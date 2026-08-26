import { requirePlatformAdmin } from './platform-middleware.js';
import { BrandingImageError } from './branding-image.js';
import { getBrandingMeta, getBrandingImage, setBrandName, setBrandingImage, clearBrandingImage, } from './platform-branding-service.js';
// Allow up to 4MB request bodies for image uploads (base64 inflates ~33%, and
// the global Fastify default is only 1MB).
const IMAGE_UPLOAD_BODY_LIMIT = 4 * 1024 * 1024;
function handleBrandingError(err, reply) {
    if (err instanceof BrandingImageError) {
        reply.status(400).send({ error: err.message });
        return true;
    }
    return false;
}
async function serveImage(kind, reply) {
    const image = await getBrandingImage(kind);
    if (!image) {
        reply.status(404).send({ error: 'Chưa có ảnh thương hiệu.' });
        return;
    }
    reply
        .header('Content-Type', image.mime)
        // Immutable-ish: URLs are versioned by updatedAt, so long cache is safe.
        .header('Cache-Control', 'public, max-age=86400')
        // Harden against SVG script execution if the URL is opened directly.
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
        .send(image.buffer);
}
export async function platformBrandingRoutes(app) {
    // ── Public ────────────────────────────────────────────────────────
    // GET /api/v1/platform/branding — brand name + image version tokens
    app.get('/api/v1/platform/branding', async (request) => {
        const host = request.query?.brand || request.headers['x-forwarded-host'] || request.headers.host || '';
        return getBrandingMeta(host);
    });
    // GET /api/v1/platform/branding/logo — serve logo bytes
    app.get('/api/v1/platform/branding/logo', async (_req, reply) => {
        await serveImage('logo', reply);
    });
    // GET /api/v1/platform/branding/favicon — serve favicon bytes
    app.get('/api/v1/platform/branding/favicon', async (_req, reply) => {
        await serveImage('favicon', reply);
    });
    // ── Super admin only ──────────────────────────────────────────────
    // PUT /api/v1/platform/branding — set brand name
    app.put('/api/v1/platform/branding', { preHandler: requirePlatformAdmin }, async (request, reply) => {
        try {
            const brandName = await setBrandName(request.body?.brandName ?? '');
            return { success: true, brandName };
        }
        catch (err) {
            if (handleBrandingError(err, reply))
                return;
            throw err;
        }
    });
    // PUT /api/v1/platform/branding/logo — upload logo (base64 data URL)
    app.put('/api/v1/platform/branding/logo', { preHandler: requirePlatformAdmin, bodyLimit: IMAGE_UPLOAD_BODY_LIMIT }, async (request, reply) => {
        try {
            await setBrandingImage('logo', request.body?.dataUrl);
            return { success: true };
        }
        catch (err) {
            if (handleBrandingError(err, reply))
                return;
            throw err;
        }
    });
    // PUT /api/v1/platform/branding/favicon — upload favicon (base64 data URL)
    app.put('/api/v1/platform/branding/favicon', { preHandler: requirePlatformAdmin, bodyLimit: IMAGE_UPLOAD_BODY_LIMIT }, async (request, reply) => {
        try {
            await setBrandingImage('favicon', request.body?.dataUrl);
            return { success: true };
        }
        catch (err) {
            if (handleBrandingError(err, reply))
                return;
            throw err;
        }
    });
    // DELETE /api/v1/platform/branding/logo — reset logo to default
    app.delete('/api/v1/platform/branding/logo', { preHandler: requirePlatformAdmin }, async () => {
        await clearBrandingImage('logo');
        return { success: true };
    });
    // DELETE /api/v1/platform/branding/favicon — reset favicon to default
    app.delete('/api/v1/platform/branding/favicon', { preHandler: requirePlatformAdmin }, async () => {
        await clearBrandingImage('favicon');
        return { success: true };
    });
}
//# sourceMappingURL=platform-branding-routes.js.map