/**
 * seed-appointments.ts — Seed dữ liệu mẫu lịch hẹn (appointments)
 * Run: npx ts-node prisma/seed-appointments.ts
 * 
 * Requires: Contacts must already exist (run seed-sample.ts first)
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🗓️  Bắt đầu tạo lịch hẹn mẫu...')

  const org = await prisma.organization.findFirst()
  if (!org) {
    console.error('❌ Chưa có Organization. Hãy chạy seed-sample.ts trước.')
    process.exit(1)
  }

  // Lấy danh sách contacts hiện có
  const contacts = await prisma.contact.findMany({
    where: { orgId: org.id },
    take: 10,
    orderBy: { createdAt: 'asc' },
  })

  if (contacts.length === 0) {
    console.error('❌ Chưa có Contact nào. Hãy chạy seed-sample.ts trước.')
    process.exit(1)
  }

  console.log(`ℹ️  Tìm thấy ${contacts.length} contacts`)

  // Xoá appointments cũ (nếu có) để tránh duplicate
  const deleted = await prisma.appointment.deleteMany({ where: { orgId: org.id } })
  if (deleted.count > 0) {
    console.log(`🗑️  Xoá ${deleted.count} appointments cũ`)
  }

  const today = new Date()
  const dayMs = 24 * 60 * 60 * 1000

  // Dữ liệu mẫu — đa dạng status, type, thời gian
  const appointments = [
    // === HÔM NAY (2 cuộc hẹn) ===
    {
      contactIdx: 0,
      date: today,
      time: '09:00',
      type: 'consultation',
      status: 'scheduled',
      notes: 'Tư vấn gói phần mềm CRM nâng cao cho doanh nghiệp vừa',
    },
    {
      contactIdx: 1,
      date: today,
      time: '14:30',
      type: 'follow_up',
      status: 'scheduled',
      notes: 'Theo dõi sau demo tuần trước, kiểm tra feedback',
    },

    // === SẮP TỚI (3 cuộc hẹn) ===
    {
      contactIdx: 2,
      date: new Date(today.getTime() + 1 * dayMs),
      time: '10:00',
      type: 'new_visit',
      status: 'scheduled',
      notes: 'Khám mới — khách đăng ký qua Zalo, cần tư vấn chi tiết',
    },
    {
      contactIdx: 3,
      date: new Date(today.getTime() + 2 * dayMs),
      time: '15:00',
      type: 'consultation',
      status: 'scheduled',
      notes: 'Demo sản phẩm cho team 5 người',
    },
    {
      contactIdx: 0,
      date: new Date(today.getTime() + 5 * dayMs),
      time: '11:00',
      type: 'follow_up',
      status: 'scheduled',
      notes: 'Follow-up ký hợp đồng',
    },

    // === ĐÃ HOÀN THÀNH (3 cuộc hẹn) ===
    {
      contactIdx: 4,
      date: new Date(today.getTime() - 2 * dayMs),
      time: '09:30',
      type: 'consultation',
      status: 'completed',
      notes: 'Tư vấn thành công — khách rất hài lòng',
    },
    {
      contactIdx: 5,
      date: new Date(today.getTime() - 5 * dayMs),
      time: '16:00',
      type: 'new_visit',
      status: 'completed',
      notes: 'Gặp mặt lần đầu, trình bày giải pháp CRM tổng thể',
    },
    {
      contactIdx: 1,
      date: new Date(today.getTime() - 7 * dayMs),
      time: '08:30',
      type: 'follow_up',
      status: 'completed',
      notes: 'Khách đã test thử gói trial, feedback tích cực',
    },

    // === ĐÃ HUỶ (1) ===
    {
      contactIdx: 6 % contacts.length,
      date: new Date(today.getTime() - 1 * dayMs),
      time: '13:00',
      type: 'other',
      status: 'cancelled',
      notes: 'Khách báo bận, hẹn lại tuần sau',
    },

    // === VẮNG MẶT (1) ===
    {
      contactIdx: 7 % contacts.length,
      date: new Date(today.getTime() - 3 * dayMs),
      time: '10:00',
      type: 'consultation',
      status: 'no_show',
      notes: 'Khách không đến, đã gọi lại nhưng không liên lạc được',
    },
  ]

  let created = 0
  for (const appt of appointments) {
    const contact = contacts[appt.contactIdx % contacts.length]

    await prisma.appointment.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        appointmentDate: appt.date,
        appointmentTime: appt.time,
        type: appt.type,
        status: appt.status,
        notes: appt.notes,
      },
    })
    created++

    const statusEmoji = {
      scheduled: '📅',
      completed: '✅',
      cancelled: '❌',
      no_show: '⚠️',
    }[appt.status] || '📋'

    console.log(`   ${statusEmoji} ${appt.status.padEnd(10)} | ${appt.time} | ${contact.fullName ?? 'N/A'} — ${appt.notes?.substring(0, 40)}...`)
  }

  console.log(`\n🎉 Hoàn thành! Đã tạo ${created} lịch hẹn mẫu.`)
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi tạo dữ liệu:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
