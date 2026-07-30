// Types for the PerfexCRM REST addon (CodeCanyon #25278359).
// Contract reference: plans/2026-05-29-perfexcrm-sync/reports/perfex-rest-api-contract.md

/** Per-org Perfex settings — stored in Integration.config (type='perfex'). */
export interface PerfexIntegrationConfig {
  baseUrl: string; // https://host (no trailing /api)
  authTokenEnc: string; // encryptToken() ciphertext — decrypted only at client construction
  syncContacts: boolean;
  syncLeads: boolean;
  leadSourceId?: number; // Perfex numeric ids (manual entry — addon has no list endpoint)
  leadStatusId?: number;
  leadAssignedId?: number;
  fallbackCustomerId?: number; // customer id for contacts with no company
  syntheticEmailFallbackDomain: string; // e.g. 'noreply.bizcrm.vn'
  debounceSeconds: number;
}

export const PERFEX_CONFIG_DEFAULTS = {
  syncContacts: true,
  syncLeads: false,
  syntheticEmailFallbackDomain: 'noreply.bizcrm.vn',
  debounceSeconds: 15,
} as const;

// ── Write payloads (biz-crm → Perfex) ───────────────────────────────

export interface CustomerPayload {
  company: string; // required
  vat?: string;
  phonenumber?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface ContactPayload {
  customer_id: number; // required — owning Perfex customer
  firstname: string; // required
  lastname: string; // required
  email: string; // required + unique in Perfex
  title?: string;
  phonenumber?: string;
  is_primary?: 'on';
  donotsendwelcomeemail: 'on'; // always — never let Perfex email synthetic addresses
}

export interface LeadPayload {
  name: string; // required
  source: number; // required (Perfex lead_sources id)
  status: number; // required (Perfex leads_statuses id)
  assigned: number; // required (Perfex staff id)
  email?: string;
  phonenumber?: string;
  company?: string;
  description?: string;
}

// ── Read responses (Perfex → biz-crm) ───────────────────────────────

/** Envelope for write/search responses. HTTP 200 may still carry status:false. */
export interface PerfexWriteResponse {
  status: boolean;
  message?: string;
  record_id?: number; // present for customer/lead create; ABSENT for contact create
  error?: Record<string, string>; // field → message (409 validation)
}

export interface PerfexContact {
  id: string;
  userid: string; // owning customer id
  firstname: string;
  lastname: string;
  email: string;
  phonenumber?: string;
  title?: string | null;
  is_primary?: string;
  company?: string;
}

export interface PerfexCustomer {
  userid: string; // customer (client) id
  company: string;
  vat?: string;
  phonenumber?: string;
  website?: string;
}

export type LocalType = 'company' | 'contact' | 'lead';

/** Domain-event `origin` tag for writes made by a (future) Perfex→biz-crm pull — used as a
 *  loop guard so the subscriber ignores its own writes. */
export const PERFEX_ORIGIN = 'perfex-pull';
