import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import { Prisma } from '@prisma/client';
import { renderTemplate, SAMPLE_PREVIEW_CONTEXT } from './template-renderer.js';
// v1 triggers (backward compat)
const VALID_TRIGGERS_V1 = ['message_received', 'contact_created', 'lifecycle_changed', 'status_changed'];
// v2 triggers (visual flow editor)
const VALID_TRIGGERS_V2 = [
    ...VALID_TRIGGERS_V1,
    'tag_added', 'tag_removed',
    'property_changed', 'event_tracked',
    'segment_entered', 'segment_exited',
    'lifecycle_changed',
    'no_reply_24h', 'appointment_upcoming',
    'message_sent',
    'conversation_idle', 'birthday_detected',
    'user_follow_oa', 'user_unfollow_oa',
    'order_completed',
];
const ALL_VALID_TRIGGERS = VALID_TRIGGERS_V2;
export async function automationRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // ── Automation Rules ────────────────────────────────────────────────
    app.get('/api/v1/automation/rules', async (request, reply) => {
        const user = request.user;
        // Per Phân quyền matrix: Tự động hóa = "—" for members.
        if (user.role === 'member') {
            return reply.status(403).send({ error: 'Bạn không có quyền truy cập Tự động hóa' });
        }
        const rules = await prisma.automationRule.findMany({
            where: { orgId: user.orgId },
            orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        });
        return { rules };
    });
    app.post('/api/v1/automation/rules', async (request, reply) => {
        const user = request.user;
        const body = request.body;
        if (!['owner', 'admin'].includes(user.role)) {
            return reply.status(403).send({ error: 'Only admin/owner can manage automation rules' });
        }
        if (!body.name)
            return reply.status(400).send({ error: 'name is required' });
        if (!body.trigger || !ALL_VALID_TRIGGERS.includes(body.trigger)) {
            return reply.status(400).send({ error: `trigger must be one of: ${ALL_VALID_TRIGGERS.join(', ')}` });
        }
        const isV2 = body.flowVersion === 2 || body.flowConfig != null;
        // Validate flowConfig shape before persisting (prevent malformed DAGs)
        if (isV2 && body.flowConfig) {
            const fc = body.flowConfig;
            if (!fc.trigger || typeof fc.trigger !== 'object' || !fc.trigger.id) {
                return reply.status(400).send({ error: 'flowConfig.trigger is required and must have an id' });
            }
            if (!Array.isArray(fc.nodes)) {
                return reply.status(400).send({ error: 'flowConfig.nodes must be an array' });
            }
            if (!Array.isArray(fc.edges)) {
                return reply.status(400).send({ error: 'flowConfig.edges must be an array' });
            }
        }
        const rule = await prisma.automationRule.create({
            data: {
                orgId: user.orgId,
                name: body.name,
                description: body.description,
                trigger: body.trigger,
                conditions: Array.isArray(body.conditions) ? body.conditions : [],
                actions: Array.isArray(body.actions) ? body.actions : [],
                enabled: body.enabled ?? true,
                priority: Number(body.priority ?? 0),
                flowVersion: isV2 ? 2 : 1,
                flowConfig: isV2 ? (body.flowConfig ?? Prisma.JsonNull) : undefined,
            },
        });
        return reply.status(201).send(rule);
    });
    app.put('/api/v1/automation/rules/:id', async (request, reply) => {
        const user = request.user;
        if (!['owner', 'admin'].includes(user.role)) {
            return reply.status(403).send({ error: 'Only admin/owner can manage automation rules' });
        }
        const { id } = request.params;
        const body = request.body;
        if (body.trigger && !ALL_VALID_TRIGGERS.includes(body.trigger)) {
            return reply.status(400).send({ error: `trigger must be one of: ${ALL_VALID_TRIGGERS.join(', ')}` });
        }
        const existing = await prisma.automationRule.findFirst({ where: { id, orgId: user.orgId } });
        if (!existing)
            return reply.status(404).send({ error: 'Rule not found' });
        const rule = await prisma.automationRule.update({
            where: { id },
            data: {
                name: body.name,
                description: body.description,
                trigger: body.trigger,
                conditions: Array.isArray(body.conditions) ? body.conditions : undefined,
                actions: Array.isArray(body.actions) ? body.actions : undefined,
                enabled: body.enabled,
                priority: body.priority !== undefined ? Number(body.priority) : undefined,
                flowVersion: body.flowVersion !== undefined ? Number(body.flowVersion) : undefined,
                flowConfig: body.flowConfig !== undefined ? body.flowConfig : undefined,
            },
        });
        return rule;
    });
    app.delete('/api/v1/automation/rules/:id', async (request, reply) => {
        const user = request.user;
        if (!['owner', 'admin'].includes(user.role)) {
            return reply.status(403).send({ error: 'Only admin/owner can manage automation rules' });
        }
        const { id } = request.params;
        const existing = await prisma.automationRule.findFirst({ where: { id, orgId: user.orgId } });
        if (!existing)
            return reply.status(404).send({ error: 'Rule not found' });
        await prisma.automationRule.delete({ where: { id } });
        return { success: true };
    });
    // ── Test Run ─────────────────────────────────────────────────────────
    // POST /api/v1/automation/rules/:id/test-run
    // Execute the flow for testing. Actions run for real and results are logged.
    // Accepts flowConfig in body (for unsaved/current editor state) OR falls back to DB.
    // For conversation-based triggers: pass conversationId (required).
    // For contact-based triggers: pass contactId (optional, falls back to sample data).
    // Special ruleId '__unsaved__' skips DB lookup entirely (uses body flowConfig only).
    app.post('/api/v1/automation/rules/:id/test-run', async (request, reply) => {
        const user = request.user;
        if (!['owner', 'admin'].includes(user.role)) {
            return reply.status(403).send({ error: 'Only admin/owner can test automation rules' });
        }
        const { id } = request.params;
        const { contactId, conversationId, dryRun = true, flowConfig: bodyFlowConfig } = request.body ?? {};
        let ruleName = 'Test Run';
        let flowConfig = null;
        // Priority: body flowConfig > DB flowConfig
        if (bodyFlowConfig && bodyFlowConfig.trigger && Array.isArray(bodyFlowConfig.nodes)) {
            flowConfig = bodyFlowConfig;
            ruleName = bodyFlowConfig.metadata?.name || 'Test Run';
        }
        // If no body flowConfig and not unsaved, try DB
        if (!flowConfig && id !== '__unsaved__') {
            const rule = await prisma.automationRule.findFirst({
                where: { id, orgId: user.orgId },
            });
            if (!rule)
                return reply.status(404).send({ error: 'Rule not found' });
            ruleName = rule.name;
            flowConfig = rule.flowConfig;
        }
        if (!flowConfig || !flowConfig.trigger || !Array.isArray(flowConfig.nodes)) {
            return reply.status(400).send({ error: 'Không tìm thấy flowConfig hợp lệ. Vui lòng thêm ít nhất 1 block vào flow.' });
        }
        // Build execution context
        const ctx = { orgId: user.orgId };
        const triggerType = flowConfig.trigger.type;
        // ── Path A: conversationId provided (conversation-based triggers) ──
        if (conversationId) {
            const conversation = await prisma.conversation.findFirst({
                where: { id: conversationId, orgId: user.orgId },
                include: {
                    contact: {
                        select: {
                            id: true, fullName: true, crmName: true, phone: true,
                            email: true, lifecycleStage: true, source: true, tags: true,
                        },
                    },
                },
            });
            if (!conversation)
                return reply.status(404).send({ error: 'Conversation not found' });
            ctx.conversationId = conversation.id;
            const contact = conversation.contact;
            if (contact) {
                ctx.contactId = contact.id;
                ctx['contact.id'] = contact.id;
                ctx['contact.fullName'] = contact.fullName || contact.crmName || '';
                ctx['contact.phone'] = contact.phone || '';
                ctx['contact.email'] = contact.email || '';
                ctx['contact.lifecycleStage'] = contact.lifecycleStage || 'subscriber';
                ctx['contact.status'] = contact.lifecycleStage || 'subscriber';
                ctx['contact.source'] = contact.source || '';
            }
            // Trigger-specific data
            ctx.triggerData = {};
            if (triggerType === 'message_received' || triggerType === 'message_sent') {
                ctx.messageText = 'Xin chào, tôi muốn tư vấn sản phẩm (test run)';
            }
            else if (triggerType === 'conversation_idle') {
                const idleMinutes = flowConfig.trigger.config?.idleMinutes || 30;
                ctx.triggerData.idleMinutes = idleMinutes;
            }
            // ── Path B: contactId provided (contact-based triggers) ──
        }
        else if (contactId) {
            const contact = await prisma.contact.findFirst({
                where: { id: contactId, orgId: user.orgId },
                select: {
                    id: true, fullName: true, crmName: true, phone: true,
                    email: true, lifecycleStage: true, source: true, tags: true,
                },
            });
            if (!contact)
                return reply.status(404).send({ error: 'Contact not found' });
            ctx.contactId = contact.id;
            ctx['contact.id'] = contact.id;
            ctx['contact.fullName'] = contact.fullName || contact.crmName || '';
            ctx['contact.phone'] = contact.phone || '';
            ctx['contact.email'] = contact.email || '';
            ctx['contact.lifecycleStage'] = contact.lifecycleStage || 'subscriber';
            ctx['contact.status'] = contact.lifecycleStage || 'subscriber';
            ctx['contact.source'] = contact.source || '';
            // Find latest conversation for this contact (for actions that need it)
            const conv = await prisma.conversation.findFirst({
                where: { contactId: contact.id, orgId: user.orgId },
                select: { id: true },
                orderBy: { lastMessageAt: 'desc' },
            });
            if (conv)
                ctx.conversationId = conv.id;
            // Trigger-specific data
            ctx.triggerData = {};
            if (triggerType === 'lifecycle_changed' || triggerType === 'status_changed') {
                ctx.triggerData.fromStage = flowConfig.trigger.config?.fromStage || contact.lifecycleStage || 'subscriber';
                ctx.triggerData.toStage = flowConfig.trigger.config?.toStage || 'lead';
                ctx.triggerData.fromStatus = ctx.triggerData.fromStage;
                ctx.triggerData.toStatus = ctx.triggerData.toStage;
            }
            else if (triggerType === 'tag_added' || triggerType === 'tag_removed') {
                const tags = contact.tags ?? [];
                ctx.triggerData.tag = flowConfig.trigger.config?.tag || tags[0] || 'sample-tag';
            }
            else if (triggerType === 'message_received') {
                ctx.messageText = 'Xin chào, tôi muốn tư vấn sản phẩm (test run)';
            }
            // ── Path C: No context — use sample data ──
        }
        else {
            ctx.contactId = 'test_contact_sample';
            ctx['contact.id'] = 'test_contact_sample';
            ctx['contact.fullName'] = 'Nguyễn Văn A (mẫu)';
            ctx['contact.phone'] = '0901234567';
            ctx['contact.email'] = 'a@test.vn';
            ctx['contact.lifecycleStage'] = 'subscriber';
            ctx['contact.status'] = 'subscriber';
            ctx['contact.source'] = 'zalo';
            ctx.conversationId = 'test_conversation_sample';
            ctx.messageText = 'Xin chào, tôi muốn tư vấn sản phẩm (dữ liệu mẫu)';
            ctx.triggerData = {
                fromStage: 'subscriber', toStage: 'lead',
                fromStatus: 'subscriber', toStatus: 'lead',
                tag: 'vip', fieldKey: 'total_spend',
                oldValue: '500000', newValue: '1500000',
                eventName: 'page_view', eventValue: '/san-pham/abc',
            };
        }
        try {
            const { executeFlowV2 } = await import('./automation-engine.js');
            const effectiveId = id === '__unsaved__' ? 'unsaved' : id;
            const result = await executeFlowV2(effectiveId, ruleName, flowConfig, ctx, dryRun);
            return {
                ...result,
                testContext: {
                    contactId: ctx.contactId || null,
                    conversationId: ctx.conversationId || null,
                    usedSampleData: !contactId && !conversationId,
                    contactName: ctx['contact.fullName'],
                    contactPhone: ctx['contact.phone'] || null,
                    contactEmail: ctx['contact.email'] || null,
                    contactLifecycle: ctx['contact.lifecycleStage'] || null,
                    contactSource: ctx['contact.source'] || null,
                    messageText: ctx.messageText || null,
                    triggerData: ctx.triggerData || null,
                    triggerType,
                },
            };
        }
        catch (err) {
            return reply.status(500).send({
                error: 'Test run failed',
                message: err.message || String(err),
            });
        }
    });
    // ── Message Templates ───────────────────────────────────────────────
    app.get('/api/v1/automation/templates', async (request) => {
        const user = request.user;
        const { search = '', category = '' } = request.query;
        const where = {
            orgId: user.orgId,
            OR: [
                { ownerUserId: null }, // team templates
                { ownerUserId: user.id }, // personal templates
            ],
        };
        if (search) {
            where.AND = {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { content: { contains: search, mode: 'insensitive' } },
                ],
            };
        }
        if (category)
            where.category = category;
        const templates = await prisma.messageTemplate.findMany({
            where,
            orderBy: { name: 'asc' },
        });
        return {
            templates: templates.map(t => ({ ...t, isPersonal: t.ownerUserId !== null })),
        };
    });
    app.post('/api/v1/automation/templates', async (request, reply) => {
        const user = request.user;
        const body = request.body;
        if (!body.name)
            return reply.status(400).send({ error: 'name is required' });
        if (!body.content)
            return reply.status(400).send({ error: 'content is required' });
        // ownerUserId: null = team template (admin+), value = personal (any user)
        const isPersonal = body.isPersonal === true;
        if (!isPersonal && !['owner', 'admin'].includes(user.role)) {
            return reply.status(403).send({ error: 'Only admin/owner can create team templates' });
        }
        const template = await prisma.messageTemplate.create({
            data: {
                orgId: user.orgId,
                ownerUserId: isPersonal ? user.id : null,
                name: body.name,
                content: body.content,
                category: body.category ?? null,
            },
        });
        return reply.status(201).send({ ...template, isPersonal });
    });
    app.put('/api/v1/automation/templates/:id', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const body = request.body;
        const existing = await prisma.messageTemplate.findFirst({
            where: { id, orgId: user.orgId },
            select: { id: true, ownerUserId: true },
        });
        if (!existing)
            return reply.status(404).send({ error: 'Template not found' });
        const isPersonalOwner = existing.ownerUserId === user.id;
        const canEditTeam = ['owner', 'admin'].includes(user.role);
        if (!isPersonalOwner && !canEditTeam) {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        const template = await prisma.messageTemplate.update({
            where: { id },
            data: {
                name: body.name,
                content: body.content,
                category: body.category ?? null,
            },
        });
        return { ...template, isPersonal: template.ownerUserId !== null };
    });
    app.delete('/api/v1/automation/templates/:id', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const existing = await prisma.messageTemplate.findFirst({
            where: { id, orgId: user.orgId },
            select: { id: true, ownerUserId: true },
        });
        if (!existing)
            return reply.status(404).send({ error: 'Template not found' });
        const isPersonalOwner = existing.ownerUserId === user.id;
        const canDeleteTeam = ['owner', 'admin'].includes(user.role);
        if (!isPersonalOwner && !canDeleteTeam) {
            return reply.status(403).send({ error: 'Forbidden' });
        }
        await prisma.messageTemplate.delete({ where: { id } });
        return { success: true };
    });
    // POST /api/v1/automation/templates/:id/preview — render with optional contactId,
    // falling back to a sample context so authors always see realistic output.
    app.post('/api/v1/automation/templates/:id/preview', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const { contactId } = request.body ?? {};
        const tmpl = await prisma.messageTemplate.findFirst({
            where: { id, orgId: user.orgId },
            select: { id: true, name: true, content: true },
        });
        if (!tmpl)
            return reply.status(404).send({ error: 'Template not found' });
        let context = { ...SAMPLE_PREVIEW_CONTEXT };
        if (contactId) {
            const [contact, org] = await Promise.all([
                prisma.contact.findFirst({
                    where: { id: contactId, orgId: user.orgId },
                    select: { fullName: true, crmName: true, phone: true, email: true, status: true, source: true },
                }),
                prisma.organization.findUnique({ where: { id: user.orgId }, select: { name: true } }),
            ]);
            if (contact)
                context = { contact, org };
        }
        else {
            const org = await prisma.organization.findUnique({ where: { id: user.orgId }, select: { name: true } });
            if (org?.name)
                context = { ...context, org };
        }
        return {
            templateId: tmpl.id,
            rendered: renderTemplate(tmpl.content, context),
            sample: !contactId,
        };
    });
    // GET /api/v1/automation/run-logs?ruleId=&limit= — list recent automation
    // rule executions. Sourced from ActivityLog where entityType='automation'.
    app.get('/api/v1/automation/run-logs', async (request, reply) => {
        const user = request.user;
        if (user.role === 'member') {
            return reply.status(403).send({ error: 'Bạn không có quyền truy cập Tự động hóa' });
        }
        const limitRaw = Number.parseInt(request.query?.limit ?? '50', 10);
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
        const where = {
            orgId: user.orgId,
            entityType: 'automation',
            ...(request.query?.ruleId ? { entityId: request.query.ruleId } : {}),
        };
        const logs = await prisma.activityLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: { id: true, entityId: true, action: true, details: true, createdAt: true },
        });
        // Attach rule names so the UI doesn't need a second round-trip
        const ruleIds = Array.from(new Set(logs.map((l) => l.entityId).filter(Boolean)));
        const rules = ruleIds.length
            ? await prisma.automationRule.findMany({
                where: { id: { in: ruleIds }, orgId: user.orgId },
                select: { id: true, name: true },
            })
            : [];
        const nameById = new Map(rules.map((r) => [r.id, r.name]));
        return {
            logs: logs.map((l) => ({
                id: l.id,
                ruleId: l.entityId,
                ruleName: nameById.get(l.entityId ?? '') ?? '(đã xóa)',
                action: l.action,
                metadata: l.details, // Map 'details' → 'metadata' for frontend compatibility
                createdAt: l.createdAt,
            })),
        };
    });
}
//# sourceMappingURL=automation-routes.js.map