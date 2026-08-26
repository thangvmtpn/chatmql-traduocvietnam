import type { Company, Contact } from '@prisma/client';
import type { PerfexClient } from './perfex-client.js';
import type { PerfexIntegrationConfig, LocalType } from './perfex-types.js';
export interface FlushContext {
    orgId: string;
    integrationId: string;
    config: PerfexIntegrationConfig;
    client: PerfexClient;
}
/** Create/update a Perfex customer for a company. Returns the Perfex customer id. */
export declare function pushCompany(ctx: FlushContext, company: Company): Promise<number>;
/** Create/update a Perfex contact for a biz-crm contact. */
export declare function pushContact(ctx: FlushContext, contact: Contact): Promise<void>;
/** Create/update a Perfex lead for a biz-crm contact (lead/qualified stage + syncLeads). */
export declare function pushLead(ctx: FlushContext, contact: Contact, companyName?: string | null): Promise<void>;
/** Delete a previously-synced entity from Perfex (no-op if never synced). */
export declare function deleteEntity(ctx: FlushContext, localType: LocalType, localId: string): Promise<void>;
