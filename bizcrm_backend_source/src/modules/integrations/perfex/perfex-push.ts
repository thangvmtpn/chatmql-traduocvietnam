// Per-entity push logic: company / contact / lead create-update-delete against Perfex,
// with ExternalSyncRef bookkeeping + payloadHash no-op skip. Used by perfex-sync-service.

import type { Company, Contact } from '@prisma/client'
import { prisma } from '../../../shared/prisma-client.js'
import { logger } from '../../../shared/logger.js'
import type { PerfexClient } from './perfex-client.js'
import type { PerfexIntegrationConfig, LocalType } from './perfex-types.js'
import { companyToCustomer, contactToPerfex, contactToLead, payloadHash, resolveContactEmail } from './perfex-mappers.js'
import { isSyntheticEmail } from './perfex-synthetic-email.js'

const SYSTEM = 'perfex'

export interface FlushContext {
  orgId: string
  integrationId: string
  config: PerfexIntegrationConfig
  client: PerfexClient
}

function findRef(orgId: string, localType: LocalType, localId: string) {
  return prisma.externalSyncRef.findUnique({
    where: { orgId_system_localType_localId: { orgId, system: SYSTEM, localType, localId } },
  })
}

async function upsertRef(orgId: string, localType: LocalType, localId: string, externalId: string, hash: string) {
  await prisma.externalSyncRef.upsert({
    where: { orgId_system_localType_localId: { orgId, system: SYSTEM, localType, localId } },
    create: { orgId, system: SYSTEM, localType, localId, externalId, lastHash: hash, lastSyncedAt: new Date() },
    update: { externalId, lastHash: hash, lastSyncedAt: new Date() },
  })
}

/** Create/update a Perfex customer for a company. Returns the Perfex customer id. */
export async function pushCompany(ctx: FlushContext, company: Company): Promise<number> {
  const payload = companyToCustomer(company)
  const hash = payloadHash(payload as unknown as Record<string, unknown>)
  const ref = await findRef(ctx.orgId, 'company', company.id)
  if (ref && ref.lastHash === hash) return Number(ref.externalId)

  let externalId: number
  if (ref) {
    externalId = Number(ref.externalId)
    await ctx.client.updateCustomer(externalId, payload)
  } else {
    externalId = (await ctx.client.createCustomer(payload)).recordId
  }
  await upsertRef(ctx.orgId, 'company', company.id, String(externalId), hash)
  return externalId
}

/** Resolve the Perfex customer id a contact attaches to (company ref → on-demand → fallback). */
async function resolveCustomerId(ctx: FlushContext, contact: Contact): Promise<number> {
  if (contact.companyId) {
    const ref = await findRef(ctx.orgId, 'company', contact.companyId)
    if (ref) return Number(ref.externalId)
    const company = await prisma.company.findFirst({ where: { id: contact.companyId, orgId: ctx.orgId } })
    if (company && !company.deletedAt) return pushCompany(ctx, company)
  }
  return ensureFallbackCustomer(ctx)
}

// Keyed by integrationId so concurrent flushes of DIFFERENT orgs never share a fallback id.
const fallbackInFlight = new Map<string, Promise<number>>()
async function ensureFallbackCustomer(ctx: FlushContext): Promise<number> {
  if (ctx.config.fallbackCustomerId) return ctx.config.fallbackCustomerId
  const key = ctx.integrationId
  let inflight = fallbackInFlight.get(key)
  if (!inflight) {
    inflight = (async () => {
      const { recordId } = await ctx.client.createCustomer({ company: 'BizCRM (no company)' })
      ctx.config.fallbackCustomerId = recordId
      await prisma.integration.update({ where: { id: ctx.integrationId }, data: { config: ctx.config as object } })
      return recordId
    })().finally(() => fallbackInFlight.delete(key))
    fallbackInFlight.set(key, inflight)
  }
  return inflight
}

/** Look up a Perfex contact id by exact email. Returns 0 if not found. */
async function findContactIdByEmail(ctx: FlushContext, email: string): Promise<number> {
  const found = await ctx.client.searchContacts(email)
  const match = found.find((c) => c.email?.toLowerCase() === email.toLowerCase())
  return match ? Number(match.id) : 0
}

