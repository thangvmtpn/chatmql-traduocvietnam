/**
 * platform-middleware.ts — Guard for platform-admin-only routes.
 *
 * Accepts ONLY tokens with claim `kind === 'platform'`. Company tokens are
 * rejected (403). Mirrors the structured TOKEN_* errors of authMiddleware so
 * the platform frontend can refresh/redirect consistently.
 */
import type { FastifyRequest, FastifyReply } from 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    platformAdmin?: { id: string; email: string; fullName: string }
  }
}

export async function requirePlatformAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await request.jwtVerify()
  } catch (err: any) {
    const message: string = err?.message || ''
    let code: 'TOKEN_EXPIRED' | 'TOKEN_INVALID' | 'TOKEN_MISSING' = 'TOKEN_INVALID'
    if (/expired/i.test(message) || err?.code === 'FAST_JWT_EXPIRED') code = 'TOKEN_EXPIRED'
    else if (/missing|no authorization/i.test(message) || err?.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
      code = 'TOKEN_MISSING'
    }
    reply.status(401).send({ error: 'Unauthorized', code })
    return
  }

  const u = request.user as { kind?: string; sub?: string; email?: string; fullName?: string }
  if (u?.kind !== 'platform' || !u.sub) {
    reply.status(403).send({ error: 'Forbidden', code: 'NOT_PLATFORM_ADMIN' })
    return
  }
  request.platformAdmin = { id: u.sub, email: u.email ?? '', fullName: u.fullName ?? '' }
}
