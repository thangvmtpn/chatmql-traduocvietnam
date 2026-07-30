/**
 * Seed script: Creates sample CDP data (events, lifecycle logs, segments, property values)
 * Usage: npx tsx scripts/seed-cdp-data.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function randomDate(daysAgo: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo))
  d.setHours(Math.floor(Math.random() * 14) + 8) // 8am-10pm
  d.setMinutes(Math.floor(Math.random() * 60))
  return d
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function main() {
  const org = await prisma.organization.findFirst()
  if (!org) {
    console.log('❌ No organization found. Run setup first.')
    return
  }

  // Get contacts
  const contacts = await prisma.contact.findMany({
    where: { orgId: org.id },
    take: 20,
    select: { id: true, fullName: true, status: true },
  })

  if (contacts.length === 0) {
    console.log('❌ No contacts found. Seed contacts first.')
    return
  }

  console.log(`📦 Seeding CDP data for ${contacts.length} contacts in org "${org.name}"...\n`)

  // ═══════════════════════════════════════════════════
  // 1. CDP Events
  // ═══════════════════════════════════════════════════
  const EVENT_TEMPLATES = [
    { name: 'page_view', source: 'web', props: () => ({ page: pick(['/products', '/pricing', '/about', '/contact', '/blog']), referrer: pick(['google', 'facebook', 'direct', 'zalo']) }) },
    { name: 'product_view', source: 'web', props: () => ({ product: pick(['Trà thảo mộc', 'Trà giảm cân', 'Trà detox', 'Trà bổ thận', 'Trà ngủ ngon']), duration_sec: Math.floor(Math.random() * 300) + 10 }) },
    { name: 'add_to_cart', source: 'web', props: () => ({ product: pick(['Trà thảo mộc', 'Trà giảm cân', 'Trà detox']), quantity: Math.floor(Math.random() * 5) + 1, value: (Math.floor(Math.random() * 500) + 100) * 1000 }) },
    { name: 'purchase', source: 'system', props: () => ({ amount: (Math.floor(Math.random() * 2000) + 200) * 1000, items: Math.floor(Math.random() * 5) + 1, payment_method: pick(['cod', 'transfer', 'momo', 'zalopay']) }) },
    { name: 'message_sent', source: 'zalo', props: () => ({ channel: 'zalo', type: pick(['text', 'image', 'link']) }) },
    { name: 'message_received', source: 'zalo', props: () => ({ channel: 'zalo', type: pick(['text', 'image', 'sticker']) }) },
    { name: 'form_submit', source: 'web', props: () => ({ form: pick(['contact_form', 'newsletter', 'feedback', 'warranty']), utm_source: pick(['facebook', 'google', 'organic', 'zalo_oa']) }) },
    { name: 'email_open', source: 'email', props: () => ({ campaign: pick(['welcome', 'promo_tet', 'flash_sale', 'loyalty']), subject: pick(['Ưu đãi đặc biệt', 'Sản phẩm mới', 'Chương trình VIP']) }) },
    { name: 'support_ticket', source: 'system', props: () => ({ priority: pick(['low', 'medium', 'high']), category: pick(['delivery', 'quality', 'refund', 'inquiry']) }) },
    { name: 'review_posted', source: 'web', props: () => ({ rating: Math.floor(Math.random() * 3) + 3, product: pick(['Trà thảo mộc', 'Trà giảm cân']) }) },
  ]

  let eventCount = 0
  for (const contact of contacts) {
    // Each contact gets 3-15 random events over the past 30 days
    const numEvents = Math.floor(Math.random() * 13) + 3
    for (let i = 0; i < numEvents; i++) {
      const template = pick(EVENT_TEMPLATES)
      await prisma.cdpEvent.create({
        data: {
          orgId: org.id,
          contactId: contact.id,
          eventName: template.name,
          properties: template.props(),
          source: template.source,
          timestamp: randomDate(30),
        },
      })
      eventCount++
    }
  }
  console.log(`✅ Created ${eventCount} CDP events`)

  // ═══════════════════════════════════════════════════
  // 2. Lifecycle Logs
  // ═══════════════════════════════════════════════════
  const LIFECYCLE_STAGES = ['subscriber', 'lead', 'qualified', 'opportunity', 'customer', 'evangelist']
  const REASONS = [
    'Đã mua hàng lần đầu',
    'Đủ điều kiện doanh thu > 5tr',
    'Đăng ký nhận tin',
    'Tương tác tích cực trên Zalo',
    'Giới thiệu khách mới',
    'Mua hàng lặp lại 3+ lần',
    'Chuyển từ Zalo OA',
    null,
    null,
  ]

  const admin = await prisma.user.findFirst({ where: { orgId: org.id } })

  let lifecycleCount = 0
  for (const contact of contacts) {
    // Simulate 1-3 lifecycle transitions per contact
    const numTransitions = Math.floor(Math.random() * 3) + 1
    let currentStage: string | null = null

    for (let i = 0; i < numTransitions; i++) {
      const toStageIdx = Math.min(
        (currentStage ? LIFECYCLE_STAGES.indexOf(currentStage) + 1 : 0) + Math.floor(Math.random() * 2),
        LIFECYCLE_STAGES.length - 1
      )
      const toStage = LIFECYCLE_STAGES[toStageIdx]

      if (toStage === currentStage) continue

      await prisma.lifecycleLog.create({
        data: {
          orgId: org.id,
          contactId: contact.id,
          fromStage: currentStage,
          toStage,
          changedBy: admin?.id || null,
          reason: pick(REASONS),
          createdAt: randomDate(60 - i * 15),
        },
      })

      currentStage = toStage
      lifecycleCount++
    }

    // Update contact status to match latest stage
    if (currentStage) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { status: currentStage },
      })
    }
  }
  console.log(`✅ Created ${lifecycleCount} lifecycle transitions`)

  // ═══════════════════════════════════════════════════
  // 3. Segments
  // ═══════════════════════════════════════════════════
  const SEGMENTS = [
    {
      name: 'Khách VIP',
      description: 'Khách hàng đã mua trên 5 triệu đồng',
      conditions: [{ logic: 'AND' as const, conditions: [{ type: 'property' as const, field: 'doanh_thu', operator: 'gte', value: 5000000 }] }],
    },
    {
      name: 'Khách Miền Nam',
      description: 'Khách ở khu vực miền Nam',
      conditions: [{ logic: 'AND' as const, conditions: [{ type: 'property' as const, field: 'khu_vuc', operator: 'equals', value: 'mien_nam' }] }],
    },
    {
      name: 'Lead nóng',
      description: 'Khách đang ở giai đoạn cơ hội hoặc đã mua',
      conditions: [{ logic: 'OR' as const, conditions: [
        { type: 'contact' as const, field: 'status', operator: 'equals', value: 'opportunity' },
        { type: 'contact' as const, field: 'status', operator: 'equals', value: 'customer' },
      ] }],
    },
    {
      name: 'Tương tác Zalo',
      description: 'Khách hàng có sự kiện nhắn tin qua Zalo',
      conditions: [{ logic: 'AND' as const, conditions: [{ type: 'event' as const, field: 'message_sent', operator: 'has_event', value: 'true' }] }],
    },
    {
      name: 'Cộng tác viên',
      description: 'Các khách hàng là CTV',
      conditions: [{ logic: 'AND' as const, conditions: [{ type: 'property' as const, field: 'la_ctv', operator: 'equals', value: 'true' }] }],
    },
  ]

  let segmentCount = 0
  for (const seg of SEGMENTS) {
    const existing = await prisma.segment.findFirst({
      where: { orgId: org.id, name: seg.name },
    })
    if (existing) {
      console.log(`⏭️  Skip segment: "${seg.name}" (already exists)`)
      continue
    }

    // Calculate contact count based on matching
    const contactCount = Math.floor(Math.random() * Math.min(contacts.length, 8)) + 1

    await prisma.segment.create({
      data: {
        orgId: org.id,
        name: seg.name,
        description: seg.description,
        conditions: seg.conditions as any,
        contactCount,
        lastCalculatedAt: new Date(),
      },
    })
    segmentCount++
    console.log(`✅ Segment: "${seg.name}" (${contactCount} contacts)`)
  }
  console.log(`✅ Created ${segmentCount} segments`)

  // ═══════════════════════════════════════════════════
  // 4. Property Values (for contacts)
  // ═══════════════════════════════════════════════════
  const properties = await prisma.customProperty.findMany({
    where: { orgId: org.id },
  })

  if (properties.length === 0) {
    console.log('⚠️  No custom properties found. Run seed-cdp-properties.ts first.')
  } else {
    let propValCount = 0
    const SAMPLE_VALUES: Record<string, () => string> = {
      doanh_thu: () => String((Math.floor(Math.random() * 50) + 1) * 100000),
      san_pham_quan_tam: () => pick(['tra_thao_moc', 'tra_giam_can', 'tra_detox', 'tra_bo_than', 'tra_ngu_ngon']),
      khu_vuc: () => pick(['mien_bac', 'mien_trung', 'mien_nam']),
      ngay_mua_hang_gan_nhat: () => randomDate(60).toISOString().split('T')[0],
      la_ctv: () => pick(['true', 'false', 'false', 'false']),
      ghi_chu_dac_biet: () => pick([
        'Khách quen, mua hàng thường xuyên',
        'Đã giới thiệu 3 khách mới',
        'Cần chăm sóc đặc biệt',
        'Ưu tiên giao hàng nhanh',
        'Đang xem xét làm CTV',
        '',
      ]),
    }

    for (const contact of contacts.slice(0, 12)) {
      for (const prop of properties) {
        const valueFn = SAMPLE_VALUES[prop.fieldKey]
        if (!valueFn) continue

        const value = valueFn()
        if (!value) continue

        // Upsert — skip if exists
        const exists = await prisma.contactPropertyValue.findUnique({
          where: {
            contactId_propertyId: { contactId: contact.id, propertyId: prop.id },
          },
        })
        if (exists) continue

        await prisma.contactPropertyValue.create({
          data: {
            orgId: org.id,
            contactId: contact.id,
            propertyId: prop.id,
            value,
          },
        })
        propValCount++
      }
    }
    console.log(`✅ Created ${propValCount} property values`)
  }

  // ═══════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════
  console.log('\n🎉 CDP seed complete!')
  console.log(`   📊 ${eventCount} events`)
  console.log(`   🔄 ${lifecycleCount} lifecycle transitions`)
  console.log(`   👥 ${segmentCount} segments`)
  console.log(`   → Refresh /cdp page to see data`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
