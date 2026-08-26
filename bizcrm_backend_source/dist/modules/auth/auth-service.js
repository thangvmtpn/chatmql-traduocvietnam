import bcrypt from 'bcryptjs';
import { prisma } from '../../shared/prisma-client.js';
import { isOrgUsable } from '../platform/org-license.js';
/** Check if first-run setup is needed */
export async function checkSetupStatus() {
    const count = await prisma.user.count();
    return { needsSetup: count === 0 };
}
/** Create initial org + owner user */
export async function setup(orgName, fullName, email, password) {
    const existing = await prisma.user.count();
    if (existing > 0) {
        const err = new Error('Setup already completed');
        err.statusCode = 400;
        throw err;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({ data: { name: orgName } });
        const user = await tx.user.create({
            data: {
                orgId: org.id,
                email: email.toLowerCase().trim(),
                passwordHash,
                fullName,
                role: 'owner',
            },
        });
        return { org, user };
    });
    return {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        role: result.user.role,
        orgId: result.org.id,
    };
}
/** Verify credentials, return JWT payload */
export async function login(email, password) {
    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
        include: { org: { select: { status: true, expiresAt: true } } },
    });
    if (!user || !user.isActive) {
        const err = new Error('Email hoặc mật khẩu không đúng');
        err.statusCode = 401;
        throw err;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
        const err = new Error('Email hoặc mật khẩu không đúng');
        err.statusCode = 401;
        throw err;
    }
    // License gate: block login when the company is expired or suspended.
    // (super admin can still enter via /platform login-as, which bypasses this.)
    assertOrgUsable(user.org);
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role, orgId: user.orgId };
}
/** Throw a 403 ORG_EXPIRED / ORG_SUSPENDED error when the org is unusable. */
export function assertOrgUsable(org) {
    const usable = isOrgUsable(org);
    if (usable.ok)
        return;
    const msg = usable.reason === 'EXPIRED'
        ? 'Tài khoản công ty đã hết hạn sử dụng. Vui lòng liên hệ để gia hạn.'
        : 'Tài khoản công ty đang bị tạm khóa. Vui lòng liên hệ quản trị hệ thống.';
    const err = new Error(msg);
    err.statusCode = 403;
    err.code = usable.reason === 'EXPIRED' ? 'ORG_EXPIRED' : 'ORG_SUSPENDED';
    throw err;
}
/** Return safe user profile (no password hash) */
export async function getProfile(userId) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            orgId: true,
            isActive: true,
            avatarUrl: true,
            createdAt: true,
            org: { select: { id: true, name: true, status: true, expiresAt: true } },
        },
    });
    if (!user) {
        const err = new Error('User not found');
        err.statusCode = 404;
        throw err;
    }
    return user;
}
//# sourceMappingURL=auth-service.js.map