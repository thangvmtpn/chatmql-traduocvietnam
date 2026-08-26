// zns-message.ts — shared helpers to land a ZNS send on a conversation timeline.
// A ZNS always creates a Message (contentType='zns_template') linked to its
// ZnsLog so the send + its delivery lifecycle show up in chat history.
import { prisma } from '../../shared/prisma-client.js';
import { SenderType } from '../../shared/constants.js';
import { emitNewMessage } from '../realtime/socket-gateway.js';
import { transformMessageForFrontend } from '../chat/chat-routes.js';
/**
 * Find (or create) the OA conversation for a contact so a ZNS send always has a
 * timeline to land on. Mirrors oa-webhook.ts insertSystemMessage's resolve logic
 * (match by external thread uid OR contact+threadType, else create).
 */
export async function resolveOrCreateOaConversation(accountId, orgId, contact) {
    const existing = await prisma.conversation.findFirst({
        where: {
            channelAccountId: accountId,
            OR: [
                ...(contact.zaloUid ? [{ externalThreadId: contact.zaloUid }] : []),
                { contactId: contact.id, threadType: 'user' },
            ],
        },
        select: { id: true },
    });
    if (existing)
        return existing.id;
    const created = await prisma.conversation.create({
        data: {
            orgId,
            channelAccountId: accountId,
            contactId: contact.id,
            externalThreadId: contact.zaloUid ?? null,
            threadType: 'user',
            displayName: contact.fullName ?? null,
        },
        select: { id: true },
    });
    return created.id;
}
/**
 * Append a zns_template Message linked to its ZnsLog, bump the conversation,
 * and emit it so the chat reflects the send. Returns the new message id.
 */
export async function createZnsMessage(args) {
    const sentAt = args.sentAt ?? new Date();
    const message = await prisma.message.create({
        data: {
            conversationId: args.conversationId,
            externalMsgId: args.externalMsgId ?? null,
            senderType: SenderType.SELF,
            senderUid: '',
            senderName: 'Staff',
            content: args.templateName ?? `ZNS Template ${args.templateId}`,
            contentType: 'zns_template',
            attachments: [
                { templateId: args.templateId, templateData: args.templateData, trackingId: args.trackingId },
            ],
            sentAt,
            repliedByUserId: args.sentByUserId ?? null,
            znsLogId: args.znsLogId,
        },
    });
    await prisma.conversation.update({
        where: { id: args.conversationId },
        data: { lastMessageAt: sentAt, isReplied: true },
    });
    try {
        emitNewMessage(args.orgId, args.conversationId, transformMessageForFrontend(message));
    }
    catch {
        /* socket not connected */
    }
    return message.id;
}
//# sourceMappingURL=zns-message.js.map