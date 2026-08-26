import bcrypt from 'bcryptjs';
import { requirePlatformAdmin } from './platform-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import { logPlatformAction } from './platform-audit.js';
const ROLES = ['owner', 'admin', 'manager', 'member'];
export async function platformProvisioningRoutes(app) {
    app.addHook('preHandler', requirePlatformAdmin);
    // POST /api/v1/platform/orgs — create company + initial owner
    app.post('/api/v1/platform/orgs', async (request, reply) => {
        const { orgName, ownerFullName, ownerEmail, ownerPassword, expiresAt, plan } = request.body ?? {};
        if (!orgName || !ownerFullName || !ownerEmail || !ownerPassword) {
            return reply.status(400).send({ error: 'Thiếu thông tin bắt buộc' });
        }
        if (ownerPassword.length < 8)
            return reply.status(400).send({ error: 'Mật khẩu tối thiểu 8 ký tự' });
        const email = ownerEmail.toLowerCase().trim();
        const dup = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (dup)
            return reply.status(409).send({ error: 'Email đã được sử dụng', code: 'EMAIL_TAKEN' });
        let expires = null;
        if (expiresAt) {
            const d = new Date(expiresAt);
            if (isNaN(d.getTime()))
                return reply.status(400).send({ error: 'expiresAt không hợp lệ' });
            expires = d;
        }
        const passwordHash = await bcrypt.hash(ownerPassword, 12);
        const result = await prisma.$transaction(async (tx) => {
            const org = await tx.organization.create({ data: { name: orgName, expiresAt: expires, plan: plan ?? null } });
            const owner = await tx.user.create({
                data: { orgId: org.id, email, passwordHash, fullName: ownerFullName, role: 'owner' },
            });
            return { org, owner };
        });
        await logPlatformAction(request.platformAdmin.id, 'org.create', {
            targetOrgId: result.org.id, targetUserId: result.owner.id, meta: { orgName, ownerEmail: email },
        });
        return reply.status(201).send({
            org: { id: result.org.id, name: result.org.name, status: result.org.status, expiresAt: result.org.expiresAt, plan: result.org.plan },
            owner: { id: result.owner.id, email: result.owner.email, fullName: result.owner.fullName, role: result.owner.role },
        });
    });
    // GET /api/v1/platform/orgs/:orgId/users — for the login-as picker / user mgmt
    app.get('/api/v1/platform/orgs/:orgId/users', async (request, reply) => {
        const org = await prisma.organization.findUnique({ where: { id: request.params.orgId }, select: { id: true } });
        if (!org)
            return reply.status(404).send({ error: 'Organization not found' });
        const items = await prisma.user.findMany({
            where: { orgId: org.id }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
            select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true },
        });
        return { items };
    });
    // POST /api/v1/platform/orgs/:orgId/users — add a user to a company
    app.post('/api/v1/platform/orgs/:orgId/users', async (request, reply) => {
        const { fullName, email, password, role } = request.body ?? {};
        if (!fullName || !email || !password)
            return reply.status(400).send({ error: 'Thiếu thông tin bắt buộc' });
        if (password.length < 8)
            return reply.status(400).send({ error: 'Mật khẩu tối thiểu 8 ký tự' });
        const r = role && ROLES.includes(role) ? role : 'member';
        const org = await prisma.organization.findUnique({ where: { id: request.params.orgId }, select: { id: true } });
        if (!org)
            return reply.status(404).send({ error: 'Organization not found' });
        const e = email.toLowerCase().trim();
        const dup = await prisma.user.findUnique({ where: { email: e }, select: { id: true } });
        if (dup)
            return reply.status(409).send({ error: 'Email đã được sử dụng', code: 'EMAIL_TAKEN' });
        const passwordHash = await bcrypt.hash(password, 12);
        const user = await prisma.user.create({ data: { orgId: org.id, email: e, passwordHash, fullName, role: r } });
        await logPlatformAction(request.platformAdmin.id, 'account.create', {
            targetOrgId: org.id, targetUserId: user.id, meta: { email: e, role: r },
        });
        return reply.status(201).send({ id: user.id, email: user.email, fullName: user.fullName, role: user.role, isActive: user.isActive });
    });
    // POST /api/v1/platform/orgs/:orgId/users/:userId/reset-password
    app.post('/api/v1/platform/orgs/:orgId/users/:userId/reset-password', async (request, reply) => {
        const { newPassword } = request.body ?? {};
        if (!newPassword || newPassword.length < 8)
            return reply.status(400).send({ error: 'Mật khẩu tối thiểu 8 ký tự' });
        const user = await prisma.user.findFirst({
            where: { id: request.params.userId, orgId: request.params.orgId }, select: { id: true },
        });
        if (!user)
            return reply.status(404).send({ error: 'User not found in org' });
        const passwordHash = await bcrypt.hash(newPassword, 12);
        await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
        await logPlatformAction(request.platformAdmin.id, 'account.reset_password', {
            targetOrgId: request.params.orgId, targetUserId: user.id,
        });
        return { success: true };
    });
    // PATCH /api/v1/platform/orgs/:orgId/users/:userId — lock/unlock (isActive)
    app.patch('/api/v1/platform/orgs/:orgId/users/:userId', async (request, reply) => {
        const { isActive } = request.body ?? {};
        if (typeof isActive !== 'boolean')
            return reply.status(400).send({ error: 'isActive phải là boolean' });
        const user = await prisma.user.findFirst({
            where: { id: request.params.userId, orgId: request.params.orgId }, select: { id: true },
        });
        if (!user)
            return reply.status(404).send({ error: 'User not found in org' });
        const updated = await prisma.user.update({
            where: { id: user.id }, data: { isActive }, select: { id: true, isActive: true },
        });
        await logPlatformAction(request.platformAdmin.id, 'account.update', {
            targetOrgId: request.params.orgId, targetUserId: user.id, meta: { isActive },
        });
        return updated;
    });
}
//# sourceMappingURL=provisioning-routes.js.map