import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
/**
 * Extract human-readable text from content that might be Zalo JSON.
 * Prevents raw JSON blobs from appearing in search results.
 */
function parseSearchContent(content, maxLen = 80) {
    if (!content)
        return 'Tin nhắn';
    // If it's not JSON, just truncate
    if (!content.startsWith('{') && !content.startsWith('[')) {
        return content.length > maxLen ? content.slice(0, maxLen) + '…' : content;
    }
    try {
        const d = JSON.parse(content);
        const text = d.title || d.description || d.displayText || d.text || d.href || null;
        if (text) {
            return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
        }
        return 'Tin nhắn đặc biệt';
    }
    catch {
        return content.length > maxLen ? content.slice(0, maxLen) + '…' : content;
    }
}
export async function searchRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // ── Ensure unaccent extension (idempotent, runs once on startup) ──
    let unaccentReady = false;
    app.addHook('onReady', async () => {
        try {
            // W4-FIX: Use tagged template — no user input here, purely DDL.
            await prisma.$executeRaw `CREATE EXTENSION IF NOT EXISTS unaccent`;
            unaccentReady = true;
        }
        catch (err) {
            console.warn('[search] Could not enable unaccent extension:', err.message);
        }
    });
    // ── Global Search ────────────────────────────────────────────────
    app.get('/api/v1/search', async (request) => {
        const user = request.user;
        const q = String(request.query.q || '').trim();
        const limit = Math.min(parseInt(String(request.query.limit || '12')), 30);
        if (!q || q.length < 2)
            return { results: [] };
        const results = [];
        const contactLimit = Math.ceil(limit / 2);
        const convLimit = Math.ceil(limit / 3);
        const msgLimit = Math.ceil(limit / 3);
        // W4-FIX: Migrated from $queryRawUnsafe to $queryRaw tagged template.
        // Tagged templates auto-parameterize all ${} interpolations — safer by default.
        // ── Search contacts (unaccent + case-insensitive) ──────────────
        const contacts = await prisma.$queryRaw `
      SELECT id, full_name, phone, email, avatar_url
      FROM contacts
      WHERE org_id = ${user.orgId}
        AND is_group = false
        AND deleted_at IS NULL
        AND (
          unaccent(LOWER(full_name)) LIKE '%' || unaccent(LOWER(${q})) || '%'
          OR phone LIKE '%' || ${q} || '%'
          OR unaccent(LOWER(email)) LIKE '%' || unaccent(LOWER(${q})) || '%'
        )
      ORDER BY updated_at DESC
      LIMIT ${contactLimit}
    `;
        for (const c of contacts) {
            results.push({
                id: c.id,
                type: 'contact',
                title: c.full_name || 'Unknown',
                subtitle: c.phone || c.email || '—',
                avatar: c.avatar_url,
            });
        }
        // ── Search conversations (unaccent on contact name + displayName) ─
        const convs = await prisma.$queryRaw `
      SELECT cv.id, cv.display_name, cv.thread_type,
             ct.full_name AS contact_name, ct.phone AS contact_phone
      FROM conversations cv
      LEFT JOIN contacts ct ON ct.id = cv.contact_id
      WHERE cv.org_id = ${user.orgId}
        AND (
          unaccent(LOWER(ct.full_name)) LIKE '%' || unaccent(LOWER(${q})) || '%'
          OR unaccent(LOWER(cv.display_name)) LIKE '%' || unaccent(LOWER(${q})) || '%'
        )
      ORDER BY cv.last_message_at DESC NULLS LAST
      LIMIT ${convLimit}
    `;
        const seenConvIds = new Set();
        for (const conv of convs) {
            if (seenConvIds.has(conv.id))
                continue;
            seenConvIds.add(conv.id);
            results.push({
                id: conv.id,
                type: 'conversation',
                title: conv.display_name || conv.contact_name || 'Unknown',
                subtitle: conv.contact_phone || conv.thread_type || '—',
            });
        }
        // ── Search messages (unaccent on content) ──────────────────────
        const msgs = await prisma.$queryRaw `
      SELECT m.id, m.content, m.conversation_id,
             ct.full_name AS contact_name
      FROM messages m
      JOIN conversations cv ON cv.id = m.conversation_id
      LEFT JOIN contacts ct ON ct.id = cv.contact_id
      WHERE cv.org_id = ${user.orgId}
        AND m.is_deleted = false
        AND unaccent(LOWER(m.content)) LIKE '%' || unaccent(LOWER(${q})) || '%'
      ORDER BY m.sent_at DESC
      LIMIT ${msgLimit}
    `;
        for (const msg of msgs) {
            results.push({
                id: msg.id,
                type: 'message',
                title: parseSearchContent(msg.content),
                subtitle: msg.contact_name || 'Unknown',
                conversationId: msg.conversation_id,
            });
        }
        return { results: results.slice(0, limit) };
    });
}
//# sourceMappingURL=search-routes.js.map