// flushOrg — drain an org's SyncOutbox to Perfex. Invoked by the debounced queue worker.
// Coalesces rows per entity, orders Company→Contact, pushes sequentially (gentle on self-hosted
// Perfex), records ExternalSyncRef, and marks each row done/failed/skipped. One row failing
// never aborts the rest.

import type { Contact } from '@prisma/client'
import { prisma } from '../../../shared/prisma-client.js'
import { logger } from '../../../shared/logger.js'
import { loadPerfexIntegration, decryptAuthToken } from './perfex-config.js'
import { PerfexClient } from './perfex-client.js'
import { pushCompany, pushContact, pushLead, deleteEntity, type FlushContext } from './perfex-push.js'
import type { LocalType } from './perfex-types.js'

const LEAD_STAGES = new Set(['lead', 'qualified'])

interface OutboxGroup {
  rowIds: string[]
  localType: LocalType
  localId: string
  op: 'upsert' | 'delete' // latest op wins
}

export async function flushOrg(orgId: string): Promise<void> {
  const [integration, pending] = await Promise.all([
    loadPerfexIntegration(orgId),
    prisma.syncOutbox.findMany({ where: { orgId, status: 'pending' }, orderBy: { createdAt: 'asc' } }),
  ])
  if (pending.length === 0) return

  if (!integration || !integration.enabled) {
    await markRows(pending.map((r) => r.id), 'skipped', { skipReason: 'integration_disabled' })
    return
  }

  const ctx: FlushContext = {
    orgId,
    integrationId: integration.integrationId,
    config: integration.config,
    client: new PerfexClient({ baseUrl: integration.config.baseUrl, authToken: decryptAuthToken(integration.config) }),
  }

  const groups = coalesce(pending)
  // Companies first so contacts can attach to a customer_id (rank: company=0, contact=1).
  const rank = (t: LocalType) => (t === 'company' ? 0 : 1)
  groups.sort((a, b) => rank(a.localType) - rank(b.localType))

  const startedAt = Date.now()
  let done = 0
  let failed = 0
  for (const g of groups) {
    try {
      await processGroup(ctx, g)
      await markRows(g.rowIds, 'done')
      done++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn({ orgId, localType: g.localType, localId: g.localId, err: msg }, '[perfex] group flush failed')
      await markRows(g.rowIds, 'failed', { errorMessage: msg.slice(0, 500), incAttempts: true })
      failed++
    }
  }

  await prisma.integration.update({ where: { id: integration.integrationId }, data: { lastSyncAt: new Date() } })
  // Structured audit log (no token / PII).
  logger.info(
    { orgId, groups: groups.length, rows: pending.length, done, failed, durationMs: Date.now() - startedAt },
    '[perfex] flush complete',
  )
}

async function processGroup(ctx: FlushContext, g: OutboxGroup): Promise<void> {
  if (g.op === 'delete') {
    await deleteEntity(ctx, g.localType, g.localId)
    return
  }
  if (g.localType === 'company') {
    const company = await prisma.company.findFirst({ where: { id: g.localId, orgId: ctx.orgId } })
    if (!company || company.deletedAt) return deleteEntity(ctx, 'company', g.localId)
    await pushCompany(ctx, company)
    return
  }
  // contact
  const contact = await prisma.contact.findFirst({ where: { id: g.localId, orgId: ctx.orgId } })
  if (!contact || contact.deletedAt) return deleteEntity(ctx, 'contact', g.localId)
  if (ctx.config.syncLeads && LEAD_STAGES.has(contact.lifecycleStage)) {
    await pushLead(ctx, contact, await companyName(contact))
    return
  }
  if (ctx.config.syncContacts) await pushContact(ctx, contact)
}

async function companyName(contact: Contact): Promise<string | null> {
  if (!contact.companyId) return null
  const c = await prisma.company.findUnique({ where: { id: contact.companyId }, select: { name: true } })
  return c?.name ?? null
}

/** Collapse multiple rows for the same entity into one group; latest op wins. */
function coalesce(rows: { id: string; localType: string; localId: string; op: string }[]): OutboxGroup[] {
  const map = new Map<string, OutboxGroup>()
  for (const r of rows) {
    const key = `${r.localType}:${r.localId}`
    const existing = map.get(key)
    if (existing) {
      existing.rowIds.push(r.id)
      existing.op = r.op as 'upsert' | 'delete' // rows are createdAt-asc → last wins
    } else {
      map.set(key, { rowIds: [r.id], localType: r.localType as LocalType, localId: r.localId, op: r.op as 'upsert' | 'delete' })
    }
  }
  return [...map.values()]
}

async function markRows(
  ids: string[],
  status: 'done' | 'failed' | 'skipped',
  opts: { errorMessage?: string; skipReason?: string; incAttempts?: boolean } = {},
): Promise<void> {
  if (ids.length === 0) return
  await prisma.syncOutbox.updateMany({
    where: { id: { in: ids } },
    data: {
      status,
      processedAt: new Date(),
      ...(opts.errorMessage ? { errorMessage: opts.errorMessage } : {}),
      ...(opts.skipReason ? { skipReason: opts.skipReason } : {}),
      ...(opts.incAttempts ? { attempts: { increment: 1 } } : {}),
    },
  })
}
