/**
 * org-stats-service.ts — Aggregate per-org counts for the platform console.
 * Uses groupBy (one query per metric) to avoid N+1 over many companies.
 */
import { prisma } from '../../shared/prisma-client.js'

export type OrgStats = { users: number; contacts: number; conversations: number }

const EMPTY: OrgStats = { users: 0, contacts: 0, conversations: 0 }

/** Per-org counts for a given set of orgIds. Missing orgs default to zero. */
export async function getOrgStatsMap(orgIds: string[]): Promise<Map<string, OrgStats>> {
  const map = new Map<string, OrgStats>()
  if (orgIds.length === 0) return map
  const where = { orgId: { in: orgIds } }

  const [users, contacts, conversations] = await Promise.all([
    prisma.user.groupBy({ by: ['orgId'], _count: { _all: true }, where }),
    prisma.contact.groupBy({ by: ['orgId'], _count: { _all: true }, where }),
    prisma.conversation.groupBy({ by: ['orgId'], _count: { _all: true }, where }),
  ])

  const ensure = (id: string): OrgStats => {
    let s = map.get(id)
    if (!s) { s = { ...EMPTY }; map.set(id, s) }
    return s
  }
  for (const r of users) ensure(r.orgId).users = r._count._all
  for (const r of contacts) ensure(r.orgId).contacts = r._count._all
  for (const r of conversations) ensure(r.orgId).conversations = r._count._all
  for (const id of orgIds) ensure(id) // guarantee an entry for every requested org
  return map
}

/** System-wide totals across all organizations. */
export async function getGlobalTotals(): Promise<{ users: number; contacts: number; conversations: number }> {
  const [users, contacts, conversations] = await Promise.all([
    prisma.user.count(),
    prisma.contact.count(),
    prisma.conversation.count(),
  ])
  return { users, contacts, conversations }
}
