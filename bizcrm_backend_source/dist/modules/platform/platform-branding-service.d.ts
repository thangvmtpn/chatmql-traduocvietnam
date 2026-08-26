import { type BrandingImageKind } from './branding-image.js';
export interface BrandingMeta {
    brandName: string | null;
    logoVersion: string | null;
    faviconVersion: string | null;
}
export interface BrandingImage {
    buffer: Buffer;
    mime: string;
}
/** Public metadata used to render brand name/title/favicon before login. */
export declare function getBrandingMeta(host?: string): Promise<BrandingMeta & {
    tagline?: string;
    logoUrl?: string;
    primaryColor?: string;
}>;
/** Fetch raw image bytes for a logo/favicon, or null if none is set. */
export declare function getBrandingImage(kind: BrandingImageKind): Promise<BrandingImage | null>;
/** Upsert the brand name. Empty string clears it (reverts to default). */
export declare function setBrandName(name: unknown): Promise<string>;
/** Decode + store a logo/favicon image from a base64 data URL. */
export declare function setBrandingImage(kind: BrandingImageKind, dataUrl: unknown): Promise<void>;
/** Remove a logo/favicon so the frontend falls back to its default asset. */
export declare function clearBrandingImage(kind: BrandingImageKind): Promise<void>;
