/** Per-org Perfex settings — stored in Integration.config (type='perfex'). */
export interface PerfexIntegrationConfig {
    baseUrl: string;
    authTokenEnc: string;
    syncContacts: boolean;
    syncLeads: boolean;
    leadSourceId?: number;
    leadStatusId?: number;
    leadAssignedId?: number;
    fallbackCustomerId?: number;
    syntheticEmailFallbackDomain: string;
    debounceSeconds: number;
}
export declare const PERFEX_CONFIG_DEFAULTS: {
    readonly syncContacts: true;
    readonly syncLeads: false;
    readonly syntheticEmailFallbackDomain: "noreply.bizcrm.vn";
    readonly debounceSeconds: 15;
};
export interface CustomerPayload {
    company: string;
    vat?: string;
    phonenumber?: string;
    website?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
}
export interface ContactPayload {
    customer_id: number;
    firstname: string;
    lastname: string;
    email: string;
    title?: string;
    phonenumber?: string;
    is_primary?: 'on';
    donotsendwelcomeemail: 'on';
}
export interface LeadPayload {
    name: string;
    source: number;
    status: number;
    assigned: number;
    email?: string;
    phonenumber?: string;
    company?: string;
    description?: string;
}
/** Envelope for write/search responses. HTTP 200 may still carry status:false. */
export interface PerfexWriteResponse {
    status: boolean;
    message?: string;
    record_id?: number;
    error?: Record<string, string>;
}
export interface PerfexContact {
    id: string;
    userid: string;
    firstname: string;
    lastname: string;
    email: string;
    phonenumber?: string;
    title?: string | null;
    is_primary?: string;
    company?: string;
}
export interface PerfexCustomer {
    userid: string;
    company: string;
    vat?: string;
    phonenumber?: string;
    website?: string;
}
export type LocalType = 'company' | 'contact' | 'lead';
/** Domain-event `origin` tag for writes made by a (future) Perfex→biz-crm pull — used as a
 *  loop guard so the subscriber ignores its own writes. */
export declare const PERFEX_ORIGIN = "perfex-pull";
