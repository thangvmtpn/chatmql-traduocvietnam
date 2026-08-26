import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import { emitDomainEvent } from '../../shared/domain-events.js';
import { badRequest, notFound } from '../../shared/http-errors.js';
export async function companyRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // GET /api/v1/companies — list with pagination + search
    app.get('/api/v1/companies', async (request) => {
        const user = request.user;
        const { page = '1', limit = '20', search } = request.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;
        const where = { orgId: user.orgId, deletedAt: null };
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { taxCode: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
            ];
        }
        const [companies, total] = await Promise.all([
            prisma.company.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { createdAt: 'desc' },
                include: {
                    owner: { select: { id: true, fullName: true } },
                    _count: { select: { contacts: { where: { deletedAt: null, mergedInto: null } } } },
                },
            }),
            prisma.company.count({ where }),
        ]);
        return { companies, total, page: pageNum, limit: limitNum };
    });
    // GET /api/v1/companies/:id — single company with first 50 contacts
    app.get('/api/v1/companies/:id', async (request, reply) => {
        const user = request.user;
        const company = await prisma.company.findFirst({
            where: { id: request.params.id, orgId: user.orgId, deletedAt: null },
            include: {
                owner: { select: { id: true, fullName: true, email: true } },
                contacts: {
                    where: { deletedAt: null, mergedInto: null },
                    orderBy: { isPrimaryContact: 'desc' },
                    take: 50,
                    select: {
                        id: true,
                        fullName: true,
                        crmName: true,
                        phone: true,
                        email: true,
                        avatarUrl: true,
                        jobTitle: true,
                        isPrimaryContact: true,
                        lifecycleStage: true,
                        leadScore: true,
                    },
                },
                _count: { select: { contacts: { where: { deletedAt: null, mergedInto: null } } } },
            },
        });
        if (!company)
            return notFound(reply, 'Company');
        return company;
    });
    // POST /api/v1/companies — create
    app.post('/api/v1/companies', async (request, reply) => {
        const user = request.user;
        const body = request.body;
        if (!body.name?.trim())
            return badRequest(reply, 'name is required');
        const company = await prisma.company.create({
            data: {
                orgId: user.orgId,
                name: body.name.trim(),
                taxCode: body.taxCode?.trim() || null,
                industry: body.industry?.trim() || null,
                size: body.size?.trim() || null,
                website: body.website?.trim() || null,
                address: body.address?.trim() || null,
                phone: body.phone?.trim() || null,
                email: body.email?.trim() || null,
                ownerId: body.ownerId || (user.role === 'member' ? user.id : null),
                notes: body.notes?.trim() || null,
                tags: body.tags ?? [],
                metadata: body.metadata ?? {},
            },
        });
        emitDomainEvent({ type: 'company.created', orgId: user.orgId, id: company.id });
        return company;
    });
    // PATCH /api/v1/companies/:id
    app.patch('/api/v1/companies/:id', async (request, reply) => {
        const user = request.user;
        const existing = await prisma.company.findFirst({
            where: { id: request.params.id, orgId: user.orgId, deletedAt: null },
        });
        if (!existing)
            return notFound(reply, 'Company');
        const body = request.body;
        const data = {};
        if (body.name !== undefined)
            data.name = body.name.trim();
        if (body.taxCode !== undefined)
            data.taxCode = body.taxCode?.trim() || null;
        if (body.industry !== undefined)
            data.industry = body.industry?.trim() || null;
        if (body.size !== undefined)
            data.size = body.size?.trim() || null;
        if (body.website !== undefined)
            data.website = body.website?.trim() || null;
        if (body.address !== undefined)
            data.address = body.address?.trim() || null;
        if (body.phone !== undefined)
            data.phone = body.phone?.trim() || null;
        if (body.email !== undefined)
            data.email = body.email?.trim() || null;
        if (body.ownerId !== undefined)
            data.ownerId = body.ownerId || null;
        if (body.notes !== undefined)
            data.notes = body.notes?.trim() || null;
        if (body.tags !== undefined)
            data.tags = body.tags;
        if (body.metadata !== undefined)
            data.metadata = body.metadata;
        const company = await prisma.company.update({ where: { id: request.params.id }, data });
        emitDomainEvent({ type: 'company.updated', orgId: user.orgId, id: company.id });
        return company;
    });
    // DELETE /api/v1/companies/:id — soft delete
    app.delete('/api/v1/companies/:id', async (request, reply) => {
        const user = request.user;
        const existing = await prisma.company.findFirst({
            where: { id: request.params.id, orgId: user.orgId, deletedAt: null },
        });
        if (!existing)
            return notFound(reply, 'Company');
        await prisma.company.update({
            where: { id: request.params.id },
            data: { deletedAt: new Date() },
        });
        emitDomainEvent({ type: 'company.deleted', orgId: user.orgId, id: request.params.id });
        return { ok: true };
    });
}
//# sourceMappingURL=company-routes.js.map