import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerfexClient } from './perfex-client.js';
import { PerfexConflictError, PerfexAuthError } from './perfex-errors.js';
function mockResponse(status, body) {
    return { status, json: async () => body };
}
describe('PerfexClient', () => {
    let fetchMock;
    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());
    const client = () => new PerfexClient({ baseUrl: 'https://crm.example.com', authToken: 'secret-tok' });
    it('rejects non-https / private base URLs', () => {
        expect(() => new PerfexClient({ baseUrl: 'http://crm.example.com', authToken: 't' })).toThrow();
        expect(() => new PerfexClient({ baseUrl: 'https://169.254.169.254', authToken: 't' })).toThrow();
        expect(() => new PerfexClient({ baseUrl: 'https://10.0.0.5', authToken: 't' })).toThrow();
        // localhost http is allowed for dev
        expect(() => new PerfexClient({ baseUrl: 'http://localhost:8080', authToken: 't' })).not.toThrow();
    });
    it('sends the authtoken header and JSON body', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(200, { status: true, record_id: 7 }));
        await client().createCustomer({ company: 'Acme' });
        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toBe('https://crm.example.com/api/customers');
        expect(opts.method).toBe('POST');
        expect(opts.headers.authtoken).toBe('secret-tok');
        expect(opts.headers['Content-Type']).toBe('application/json');
        expect(JSON.parse(opts.body)).toEqual({ company: 'Acme' });
    });
    it('returns record_id from customer create', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(200, { status: true, record_id: 42 }));
        expect(await client().createCustomer({ company: 'A' })).toEqual({ recordId: 42 });
    });
    it('treats HTTP 200 with status:false as a failure (no silent success)', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(200, { status: false, message: 'nope' }));
        await expect(client().updateCustomer(1, { company: 'A' })).rejects.toThrow('nope');
    });
    it('maps 409 to PerfexConflictError and does NOT retry', async () => {
        fetchMock.mockResolvedValue(mockResponse(409, { status: false, message: 'email exists', error: { email: 'dup' } }));
        await expect(client().createContact({ customer_id: 1, firstname: 'A', lastname: 'B', email: 'a@b.com', donotsendwelcomeemail: 'on' }))
            .rejects.toBeInstanceOf(PerfexConflictError);
        expect(fetchMock).toHaveBeenCalledTimes(1); // 409 = no retry
    });
    it('maps 401 to PerfexAuthError', async () => {
        fetchMock.mockResolvedValue(mockResponse(401, { status: false }));
        await expect(client().searchContacts('x')).rejects.toBeInstanceOf(PerfexAuthError);
    });
    it('retries on 5xx then succeeds', async () => {
        fetchMock
            .mockResolvedValueOnce(mockResponse(500, { status: false }))
            .mockResolvedValueOnce(mockResponse(200, { status: true, record_id: 9 }));
        expect(await client().createLead({ name: 'L', source: 1, status: 2, assigned: 3 })).toEqual({ recordId: 9 });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    it('searchContacts returns [] on 404 (not found)', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(404, { status: false, message: 'No data' }));
        expect(await client().searchContacts('nobody@x.com')).toEqual([]);
    });
    it('ping returns true when reachable+authorized (404 = ok)', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(404, { status: false }));
        expect(await client().ping()).toBe(true);
    });
    it('ping returns false on auth error', async () => {
        fetchMock.mockResolvedValue(mockResponse(401, { status: false }));
        expect(await client().ping()).toBe(false);
    });
});
//# sourceMappingURL=perfex-client.test.js.map