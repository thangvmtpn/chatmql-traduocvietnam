/**
 * platform-branding-routes.ts — White-label branding under /api/v1/platform.
 *
 * Public GETs (brand meta + logo/favicon bytes) are reachable before login so
 * the login page + document title + favicon reflect the brand. Mutations are
 * guarded by requirePlatformAdmin (super admin only).
 */
import type { FastifyInstance, FastifyReply } from 'fastify'
import { requirePlatformAdmin } from './platform-middleware.js'
import { BrandingImageError, type BrandingImageKind } from './branding-image.js'
import {
  getBrandingMeta,
  getBrandingImage,
  setBrandName,
  setBrandingImage,
  clearBrandingImage,
} from './platform-branding-service.js'

// Allow up to 4MB request bodies for image uploads (base64 inflates ~33%, and
// the global Fastify default is only 1MB).
const IMAGE_UPLOAD_BODY_LIMIT = 4 * 1024 * 1024

function handleBrandingError(err: unknown, reply: FastifyReply): boolean {
  if (err instanceof BrandingImageError) {
    reply.status(400).send({ error: err.message })
    return true
  }
  return false
}

async function serveImage(kind: BrandingImageKind, reply: FastifyReply): Promise<void> {
  const image = await getBrandingImage(kind)
  if (!image) {
    reply.status(404).send({ error: 'Chưa có ảnh thương hiệu.' })
    return
  }
  reply
    .header('Content-Type', image.mime)
    // Immutable-ish: URLs are versioned by updatedAt, so long cache is safe.
    .header('Cache-Control', 'public, max-age=86400')
    // Harden against SVG script execution if the URL is opened directly.
    .header('X-Content-Type-Options', 'nosniff')
    .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
    .send(image.buffer)
}

export async function platformBrandingRoutes(app: FastifyInstance): Promise<void> {
  // ── Public ────────────────────────────────────────────────────────
  // GET /api/v1/platform/branding — brand name + image version tokens
  app.get<{ Querystring: { brand?: string } }>('/api/v1/platform/branding', async (request) => {
    const host = request.query?.brand || (request.headers['x-forwarded-host'] as string) || request.headers.host || ''
    return getBrandingMeta(host)
  })

  // GET /api/v1/platform/branding/logo — serve logo bytes
  app.get('/api/v1/platform/branding/logo', async (_req, reply) => {
    await serveImage('logo', reply)
  })

  // GET /api/v1/platform/branding/favicon — serve favicon bytes
  app.get('/api/v1/platform/branding/favicon', async (_req, reply) => {
    await serveImage('favicon', reply)
  })

  // ── Super admin only ──────────────────────────────────────────────
  // PUT /api/v1/platform/branding — set brand name
  app.put<{ Body: { brandName?: string } }>(
    '/api/v1/platform/branding',
    { preHandler: requirePlatformAdmin },
    async (request, reply) => {
      try {
        const brandName = await setBrandName(request.body?.brandName ?? '')
        return { success: true, brandName }
      } catch (err) {
        if (handleBrandingError(err, reply)) return
        throw err
      }
    },
  )

  // PUT /api/v1/platform/branding/logo — upload logo (base64 data URL)
  app.put<{ Body: { dataUrl?: string } }>(
    '/api/v1/platform/branding/logo',
    { preHandler: requirePlatformAdmin, bodyLimit: IMAGE_UPLOAD_BODY_LIMIT },
    async (request, reply) => {
      try {
        await setBrandingImage('logo', request.body?.dataUrl)
        return { success: true }
      } catch (err) {
        if (handleBrandingError(err, reply)) return
        throw err
      }
    },
  )

  // PUT /api/v1/platform/branding/favicon — upload favicon (base64 data URL)
  app.put<{ Body: { dataUrl?: string } }>(
    '/api/v1/platform/branding/favicon',
    { preHandler: requirePlatformAdmin, bodyLimit: IMAGE_UPLOAD_BODY_LIMIT },
    async (request, reply) => {
      try {
        await setBrandingImage('favicon', request.body?.dataUrl)
        return { success: true }
      } catch (err) {
        if (handleBrandingError(err, reply)) return
        throw err
      }
    },
  )

  // DELETE /api/v1/platform/branding/logo — reset logo to default
  app.delete('/api/v1/platform/branding/logo', { preHandler: requirePlatformAdmin }, async () => {
    await clearBrandingImage('logo')
    return { success: true }
  })

  // DELETE /api/v1/platform/branding/favicon — reset favicon to default
  app.delete('/api/v1/platform/branding/favicon', { preHandler: requirePlatformAdmin }, async () => {
    await clearBrandingImage('favicon')
    return { success: true }
  })
}
