import { requirePlatformAdmin } from './platform-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import { logPlatformAction } from './platform-audit.js';
const USER_SELECT = { id: true, email: true, fullName: true, role: true, isActive: true };
export async function platformEnterCompanyRoutes(app) {
    app.addHook('preHandler', requirePlatformAdmin);
    // POST /api/v1/platform/orgs/:orgId/login-as — body { userId? } (default: an owner)
    app.post('/api/v1/platform/orgs/:orgId/login-as', async (request, reply) => {
        const orgId = request.params.orgId;
        const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
        if (!org)
            return reply.status(404).send({ error: 'Organization not found' });
        let target;
        if (request.body?.userId) {
            target = await prisma.user.findFirst({ where: { id: request.body.userId, orgId }, select: USER_SELECT });
            if (!target)
                return reply.status(404).send({ error: 'User not found in org' });
        }
        else {
            target =
                (await prisma.user.findFirst({
                    where: { orgId, role: 'owner', isActive: true }, orderBy: { createdAt: 'asc' }, select: USER_SELECT,
                })) ??
                    (await prisma.user.findFirst({
                        where: { orgId, isActive: true }, orderBy: { createdAt: 'asc' }, select: USER_SELECT,
                    }));
            if (!target)
                return reply.status(400).send({ error: 'Company chưa có tài khoản hoạt động để đăng nhập' });
        }
        if (!target.isActive)
            return reply.status(400).send({ error: 'Tài khoản đã bị khóa' });
        const payload = {
            id: target.id,
            email: target.email,
            fullName: target.fullName,
            role: target.role,
            orgId,
            kind: 'company',
            platformActorId: request.platformAdmin.id,
        };
        // 4h window, access-only (no refresh) — mirrors same-org impersonation.
        const accessToken = app.jwt.sign(payload, { expiresIn: '4h' });
        await logPlatformAction(request.platformAdmin.id, 'enter_company', { targetOrgId: orgId, targetUserId: target.id });
        return { token: accessToken, user: payload };
    });
}
//# sourceMappingURL=enter-company-routes.js.map