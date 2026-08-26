import { describe, it, expect } from 'vitest';
import { mapContentType, fileExtFromUrl } from './fb-message-normalize.js';
const IMG = 'https://cdn.fbsbx.com/x/photo.jpg?token=abc';
describe('mapContentType', () => {
    it('encodes an image so the FE parseImageUrls (href/thumb/hdUrl) can read it', () => {
        const r = mapContentType({ mid: 'm1', attachments: [{ type: 'image', payload: { url: IMG } }] });
        expect(r.contentType).toBe('image');
        const c = JSON.parse(r.content);
        expect(c.href).toBe(IMG);
        expect(c.thumb).toBe(IMG);
        expect(c.hdUrl).toBe(IMG);
        expect(r.attachments).toHaveLength(1);
    });
    it('encodes video with an href the FE parseVideoInfo reads', () => {
        const url = 'https://cdn.fbsbx.com/v/clip.mp4';
        const r = mapContentType({ attachments: [{ type: 'video', payload: { url } }] });
        expect(r.contentType).toBe('video');
        expect(JSON.parse(r.content).href).toBe(url);
    });
    it('maps audio → voice', () => {
        const r = mapContentType({ attachments: [{ type: 'audio', payload: { url: 'https://x/a.mp3' } }] });
        expect(r.contentType).toBe('voice');
    });
    it('encodes file with fileExt + href so parseFileInfo matches (clickable)', () => {
        const url = 'https://cdn.fbsbx.com/d/report.pdf?dl=1';
        const r = mapContentType({ attachments: [{ type: 'file', payload: { url } }] });
        expect(r.contentType).toBe('file');
        const c = JSON.parse(r.content);
        expect(c.fileExt).toBe('pdf');
        expect(c.href).toBe(url);
    });
    it('turns a location into a clickable Google Maps link', () => {
        const r = mapContentType({ attachments: [{ type: 'location', payload: { coordinates: { lat: 10.77, long: 106.7 } } }] });
        expect(r.contentType).toBe('link');
        expect(JSON.parse(r.content).href).toContain('google.com/maps?q=10.77,106.7');
    });
    it('passes plain text through', () => {
        expect(mapContentType({ text: 'hello' })).toEqual({ contentType: 'text', content: 'hello', attachments: [] });
    });
    it('yields empty content + no attachments for an empty message (caller skips it)', () => {
        const r = mapContentType({});
        expect(r.content).toBe('');
        expect(r.attachments).toHaveLength(0);
    });
});
describe('fileExtFromUrl', () => {
    it('extracts extension, ignoring query strings', () => {
        expect(fileExtFromUrl('https://x/a/report.pdf?dl=1')).toBe('pdf');
        expect(fileExtFromUrl('https://x/IMG.PNG')).toBe('png');
    });
    it('returns empty when no extension', () => {
        expect(fileExtFromUrl('https://x/download')).toBe('');
    });
});
//# sourceMappingURL=fb-message-normalize.test.js.map