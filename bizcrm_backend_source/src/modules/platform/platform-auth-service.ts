/**
 * platform-auth-service.ts — Super admin identity (setup, login, profile).
 * PlatformAdmin is a separate identity from org Users; not scoped to any org.
 */
import bcrypt from 'bcryptjs'
import { prisma } from '../../shared/prisma-client.js'

export interface PlatformJwtPayload {
  kind: 'platform'
  sub: string // PlatformAdmin id
  email: string
  fullName: string
}

function httpError(message: string, statusCode: number, code?: string) {
  const err = new Error(message) as Error & { statusCode: number; code?: string }
  err.statusCode = statusCode
  if (code) err.code = code
  return err
}

/**
 * One-time setup: create the FIRST platform admin. Guarded by count===0.
 * Accessed via a manual link (/platform/setup) — no env token, no auto-detect.
 */
export async function platformSetup(
  fullName: string,
  email: string,
  password: string,
): Promise<PlatformJwtPayload> {
  const existing = await prisma.platformAdmin.count()
  if (existing > 0) {
    throw httpError('Super admin đã được khởi tạo', 409, 'SUPERADMIN_EXISTS')
  }
  if (password.length < 8) throw httpError('Mật khẩu tối thiểu 8 ký tự', 400)

  const passwordHash = await bcrypt.hash(password, 12)
  const admin = await prisma.platformAdmin.create({
    data: { email: email.toLowerCase().trim(), passwordHash, fullName },
  })
  return { kind: 'platform', sub: admin.id, email: admin.email, fullName: admin.fullName }
}

/** Verify platform-admin credentials. */
export async function platformLogin(email: string, password: string): Promise<PlatformJwtPayload> {
  const admin = await prisma.platformAdmin.findUnique({ where: { email: email.toLowerCase().trim() } })
  if (!admin || !admin.isActive) throw httpError('Email hoặc mật khẩu không đúng', 401)

  const valid = await bcrypt.compare(password, admin.passwordHash)
  if (!valid) throw httpError('Email hoặc mật khẩu không đúng', 401)

  await prisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } })
  return { kind: 'platform', sub: admin.id, email: admin.email, fullName: admin.fullName }
}

/** Safe profile for /platform/auth/me. */
export async function getPlatformProfile(adminId: string) {
  const admin = await prisma.platformAdmin.findUnique({
    where: { id: adminId },
    select: { id: true, email: true, fullName: true, isActive: true, lastLoginAt: true, createdAt: true },
  })
  if (!admin || !admin.isActive) throw httpError('Platform admin không khả dụng', 401, 'TOKEN_INVALID')
  return admin
}
