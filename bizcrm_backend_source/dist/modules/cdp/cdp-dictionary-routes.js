import { prisma } from '../../shared/prisma-client.js';
export const cdpDictionaryRoutes = async (app) => {
    // Add authentication hook
    app.addHook('onRequest', async (request, reply) => {
        try {
            await request.jwtVerify();
        }
        catch (err) {
            reply.status(401).send({ error: 'Unauthorized' });
        }
    });
    // Get all event definitions
    app.get('/api/v1/cdp/dictionary', async (req) => {
        const orgId = req.user.orgId;
        const definitions = await prisma.cdpEventDefinition.findMany({
            where: { orgId },
            orderBy: { eventName: 'asc' },
        });
        return definitions;
    });
    // Create an event definition
    app.post('/api/v1/cdp/dictionary', async (req, reply) => {
        const orgId = req.user.orgId;
        const { eventName, displayName, description, schema, isActive } = req.body;
        if (!eventName || !displayName) {
            return reply.status(400).send({ error: 'eventName and displayName are required' });
        }
        // Check existing
        const existing = await prisma.cdpEventDefinition.findUnique({
            where: { orgId_eventName: { orgId, eventName } }
        });
        if (existing) {
            return reply.status(400).send({ error: 'Event definition already exists' });
        }
        const definition = await prisma.cdpEventDefinition.create({
            data: {
                orgId,
                eventName,
                displayName,
                description,
                schema: schema || {},
                isActive: isActive !== undefined ? isActive : true,
            }
        });
        return definition;
    });
    // Update an event definition
    app.put('/api/v1/cdp/dictionary/:id', async (req, reply) => {
        const orgId = req.user.orgId;
        const { id } = req.params;
        const { displayName, description, schema, isActive } = req.body;
        const existing = await prisma.cdpEventDefinition.findUnique({ where: { id } });
        if (!existing || existing.orgId !== orgId) {
            return reply.status(404).send({ error: 'Not found' });
        }
        const updated = await prisma.cdpEventDefinition.update({
            where: { id },
            data: {
                displayName,
                description,
                schema,
                isActive,
            }
        });
        return updated;
    });
    // Delete an event definition
    app.delete('/api/v1/cdp/dictionary/:id', async (req, reply) => {
        const orgId = req.user.orgId;
        const { id } = req.params;
        const existing = await prisma.cdpEventDefinition.findUnique({ where: { id } });
        if (!existing || existing.orgId !== orgId) {
            return reply.status(404).send({ error: 'Not found' });
        }
        await prisma.cdpEventDefinition.delete({ where: { id } });
        return { success: true };
    });
};
//# sourceMappingURL=cdp-dictionary-routes.js.map