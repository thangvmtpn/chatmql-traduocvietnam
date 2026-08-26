import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
export async function taskRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // GET /api/v1/tasks — list with filters
    app.get('/api/v1/tasks', async (request) => {
        const user = request.user;
        const { status, priority, assignedUserId, page = '1', limit = '20' } = request.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;
        const where = { orgId: user.orgId };
        if (status)
            where.status = status;
        if (priority)
            where.priority = priority;
        if (assignedUserId)
            where.assignedUserId = assignedUserId;
        const [tasks, total] = await Promise.all([
            prisma.task.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: [{ dueDate: 'asc' }, { priority: 'asc' }, { createdAt: 'desc' }],
                include: {
                    assignedUser: { select: { id: true, fullName: true, avatarUrl: true } },
                    createdBy: { select: { id: true, fullName: true } },
                },
            }),
            prisma.task.count({ where }),
        ]);
        return { tasks, total, page: pageNum, limit: limitNum };
    });
    // GET /api/v1/tasks/counts — count by status (for sidebar badge)
    app.get('/api/v1/tasks/counts', async (request) => {
        const user = request.user;
        const counts = await prisma.task.groupBy({
            by: ['status'],
            where: { orgId: user.orgId },
            _count: { _all: true },
        });
        const result = { todo: 0, in_progress: 0, done: 0, cancelled: 0 };
        for (const c of counts) {
            result[c.status] = c._count._all;
        }
        result.active = result.todo + result.in_progress;
        return result;
    });
    // GET /api/v1/tasks/:id — single task
    app.get('/api/v1/tasks/:id', async (request, reply) => {
        const user = request.user;
        const task = await prisma.task.findFirst({
            where: { id: request.params.id, orgId: user.orgId },
            include: {
                assignedUser: { select: { id: true, fullName: true, avatarUrl: true } },
                createdBy: { select: { id: true, fullName: true } },
            },
        });
        if (!task)
            return reply.status(404).send({ error: 'Task not found' });
        return task;
    });
    // POST /api/v1/tasks — create
    app.post('/api/v1/tasks', async (request, reply) => {
        const user = request.user;
        const { title, description, priority, dueDate, assignedUserId, contactId, conversationId } = request.body;
        if (!title || title.trim().length === 0) {
            return reply.status(400).send({ error: 'Title is required' });
        }
        const task = await prisma.task.create({
            data: {
                orgId: user.orgId,
                title: title.trim(),
                description: description?.trim() || null,
                priority: priority || 'medium',
                dueDate: dueDate ? new Date(dueDate) : null,
                assignedUserId: assignedUserId || null,
                contactId: contactId || null,
                conversationId: conversationId || null,
                createdByUserId: user.id,
            },
            include: {
                assignedUser: { select: { id: true, fullName: true, avatarUrl: true } },
                createdBy: { select: { id: true, fullName: true } },
            },
        });
        return task;
    });
    // PUT /api/v1/tasks/:id — update
    app.put('/api/v1/tasks/:id', async (request, reply) => {
        const user = request.user;
        const existing = await prisma.task.findFirst({
            where: { id: request.params.id, orgId: user.orgId },
        });
        if (!existing)
            return reply.status(404).send({ error: 'Task not found' });
        const data = { ...request.body };
        if (data.dueDate !== undefined) {
            data.dueDate = data.dueDate ? new Date(data.dueDate) : null;
        }
        if (data.title !== undefined) {
            data.title = data.title.trim();
        }
        // Set completedAt when status transitions to done
        if (data.status === 'done' && existing.status !== 'done') {
            data.completedAt = new Date();
        }
        else if (data.status && data.status !== 'done') {
            data.completedAt = null;
        }
        const task = await prisma.task.update({
            where: { id: request.params.id },
            data,
            include: {
                assignedUser: { select: { id: true, fullName: true, avatarUrl: true } },
                createdBy: { select: { id: true, fullName: true } },
            },
        });
        return task;
    });
    // DELETE /api/v1/tasks/:id
    app.delete('/api/v1/tasks/:id', async (request, reply) => {
        const user = request.user;
        const existing = await prisma.task.findFirst({
            where: { id: request.params.id, orgId: user.orgId },
        });
        if (!existing)
            return reply.status(404).send({ error: 'Task not found' });
        await prisma.task.delete({ where: { id: request.params.id } });
        return { ok: true };
    });
}
//# sourceMappingURL=task-routes.js.map