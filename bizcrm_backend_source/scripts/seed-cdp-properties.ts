/**
 * Seed script: Creates sample CDP custom properties for the first org.
 * Usage: npx tsx scripts/seed-cdp-properties.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const org = await prisma.organization.findFirst()
  if (!org) {
    console.log('❌ No organization found. Run setup first.')
    return
  }

  const properties = [
    {
      name: 'Doanh thu',
      fieldKey: 'doanh_thu',
      fieldType: 'number',
      groupName: 'Giao dịch',
      description: 'Tổng doanh thu khách hàng (VNĐ)',
      sortOrder: 1,
    },
    {
      name: 'Sản phẩm quan tâm',
      fieldKey: 'san_pham_quan_tam',
      fieldType: 'multi_select',
      groupName: 'Sản phẩm',
      description: 'Các sản phẩm khách hàng đang quan tâm',
      options: [
        { value: 'tra_thao_moc', label: 'Trà thảo mộc', color: '#16a34a' },
        { value: 'tra_giam_can', label: 'Trà giảm cân', color: '#9333ea' },
        { value: 'tra_detox', label: 'Trà detox', color: '#f59e0b' },
        { value: 'tra_bo_than', label: 'Trà bổ thận', color: '#3b82f6' },
        { value: 'tra_ngu_ngon', label: 'Trà ngủ ngon', color: '#ec4899' },
      ],
      sortOrder: 2,
    },
    {
      name: 'Khu vực',
      fieldKey: 'khu_vuc',
      fieldType: 'single_select',
      groupName: 'Địa lý',
      description: 'Khu vực địa lý của khách hàng',
      options: [
        { value: 'mien_bac', label: 'Miền Bắc', color: '#3b82f6' },
        { value: 'mien_trung', label: 'Miền Trung', color: '#f59e0b' },
        { value: 'mien_nam', label: 'Miền Nam', color: '#16a34a' },
      ],
      sortOrder: 3,
    },
    {
      name: 'Ngày mua hàng gần nhất',
      fieldKey: 'ngay_mua_hang_gan_nhat',
      fieldType: 'date',
      groupName: 'Giao dịch',
      description: 'Lần mua hàng cuối cùng',
      sortOrder: 4,
    },
    {
      name: 'Là CTV',
      fieldKey: 'la_ctv',
      fieldType: 'boolean',
      groupName: 'Phân loại',
      description: 'Khách hàng có phải là cộng tác viên không',
      sortOrder: 5,
    },
    {
      name: 'Ghi chú đặc biệt',
      fieldKey: 'ghi_chu_dac_biet',
      fieldType: 'text',
      groupName: 'Chung',
      description: 'Thông tin bổ sung riêng',
      sortOrder: 6,
    },
  ]

  let created = 0
  for (const prop of properties) {
    const existing = await prisma.customProperty.findUnique({
      where: { orgId_fieldKey: { orgId: org.id, fieldKey: prop.fieldKey } },
    })
    if (existing) {
      console.log(`⏭️  Skip: "${prop.name}" (already exists)`)
      continue
    }

    await prisma.customProperty.create({
      data: {
        orgId: org.id,
        name: prop.name,
        fieldKey: prop.fieldKey,
        fieldType: prop.fieldType,
        options: prop.options ?? [],
        groupName: prop.groupName ?? null,
        description: prop.description ?? null,
        sortOrder: prop.sortOrder,
      },
    })
    created++
    console.log(`✅ Created: "${prop.name}" (${prop.fieldType})`)
  }

  console.log(`\n🎉 Done! ${created} properties created for org "${org.name}".`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
