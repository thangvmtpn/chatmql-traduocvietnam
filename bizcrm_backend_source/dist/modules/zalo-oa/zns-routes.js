import { Platform } from '../../shared/constants.js';
import { randomUUID } from 'node:crypto';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import { logger } from '../../shared/logger.js';
import { normalizePhone, PhoneFormatError, tryNormalizePhone } from '../../shared/phone.js';
import { getClient, sendZnsViaOa } from './oa-pool.js';
import { resolveOrCreateOaConversation, createZnsMessage } from './zns-message.js';
const TEMPLATE_TTL_MS = 60 * 60 * 1000; // 1h
export async function znsRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // ── GET /api/v1/zns/templates ──────────────────────────────────────────────
    app.get('/api/v1/zns/templates', async (request, reply) => {
        const user = request.user;
        const { accountId, refresh } = request.query;
        if (!accountId)
            return reply.code(400).send({ error: 'accountId required' });
        const account = await prisma.channelAccount.findFirst({
            where: { id: accountId, orgId: user.orgId, platform: Platform.ZALO_OA, deletedAt: null },
            select: { id: true },
        });
        if (!account)
            return reply.code(404).send({ error: 'OA account not found' });
        // Check cache freshness.
        const cached = await prisma.znsTemplate.findMany({
            where: { channelAccountId: accountId },
            orderBy: { templateName: 'asc' },
        });
        const stale = refresh === '1' || cached.length === 0 ||
            cached.some(t => Date.now() - t.fetchedAt.getTime() > TEMPLATE_TTL_MS);
        if (!stale) {
            return cached.filter(t => t.status === 'ENABLE');
        }
        // Refresh from Zalo.
        try {
            const client = await getClient(accountId);
            const fresh = await client.listZnsTemplates();
            await prisma.$transaction([
                prisma.znsTemplate.deleteMany({ where: { channelAccountId: accountId } }),
                ...fresh.map(t => prisma.znsTemplate.create({
                    data: {
                        channelAccountId: accountId,
                        templateId: t.templateId,
                        templateName: t.templateName,
                        status: t.status,
                        templateType: t.templateType ?? null,
                        params: t.params,
                        previewUrl: t.previewUrl ?? null,
                    },
                })),
            ]);
            const refreshed = await prisma.znsTemplate.findMany({
                where: { channelAccountId: accountId, status: 'ENABLE' },
                orderBy: { templateName: 'asc' },
            });
            return refreshed;
        }
        catch (err) {
            logger.warn(`[zns] template refresh failed: ${err.message}`);
            // Fall back to cached even if stale.
            return cached.filter(t => t.status === 'ENABLE');
        }
    });
    // ── POST /api/v1/zns/send ──────────────────────────────────────────────────
    app.post('/api/v1/zns/send', async (request, reply) => {
        const user = request.user;
        const { accountId, contactId, phone: rawPhone, templateId, templateData, conversationId, mode } = request.body;
        if (!accountId || !templateId || !templateData) {
            return reply.code(400).send({ error: 'accountId, templateId, templateData required' });
        }
        // Resolve phone: explicit > contact.phone.
        let resolvedPhone = null;
        let contactRecord = null;
        if (contactId) {
            contactRecord = await prisma.contact.findFirst({
                where: { id: contactId, orgId: user.orgId },
                select: { id: true, phone: true, fullName: true, zaloUid: true },
            });
            if (!contactRecord)
                return reply.code(404).send({ error: 'Contact not found' });
            resolvedPhone = tryNormalizePhone(rawPhone ?? contactRecord.phone);
        }
        else {
            resolvedPhone = tryNormalizePhone(rawPhone);
        }
        if (!resolvedPhone) {
            try {
                normalizePhone(rawPhone ?? '');
            }
            catch (e) {
                if (e instanceof PhoneFormatError) {
                    return reply.code(400).send({ error: e.message, code: 'INVALID_PHONE' });
                }
            }
            return reply.code(400).send({ error: 'phone required' });
        }
        const account = await prisma.channelAccount.findFirst({
            where: { id: accountId, orgId: user.orgId, platform: Platform.ZALO_OA, deletedAt: null },
            select: { id: true },
        });
        if (!account)
            return reply.code(404).send({ error: 'OA account not found' });
        const trackingId = randomUUID();
        const log = await prisma.znsLog.create({
            data: {
                orgId: user.orgId,
                channelAccountId: accountId,
                contactId: contactRecord?.id ?? null,
                conversationId: conversationId ?? null,
                templateId,
                phone: resolvedPhone,
                paramsJson: templateData,
                trackingId,
                status: 'pending',
                sentByUserId: user.id,
            },
        });
        const result = await sendZnsViaOa(accountId, {
            phone: resolvedPhone,
            templateId,
            templateData,
            trackingId,
            mode,
        });
        if (!result.sent) {
            await prisma.znsLog.update({
                where: { id: log.id },
                data: { status: 'failed', errorCode: result.errorCode != null ? String(result.errorCode) : null, errorMessage: result.error ?? 'unknown' },
            });
            return reply.code(502).send({
                error: result.error ?? 'ZNS send failed',
                errorCode: result.errorCode,
                znsLogId: log.id,
            });
        }
        await prisma.znsLog.update({
            where: { id: log.id },
            data: { status: 'sent', externalMsgId: result.msgId ?? null },
        });
        // Land the send on a timeline so it shows in chat history. Prefer an
        // explicit conversationId (sent from within a chat); otherwise resolve-or-
        // create the contact's OA conversation so the ZNS always has somewhere to go.
        let targetConvId = null;
        if (conversationId) {
            const conv = await prisma.conversation.findFirst({
                where: { id: conversationId, orgId: user.orgId },
                select: { id: true },
            });
            targetConvId = conv?.id ?? null;
        }
        if (!targetConvId && contactRecord) {
            targetConvId = await resolveOrCreateOaConversation(accountId, user.orgId, contactRecord);
        }
        if (targetConvId) {
            const tmpl = await prisma.znsTemplate.findFirst({
                where: { channelAccountId: accountId, templateId },
                select: { templateName: true },
            });
            await prisma.znsLog.update({ where: { id: log.id }, data: { conversationId: targetConvId } });
            await createZnsMessage({
                conversationId: targetConvId,
                orgId: user.orgId,
                znsLogId: log.id,
                externalMsgId: result.msgId ?? null,
                templateId,
                templateData,
                trackingId,
                templateName: tmpl?.templateName ?? null,
                sentByUserId: user.id,
            });
        }
        return { trackingId, znsLogId: log.id, externalMsgId: result.msgId };
    });
}
//# sourceMappingURL=zns-routes.js.map