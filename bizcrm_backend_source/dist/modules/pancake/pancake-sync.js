/**
 * pancake-sync.ts — Sync conversations, messages, and customers from Pancake.
 *
 * Supports 3 sync directions:
 *   - 'pull': Pancake → BizCRM (read-only, safe for production)
 *   - 'push': BizCRM → Pancake (writes back to Pancake — use with caution)
 *   - 'both': Full bidirectional sync
 *
 * Default is 'pull' to prevent accidental data writes to production Pancake.
 */
import { prisma } from '../../shared/prisma-client.js';
import { SenderType } from '../../shared/constants.js';
import { getConversations, getMessages, getCustomers, } from './pancake-client.js';
import { stripHtml, parsePancakeTime, mapAttachmentType, extractAttachments } from './pancake-helpers.js';
import { emitDomainEvent } from '../../shared/domain-events.js';
import { seedIdleCheckpoints } from '../automation/conversation-idle-poller.js';
import { logger } from '../../shared/logger.js';
// ─── Main Sync Entry Point ───────────────────────────────────────────────────
/**
 * Sync a single Pancake page — conversations, messages, and customers.
 *
 * @param orgId - Organization ID
 * @param channelAccountId - BizCRM ChannelAccount.id
 * @param pageId - Pancake page ID
 * @param pageToken - Decrypted page access token
 * @param direction - Sync direction (default: 'pull')
 */
