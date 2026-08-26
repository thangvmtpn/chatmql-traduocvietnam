import { describe, it, expect } from 'vitest';
import { isOrgUsable, orgDisplayStatus, isExpiringWithin } from './org-license.js';
const NOW = new Date('2026-06-06T00:00:00.000Z');
const past = new Date('2026-06-05T00:00:00.000Z');
const future = new Date('2026-06-10T00:00:00.000Z');
describe('isOrgUsable', () => {
    it('allows unlimited orgs (expiresAt null)', () => {
        expect(isOrgUsable({ status: 'active', expiresAt: null }, NOW)).toEqual({ ok: true });
    });
    it('allows active orgs not yet expired', () => {
        expect(isOrgUsable({ status: 'active', expiresAt: future }, NOW)).toEqual({ ok: true });
    });
    it('blocks expired orgs', () => {
        expect(isOrgUsable({ status: 'active', expiresAt: past }, NOW)).toEqual({ ok: false, reason: 'EXPIRED' });
    });
    it('blocks suspended orgs regardless of expiry', () => {
        expect(isOrgUsable({ status: 'suspended', expiresAt: future }, NOW)).toEqual({ ok: false, reason: 'SUSPENDED' });
        expect(isOrgUsable({ status: 'suspended', expiresAt: null }, NOW)).toEqual({ ok: false, reason: 'SUSPENDED' });
    });
    it('treats exact-now expiry as still valid (only strictly-past blocks)', () => {
        expect(isOrgUsable({ status: 'active', expiresAt: NOW }, NOW)).toEqual({ ok: true });
    });
});
describe('orgDisplayStatus', () => {
    it('classifies each case', () => {
        expect(orgDisplayStatus({ status: 'active', expiresAt: null }, NOW)).toBe('unlimited');
        expect(orgDisplayStatus({ status: 'active', expiresAt: future }, NOW)).toBe('active');
        expect(orgDisplayStatus({ status: 'active', expiresAt: past }, NOW)).toBe('expired');
        expect(orgDisplayStatus({ status: 'suspended', expiresAt: future }, NOW)).toBe('suspended');
    });
    it('suspended takes precedence over expired', () => {
        expect(orgDisplayStatus({ status: 'suspended', expiresAt: past }, NOW)).toBe('suspended');
    });
});
describe('isExpiringWithin', () => {
    it('is false for unlimited orgs', () => {
        expect(isExpiringWithin({ status: 'active', expiresAt: null }, 7, NOW)).toBe(false);
    });
    it('is true when within the window', () => {
        expect(isExpiringWithin({ status: 'active', expiresAt: future }, 7, NOW)).toBe(true); // 4 days out
    });
    it('is false when beyond the window', () => {
        const far = new Date('2026-06-20T00:00:00.000Z');
        expect(isExpiringWithin({ status: 'active', expiresAt: far }, 7, NOW)).toBe(false);
    });
    it('is false for already-expired orgs (not "soon", already gone)', () => {
        expect(isExpiringWithin({ status: 'active', expiresAt: past }, 7, NOW)).toBe(false);
    });
});
//# sourceMappingURL=org-license.test.js.map