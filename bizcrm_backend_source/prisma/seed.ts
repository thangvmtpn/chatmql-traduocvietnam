/**
 * Prisma seed script — Seeds default Vietnamese tags for all organizations.
 * Run: npx prisma db seed   OR   npx tsx prisma/seed.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const TAG_KEY = 'org.tags'

const DEFAULT_TAGS = [
  { id: crypto.randomUUID(), name: 'Quan tâm',     color: '#3b82f6' },  // Blue — interested
  { id: crypto.randomUUID(), name: 'Tiềm năng',    color: '#10b981' },  // Green — potential
  { id: crypto.randomUUID(), name: 'VIP',           color: '#f59e0b' },  // Amber — VIP customer
  { id: crypto.randomUUID(), name: 'Chuyển đổi',   color: '#8b5cf6' },  // Purple — converted
  { id: crypto.randomUUID(), name: 'Mới',           color: '#06b6d4' },  // Cyan — new lead
  { id: crypto.randomUUID(), name: 'Liên hệ',      color: '#f97316' },  // Orange — need to contact
  { id: crypto.randomUUID(), name: 'Chăm sóc',     color: '#ec4899' },  // Pink — nurturing
  { id: crypto.randomUUID(), name: 'Đã mua',       color: '#16a34a' },  // Dark green — purchased
]

async function main() {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } })

  if (orgs.length === 0) {
    console.log('⏭️  No organizations found — skipping tag seed.')
    return
  }

  for (const org of orgs) {
    // Check if tags already exist for this org
    const existing = await prisma.appSetting.findUnique({
      where: { orgId_settingKey: { orgId: org.id, settingKey: TAG_KEY } },
    })

    if (existing?.valuePlain) {
      try {
        const tags = JSON.parse(existing.valuePlain)
        if (Array.isArray(tags) && tags.length > 0) {
          console.log(`⏭️  Org "${org.name}" already has ${tags.length} tags — skipping.`)
          continue
        }
      } catch { /* corrupt JSON, overwrite */ }
    }

    // Seed with fresh UUIDs for this org
    const orgTags = DEFAULT_TAGS.map(t => ({ ...t, id: crypto.randomUUID() }))

    await prisma.appSetting.upsert({
      where: { orgId_settingKey: { orgId: org.id, settingKey: TAG_KEY } },
      update: { valuePlain: JSON.stringify(orgTags) },
      create: { orgId: org.id, settingKey: TAG_KEY, valuePlain: JSON.stringify(orgTags) },
    })

    console.log(`✅ Seeded ${orgTags.length} tags for org "${org.name}"`)
  }
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
