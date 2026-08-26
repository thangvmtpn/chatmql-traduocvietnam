/**
 * branding-image.ts — Pure helpers for white-label branding images.
 *
 * No DB / IO here so the parsing + validation logic is unit-testable in
 * isolation (see branding-image.test.ts). The service layer
 * (platform-branding-service.ts) wires these into Prisma.
 */
export declare const BRANDING_KEYS: {
    readonly brandName: "brand_name";
    readonly logo: "brand_logo";
    readonly favicon: "brand_favicon";
};
export type BrandingImageKind = 'logo' | 'favicon';
export declare function brandingKeyForImage(kind: BrandingImageKind): string;
export declare const ALLOWED_IMAGE_MIMES: Set<string>;
export declare const MAX_IMAGE_BYTES: number;
export declare const MAX_BRAND_NAME_LENGTH = 60;
export declare class BrandingImageError extends Error {
    constructor(message: string);
}
export interface DecodedImage {
    mime: string;
    buffer: Buffer;
}
/**
 * Parse + validate a base64 data URL (`data:<mime>;base64,<data>`) into raw
 * bytes. Throws BrandingImageError on malformed input, disallowed MIME type, or
 * oversized payload.
 */
export declare function decodeBrandingImage(dataUrl: unknown): DecodedImage;
/**
 * Normalize + validate a brand name. Returns the trimmed value or throws.
 * Empty string is treated as "reset to default" by the caller, so we allow it.
 */
export declare function normalizeBrandName(name: unknown): string;
