/**
 * Seed: Zalo OA + Zalo cá nhân CDP events & Event Dictionary
 * Usage: npx tsx scripts/seed-cdp-zalo.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function randomDate(daysAgo: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo))
  d.setHours(Math.floor(Math.random() * 14) + 8)
  d.setMinutes(Math.floor(Math.random() * 60))
  return d
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ═══════════════════════════════════════════════════════════════
// Event Dictionary — Zalo OA + Zalo Cá nhân
// ═══════════════════════════════════════════════════════════════
const ZALO_EVENT_DEFINITIONS = [
  // ── Zalo OA Events ──
  {
    eventName: 'oa_follow',
    displayName: 'Quan tâm OA',
    description: 'Người dùng bấm Quan tâm (follow) Zalo OA',
    schema: {
      type: 'object',
      properties: {
        oa_id: { type: 'string', description: 'ID của Zalo OA' },
        source: { type: 'string', enum: ['qr_code', 'search', 'share_link', 'article', 'ad'] },
      },
    },
  },
  {
    eventName: 'oa_unfollow',
    displayName: 'Bỏ quan tâm OA',
    description: 'Người dùng bỏ Quan tâm Zalo OA',
    schema: {
      type: 'object',
      properties: {
        oa_id: { type: 'string' },
      },
    },
  },
  {
    eventName: 'oa_send_message',
    displayName: 'Gửi tin nhắn tới OA',
    description: 'Người dùng gửi tin nhắn tới Zalo OA (text, image, sticker, file)',
    schema: {
      type: 'object',
      properties: {
        oa_id: { type: 'string' },
        msg_type: { type: 'string', enum: ['text', 'image', 'sticker', 'file', 'voice', 'location'] },
      },
    },
  },
  {
    eventName: 'oa_receive_message',
    displayName: 'OA gửi tin tới KH',
    description: 'OA gửi tin nhắn (broadcast / trả lời) tới người dùng',
    schema: {
      type: 'object',
      properties: {
        oa_id: { type: 'string' },
        msg_type: { type: 'string', enum: ['text', 'image', 'template', 'request_info', 'transaction'] },
        template_id: { type: 'string' },
      },
    },
  },
  {
    eventName: 'oa_click_menu',
    displayName: 'Bấm menu OA',
    description: 'Người dùng bấm vào menu item trên Zalo OA',
    schema: {
      type: 'object',
      properties: {
        oa_id: { type: 'string' },
        menu_title: { type: 'string' },
        menu_action: { type: 'string', enum: ['open_url', 'query_show', 'open_phone'] },
      },
    },
  },
  {
    eventName: 'oa_submit_form',
    displayName: 'Gửi form OA',
    description: 'Người dùng submit form thu thập thông tin trên OA (tên, SĐT, email)',
    schema: {
      type: 'object',
      properties: {
        oa_id: { type: 'string' },
        form_name: { type: 'string' },
        fields_submitted: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    eventName: 'oa_open_article',
    displayName: 'Xem bài viết OA',
    description: 'Người dùng mở đọc bài viết trên Zalo OA',
    schema: {
      type: 'object',
      properties: {
        oa_id: { type: 'string' },
        article_title: { type: 'string' },
        article_id: { type: 'string' },
        read_duration_sec: { type: 'number' },
      },
    },
  },
  {
    eventName: 'oa_click_cta',
    displayName: 'Bấm CTA trên OA',
    description: 'Người dùng bấm nút CTA (Call To Action) trong template message hoặc bài viết OA',
    schema: {
      type: 'object',
      properties: {
        oa_id: { type: 'string' },
        cta_type: { type: 'string', enum: ['open_url', 'phone', 'open_sms'] },
        cta_label: { type: 'string' },
        url: { type: 'string' },
      },
    },
  },
  // ── Zalo Cá nhân Events ──
  {
    eventName: 'zalo_msg_sent',
    displayName: 'Gửi tin nhắn Zalo',
    description: 'Nhân viên gửi tin nhắn Zalo cá nhân tới khách hàng',
    schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', const: 'zalo_personal' },
        msg_type: { type: 'string', enum: ['text', 'image', 'file', 'link', 'voice', 'sticker'] },
        thread_type: { type: 'string', enum: ['user', 'group'] },
      },
    },
  },
  {
    eventName: 'zalo_msg_received',
    displayName: 'Nhận tin nhắn Zalo',
    description: 'Khách hàng gửi tin nhắn Zalo cá nhân tới nhân viên',
    schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', const: 'zalo_personal' },
        msg_type: { type: 'string', enum: ['text', 'image', 'file', 'sticker', 'voice', 'video'] },
        thread_type: { type: 'string', enum: ['user', 'group'] },
      },
    },
  },
  {
    eventName: 'zalo_friend_added',
    displayName: 'Thêm bạn Zalo',
    description: 'Kết bạn Zalo thành công với khách hàng',
    schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', const: 'zalo_personal' },
        source: { type: 'string', enum: ['phone_search', 'qr_code', 'suggest', 'group'] },
      },
    },
  },
  {
    eventName: 'zalo_reaction',
    displayName: 'Thả cảm xúc Zalo',
    description: 'Khách hàng thả cảm xúc (reaction) vào tin nhắn',
    schema: {
      type: 'object',
      properties: {
        channel: { type: 'string', const: 'zalo_personal' },
        emoji: { type: 'string' },
      },
    },
  },
  // ── Zalo Mini App Events ──
  {
    eventName: 'miniapp_open',
    displayName: 'Mở Mini App',
    description: 'Khách mở Zalo Mini App từ OA hoặc link chia sẻ',
    schema: {
      type: 'object',
      properties: {
        app_id: { type: 'string' },
        entry_point: { type: 'string', enum: ['oa_menu', 'oa_message', 'share_link', 'qr_code', 'search'] },
      },
    },
  },
  {
    eventName: 'miniapp_order',
    displayName: 'Đặt hàng Mini App',
    description: 'Khách hàng đặt đơn hàng qua Zalo Mini App',
    schema: {
      type: 'object',
      properties: {
        app_id: { type: 'string' },
        order_amount: { type: 'number' },
        items_count: { type: 'integer' },
        payment_method: { type: 'string', enum: ['zalopay', 'cod', 'transfer'] },
      },
    },
  },
  {
    eventName: 'miniapp_payment',
    displayName: 'Thanh toán Mini App',
    description: 'Khách hoàn tất thanh toán trên Zalo Mini App (ZaloPay Checkout)',
    schema: {
      type: 'object',
      properties: {
        app_id: { type: 'string' },
        amount: { type: 'number' },
        status: { type: 'string', enum: ['success', 'failed', 'pending'] },
        method: { type: 'string', enum: ['zalopay', 'atm', 'cc', 'cod'] },
      },
    },
  },
]

// ═══════════════════════════════════════════════════════════════
// Event Templates for sample CdpEvent records
// ═══════════════════════════════════════════════════════════════
const EVENT_TEMPLATES = [
  // Zalo OA
  { name: 'oa_follow', source: 'zalo_oa', props: () => ({ oa_id: 'oa_579234', source: pick(['qr_code', 'search', 'share_link', 'article', 'ad']) }) },
  { name: 'oa_send_message', source: 'zalo_oa', props: () => ({ oa_id: 'oa_579234', msg_type: pick(['text', 'image', 'sticker', 'voice']) }) },
  { name: 'oa_receive_message', source: 'zalo_oa', props: () => ({ oa_id: 'oa_579234', msg_type: pick(['text', 'image', 'template', 'transaction']), template_id: pick(['tpl_welcome', 'tpl_promo', 'tpl_order_confirm', '']) }) },
  { name: 'oa_click_menu', source: 'zalo_oa', props: () => ({ oa_id: 'oa_579234', menu_title: pick(['Xem sản phẩm', 'Liên hệ tư vấn', 'Tra cứu đơn hàng', 'Khuyến mãi']), menu_action: pick(['open_url', 'query_show', 'open_phone']) }) },
  { name: 'oa_submit_form', source: 'zalo_oa', props: () => ({ oa_id: 'oa_579234', form_name: pick(['Đăng ký tư vấn', 'Nhận mẫu thử', 'Đăng ký CTV']), fields_submitted: pick([['name', 'phone'], ['name', 'phone', 'email'], ['name', 'phone', 'address']]) }) },
  { name: 'oa_open_article', source: 'zalo_oa', props: () => ({ oa_id: 'oa_579234', article_title: pick(['Bí quyết chăm sóc da mùa hè', 'Top 5 sản phẩm bán chạy', 'Chương trình ưu đãi tháng 5', 'Hướng dẫn sử dụng sản phẩm']), article_id: `art_${Math.floor(Math.random() * 100)}`, read_duration_sec: Math.floor(Math.random() * 180) + 10 }) },
  { name: 'oa_click_cta', source: 'zalo_oa', props: () => ({ oa_id: 'oa_579234', cta_type: pick(['open_url', 'phone']), cta_label: pick(['Mua ngay', 'Gọi tư vấn', 'Xem chi tiết', 'Đặt lịch hẹn']), url: pick(['https://shop.example.vn/promo', 'https://shop.example.vn/product/123', '']) }) },
  // Zalo cá nhân
  { name: 'zalo_msg_sent', source: 'zalo', props: () => ({ channel: 'zalo_personal', msg_type: pick(['text', 'image', 'file', 'link']), thread_type: pick(['user', 'user', 'user', 'group']) }) },
  { name: 'zalo_msg_received', source: 'zalo', props: () => ({ channel: 'zalo_personal', msg_type: pick(['text', 'image', 'sticker', 'voice']), thread_type: 'user' }) },
  { name: 'zalo_friend_added', source: 'zalo', props: () => ({ channel: 'zalo_personal', source: pick(['phone_search', 'qr_code', 'suggest', 'group']) }) },
  { name: 'zalo_reaction', source: 'zalo', props: () => ({ channel: 'zalo_personal', emoji: pick(['❤️', '👍', '😆', '😮', '😢']) }) },
  // Mini App
  { name: 'miniapp_open', source: 'zalo_miniapp', props: () => ({ app_id: 'app_tra_duoc', entry_point: pick(['oa_menu', 'oa_message', 'share_link', 'qr_code']) }) },
  { name: 'miniapp_order', source: 'zalo_miniapp', props: () => ({ app_id: 'app_tra_duoc', order_amount: (Math.floor(Math.random() * 2000) + 100) * 1000, items_count: Math.floor(Math.random() * 5) + 1, payment_method: pick(['zalopay', 'cod', 'transfer']) }) },
  { name: 'miniapp_payment', source: 'zalo_miniapp', props: () => ({ app_id: 'app_tra_duoc', amount: (Math.floor(Math.random() * 2000) + 100) * 1000, status: pick(['success', 'success', 'success', 'failed', 'pending']), method: pick(['zalopay', 'atm', 'cc', 'cod']) }) },
]

async function main() {
  const org = await prisma.organization.findFirst()
  if (!org) { console.log('❌ No organization found.'); return }

  const contacts = await prisma.contact.findMany({
    where: { orgId: org.id },
    take: 20,
    select: { id: true, fullName: true },
  })
  if (contacts.length === 0) { console.log('❌ No contacts found.'); return }

  console.log(`📦 Seeding Zalo CDP data for ${contacts.length} contacts...\n`)

  // ── 1. Clear old events & definitions ──
  const delEvents = await prisma.cdpEvent.deleteMany({ where: { orgId: org.id } })
  const delDefs = await prisma.cdpEventDefinition.deleteMany({ where: { orgId: org.id } })
  console.log(`🗑️  Cleared ${delEvents.count} old events, ${delDefs.count} old definitions`)

  // ── 2. Seed Event Dictionary ──
  let defCount = 0
  for (const def of ZALO_EVENT_DEFINITIONS) {
    await prisma.cdpEventDefinition.create({
      data: {
        orgId: org.id,
        eventName: def.eventName,
        displayName: def.displayName,
        description: def.description,
        schema: def.schema,
        isActive: true,
      },
    })
    defCount++
  }
  console.log(`✅ Created ${defCount} event definitions (Zalo OA + Cá nhân + Mini App)`)

  // ── 3. Seed CDP Events ──
  let eventCount = 0
  for (const contact of contacts) {
    const numEvents = Math.floor(Math.random() * 13) + 5
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

  console.log('\n🎉 Zalo CDP seed complete!')
  console.log(`   📖 ${defCount} event definitions`)
  console.log(`   📊 ${eventCount} sample events`)
  console.log(`   → Refresh Settings > Từ điển sự kiện & Analytics > Sự kiện KH`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
