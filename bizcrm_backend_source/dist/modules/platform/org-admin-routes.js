import { requirePlatformAdmin } from './platform-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import { getOrgStatsMap } from './org-stats-service.js';
import { orgDisplayStatus, isExpiringWithin } from './org-license.js';
import { logPlatformAction } from './platform-audit.js';
const ORG_SELECT = {
    id: true, name: true, status: true, expiresAt: true,
    plan: true, adminNotes: true, createdAt: true, updatedAt: true,
};
export async function platformOrgRoutes(app) {
    app.addHook('preHandler', requirePlatformAdmin);
    // GET /api/v1/platform/orgs — paginated company list with stats
    app.get('/api/v1/platform/orgs', async (request) => {
        const search = (request.query.search ?? '').trim();
        const page = Math.max(1, parseInt(request.query.page ?? '1') || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(request.query.pageSize ?? '20') || 20));
        const where = search ? { name: { contains: search, mode: 'insensitive' } } : {};
        const [total, orgs] = await Promise.all([
            prisma.organization.count({ where }),
            prisma.organization.findMany({
                where, orderBy: { createdAt: 'desc' },
                skip: (page - 1) * pageSize, take: pageSize, select: ORG_SELECT,
            }),
        ]);
        const stats = await getOrgStatsMap(orgs.map((o) => o.id));
        const items = orgs.map((o) => ({
            ...o,
            displayStatus: orgDisplayStatus(o),
            expiringSoon: isExpiringWithin(o, 7),
            stats: stats.get(o.id) ?? { users: 0, contacts: 0, conversations: 0 },
        }));
        return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
    });
    // GET /api/v1/platform/orgs/:orgId — detail + users
    app.get('/api/v1/platform/orgs/:orgId', async (request, reply) => {
        const org = await prisma.organization.findUnique({ where: { id: request.params.orgId }, select: ORG_SELECT });
        if (!org)
            return reply.status(404).send({ error: 'Organization not found' });
        const stats = (await getOrgStatsMap([org.id])).get(org.id);
        const users = await prisma.user.findMany({
            where: { orgId: org.id }, orderBy: { createdAt: 'asc' },
            select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true },
        });
        return { ...org, displayStatus: orgDisplayStatus(org), expiringSoon: isExpiringWithin(org, 7), stats, users };
    });
    // PATCH /api/v1/platform/orgs/:orgId — name / plan / adminNotes
    app.patch('/api/v1/platform/orgs/:orgId', async (request, reply) => {
        const { name, plan, adminNotes } = request.body ?? {};
        const data = {};
        if (name !== undefined)
            data.name = name;
        if (plan !== undefined)
            data.plan = plan;
        if (adminNotes !== undefined)
            data.adminNotes = adminNotes;
        if (Object.keys(data).length === 0)
            return reply.status(400).send({ error: 'Không có thay đổi' });
        const exists = await prisma.organization.findUnique({ where: { id: request.params.orgId }, select: { id: true } });
        if (!exists)
            return reply.status(404).send({ error: 'Organization not found' });
        const org = await prisma.organization.update({ where: { id: request.params.orgId }, data, select: ORG_SELECT });
        await logPlatformAction(request.platformAdmin.id, 'org.update', { targetOrgId: org.id, meta: data });
        return org;
    });
    // PATCH /api/v1/platform/orgs/:orgId/license — expiresAt (null = unlimited) + status
    app.patch('/api/v1/platform/orgs/:orgId/license', async (request, reply) => {
        const { expiresAt, status } = request.body ?? {};
        const data = {};
        if (expiresAt !== undefined) {
            if (expiresAt === null)
                data.expiresAt = null;
            else {
                const d = new Date(expiresAt);
                if (isNaN(d.getTime()))
                    return reply.status(400).send({ error: 'expiresAt không hợp lệ' });
                data.expiresAt = d;
            }
        }
        if (status !== undefined) {
            if (status !== 'active' && status !== 'suspended') {
                return reply.status(400).send({ error: 'status phải là active hoặc suspended' });
            }
            data.status = status;
        }
        if (Object.keys(data).length === 0)
            return reply.status(400).send({ error: 'Không có thay đổi' });
        const exists = await prisma.organization.findUnique({ where: { id: request.params.orgId }, select: { id: true } });
        if (!exists)
            return reply.status(404).send({ error: 'Organization not found' });
        const org = await prisma.organization.update({ where: { id: request.params.orgId }, data, select: ORG_SELECT });
        await logPlatformAction(request.platformAdmin.id, 'org.license', { targetOrgId: org.id, meta: data });
        return { ...org, displayStatus: orgDisplayStatus(org), expiringSoon: isExpiringWithin(org, 7) };
    });
}
//# sourceMappingURL=org-admin-routes.js.map