export async function syncPancakePage(orgId, channelAccountId, pageId, pageToken, direction = 'pull') {
    logger.info({ pageId, direction }, '[pancake-sync] Starting sync');
    const stats = { conversations: 0, messages: 0, customers: 0 };
    // ── 1. Sync conversations + messages ─────────────────────────────
    if (direction === 'pull' || direction === 'both') {
        const convStats = await syncConversations(orgId, channelAccountId, pageId, pageToken);
        stats.conversations = convStats.conversations;
        stats.messages = convStats.messages;
    }
    // ── 2. Sync customers ────────────────────────────────────────────
    // NOTE: Disabled — page_customers API requires undocumented `since` format
    // and consistently fails. Customer data (name, gender, phone) is already
    // extracted from conversation.page_customer during conversation sync above.
    // if (direction === 'pull' || direction === 'both') {
    //   stats.customers = await syncCustomers(orgId, pageId, pageToken)
    // }
    // ── 3. Push (BizCRM → Pancake) — only if direction includes push ─
    if (direction === 'push' || direction === 'both') {
        logger.info('[pancake-sync] Push sync — skipped (not yet implemented)');
        // Future: push contact updates, tags back to Pancake
    }
    // Update lastConnectedAt on the channel account
    await prisma.channelAccount.update({
        where: { id: channelAccountId },
        data: { lastConnectedAt: new Date() },
    });
    logger.info({ pageId, ...stats }, '[pancake-sync] Sync completed');
    return stats;
}
// ─── Conversation Sync ───────────────────────────────────────────────────────
async function syncConversations(orgId, channelAccountId, pageId, pageToken) {
    let totalConversations = 0;
    let totalMessages = 0;
    let cursor;
    // Paginate through conversations (max 5 pages to avoid rate limits on first sync)
    const MAX_PAGES = 5;
    for (let page = 0; page < MAX_PAGES; page++) {
        const result = await getConversations(pageId, pageToken, {
            type: 'INBOX',
            cursor,
            limit: 60,
        });
        const conversations = result.conversations || [];
        if (conversations.length === 0)
            break;
        for (const conv of conversations) {
            try {
                const synced = await syncSingleConversation(orgId, channelAccountId, pageId, pageToken, conv);
                totalConversations++;
                totalMessages += synced.messages;
            }
            catch (err) {
                logger.warn({ err: err.message, convId: conv.id }, '[pancake-sync] Conv sync failed — skipping');
            }
        }
        // Use last conversation ID as cursor for next page
        cursor = conversations[conversations.length - 1]?.id;
        if (conversations.length < 60)
            break; // Last page
    }
    return { conversations: totalConversations, messages: totalMessages };
}
async function syncSingleConversation(orgId, channelAccountId, pageId, pageToken, pancakeConv) {
    const externalThreadId = String(pancakeConv.id);
    // ── Upsert Contact ──────────────────────────────────────────────
    // Pancake provides contact info in multiple places:
    // - conv.from.id/name — basic sender
    // - conv.page_customer.id/name/gender/birthday/notes — rich profile
    // - conv.customers[].id/name/fb_id — linked customers
    const senderInfo = pancakeConv.from || { id: '', name: '' };
    const pageCustomer = pancakeConv.page_customer || {};
    const customersArr = pancakeConv.customers || [];
    // Best pancakeUid: page_customer.id > customers[0].id > from.id
    const pancakeCustomerId = pageCustomer.id
        || customersArr[0]?.id
        || senderInfo.page_customer_id
        || senderInfo.id
        || '';
    const senderName = pageCustomer.name || senderInfo.name || 'Unknown';
    let contact = pancakeCustomerId
        ? await prisma.contact.findFirst({
            where: { orgId, pancakeUid: pancakeCustomerId },
        })
        : null;
    if (!contact) {
        // Extract phone from conversation.recent_phone_numbers
        const recentPhones = pancakeConv.recent_phone_numbers || [];
        const phoneFromConv = recentPhones[0]?.phone_number || null;
        contact = await prisma.contact.create({
            data: {
                orgId,
                fullName: senderName,
                pancakeUid: pancakeCustomerId || null,
                phone: phoneFromConv,
                source: 'pancake',
                lifecycleStage: 'subscriber',
                metadata: pageCustomer.gender ? { gender: pageCustomer.gender } : {},
                notes: pageCustomer.notes || null,
            },
        });
        emitDomainEvent({ type: 'contact.created', orgId, id: contact.id });
    }
    // Enrich existing contact with page_customer data (fill blank fields only)
    {
        const updates = {};
        // Phone from conversation messages
        const recentPhones = pancakeConv.recent_phone_numbers || [];
        const phoneFromConv = recentPhones[0]?.phone_number || null;
        if (!contact.phone && phoneFromConv)
            updates.phone = phoneFromConv;
        // Name
        if (!contact.fullName && senderName)
            updates.fullName = senderName;
        // Notes from page_customer
        if (!contact.notes && pageCustomer.notes)
            updates.notes = pageCustomer.notes;
        // Gender in metadata
        if (pageCustomer.gender) {
            const meta = contact.metadata || {};
            if (!meta.gender) {
                updates.metadata = { ...meta, gender: pageCustomer.gender };
            }
        }
        if (Object.keys(updates).length > 0) {
            await prisma.contact.update({ where: { id: contact.id }, data: updates });
            // Refresh contact in memory
            Object.assign(contact, updates);
        }
    }
    // ── Upsert Conversation ─────────────────────────────────────────
    let conversation = await prisma.conversation.findFirst({
        where: { channelAccountId, externalThreadId },
    });
    // Use updated_at > inserted_at for lastMessageAt
    const convTime = parsePancakeTime(pancakeConv.updated_at || pancakeConv.inserted_at);
    if (!conversation) {
        conversation = await prisma.conversation.create({
            data: {
                orgId,
                channelAccountId,
                contactId: contact.id,
                externalThreadId,
                displayName: senderName || contact.fullName || null,
                tab: 'main',
                lastMessageAt: convTime,
                unreadCount: 0,
                isReplied: true, // Historical sync — don't mark as unread
            },
        });
    }
    else {
        // I3 fix: Update lastMessageAt on existing conversations
        await prisma.conversation.update({
            where: { id: conversation.id },
            data: { lastMessageAt: convTime },
        });
    }
    // Bulk import must NOT look like live "idle" activity: pre-seed idle checkpoints
    // so conversation-idle-poller skips this synced thread (otherwise a batch sync of
    // historical conversations fires `conversation_idle` → ai_cdp on every one). Real
    // activity later advances lastMessageAt past the checkpoint and re-arms idle.
    await seedIdleCheckpoints(conversation.id, convTime);
    // ── Sync messages (latest 30 per conversation) ──────────────────
    let msgCount = 0;
    try {
        const msgResult = await getMessages(pageId, externalThreadId, pageToken, { limit: 30 });
        const messages = msgResult.messages || [];
        for (const msg of messages) {
            const externalMsgId = String(msg.id || '');
            if (!externalMsgId)
                continue;
            // C2 fix: Scope dedup by conversationId — two orgs syncing the
            // same Pancake page should each get their own copy of messages.
            const exists = await prisma.message.findFirst({
                where: { conversationId: conversation.id, externalMsgId },
                select: { id: true },
            });
            if (exists)
                continue;
            // Determine sender type: if from.id matches page_id, it's SELF (staff sent)
            const isFromPage = msg.from?.id === pageId;
            const senderType = isFromPage ? SenderType.SELF : SenderType.CONTACT;
            // Use original_message (clean text) if available, else strip HTML from message
            const content = msg.original_message || stripHtml(msg.message || '');
            await prisma.message.create({
                data: {
                    conversationId: conversation.id,
                    externalMsgId,
                    senderType,
                    senderUid: msg.from?.id || '',
                    senderName: msg.from?.name || (isFromPage ? 'Staff' : senderName),
                    content,
                    contentType: mapAttachmentType(msg.attachments),
                    attachments: extractAttachments(msg.attachments),
                    sentAt: parsePancakeTime(msg.inserted_at || msg.created_time),
                },
            });
            msgCount++;
        }
    }
    catch (err) {
        logger.warn({ err: err.message, convId: externalThreadId }, '[pancake-sync] Message sync failed');
    }
    return { messages: msgCount };
}
// ─── Customer Sync ───────────────────────────────────────────────────────────
async function syncCustomers(orgId, pageId, pageToken) {
    let totalCustomers = 0;
    let page = 1;
    const MAX_PAGES = 10;
    // Pancake requires `since` param — default to 6 months ago
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const since = sixMonthsAgo.toISOString().split('T')[0]; // YYYY-MM-DD
    for (; page <= MAX_PAGES; page++) {
        try {
            const result = await getCustomers(pageId, pageToken, { page, limit: 100, since });
            const customers = result.page_customers || [];
            if (customers.length === 0)
                break;
            for (const cust of customers) {
                try {
                    await syncSingleCustomer(orgId, cust);
                    totalCustomers++;
                }
                catch (err) {
                    logger.warn({ err: err.message, custId: cust.id }, '[pancake-sync] Customer sync failed — skipping');
                }
            }
            if (customers.length < 100)
                break; // Last page
        }
        catch (err) {
            logger.warn({ err: err.message, page }, '[pancake-sync] Customer page fetch failed — stopping');
            break;
        }
    }
    return totalCustomers;
}
async function syncSingleCustomer(orgId, cust) {
    if (!cust.id)
        return;
    const pancakeUid = String(cust.id);
    // Try to find existing contact by pancakeUid
    let contact = await prisma.contact.findFirst({
        where: { orgId, pancakeUid },
    });
    const updateData = {};
    if (cust.name)
        updateData.fullName = cust.name;
    if (cust.phone_numbers?.length)
        updateData.phone = cust.phone_numbers[0];
    if (cust.emails?.length)
        updateData.email = cust.emails[0];
    if (contact) {
        // Update existing — only fill in blank fields (don't overwrite user edits)
        const fieldsToUpdate = {};
        if (!contact.fullName && updateData.fullName)
            fieldsToUpdate.fullName = updateData.fullName;
        if (!contact.phone && updateData.phone)
            fieldsToUpdate.phone = updateData.phone;
        if (!contact.email && updateData.email)
            fieldsToUpdate.email = updateData.email;
        if (Object.keys(fieldsToUpdate).length > 0) {
            await prisma.contact.update({
                where: { id: contact.id },
                data: fieldsToUpdate,
            });
        }
    }
    else {
        // Create new contact
        await prisma.contact.create({
            data: {
                orgId,
                pancakeUid,
                fullName: updateData.fullName || `Customer ${pancakeUid.slice(-4)}`,
                phone: updateData.phone || null,
                email: updateData.email || null,
                source: 'pancake',
                lifecycleStage: 'subscriber',
            },
        });
    }
}
// Helpers now imported from ./pancake-helpers.ts
//# sourceMappingURL=pancake-sync.js.map