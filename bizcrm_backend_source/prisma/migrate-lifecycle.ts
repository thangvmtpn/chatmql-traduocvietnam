/**
 * One-shot data migration: backfill Contact.lifecycleStage from Contact.status.
 *
 * Run AFTER `yarn db:push` adds the lifecycle_stage column, and BEFORE
 * removing the status column. After this, drop `status` from schema.prisma
 * and run `yarn db:push --accept-data-loss`.
 *
 * Mapping (decided 2026-05-15):
 *   status='new'        → lifecycle_stage='subscriber'
 *   status='contacted'  → lifecycle_stage='lead'
 *   status='interested' → lifecycle_stage='qualified'
 *   status='converted'  → lifecycle_stage='customer'
 *   status='lost'       → lifecycle_stage='churned'
 *   status=NULL/other   → kept as 'subscriber' (column default)
 *
 * Usage: yarn tsx prisma/migrate-lifecycle.ts
 */
import { prisma } from '../src/shared/prisma-client.js'

const MAPPING: Record<string, string> = {
  new: 'subscriber',
  contacted: 'lead',
  interested: 'qualified',
  converted: 'customer',
  lost: 'churned',
}

async function main() {
  // Snapshot pre-migration distribution
  const before = await prisma.$queryRawUnsafe<Array<{ status: string | null; count: bigint }>>(
    'SELECT status, COUNT(*)::bigint AS count FROM contacts GROUP BY status ORDER BY count DESC'
  )
  console.log('Before — Contact.status distribution:')
  for (const row of before) console.log(`  ${row.status ?? '<null>'}: ${row.count}`)

  // Pre-existing data has TWO kinds of status values:
  //   (a) Legacy 5-value pipeline: new/contacted/interested/converted/lost
  //   (b) Already-lifecycle 7-value stages written by cdp-lifecycle-routes.ts:86
  //       which has been calling `data: { status: toStage }` with HubSpot stages
  // We map (a) via MAPPING and pass-through (b) by copying status → lifecycle_stage.
  const VALID_STAGES = ['subscriber', 'lead', 'qualified', 'opportunity', 'customer', 'evangelist', 'churned']

  let totalUpdated = 0
  for (const [oldStatus, newStage] of Object.entries(MAPPING)) {
    const result = await prisma.$executeRawUnsafe(
      'UPDATE contacts SET lifecycle_stage = $1 WHERE status = $2',
      newStage,
      oldStatus,
    )
    console.log(`  ${oldStatus} → ${newStage}: ${result} rows`)
    totalUpdated += Number(result)
  }

  // Pass-through for rows where status was already a valid lifecycle stage
  for (const stage of VALID_STAGES) {
    const result = await prisma.$executeRawUnsafe(
      'UPDATE contacts SET lifecycle_stage = $1 WHERE status = $1',
      stage,
    )
    if (Number(result) > 0) {
      console.log(`  ${stage} → ${stage} (pass-through): ${result} rows`)
      totalUpdated += Number(result)
    }
  }

  const after = await prisma.$queryRawUnsafe<Array<{ lifecycle_stage: string; count: bigint }>>(
    'SELECT lifecycle_stage, COUNT(*)::bigint AS count FROM contacts GROUP BY lifecycle_stage ORDER BY count DESC'
  )
  console.log('\nAfter — Contact.lifecycle_stage distribution:')
  for (const row of after) console.log(`  ${row.lifecycle_stage}: ${row.count}`)

  console.log(`\n✅ Backfill complete. ${totalUpdated} rows updated.`)
  console.log('Next step: remove `status` field from schema.prisma, then run:')
  console.log('  yarn db:push --accept-data-loss')
}

main()
  .catch((err) => {
    console.error('❌ Backfill failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
