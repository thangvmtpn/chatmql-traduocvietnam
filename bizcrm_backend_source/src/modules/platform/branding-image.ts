/**
 * branding-image.ts — Pure helpers for white-label branding images.
 *
 * No DB / IO here so the parsing + validation logic is unit-testable in
 * isolation (see branding-image.test.ts). The service layer
 * (platform-branding-service.ts) wires these into Prisma.
 */

// Setting keys stored in the PlatformSetting table.
export const BRANDING_KEYS = {
  brandName: 'brand_name',
  logo: 'brand_logo',
  favicon: 'brand_favicon',
} as const

export type BrandingImageKind = 'logo' | 'favicon'

export function brandingKeyForImage(kind: BrandingImageKind): string {
  return kind === 'logo' ? BRANDING_KEYS.logo : BRANDING_KEYS.favicon
}

// Allowed image MIME types. SVG is allowed for crisp logos but is served with
// hardening headers (nosniff + restrictive CSP) since it can embed scripts.
export const ALLOWED_IMAGE_MIMES = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
])

// 1 MB of decoded image bytes. Logos/favicons are tiny; this is a generous
// ceiling that still keeps DB rows and the served payload small.
export const MAX_IMAGE_BYTES = 1024 * 1024

export const MAX_BRAND_NAME_LENGTH = 60

export class BrandingImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BrandingImageError'
  }
}

const DATA_URL_RE = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i

export interface DecodedImage {
  mime: string
  buffer: Buffer
}

/**
 * Parse + validate a base64 data URL (`data:<mime>;base64,<data>`) into raw
 * bytes. Throws BrandingImageError on malformed input, disallowed MIME type, or
 * oversized payload.
 */
export function decodeBrandingImage(dataUrl: unknown): DecodedImage {
  if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
    throw new BrandingImageError('Thiếu dữ liệu ảnh (dataUrl).')
  }

  const match = DATA_URL_RE.exec(dataUrl.trim())
  if (!match) {
    throw new BrandingImageError('Định dạng ảnh không hợp lệ. Cần data URL base64.')
  }

  const mime = match[1].toLowerCase()
  if (!ALLOWED_IMAGE_MIMES.has(mime)) {
    throw new BrandingImageError(
      `Định dạng ảnh "${mime}" không được hỗ trợ. Dùng PNG, JPEG, WebP, GIF, SVG hoặc ICO.`,
    )
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64')
  } catch {
    throw new BrandingImageError('Không giải mã được dữ liệu ảnh base64.')
  }

  if (buffer.length === 0) {
    throw new BrandingImageError('Ảnh rỗng.')
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    const kb = Math.round(MAX_IMAGE_BYTES / 1024)
    throw new BrandingImageError(`Ảnh vượt quá dung lượng cho phép (${kb}KB).`)
  }

  return { mime, buffer }
}

/**
 * Normalize + validate a brand name. Returns the trimmed value or throws.
 * Empty string is treated as "reset to default" by the caller, so we allow it.
 */
export function normalizeBrandName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new BrandingImageError('Tên thương hiệu không hợp lệ.')
  }
  const trimmed = name.trim()
  if (trimmed.length > MAX_BRAND_NAME_LENGTH) {
    throw new BrandingImageError(`Tên thương hiệu tối đa ${MAX_BRAND_NAME_LENGTH} ký tự.`)
  }
  return trimmed
}
