/**
 * platform-branding-service.ts — DB access for white-label branding.
 *
 * Branding is platform-wide (not org-scoped): a single super-admin-owned brand
 * name + logo + favicon stored in the PlatformSetting table. All getters fall
 * back to nulls so the frontend can apply its built-in defaults.
 */
import { prisma } from '../../shared/prisma-client.js';
import { BRANDING_KEYS, brandingKeyForImage, decodeBrandingImage, normalizeBrandName, } from './branding-image.js';
function versionOf(updatedAt) {
    return updatedAt ? String(updatedAt.getTime()) : null;
}
const TRADUOC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 110" width="420" height="110">
  <g transform="translate(10, 5)">
    <!-- Star & Swoosh Icon -->
    <circle cx="50" cy="50" r="40" fill="none" stroke="#E31D24" stroke-width="6"/>
    <path d="M 25,65 Q 45,85 70,60 T 80,30" fill="none" stroke="#0D6838" stroke-width="6" stroke-linecap="round"/>
    <polygon points="50,10 60,35 85,35 65,50 72,75 50,60 28,75 35,50 15,35 40,35" fill="#F59E0B"/>
  </g>
  <!-- Text -->
  <text x="115" y="52" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-weight="900" font-size="26" fill="#0D6838">TRÀ DƯỢC VIỆT NAM</text>
  <text x="115" y="80" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-weight="600" font-size="13" stroke-width="0.5" fill="#E31D24">PHƯỚC LÀNH CHO SỨC KHỎE</text>
</svg>`;
/** Public metadata used to render brand name/title/favicon before login. */
export async function getBrandingMeta(host) {
    // Default Master Brand: Trà Dược Việt Nam
    return {
        brandName: 'Trà Dược Việt Nam',
        tagline: 'Phước lành cho sức khỏe',
        logoUrl: '/assets/logo-traduocvietnam.svg',
        faviconVersion: 'traduoc-v1',
        logoVersion: 'traduoc-v1',
        primaryColor: '#0D6838',
    };
}
/** Fetch raw image bytes for a logo/favicon, or null if none is set. */
export async function getBrandingImage(kind) {
    const row = await prisma.platformSetting.findUnique({
        where: { settingKey: brandingKeyForImage(kind) },
        select: { valueBytes: true, valueText: true },
    });
    if (row?.valueBytes && row.valueText) {
        return { buffer: Buffer.from(row.valueBytes), mime: row.valueText };
    }
    // Fallback to built-in Trà Dược Việt Nam SVG
    if (kind === 'logo') {
        return { buffer: Buffer.from(TRADUOC_SVG, 'utf-8'), mime: 'image/svg+xml' };
    }
    return null;
}
/** Upsert the brand name. Empty string clears it (reverts to default). */
export async function setBrandName(name) {
    const value = normalizeBrandName(name);
    await prisma.platformSetting.upsert({
        where: { settingKey: BRANDING_KEYS.brandName },
        create: { settingKey: BRANDING_KEYS.brandName, valueText: value || null },
        update: { valueText: value || null },
    });
    return value;
}
/** Decode + store a logo/favicon image from a base64 data URL. */
export async function setBrandingImage(kind, dataUrl) {
    const { mime, buffer } = decodeBrandingImage(dataUrl);
    const settingKey = brandingKeyForImage(kind);
    // Copy into a fresh ArrayBuffer-backed Uint8Array — Prisma's Bytes field
    // rejects Buffer (its backing may be a SharedArrayBuffer).
    const bytes = new Uint8Array(buffer);
    await prisma.platformSetting.upsert({
        where: { settingKey },
        create: { settingKey, valueBytes: bytes, valueText: mime },
        update: { valueBytes: bytes, valueText: mime },
    });
}
/** Remove a logo/favicon so the frontend falls back to its default asset. */
export async function clearBrandingImage(kind) {
    await prisma.platformSetting.deleteMany({ where: { settingKey: brandingKeyForImage(kind) } });
}
//# sourceMappingURL=platform-branding-service.js.map