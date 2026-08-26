import type { ContactPayload, CustomerPayload, LeadPayload, PerfexContact, PerfexCustomer } from './perfex-types.js';
interface PerfexClientOptions {
    baseUrl: string;
    authToken: string;
    timeoutMs?: number;
}
export declare class PerfexClient {
    private readonly apiRoot;
    private readonly authToken;
    private readonly timeoutMs;
    constructor(opts: PerfexClientOptions);
    createCustomer(p: CustomerPayload): Promise<{
        recordId: number;
    }>;
    updateCustomer(id: number, p: Partial<CustomerPayload>): Promise<void>;
    deleteCustomer(id: number): Promise<void>;
    searchCustomers(q: string): Promise<PerfexCustomer[]>;
    createContact(p: ContactPayload): Promise<void>;
    updateContact(id: number, p: Partial<ContactPayload>): Promise<void>;
    deleteContact(id: number): Promise<void>;
    searchContacts(q: string): Promise<PerfexContact[]>;
    createLead(p: LeadPayload): Promise<{
        recordId: number;
    }>;
    updateLead(id: number, p: Partial<LeadPayload>): Promise<void>;
    deleteLead(id: number): Promise<void>;
    /** Cheap auth/connectivity probe. true if reachable + authorized. */
    ping(): Promise<boolean>;
    /** GET .../search?q= → array (empty on 404). */
    private search;
    private write;
    /** Single HTTP call with timeout, JSON body, status mapping, and bounded retry. */
    private request;
    private throwForStatus;
}
export {};
