import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import { LIMITS } from '../../config/limits.js';
import { badRequest, notFound } from '../../shared/http-errors.js';
/* ── Segment evaluation engine ────────────────────────────────────── */
async function evaluateSegment(orgId, conditions) {
    // Start with all contacts in org
    let contactIds = null;
    for (const group of conditions) {
        const groupResults = [];
        for (const cond of group.conditions) {
            let ids = [];
            if (cond.type === 'contact') {
                // Filter on built-in contact fields
                const where = { orgId, isGroup: false, deletedAt: null, mergedInto: null };
                const field = cond.field; // status, source, leadScore, etc.
                switch (cond.operator) {
                    case 'equals':
                        where[field] = String(cond.value);
                        break;
                    case 'not_equals':
                        where[field] = { not: String(cond.value) };
                        break;
                    case 'contains':
                        where[field] = { contains: String(cond.value), mode: 'insensitive' };
                        break;
                    case 'gt':
                        where[field] = { gt: Number(cond.value) };
                        break;
                    case 'lt':
                        where[field] = { lt: Number(cond.value) };
                        break;
                    case 'gte':
                        where[field] = { gte: Number(cond.value) };
                        break;
                    case 'lte':
                        where[field] = { lte: Number(cond.value) };
                        break;
                    case 'is_null':
                        where[field] = null;
                        break;
                    case 'is_not_null':
                        where[field] = { not: null };
                        break;
                }
                const contacts = await prisma.contact.findMany({
                    where,
                    select: { id: true },
                    take: LIMITS.CDP_SEGMENT_MAX_CONTACTS,
                });
                ids = contacts.map(c => c.id);
            }
            else if (cond.type === 'property') {
                // Filter on custom property values
                const prop = await prisma.customProperty.findFirst({
                    where: { orgId, fieldKey: cond.field },
                });
                if (!prop)
                    continue;
                const where = { orgId, propertyId: prop.id };
                switch (cond.operator) {
                    case 'equals':
                        where.value = String(cond.value);
                        break;
                    case 'not_equals':
                        where.value = { not: String(cond.value) };
                        break;
                    case 'contains':
                        where.value = { contains: String(cond.value), mode: 'insensitive' };
                        break;
                    case 'gt':
                    case 'gte':
                    case 'lt':
                    case 'lte':
                        // For numeric comparison, we do a raw query or fetch+filter
                        // Simple approach: fetch all and filter in memory
                        const allVals = await prisma.contactPropertyValue.findMany({
                            where: { orgId, propertyId: prop.id },
                            select: { contactId: true, value: true },
                        });
                        const numVal = Number(cond.value);
                        ids = allVals
                            .filter(v => {
                            const n = Number(v.value);
                            if (isNaN(n))
                                return false;
                            if (cond.operator === 'gt')
                                return n > numVal;
                            if (cond.operator === 'gte')
                                return n >= numVal;
                            if (cond.operator === 'lt')
                                return n < numVal;
                            if (cond.operator === 'lte')
                                return n <= numVal;
                            return false;
                        })
                            .map(v => v.contactId);
                        break;
                    default:
                        where.value = String(cond.value);
                }
                if (ids.length === 0 && !['gt', 'gte', 'lt', 'lte'].includes(cond.operator)) {
                    const values = await prisma.contactPropertyValue.findMany({
                        where,
                        select: { contactId: true },
                        take: LIMITS.CDP_SEGMENT_MAX_CONTACTS,
                    });
                    ids = values.map(v => v.contactId);
                }
            }
            else if (cond.type === 'event') {
                // Filter on CDP events
                if (cond.operator === 'has_event') {
                    const events = await prisma.cdpEvent.findMany({
                        where: { orgId, eventName: cond.field },
                        select: { contactId: true },
                        distinct: ['contactId'],
                        take: LIMITS.CDP_SEGMENT_MAX_CONTACTS,
                    });
                    ids = events.map(e => e.contactId);
                }
                else if (cond.operator === 'event_count_gte') {
                    const events = await prisma.cdpEvent.groupBy({
                        by: ['contactId'],
                        where: { orgId, eventName: cond.field },
                        _count: { id: true },
                        having: { id: { _count: { gte: Number(cond.value) } } },
                    });
                    ids = events.map(e => e.contactId);
                }
            }
            else if (cond.type === 'lifecycle') {
                // Filter on current lifecycle stage
                const contacts = await prisma.contact.findMany({
                    where: { orgId, lifecycleStage: String(cond.value), isGroup: false, deletedAt: null, mergedInto: null },
                    select: { id: true },
                    take: LIMITS.CDP_SEGMENT_MAX_CONTACTS,
                });
                ids = contacts.map(c => c.id);
            }
            groupResults.push(new Set(ids));
        }
        // Combine within group using AND/OR
        let groupIds;
        if (group.logic === 'OR') {
            groupIds = new Set();
            groupResults.forEach(s => s.forEach(id => groupIds.add(id)));
        }
        else {
            // AND — intersection
            if (groupResults.length === 0) {
                groupIds = new Set();
            }
            else {
                groupIds = groupResults[0];
                for (let i = 1; i < groupResults.length; i++) {
                    groupIds = new Set([...groupIds].filter(id => groupResults[i].has(id)));
                }
            }
        }
        // Intersect with previous groups (groups are always AND-ed)
        if (contactIds === null) {
            contactIds = [...groupIds];
        }
        else {
            const set = new Set(contactIds);
            contactIds = [...groupIds].filter(id => set.has(id));
        }
    }
    return contactIds ?? [];
}
/* ── Routes ───────────────────────────────────────────────────────── */
export async function cdpSegmentRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // ── LIST segments ───────────────────────────────────────────────
    app.get('/api/v1/cdp/segments', async (request) => {
        const user = request.user;
        const segments = await prisma.segment.findMany({
            where: { orgId: user.orgId },
            orderBy: { createdAt: 'desc' },
        });
        return { segments };
    });
    // ── CREATE segment ──────────────────────────────────────────────
    app.post('/api/v1/cdp/segments', async (request, reply) => {
        const user = request.user;
        const { name, description, conditions } = request.body;
        if (!name?.trim())
            return badRequest(reply, 'name is required');
        if (!conditions?.length)
            return badRequest(reply, 'conditions are required');
        // Calculate initial count
        const contactIds = await evaluateSegment(user.orgId, conditions);
        const segment = await prisma.segment.create({
            data: {
                orgId: user.orgId,
                name: name.trim(),
                description: description?.trim() || null,
                conditions: conditions,
                contactCount: contactIds.length,
                lastCalculatedAt: new Date(),
            },
        });
        return reply.code(201).send({ segment });
    });
    // ── UPDATE segment ──────────────────────────────────────────────
    app.put('/api/v1/cdp/segments/:id', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const body = request.body;
        const existing = await prisma.segment.findFirst({
            where: { id, orgId: user.orgId },
        });
        if (!existing)
            return notFound(reply, 'Segment');
        const data = {};
        if (body.name !== undefined)
            data.name = body.name.trim();
        if (body.description !== undefined)
            data.description = body.description?.trim() || null;
        if (body.conditions !== undefined) {
            data.conditions = body.conditions;
            // Recalculate count
            const ids = await evaluateSegment(user.orgId, body.conditions);
            data.contactCount = ids.length;
            data.lastCalculatedAt = new Date();
        }
        const segment = await prisma.segment.update({ where: { id }, data });
        return { segment };
    });
    // ── DELETE segment ──────────────────────────────────────────────
    app.delete('/api/v1/cdp/segments/:id', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const existing = await prisma.segment.findFirst({
            where: { id, orgId: user.orgId },
        });
        if (!existing)
            return notFound(reply, 'Segment');
        await prisma.segment.delete({ where: { id } });
        return { success: true };
    });
    // ── RECALCULATE segment ─────────────────────────────────────────
    app.post('/api/v1/cdp/segments/:id/calculate', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const segment = await prisma.segment.findFirst({
            where: { id, orgId: user.orgId },
        });
        if (!segment)
            return notFound(reply, 'Segment');
        const conditions = segment.conditions;
        const contactIds = await evaluateSegment(user.orgId, conditions);
        await prisma.segment.update({
            where: { id },
            data: { contactCount: contactIds.length, lastCalculatedAt: new Date() },
        });
        return { contactCount: contactIds.length, lastCalculatedAt: new Date().toISOString() };
    });
    // ── GET contacts in segment ─────────────────────────────────────
    app.get('/api/v1/cdp/segments/:id/contacts', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const limit = Math.min(parseInt(request.query.limit || '50'), 200);
        const offset = parseInt(request.query.offset || '0');
        const segment = await prisma.segment.findFirst({
            where: { id, orgId: user.orgId },
        });
        if (!segment)
            return notFound(reply, 'Segment');
        const conditions = segment.conditions;
        const contactIds = await evaluateSegment(user.orgId, conditions);
        const contacts = await prisma.contact.findMany({
            where: { id: { in: contactIds.slice(offset, offset + limit) } },
            orderBy: { updatedAt: 'desc' },
        });
        return { contacts, total: contactIds.length };
    });
}
//# sourceMappingURL=cdp-segment-routes.js.map