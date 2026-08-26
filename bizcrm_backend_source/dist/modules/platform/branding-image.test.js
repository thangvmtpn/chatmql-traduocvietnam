import { describe, it, expect } from 'vitest';
import { decodeBrandingImage, normalizeBrandName, brandingKeyForImage, BrandingImageError, MAX_IMAGE_BYTES, MAX_BRAND_NAME_LENGTH, } from './branding-image.js';
// 1x1 transparent PNG
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
describe('decodeBrandingImage', () => {
    it('decodes a valid PNG data URL into bytes + mime', () => {
        const { mime, buffer } = decodeBrandingImage(`data:image/png;base64,${PNG_1PX}`);
        expect(mime).toBe('image/png');
        expect(buffer.length).toBeGreaterThan(0);
        // PNG magic number
        expect(buffer.subarray(0, 4).toString('hex')).toBe('89504e47');
    });
    it('lowercases the MIME type', () => {
        const { mime } = decodeBrandingImage(`data:IMAGE/PNG;base64,${PNG_1PX}`);
        expect(mime).toBe('image/png');
    });
    it('accepts SVG', () => {
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
        const { mime } = decodeBrandingImage(`data:image/svg+xml;base64,${svg}`);
        expect(mime).toBe('image/svg+xml');
    });
    it('rejects a disallowed MIME type', () => {
        const data = Buffer.from('hello').toString('base64');
        expect(() => decodeBrandingImage(`data:application/pdf;base64,${data}`)).toThrow(BrandingImageError);
    });
    it('rejects non-data-url strings', () => {
        expect(() => decodeBrandingImage('https://example.com/logo.png')).toThrow(BrandingImageError);
        expect(() => decodeBrandingImage('not a data url')).toThrow(BrandingImageError);
    });
    it('rejects empty / non-string input', () => {
        expect(() => decodeBrandingImage('')).toThrow(BrandingImageError);
        expect(() => decodeBrandingImage(null)).toThrow(BrandingImageError);
        expect(() => decodeBrandingImage(undefined)).toThrow(BrandingImageError);
    });
    it('rejects an oversized image', () => {
        const big = Buffer.alloc(MAX_IMAGE_BYTES + 1, 0).toString('base64');
        expect(() => decodeBrandingImage(`data:image/png;base64,${big}`)).toThrow(/dung lượng/);
    });
});
describe('normalizeBrandName', () => {
    it('trims whitespace', () => {
        expect(normalizeBrandName('  Acme CRM  ')).toBe('Acme CRM');
    });
    it('allows empty string (reset to default)', () => {
        expect(normalizeBrandName('')).toBe('');
        expect(normalizeBrandName('   ')).toBe('');
    });
    it('rejects names over the length limit', () => {
        expect(() => normalizeBrandName('x'.repeat(MAX_BRAND_NAME_LENGTH + 1))).toThrow(BrandingImageError);
    });
    it('rejects non-string input', () => {
        expect(() => normalizeBrandName(123)).toThrow(BrandingImageError);
    });
});
describe('brandingKeyForImage', () => {
    it('maps kinds to setting keys', () => {
        expect(brandingKeyForImage('logo')).toBe('brand_logo');
        expect(brandingKeyForImage('favicon')).toBe('brand_favicon');
    });
});
//# sourceMappingURL=branding-image.test.js.map