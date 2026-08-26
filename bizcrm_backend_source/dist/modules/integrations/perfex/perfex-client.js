// HTTP client for the PerfexCRM REST addon. Auth via `authtoken` header.
// Writes send JSON (the addon normalizes JSON into $_POST). Always check the
// JSON `status` field — HTTP 200 can still carry status:false.
import { logger } from '../../../shared/logger.js';
import { PerfexApiError, PerfexAuthError, PerfexConflictError, PerfexError, PerfexNotFoundError, isRetryable, } from './perfex-errors.js';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
export class PerfexClient {
    apiRoot;
    authToken;
    timeoutMs;
    constructor(opts) {
        const base = opts.baseUrl.trim().replace(/\/+$/, '');
        const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(base);
        if (!/^https:\/\//i.test(base) && !isLocalhost) {
            throw new PerfexApiError('Perfex baseUrl must be https (http allowed only for localhost)', undefined, false);
        }
        // SSRF guard: block private / link-local / metadata ranges (except explicit localhost dev).
        if (!isLocalhost && /^https?:\/\/(10\.|127\.|0\.0\.0\.0|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?fd)/i.test(base)) {
            throw new PerfexApiError('Perfex baseUrl must not point to a private/internal address', undefined, false);
        }
        this.apiRoot = `${base}/api`;
        this.authToken = opts.authToken;
        this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }
    // ── Customers (= biz-crm Company) ─────────────────────────────────
    async createCustomer(p) {
        const res = await this.write('POST', 'customers', p);
        if (res.record_id == null)
            throw new PerfexApiError('Customer created but no record_id returned', undefined, false);
        return { recordId: res.record_id };
    }
    async updateCustomer(id, p) {
        await this.write('PUT', `customers/${id}`, p);
    }
    async deleteCustomer(id) {
        await this.write('DELETE', `delete/customers/${id}`);
    }
    searchCustomers(q) {
        return this.search('customers', q);
    }
    // ── Contacts (note: create returns NO id → recover via searchContacts) ──
    async createContact(p) {
        await this.write('POST', 'contacts', p);
    }
    async updateContact(id, p) {
        await this.write('PUT', `contacts/${id}`, p);
    }
    async deleteContact(id) {
        await this.write('DELETE', `delete/contacts/${id}`);
    }
    searchContacts(q) {
        return this.search('contacts', q);
    }
    // ── Leads ─────────────────────────────────────────────────────────
    async createLead(p) {
        const res = await this.write('POST', 'leads', p);
        if (res.record_id == null)
            throw new PerfexApiError('Lead created but no record_id returned', undefined, false);
        return { recordId: res.record_id };
    }
    async updateLead(id, p) {
        await this.write('PUT', `leads/${id}`, p);
    }
    async deleteLead(id) {
        await this.write('DELETE', `delete/leads/${id}`);
    }
    /** Cheap auth/connectivity probe. true if reachable + authorized. */
    async ping() {
        try {
            await this.search('customers', '__ping__');
            return true;
        }
        catch (err) {
            if (err instanceof PerfexNotFoundError)
                return true; // reachable + authorized, just no match
            if (err instanceof PerfexAuthError)
                return false;
            throw err;
        }
    }
    // ── internals ─────────────────────────────────────────────────────
    /** GET .../search?q= → array (empty on 404). */
    async search(resource, q) {
        try {
            const data = await this.request('GET', `${resource}/search?q=${encodeURIComponent(q)}`);
            return Array.isArray(data) ? data : [data];
        }
        catch (err) {
            if (err instanceof PerfexNotFoundError)
                return [];
            throw err;
        }
    }
    async write(method, path, body) {
        const data = (await this.request(method, path, body));
        if (data && data.status === false) {
            throw new PerfexApiError(data.message ?? 'Perfex request failed', undefined, false);
        }
        return data ?? { status: true };
    }
    /** Single HTTP call with timeout, JSON body, status mapping, and bounded retry. */
    async request(method, path, body) {
        let lastErr;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.timeoutMs);
            try {
                const res = await fetch(`${this.apiRoot}/${path}`, {
                    method,
                    headers: {
                        authtoken: this.authToken,
                        Accept: 'application/json',
                        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                    },
                    body: body !== undefined ? JSON.stringify(body) : undefined,
                    signal: controller.signal,
                });
                const json = await res.json().catch(() => ({}));
                this.throwForStatus(res.status, json, method, path);
                return json;
            }
            catch (err) {
                lastErr = err;
                if (!isRetryable(err) || attempt === MAX_RETRIES)
                    break;
                await delay(300 * 2 ** attempt);
                // Mask query string — search paths carry user emails/phones.
                logger.warn({ path: maskQuery(path), method, attempt: attempt + 1 }, '[perfex] retrying request');
            }
            finally {
                clearTimeout(timer);
            }
        }
        // Guarantee callers only ever see a PerfexError (timeouts/DNS arrive as raw errors).
        if (lastErr instanceof PerfexError)
            throw lastErr;
        throw new PerfexApiError(`Perfex request failed: ${lastErr?.message ?? 'unknown'}`, undefined, true);
    }
    throwForStatus(httpStatus, json, method, path) {
        if (httpStatus === 401 || httpStatus === 403)
            throw new PerfexAuthError();
        if (httpStatus === 409) {
            throw new PerfexConflictError(json?.message ?? 'Conflict', json?.error);
        }
        if (httpStatus === 404)
            throw new PerfexNotFoundError(json?.message);
        if (httpStatus >= 500)
            throw new PerfexApiError(`Perfex ${httpStatus} at ${method} ${path}`, httpStatus, true);
        if (httpStatus >= 400)
            throw new PerfexApiError(json?.message ?? `Perfex ${httpStatus}`, httpStatus, false);
    }
}
function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
/** Redact query-string values (search paths carry user emails/phones). */
function maskQuery(path) {
    return path.replace(/\?.*$/, '?***');
}
//# sourceMappingURL=perfex-client.js.map