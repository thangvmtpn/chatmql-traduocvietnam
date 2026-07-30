/**
 * platform-branding-service.ts — DB access for white-label branding.
 *
 * Branding is platform-wide (not org-scoped): a single super-admin-owned brand
 * name + logo + favicon stored in the PlatformSetting table. All getters fall
 * back to nulls so the frontend can apply its built-in defaults.
 */
import { prisma } from '../../shared/prisma-client.js'
import {
  BRANDING_KEYS,
  brandingKeyForImage,
  decodeBrandingImage,
  normalizeBrandName,
  type BrandingImageKind,
} from './branding-image.js'

// A version token (updatedAt epoch ms) lets the frontend cache-bust the image
// URLs whenever the super admin uploads a new file.
export interface BrandingMeta {
  brandName: string | null
  logoVersion: string | null
  faviconVersion: string | null
}

export interface BrandingImage {
  buffer: Buffer
  mime: string
}

function versionOf(updatedAt: Date | undefined): string | null {
  return updatedAt ? String(updatedAt.getTime()) : null
}

/** Public metadata used to render brand name/title/favicon before login. */
export async function getBrandingMeta(host?: string): Promise<BrandingMeta & { tagline?: string; logoUrl?: string; primaryColor?: string }> {
  const normalizedHost = (host || '').toLowerCase()
  
  if (normalizedHost.includes('traduoc') || normalizedHost.includes('tra-duoc')) {
    return {
      brandName: 'Trà Dược Việt Nam',
      tagline: 'Phước lành cho sức khỏe',
      logoUrl: '/assets/logo-traduocvietnam.svg',
      faviconVersion: 'traduoc-v1',
      logoVersion: 'traduoc-v1',
      primaryColor: '#0D6838',
    }
  }

  // Default Master Brand: To Partners
  return {
    brandName: 'To Partners',
    tagline: 'Kết nối cùng phát triển',
    logoUrl: '/assets/logo-topartners.svg',
    faviconVersion: 'topartners-v1',
    logoVersion: 'topartners-v1',
    primaryColor: '#1D70B8',
  }
}

/** Fetch raw image bytes for a logo/favicon, or null if none is set. */
export async function getBrandingImage(kind: BrandingImageKind): Promise<BrandingImage | null> {
  const row = await prisma.platformSetting.findUnique({
    where: { settingKey: brandingKeyForImage(kind) },
    select: { valueBytes: true, valueText: true },
  })
  if (!row?.valueBytes || !row.valueText) return null
  return { buffer: Buffer.from(row.valueBytes), mime: row.valueText }
}

/** Upsert the brand name. Empty string clears it (reverts to default). */
export async function setBrandName(name: unknown): Promise<string> {
  const value = normalizeBrandName(name)
  await prisma.platformSetting.upsert({
    where: { settingKey: BRANDING_KEYS.brandName },
    create: { settingKey: BRANDING_KEYS.brandName, valueText: value || null },
    update: { valueText: value || null },
  })
  return value
}

/** Decode + store a logo/favicon image from a base64 data URL. */
export async function setBrandingImage(kind: BrandingImageKind, dataUrl: unknown): Promise<void> {
  const { mime, buffer } = decodeBrandingImage(dataUrl)
  const settingKey = brandingKeyForImage(kind)
  // Copy into a fresh ArrayBuffer-backed Uint8Array — Prisma's Bytes field
  // rejects Buffer (its backing may be a SharedArrayBuffer).
  const bytes = new Uint8Array(buffer)
  await prisma.platformSetting.upsert({
    where: { settingKey },
    create: { settingKey, valueBytes: bytes, valueText: mime },
    update: { valueBytes: bytes, valueText: mime },
  })
}

/** Remove a logo/favicon so the frontend falls back to its default asset. */
export async function clearBrandingImage(kind: BrandingImageKind): Promise<void> {
  await prisma.platformSetting.deleteMany({ where: { settingKey: brandingKeyForImage(kind) } })
}
