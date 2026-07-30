/**
 * api-key-service.ts — long-lived API keys for programmatic / MCP access.
 *
 * The raw key (`bzk_<random>`) is returned ONCE at creation; we store only its
 * sha256 hash. Verification hashes the presented key and looks it up. Keys are
 * org-scoped and grant admin-level API access until revoked.
 */
import { randomBytes, createHash } from 'node:crypto'
import { prisma } from '../../shared/prisma-client.js'

const KEY_PREFIX = 'bzk_'

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export interface ApiKeyContext {
  keyId: string
  orgId: string
}

export interface ApiKeyRow {
  id: string
  name: string
  prefix: string
  lastUsedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

const ROW_SELECT = {
  id: true,
  name: true,
  prefix: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
} as const

/** Create a key. Returns the RAW key (shown once) + its stored metadata. */
export async function createApiKey(
  orgId: string,
  createdById: string | null,
  name: string,
): Promise<{ rawKey: string; key: ApiKeyRow }> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Tên API key không được để trống')
  const rawKey = KEY_PREFIX + randomBytes(24).toString('base64url') // ~32 url-safe chars
  const prefix = rawKey.slice(0, 12) + '…'
  const key = await prisma.apiKey.create({
    data: { orgId, name: trimmed, prefix, keyHash: hashKey(rawKey), createdById },
    select: ROW_SELECT,
  })
  return { rawKey, key }
}

/** Verify a presented raw key. Returns its org context, or null if invalid/revoked. */
export async function verifyApiKey(rawKey: string): Promise<ApiKeyContext | null> {
  if (!rawKey.startsWith(KEY_PREFIX)) return null
  const row = await prisma.apiKey.findFirst({
    where: { keyHash: hashKey(rawKey), revokedAt: null },
    select: { id: true, orgId: true },
  })
  if (!row) return null
  // Touch lastUsedAt without blocking the request.
  prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  return { keyId: row.id, orgId: row.orgId }
}

export async function listApiKeys(orgId: string): Promise<ApiKeyRow[]> {
  return prisma.apiKey.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' }, select: ROW_SELECT })
}

/** Revoke a key (org-scoped). Idempotent. */
export async function revokeApiKey(orgId: string, id: string): Promise<boolean> {
  const res = await prisma.apiKey.updateMany({
    where: { id, orgId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return res.count > 0
}
