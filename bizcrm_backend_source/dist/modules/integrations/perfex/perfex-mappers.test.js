import { describe, it, expect } from 'vitest';
import { splitName, companyToCustomer, contactToPerfex, contactToLead, payloadHash, resolveContactEmail, } from './perfex-mappers.js';
const cfg = {
    baseUrl: 'https://x', authTokenEnc: '', syncContacts: true, syncLeads: true,
    leadSourceId: 1, leadStatusId: 2, leadAssignedId: 3,
    syntheticEmailFallbackDomain: 'noreply.bizcrm.vn', debounceSeconds: 15,
};
const contact = (over = {}) => ({
    id: 'c1', orgId: 'o1', companyId: null, zaloUid: null, phone: null, email: null,
    fullName: null, crmName: null, avatarUrl: null, jobTitle: null, isPrimaryContact: false,
    source: null, sourceDate: null, firstContactDate: null, lifecycleStage: 'subscriber',
    nextAppointment: null, assignedUserId: null, notes: null, tags: [], metadata: {},
    isGroup: false, leadScore: 0, lastActivity: null, aiSummary: null, aiSentimentLabel: null,
    aiSentimentConfidence: null, aiSentimentReason: null, aiIntent: null, aiPainPoints: [],
    aiCompetitors: [], aiSignals: [], aiAnalyzedAt: null, aiConversationId: null,
    mergedInto: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...over,
});
describe('splitName', () => {
    it('splits multi-word: last token = lastname', () => {
        expect(splitName('Nguyen Van A')).toEqual({ firstname: 'Nguyen Van', lastname: 'A' });
    });
    it('single token → lastname "."', () => {
        expect(splitName('Madonna')).toEqual({ firstname: 'Madonna', lastname: '.' });
    });
    it('empty/null → Unknown .', () => {
        expect(splitName('   ')).toEqual({ firstname: 'Unknown', lastname: '.' });
        expect(splitName(null)).toEqual({ firstname: 'Unknown', lastname: '.' });
    });
});
describe('companyToCustomer', () => {
    it('maps name→company + cleans empty fields', () => {
        const c = companyToCustomer({ name: 'Acme', taxCode: null, phone: '0900', website: null, address: null });
        expect(c.company).toBe('Acme');
        expect(c.phonenumber).toBe('0900');
        expect(c.vat).toBeUndefined();
    });
    it('throws on empty company name (Perfex required field)', () => {
        expect(() => companyToCustomer({ name: '  ' })).toThrow();
    });
});
describe('contactToPerfex', () => {
    it('synthesizes email + always donotsendwelcomeemail', () => {
        const p = contactToPerfex(contact({ fullName: 'Le Thi B', source: 'Zalo', zaloUid: 'zz', isPrimaryContact: true }), 42, cfg);
        expect(p.customer_id).toBe(42);
        expect(p.firstname).toBe('Le Thi');
        expect(p.lastname).toBe('B');
        expect(p.email).toBe('zz@zalo.me');
        expect(p.is_primary).toBe('on');
        expect(p.donotsendwelcomeemail).toBe('on');
    });
    it('prefers a real email + drops is_primary when false', () => {
        const p = contactToPerfex(contact({ fullName: 'X Y', email: 'real@corp.com' }), 1, cfg);
        expect(p.email).toBe('real@corp.com');
        expect(p.is_primary).toBeUndefined();
    });
});
describe('contactToLead', () => {
    it('uses configured source/status/assigned ids + company name', () => {
        const l = contactToLead(contact({ fullName: 'Lead Guy', email: 'l@x.com' }), cfg, 'Acme');
        expect(l).toMatchObject({ source: 1, status: 2, assigned: 3, company: 'Acme', email: 'l@x.com' });
    });
    it('throws when lead mapping ids missing', () => {
        expect(() => contactToLead(contact({ fullName: 'No Cfg' }), { ...cfg, leadSourceId: undefined }, null)).toThrow();
    });
});
describe('resolveContactEmail', () => {
    it('returns real email when present, else synthesizes', () => {
        expect(resolveContactEmail(contact({ email: 'a@b.com' }), cfg)).toBe('a@b.com');
        expect(resolveContactEmail(contact({ source: 'Zalo', zaloUid: 'q' }), cfg)).toBe('q@zalo.me');
    });
});
describe('payloadHash', () => {
    it('is stable regardless of key order', () => {
        expect(payloadHash({ a: 1, b: 2 })).toBe(payloadHash({ b: 2, a: 1 }));
    });
    it('changes when values change', () => {
        expect(payloadHash({ a: 1 })).not.toBe(payloadHash({ a: 2 }));
    });
});
//# sourceMappingURL=perfex-mappers.test.js.map