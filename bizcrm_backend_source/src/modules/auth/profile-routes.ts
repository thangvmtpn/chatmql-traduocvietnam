/**
 * profile-routes.ts — User profile API.
 * GET   /api/v1/profile        → return current user info
 * PATCH /api/v1/profile        → update fullName / avatarUrl
 * POST  /api/v1/profile/avatar → upload avatar image, returns URL
 */
import type { FastifyInstance } from 'fastify'
import multipart from '@fastify/multipart'
import { randomUUID } from 'crypto'
import { mkdir, writeFile, unlink } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const UPLOADS_DIR = path.resolve(__dirname, '../../../uploads/avatars')

// Ensure uploads directory exists at startup
mkdir(UPLOADS_DIR, { recursive: true }).catch(() => {})

// Max file size: 2MB
const MAX_FILE_SIZE = 2 * 1024 * 1024
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  // Register multipart plugin scoped to this encapsulation context
  await app.register(multipart, { limits: { fileSize: MAX_FILE_SIZE } })

  app.addHook('preHandler', authMiddleware)

  // ── Get profile ─────────────────────────────────────────────────
  app.get('/api/v1/profile', async (request) => {
    const user = request.user as { id: string }
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
    })
    return profile
  })

  // ── Update profile ───────────────────────────────────────────────
  app.patch<{
    Body: { fullName?: string; avatarUrl?: string | null }
  }>('/api/v1/profile', async (request, reply) => {
    const user = request.user as { id: string }
    const { fullName, avatarUrl } = request.body

    const data: Record<string, unknown> = {}
    if (fullName !== undefined) data.fullName = fullName.trim()
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl

    if (Object.keys(data).length === 0) {
      return reply.status(400).send({ error: 'Nothing to update' })
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
    })
    return updated
  })

  // ── Avatar upload ──────────────────────────────────────────────
  app.post('/api/v1/profile/avatar', async (request, reply) => {
    const user = request.user as { id: string }

    const file = await request.file()
    if (!file) {
      return reply.status(400).send({ error: 'Vui lòng chọn file ảnh' })
    }

    // Validate MIME type
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return reply.status(400).send({
        error: 'Chỉ chấp nhận file ảnh (JPG, PNG, WebP, GIF)',
      })
    }

    const buffer = await file.toBuffer()

    // Check file size (double-check in case limit plugin is bypassed)
    if (buffer.length > MAX_FILE_SIZE) {
      return reply.status(400).send({ error: 'Kích thước file tối đa 2MB' })
    }

    // Generate unique filename: userId-uuid.ext
    const ext = path.extname(file.filename || '.jpg').toLowerCase()
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg'
    const filename = `${user.id}-${randomUUID().slice(0, 8)}${safeExt}`
    const filepath = path.join(UPLOADS_DIR, filename)

    // Delete old avatar file if exists (best-effort)
    const existing = await prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true },
    })
    if (existing?.avatarUrl) {
      const oldFilename = existing.avatarUrl.split('/').pop()
      if (oldFilename) {
        unlink(path.join(UPLOADS_DIR, oldFilename)).catch(() => {})
      }
    }

    // Write new file
    await writeFile(filepath, buffer)

    // Build URL — relative path that works via the static plugin
    const avatarUrl = `/uploads/avatars/${filename}`

    // Update user record
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
    })

    return updated
  })

  // ── Delete avatar ──────────────────────────────────────────────
  app.delete('/api/v1/profile/avatar', async (request) => {
    const user = request.user as { id: string }

    // Get current avatar to delete file
    const existing = await prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true },
    })
    if (existing?.avatarUrl) {
      const oldFilename = existing.avatarUrl.split('/').pop()
      if (oldFilename) {
        unlink(path.join(UPLOADS_DIR, oldFilename)).catch(() => {})
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: null },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
    })
    return updated
  })
}
