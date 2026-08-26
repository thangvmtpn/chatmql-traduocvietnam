import type { Contact, Company } from '@prisma/client';
import type { CustomerPayload, ContactPayload, LeadPayload, PerfexIntegrationConfig } from './perfex-types.js';
/** Split a display name into Perfex firstname/lastname (both required, non-empty). */
export declare function splitName(fullName?: string | null): {
    firstname: string;
    lastname: string;
};
/** Resolve the contact's email, synthesizing a non-deliverable one when absent. */
export declare function resolveContactEmail(contact: Contact, cfg: PerfexIntegrationConfig): string;
export declare function companyToCustomer(company: Company): CustomerPayload;
export declare function contactToPerfex(contact: Contact, customerId: number, cfg: PerfexIntegrationConfig): ContactPayload;
export declare function contactToLead(contact: Contact, cfg: PerfexIntegrationConfig, companyName?: string | null): LeadPayload;
/** Stable sha1 of a payload (sorted keys) → ExternalSyncRef.lastHash for no-op skip. */
export declare function payloadHash(payload: Record<string, unknown>): string;
