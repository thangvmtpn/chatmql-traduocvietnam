// Load + normalize the per-org Perfex config from the shared Integration model.
// Connection/config reuses Integration(type='perfex'); no dedicated table (DRY).

import { prisma } from '../../../shared/prisma-client.js'
import { decryptToken } from '../../../shared/crypto.js'
import { PERFEX_CONFIG_DEFAULTS, type PerfexIntegrationConfig } from './perfex-types.js'

export const PERFEX_INTEGRATION_TYPE = 'perfex'

export interface LoadedPerfexIntegration {
  integrationId: string
  enabled: boolean
  config: PerfexIntegrationConfig
}

/** Parse a raw Integration.config JSON into a typed config with defaults applied. */
export function normalizeConfig(raw: unknown): PerfexIntegrationConfig {
  const c = (raw ?? {}) as Partial<PerfexIntegrationConfig>
  return {
    baseUrl: c.baseUrl ?? '',
    authTokenEnc: c.authTokenEnc ?? '',
    syncContacts: c.syncContacts ?? PERFEX_CONFIG_DEFAULTS.syncContacts,
    syncLeads: c.syncLeads ?? PERFEX_CONFIG_DEFAULTS.syncLeads,
    leadSourceId: c.leadSourceId,
    leadStatusId: c.leadStatusId,
    leadAssignedId: c.leadAssignedId,
    fallbackCustomerId: c.fallbackCustomerId,
    syntheticEmailFallbackDomain:
      c.syntheticEmailFallbackDomain ?? PERFEX_CONFIG_DEFAULTS.syntheticEmailFallbackDomain,
    debounceSeconds: c.debounceSeconds ?? PERFEX_CONFIG_DEFAULTS.debounceSeconds,
  }
}

/** Load the org's Perfex integration row (or null if none). */
export async function loadPerfexIntegration(orgId: string): Promise<LoadedPerfexIntegration | null> {
  const row = await prisma.integration.findFirst({
    where: { orgId, type: PERFEX_INTEGRATION_TYPE },
  })
  if (!row) return null
  return { integrationId: row.id, enabled: row.enabled, config: normalizeConfig(row.config) }
}

/** Decrypt the stored Perfex auth token. Throws if missing/invalid. */
export function decryptAuthToken(config: PerfexIntegrationConfig): string {
  if (!config.authTokenEnc) throw new Error('Perfex authToken not configured')
  return decryptToken(config.authTokenEnc)
}
