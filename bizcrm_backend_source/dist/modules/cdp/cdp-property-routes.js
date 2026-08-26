import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import { badRequest, notFound, conflict } from '../../shared/http-errors.js';
import { runAutomationRules } from '../automation/automation-engine.js';
const VALID_FIELD_TYPES = ['text', 'number', 'date', 'boolean', 'single_select', 'multi_select'];
function toFieldKey(name) {
    return name
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
}
export async function cdpPropertyRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // ── LIST custom properties ──────────────────────────────────────
    app.get('/api/v1/cdp/properties', async (request) => {
        const user = request.user;
        const { group } = request.query;
        const where = { orgId: user.orgId };
        if (group)
            where.groupName = group;
        const properties = await prisma.customProperty.findMany({
            where,
            orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        });
        return { properties };
    });
    // ── CREATE custom property ──────────────────────────────────────
    app.post('/api/v1/cdp/properties', async (request, reply) => {
        const user = request.user;
        const { name, fieldType, options, isRequired, groupName, description, sortOrder } = request.body;
        if (!name?.trim())
            return badRequest(reply, 'name is required');
        if (!VALID_FIELD_TYPES.includes(fieldType)) {
            return badRequest(reply, `fieldType must be one of: ${VALID_FIELD_TYPES.join(', ')}`);
        }
        const fieldKey = toFieldKey(name);
        // Check uniqueness
        const existing = await prisma.customProperty.findUnique({
            where: { orgId_fieldKey: { orgId: user.orgId, fieldKey } },
        });
        if (existing) {
            return conflict(reply, `Property with key "${fieldKey}" already exists`);
        }
        const property = await prisma.customProperty.create({
            data: {
                orgId: user.orgId,
                name: name.trim(),
                fieldKey,
                fieldType,
                options: options ?? [],
                isRequired: isRequired ?? false,
                groupName: groupName?.trim() || null,
                description: description?.trim() || null,
                sortOrder: sortOrder ?? 0,
            },
        });
        return reply.code(201).send({ property });
    });
    // ── UPDATE custom property ──────────────────────────────────────
    app.put('/api/v1/cdp/properties/:id', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const body = request.body;
        const existing = await prisma.customProperty.findFirst({
            where: { id, orgId: user.orgId },
        });
        if (!existing)
            return notFound(reply, 'Property');
        if (body.fieldType && !VALID_FIELD_TYPES.includes(body.fieldType)) {
            return badRequest(reply, `fieldType must be one of: ${VALID_FIELD_TYPES.join(', ')}`);
        }
        const data = {};
        if (body.name !== undefined) {
            data.name = body.name.trim();
            data.fieldKey = toFieldKey(body.name);
        }
        if (body.fieldType !== undefined)
            data.fieldType = body.fieldType;
        if (body.options !== undefined)
            data.options = body.options;
        if (body.isRequired !== undefined)
            data.isRequired = body.isRequired;
        if (body.groupName !== undefined)
            data.groupName = body.groupName?.trim() || null;
        if (body.description !== undefined)
            data.description = body.description?.trim() || null;
        if (body.sortOrder !== undefined)
            data.sortOrder = body.sortOrder;
        const property = await prisma.customProperty.update({
            where: { id },
            data,
        });
        return { property };
    });
    // ── DELETE custom property ──────────────────────────────────────
    app.delete('/api/v1/cdp/properties/:id', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const existing = await prisma.customProperty.findFirst({
            where: { id, orgId: user.orgId },
        });
        if (!existing)
            return notFound(reply, 'Property');
        // Delete all values for this property first, then the property
        await prisma.contactPropertyValue.deleteMany({ where: { propertyId: id } });
        await prisma.customProperty.delete({ where: { id } });
        return { success: true };
    });
    // ── GET contact property values ─────────────────────────────────
    app.get('/api/v1/contacts/:contactId/properties', async (request, reply) => {
        const user = request.user;
        const { contactId } = request.params;
        const contact = await prisma.contact.findFirst({
            where: { id: contactId, orgId: user.orgId },
            select: { id: true },
        });
        if (!contact)
            return notFound(reply, 'Contact');
        // Get all properties + values for this contact
        const properties = await prisma.customProperty.findMany({
            where: { orgId: user.orgId },
            orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }],
            include: {
                values: {
                    where: { contactId },
                    take: 1,
                },
            },
        });
        // Flatten into a clean structure
        const result = properties.map(p => ({
            id: p.id,
            fieldKey: p.fieldKey,
            name: p.name,
            fieldType: p.fieldType,
            options: p.options,
            isRequired: p.isRequired,
            groupName: p.groupName,
            description: p.description,
            value: p.values[0]?.value ?? '',
        }));
        return { properties: result };
    });
    // ── UPSERT contact property values ──────────────────────────────
    app.put('/api/v1/contacts/:contactId/properties', async (request, reply) => {
        const user = request.user;
        const { contactId } = request.params;
        const { values } = request.body;
        if (!values || !Array.isArray(values)) {
            return badRequest(reply, 'values array is required');
        }
        const contact = await prisma.contact.findFirst({
            where: { id: contactId, orgId: user.orgId },
            select: { id: true },
        });
        if (!contact)
            return notFound(reply, 'Contact');
        // Batch upsert all values
        const results = await Promise.all(values.map(v => prisma.contactPropertyValue.upsert({
            where: {
                contactId_propertyId: { contactId, propertyId: v.propertyId },
            },
            create: {
                orgId: user.orgId,
                contactId,
                propertyId: v.propertyId,
                value: v.value,
            },
            update: {
                value: v.value,
            },
        })));
        // Fire property_changed triggers (fire-and-forget)
        const propertyIds = values.map(v => v.propertyId);
        prisma.customProperty.findMany({
            where: { id: { in: propertyIds } },
            select: { id: true, fieldKey: true, name: true },
        }).then(props => {
            const keyMap = new Map(props.map(p => [p.id, p]));
            for (const v of values) {
                const prop = keyMap.get(v.propertyId);
                if (!prop)
                    continue;
                runAutomationRules('property_changed', {
                    orgId: user.orgId,
                    contactId,
                    triggerData: {
                        fieldKey: prop.fieldKey,
                        fieldName: prop.name,
                        newValue: v.value,
                    },
                }).catch(() => { });
            }
        }).catch(() => { });
        return { updated: results.length };
    });
    // ── LIST property groups ────────────────────────────────────────
    app.get('/api/v1/cdp/property-groups', async (request) => {
        const user = request.user;
        const props = await prisma.customProperty.findMany({
            where: { orgId: user.orgId },
            select: { groupName: true },
        });
        const groupCounts = {};
        for (const p of props) {
            const g = p.groupName || 'Chung';
            groupCounts[g] = (groupCounts[g] || 0) + 1;
        }
        return { groups: Object.entries(groupCounts).map(([name, count]) => ({ name, count })) };
    });
    // ── RENAME a property group ─────────────────────────────────────
    app.put('/api/v1/cdp/property-groups/rename', async (request, reply) => {
        const user = request.user;
        const { oldName, newName } = request.body;
        if (!oldName || !newName?.trim())
            return badRequest(reply, 'oldName and newName required');
        const result = await prisma.customProperty.updateMany({
            where: { orgId: user.orgId, groupName: oldName },
            data: { groupName: newName.trim() },
        });
        return { updated: result.count };
    });
    // ── REORDER properties in groups ────────────────────────────────
    app.put('/api/v1/cdp/property-groups/reorder', async (request, reply) => {
        const user = request.user;
        const { items } = request.body;
        if (!Array.isArray(items))
            return badRequest(reply, 'items array required');
        await Promise.all(items.map(item => prisma.customProperty.updateMany({
            where: { id: item.id, orgId: user.orgId },
            data: {
                sortOrder: item.sortOrder,
                ...(item.groupName !== undefined ? { groupName: item.groupName } : {}),
            },
        })));
        return { updated: items.length };
    });
}
//# sourceMappingURL=cdp-property-routes.js.map