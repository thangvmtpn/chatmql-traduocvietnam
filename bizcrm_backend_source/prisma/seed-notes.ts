/**
 * seed-notes.ts — Seed sample notes for contacts
 * Usage: npx tsx prisma/seed-notes.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Find existing org + user + contacts
  const org = await prisma.organization.findFirst()
  if (!org) { console.error('❌ No org found. Run seed-sample.ts first.'); process.exit(1) }

  const user = await prisma.user.findFirst({ where: { orgId: org.id } })
  if (!user) { console.error('❌ No user found.'); process.exit(1) }

  const contacts = await prisma.contact.findMany({
    where: { orgId: org.id },
    take: 10,
    orderBy: { createdAt: 'asc' },
  })

  if (contacts.length === 0) {
    console.error('❌ No contacts found.')
    process.exit(1)
  }

  console.log(`📝 Seeding notes for ${contacts.length} contacts...`)

  const noteData = [
    // Contact 0 — multiple notes
    { contactIdx: 0, content: 'Khách hàng quan tâm sản phẩm gói Premium. Hẹn gọi lại sau 2 ngày để tư vấn chi tiết.', isPinned: true },
    { contactIdx: 0, content: 'Đã gửi bảng giá qua Zalo, khách nói sẽ bàn với bên quản lý rồi phản hồi lại.', isPinned: false },
    { contactIdx: 0, content: 'Follow up lần 2: Khách chưa reply. Nhắn thêm 1 tin để nhắc nhở.', isPinned: false },

    // Contact 1
    { contactIdx: 1, content: 'Khách muốn mua số lượng lớn (50+ đơn vị). Cần xin approval discount 15% từ quản lý.', isPinned: true },
    { contactIdx: 1, content: 'Đã confirm giảm giá 10%. Khách đồng ý, chờ ký hợp đồng.', isPinned: false },

    // Contact 2
    { contactIdx: 2, content: 'Khách phàn nàn về tốc độ giao hàng lần trước. Cần escalate lên bộ phận vận chuyển.', isPinned: true },
    { contactIdx: 2, content: 'Đã giải quyết complaint, khách hài lòng. Gửi voucher xin lỗi 50k.', isPinned: false },

    // Contact 3
    { contactIdx: 3, content: 'Khách hàng VIP, luôn đặt hàng định kỳ mỗi tháng. Ưu tiên chăm sóc.', isPinned: true },

    // Contact 4
    { contactIdx: 4, content: 'Lần đầu liên hệ qua Zalo. Khách hỏi về chính sách bảo hành sản phẩm.', isPinned: false },
    { contactIdx: 4, content: 'Đã gửi tài liệu bảo hành. Khách nói cảm ơn, sẽ liên hệ khi cần.', isPinned: false },

    // Contact 5 (if exists)
    { contactIdx: 5, content: 'Khách quan tâm tính năng tự động hóa. Demo buổi sáng thứ 2.', isPinned: false },

    // Contact 6
    { contactIdx: 6, content: 'Ghi chú nội bộ: Kiểm tra lại số điện thoại vì khách gửi 2 SĐT khác nhau.', isPinned: false },

    // Contact 7
    { contactIdx: 7, content: 'Khách muốn tích hợp API. Chuyển qua team kỹ thuật xử lý.', isPinned: true },
    { contactIdx: 7, content: 'Team kỹ thuật đã liên hệ, đang setup sandbox cho khách test.', isPinned: false },
    { contactIdx: 7, content: 'Sandbox hoạt động OK. Khách bắt đầu tích hợp production trong tuần sau.', isPinned: false },
  ]

  let count = 0
  for (const nd of noteData) {
    const contact = contacts[nd.contactIdx]
    if (!contact) continue

    // Create with staggered timestamps for realistic ordering
    const baseDate = new Date()
    baseDate.setDate(baseDate.getDate() - Math.floor(Math.random() * 14))
    baseDate.setHours(baseDate.getHours() - Math.floor(Math.random() * 8))

    await prisma.note.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        createdByUserId: user.id,
        content: nd.content,
        isPinned: nd.isPinned,
        createdAt: baseDate,
      },
    })
    count++
  }

  console.log(`✅ Seeded ${count} notes successfully!`)
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1) })