/** Mark/clear the synthetic-email flag on the biz-crm contact for later self-healing. */
async function syncSyntheticFlag(contact: Contact, emailUsed: string, fallbackDomain: string): Promise<void> {
  const synthetic = isSyntheticEmail(emailUsed, fallbackDomain) && !contact.email?.trim()
  const meta = (contact.metadata ?? {}) as Record<string, unknown>
  if (synthetic === Boolean(meta.syntheticEmail)) return
  await prisma.contact.update({
    where: { id: contact.id },
    data: { metadata: { ...meta, syntheticEmail: synthetic } as object },
  })
}

/** Create/update a Perfex contact for a biz-crm contact. */
export async function pushContact(ctx: FlushContext, contact: Contact): Promise<void> {
  const customerId = await resolveCustomerId(ctx, contact)
  const payload = contactToPerfex(contact, customerId, ctx.config)
  const hash = payloadHash(payload as unknown as Record<string, unknown>)
  const ref = await findRef(ctx.orgId, 'contact', contact.id)
  if (ref && ref.lastHash === hash) return

  let externalId: number
  if (ref) {
    externalId = Number(ref.externalId)
    await ctx.client.updateContact(externalId, payload)
  } else {
    // Perfex contact-create returns no id. Search by the (unique) email FIRST — if a contact
    // already exists (e.g. a prior create succeeded but id-recovery failed and the row retried),
    // adopt it instead of creating a duplicate. Otherwise create, then recover the id by search.
    externalId = await findContactIdByEmail(ctx, payload.email)
    if (externalId === 0) {
      await ctx.client.createContact(payload)
      externalId = await findContactIdByEmail(ctx, payload.email)
      if (externalId === 0) throw new Error(`Contact created but id not recoverable for ${payload.email}`)
    } else {
      // Pre-existing contact (idempotent retry) → align its fields.
      await ctx.client.updateContact(externalId, payload)
    }
  }
  await upsertRef(ctx.orgId, 'contact', contact.id, String(externalId), hash)
  await syncSyntheticFlag(contact, payload.email, ctx.config.syntheticEmailFallbackDomain)
  await removeStaleRef(ctx, 'lead', contact.id) // contact crossed back from lead → drop the stale Perfex lead
}

/** Remove a now-stale mapping of the OTHER target type when a contact flips lead↔contact. */
async function removeStaleRef(ctx: FlushContext, staleType: 'contact' | 'lead', localId: string): Promise<void> {
  const ref = await findRef(ctx.orgId, staleType, localId)
  if (!ref) return
  const id = Number(ref.externalId)
  if (staleType === 'lead') await ctx.client.deleteLead(id)
  else await ctx.client.deleteContact(id)
  await prisma.externalSyncRef.delete({ where: { id: ref.id } })
  logger.debug({ orgId: ctx.orgId, staleType, localId }, '[perfex] removed stale ref on lead↔contact flip')
}

/** Create/update a Perfex lead for a biz-crm contact (lead/qualified stage + syncLeads). */
export async function pushLead(ctx: FlushContext, contact: Contact, companyName?: string | null): Promise<void> {
  const payload = contactToLead(contact, ctx.config, companyName)
  const hash = payloadHash(payload as unknown as Record<string, unknown>)
  const ref = await findRef(ctx.orgId, 'lead', contact.id)
  if (ref && ref.lastHash === hash) return

  let externalId: number
  if (ref) {
    externalId = Number(ref.externalId)
    await ctx.client.updateLead(externalId, payload)
  } else {
    externalId = (await ctx.client.createLead(payload)).recordId
  }
  await upsertRef(ctx.orgId, 'lead', contact.id, String(externalId), hash)
  await removeStaleRef(ctx, 'contact', contact.id) // promoted to lead → drop the stale Perfex contact
}

/** Delete a previously-synced entity from Perfex (no-op if never synced). */
export async function deleteEntity(ctx: FlushContext, localType: LocalType, localId: string): Promise<void> {
  // A biz-crm contact may have been pushed as a Perfex contact OR lead — clean up both refs.
  const types: LocalType[] = localType === 'company' ? ['company'] : ['contact', 'lead']
  for (const t of types) {
    const ref = await findRef(ctx.orgId, t, localId)
    if (!ref) continue
    const id = Number(ref.externalId)
    if (t === 'company') await ctx.client.deleteCustomer(id)
    else if (t === 'lead') await ctx.client.deleteLead(id)
    else await ctx.client.deleteContact(id)
    await prisma.externalSyncRef.delete({ where: { id: ref.id } })
    logger.debug({ orgId: ctx.orgId, type: t, externalId: id }, '[perfex] deleted')
  }
}
