/**
 * check-org-integrity.ts — Read-only tenant-integrity audit.
 *
 * Verifies every tenant-scoped row points at an existing Organization.
 * FK constraints already guarantee this, so a clean run is the expected
 * result — the value is a fast, explicit reassurance before/after data
 * imports or migrations, and a per-org row-count snapshot.
 *
 * Usage:  yarn tsx scripts/check-org-integrity.ts
 */
import { prisma } from '../src/shared/prisma-client.js'

// Representative tenant-scoped tables (direct orgId column).
const TABLES = [
  'user', 'contact', 'company', 'conversation', 'channelAccount',
  'task', 'appointment', 'aiConfig', 'knowledgeEntry', 'notification',
] as const

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } })
  const orgIds = new Set(orgs.map((o) => o.id))
  console.log(`\n🏢 Organizations: ${orgs.length}`)

  let orphanTotal = 0
  for (const table of TABLES) {
    // groupBy orgId for each table → detect any orgId not in the org set.
    const groups: Array<{ orgId: string; _count: { _all: number } }> =
      await (prisma as any)[table].groupBy({ by: ['orgId'], _count: { _all: true } })
    const orphans = groups.filter((g) => !orgIds.has(g.orgId))
    const rows = groups.reduce((s, g) => s + g._count._all, 0)
    const flag = orphans.length > 0 ? `❌ ${orphans.length} orphan orgId(s)` : '✅'
    console.log(`  ${table.padEnd(16)} rows=${String(rows).padStart(6)}  ${flag}`)
    if (orphans.length > 0) {
      orphanTotal += orphans.length
      for (const o of orphans) console.log(`      orphan orgId=${o.orgId} (${o._count._all} rows)`)
    }
  }

  console.log('')
  if (orphanTotal === 0) {
    console.log('✅ Integrity OK — every tenant-scoped row belongs to a real organization.')
  } else {
    console.log(`❌ Found ${orphanTotal} orphan org reference(s). Investigate before going multi-tenant.`)
    process.exitCode = 1
  }
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
