import { prisma } from '../../shared/prisma-client.js';
import { getPoolEntry } from '../zalo/zalo-pool.js';
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js';
import { logger } from '../../shared/logger.js';
export async function chatGroupRoutes(app) {
    // ── Group info (real Zalo API with fallback) ────────────────────────
    app.get('/api/v1/conversations/:id/group-info', { preHandler: requireZaloAccess() }, async (request, reply) => {
        const user = request.user;
        const forceRefresh = request.query.refresh === '1';
        const conv = await prisma.conversation.findFirst({
            where: { id: request.params.id, orgId: user.orgId },
            select: { id: true, threadType: true, externalThreadId: true, channelAccountId: true, contact: { select: { id: true, fullName: true, avatarUrl: true, metadata: true } } },
        });
        if (!conv)
            return reply.status(404).send({ error: 'Not found' });
        // Total message count
        const totalMessages = await prisma.message.count({
            where: { conversationId: request.params.id },
        });
        let members = [];
        if (conv.channelAccountId && conv.externalThreadId) {
            // 1. Try DB cache first (skip if forceRefresh)
            if (!forceRefresh) {
                const cached = await prisma.channelGroupMember.findMany({
                    where: { channelAccountId: conv.channelAccountId, groupId: conv.externalThreadId },
                    orderBy: [{ isAdmin: 'desc' }, { displayName: 'asc' }],
                });
                if (cached.length > 0) {
                    members = cached.map(m => ({
                        uid: m.memberUid,
                        name: m.displayName || 'Thành viên',
                        avatarUrl: m.avatarUrl,
                        isAdmin: m.isAdmin,
                    }));
                }
            }
            // 2. Cache miss (or refresh) → fetch from Zalo and repopulate
            if (members.length === 0) {
                const entry = getPoolEntry(conv.channelAccountId);
                if (entry?.api) {
                    try {
                        const groupInfoResp = await entry.api.getGroupInfo(conv.externalThreadId);
                        const gridInfo = groupInfoResp.gridInfoMap?.[conv.externalThreadId];
                        if (gridInfo?.currentMems) {
                            const adminIds = new Set(gridInfo.adminIds || []);
                            const fresh = gridInfo.currentMems.map(m => ({
                                memberUid: m.id,
                                displayName: m.zaloName || m.dName || null,
                                avatarUrl: m.avatar || m.avatar_25 || null,
                                isAdmin: adminIds.has(m.id),
                            }));
                            // Atomic refresh: clear + insert
                            await prisma.$transaction([
                                prisma.channelGroupMember.deleteMany({
                                    where: { channelAccountId: conv.channelAccountId, groupId: conv.externalThreadId },
                                }),
                                prisma.channelGroupMember.createMany({
                                    data: fresh.map(f => ({
                                        orgId: user.orgId,
                                        channelAccountId: conv.channelAccountId,
                                        groupId: conv.externalThreadId,
                                        memberUid: f.memberUid,
                                        displayName: f.displayName,
                                        avatarUrl: f.avatarUrl,
                                        isAdmin: f.isAdmin,
                                    })),
                                    skipDuplicates: true,
                                }),
                            ]);
                            members = fresh
                                .sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || (a.displayName || '').localeCompare(b.displayName || ''))
                                .map(f => ({
                                uid: f.memberUid,
                                name: f.displayName || 'Thành viên',
                                avatarUrl: f.avatarUrl,
                                isAdmin: f.isAdmin,
                            }));
                        }
                    }
                    catch (err) {
                        logger.error('[group-info] Zalo API getGroupInfo failed: %s', err.message);
                    }
                }
            }
        }
        // Last-resort fallback: derive from message senders if both DB cache and Zalo failed
        if (members.length === 0) {
            const senders = await prisma.message.findMany({
                where: { conversationId: request.params.id, senderUid: { not: null } },
                distinct: ['senderUid'],
                select: { senderUid: true, senderName: true },
                orderBy: { sentAt: 'desc' },
            });
            const senderUids = senders.map(s => s.senderUid).filter(Boolean);
            const contacts = senderUids.length > 0 ? await prisma.contact.findMany({
                where: { orgId: user.orgId, zaloUid: { in: senderUids } },
                select: { zaloUid: true, avatarUrl: true },
            }) : [];
            const avatarMap = new Map(contacts.map(c => [c.zaloUid, c.avatarUrl]));
            members = senders.map(s => ({
                uid: s.senderUid || '',
                name: s.senderName || 'Thành viên',
                avatarUrl: avatarMap.get(s.senderUid) || null,
            }));
            // Add self member
            if (conv.channelAccountId) {
                const zaloAcct = await prisma.channelAccount.findUnique({
                    where: { id: conv.channelAccountId },
                    select: { displayName: true, avatarUrl: true },
                });
                if (zaloAcct) {
                    members.unshift({ uid: 'self', name: zaloAcct.displayName || 'Bạn', avatarUrl: zaloAcct.avatarUrl });
                }
            }
        }
        return {
            groupName: conv.contact?.fullName || 'Nhóm Zalo',
            externalThreadId: conv.externalThreadId,
            memberCount: members.length,
            members,
            totalMessages,
        };
    });
    // ── Add member to group ──────────────────────────────────────────────
    app.post('/api/v1/conversations/:id/add-member', { preHandler: requireZaloAccess() }, async (request, reply) => {
        const user = request.user;
        const { memberIds } = request.body || {};
        if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
            return reply.status(400).send({ error: 'memberIds required' });
        }
        const conv = await prisma.conversation.findFirst({
            where: { id: request.params.id, orgId: user.orgId },
            select: { id: true, externalThreadId: true, channelAccountId: true },
        });
        if (!conv || !conv.externalThreadId || !conv.channelAccountId) {
            return reply.status(404).send({ error: 'Group not found' });
        }
        const entry = getPoolEntry(conv.channelAccountId);
        if (!entry?.api) {
            return reply.status(503).send({ error: 'Zalo account not connected' });
        }
        try {
            const result = await entry.api.addUserToGroup(memberIds, conv.externalThreadId);
            return { success: true, errorMembers: result.errorMembers || [] };
        }
        catch (err) {
            logger.error('[add-member] Error: %s', err.message);
            return reply.status(500).send({ error: 'Không thể thêm thành viên: ' + err.message });
        }
    });
    // ── Get friends list (for add-member picker) ────────────────────────
    app.get('/api/v1/conversations/:id/friends', { preHandler: requireZaloAccess() }, async (request, reply) => {
        const user = request.user;
        const conv = await prisma.conversation.findFirst({
            where: { id: request.params.id, orgId: user.orgId },
            select: { id: true, externalThreadId: true, channelAccountId: true },
        });
        if (!conv || !conv.channelAccountId) {
            return reply.status(404).send({ error: 'Conversation not found' });
        }
        const entry = getPoolEntry(conv.channelAccountId);
        if (!entry?.api) {
            return reply.status(503).send({ error: 'Zalo account not connected' });
        }
        try {
            const friends = await entry.api.getAllFriends();
            // Filter out members already in the group
            let existingMemberIds = [];
            if (conv.externalThreadId) {
                try {
                    const groupInfoResp = await entry.api.getGroupInfo(conv.externalThreadId);
                    const gridInfo = groupInfoResp.gridInfoMap?.[conv.externalThreadId];
                    if (gridInfo?.memberIds)
                        existingMemberIds = gridInfo.memberIds;
                }
                catch { /* ignore */ }
            }
            const existingSet = new Set(existingMemberIds);
            const result = friends.map(f => ({
                uid: f.userId,
                displayName: f.displayName || f.zaloName || '',
                avatar: f.avatar || '',
                isInGroup: existingSet.has(f.userId),
            }));
            return { friends: result };
        }
        catch (err) {
            logger.error('[friends] Error: %s', err.message);
            return reply.status(500).send({ error: 'Không thể lấy danh sách bạn bè' });
        }
    });
}
//# sourceMappingURL=chat-group-routes.js.map