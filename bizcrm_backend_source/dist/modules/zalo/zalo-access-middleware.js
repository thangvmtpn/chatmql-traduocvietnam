import { prisma } from '../../shared/prisma-client.js';
/** Roles that always bypass per-account ACL (full access to everything) */
const FULL_ACCESS_ROLES = new Set(['owner', 'admin']);
/**
 * Resolve the Zalo account ID from the request.
 * Checks route params in order: accountId → id → body.channelAccountId
 * Also resolves from conversation if conversationId is in params.
 */
async function resolveAccountId(request) {
    const params = request.params;
    // Direct account ID from route (e.g. /zalo-accounts/:id/*)
    if (params.accountId)
        return params.accountId;
    // Conversation-based routes — resolve accountId from conversation
    if (params.id) {
        const conv = await prisma.conversation.findFirst({
            where: { id: params.id },
            select: { channelAccountId: true },
        });
        if (conv)
            return conv.channelAccountId;
    }
    // Body fallback
    const body = request.body;
    if (body?.channelAccountId)
        return body.channelAccountId;
    return null;
}
/**
 * Resolve all account IDs accessible by a manager (own + subordinates').
 * Caches result on request to avoid re-querying within same request lifecycle.
 */
async function resolveManagerAccountIds(userId) {
    // 1. Manager's own accounts (owned + accessed)
    const [ownAccounts, ownAccess] = await Promise.all([
        prisma.channelAccount.findMany({
            where: { ownerUserId: userId, deletedAt: null },
            select: { id: true },
        }),
        prisma.channelAccountAccess.findMany({
            where: { userId },
            select: { channelAccountId: true },
        }),
    ]);
    const accountIds = new Set();
    for (const a of ownAccounts)
        accountIds.add(a.id);
    for (const a of ownAccess)
        accountIds.add(a.channelAccountId);
    // 2. Subordinates' accounts
    const subordinates = await prisma.userManager.findMany({
        where: { managerId: userId },
        select: { memberId: true },
    });
    if (subordinates.length > 0) {
        const memberIds = subordinates.map(s => s.memberId);
        const [subAccounts, subAccess] = await Promise.all([
            prisma.channelAccount.findMany({
                where: { ownerUserId: { in: memberIds }, deletedAt: null },
                select: { id: true },
            }),
            prisma.channelAccountAccess.findMany({
                where: { userId: { in: memberIds } },
                select: { channelAccountId: true },
            }),
        ]);
        for (const a of subAccounts)
            accountIds.add(a.id);
        for (const a of subAccess)
            accountIds.add(a.channelAccountId);
    }
    return accountIds;
}
/**
 * Creates a Fastify preHandler that enforces Zalo account access.
 * Owner / admin always pass. Manager uses subordinate-based scoping.
 * Members pass only if they have an entry in ChannelAccountAccess.
 *
 * @example
 * app.get('/api/v1/conversations/:id/messages', { preHandler: requireZaloAccess() }, handler)
 */
export function requireZaloAccess() {
    return async function checkZaloAccess(request, reply) {
        const user = request.user;
        if (!user) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }
        // Owner / admin bypass ACL entirely
        if (FULL_ACCESS_ROLES.has(user.role)) {
            return; // Allow
        }
        const accountId = await resolveAccountId(request);
        if (!accountId) {
            // If we can't determine the account, fall back to allowing (routes without account context)
            return;
        }
        // Manager: check own + subordinates' accounts
        if (user.role === 'manager') {
            const accessibleIds = await resolveManagerAccountIds(user.id);
            if (accessibleIds.has(accountId)) {
                return; // Allow
            }
            return reply.status(403).send({
                error: 'Bạn không có quyền truy cập tài khoản Zalo này',
                code: 'ZALO_ACCESS_DENIED',
            });
        }
        // Member: explicit ACL entry required
        const access = await prisma.channelAccountAccess.findFirst({
            where: { channelAccountId: accountId, userId: user.id },
            select: { id: true },
        });
        if (!access) {
            return reply.status(403).send({
                error: 'Bạn không có quyền truy cập tài khoản Zalo này',
                code: 'ZALO_ACCESS_DENIED',
            });
        }
    };
}
/**
 * Helper exported for use in conversation list queries.
 * Returns the set of channelAccountIds a manager can access.
 */
export { resolveManagerAccountIds };
//# sourceMappingURL=zalo-access-middleware.js.map