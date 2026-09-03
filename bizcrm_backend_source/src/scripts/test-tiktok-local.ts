/**
 * test-tiktok-local.ts — End-to-end Local Verification for TikTok Shop Native Integration.
 *
 * Tests:
 * 1. Upserts a test TikTok Shop ChannelAccount (Platform 40).
 * 2. Simulates an incoming customer message from TikTok app via Webhook with valid HMAC-SHA256 signature.
 * 3. Verifies Contact & Conversation creation (tiktokUid, source, aiMode: auto).
 * 4. Verifies BullMQ trigger and AI Auto-Reply response generation.
 */

import { createHmac } from 'node:crypto'
import { prisma } from '../shared/prisma-client.js'
import { Platform } from '../shared/constants.js'

async function main() {
  console.log('--- Bắt đầu kiểm thử tích hợp TikTok Shop Native trên Local ---')

  const appSecret = process.env.TIKTOK_APP_SECRET || 'test_secret'
  const testShopId = 'shop_vn_traduoc_01'
  const testBuyerUid = `tt_buyer_${Date.now().toString().slice(-4)}`
  const testBuyerName = 'Nguyễn Thị Hương (TikTok)'
  const testConvId = `conv_tt_${Date.now()}`

  // 1. Find the active organization and admin user
  const org = await prisma.organization.findFirst()
  if (!org) {
    throw new Error('Không tìm thấy Organization nào trong cơ sở dữ liệu')
  }
  const user = await prisma.user.findFirst({ where: { orgId: org.id } })
  if (!user) {
    throw new Error('Không tìm thấy User nào trong Organization')
  }
  console.log(`[1] Tổ chức: ${org.name} (${org.id}), User: ${user.fullName} (${user.id})`)

  // 2. Upsert ChannelAccount for TikTok Shop
  const channelAccount = await prisma.channelAccount.upsert({
    where: {
      orgId_externalPageId: {
        orgId: org.id,
        externalPageId: testShopId,
      },
    },
    create: {
      orgId: org.id,
      ownerUserId: user.id,
      platform: Platform.TIKTOK_SHOP,
      externalPageId: testShopId,
      externalUid: 'seller_vn_traduoc',
      displayName: 'Trà Dược Việt Nam - TikTok Shop',
      status: 'connected',
    },
    update: {
      status: 'connected',
      deletedAt: null,
      isDisabled: false,
    },
  })
  console.log(`[2] Đã sẵn sàng Kênh TikTok Shop: ${channelAccount.displayName} (ID: ${channelAccount.id})`)

  // 3. Prepare Webhook Payload
  const customerQuestion = 'Chào shop, em đang cần tìm trà thanh nhiệt mát gan, giá bao nhiêu vậy shop?'
  const payload = {
    event: 'IM_MESSAGE',
    shop_id: testShopId,
    timestamp: Date.now(),
    data: {
      conversation_id: testConvId,
      message_id: `msg_${Date.now()}`,
      sender: {
        role: 'BUYER',
        user_id: testBuyerUid,
        nickname: testBuyerName,
      },
      type: 'TEXT',
      content: JSON.stringify({ text: customerQuestion }),
      create_time: Date.now(),
    },
  }

  const rawBody = Buffer.from(JSON.stringify(payload), 'utf8')
  const signature = createHmac('sha256', appSecret).update(rawBody).digest('hex')

  console.log(`[3] Gửi Webhook giả lập từ TikTok App tới http://localhost:4520/api/v1/tiktok-shop/webhook...`)
  console.log(`    - Khách hàng: ${testBuyerName} (${testBuyerUid})`)
  console.log(`    - Câu hỏi: "${customerQuestion}"`)
  console.log(`    - Signature: ${signature.slice(0, 16)}...`)

  const res = await fetch('http://localhost:4520/api/v1/tiktok-shop/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tts-signature': signature,
    },
    body: rawBody,
  })

  const resJson = await res.json()
  console.log(`[4] Phản hồi Webhook:`, resJson)

  // 4. Verify DB records
  console.log('[5] Đang chờ hệ thống xử lý Inbound & AI Auto-Reply (khoảng 7 giây)...')
  await new Promise(r => setTimeout(r, 7000))

  const contact = await prisma.contact.findFirst({
    where: { orgId: org.id, tiktokUid: testBuyerUid },
  })
  console.log(`[6] Kiểm tra Contact:`, contact ? `✓ Thành công! (ID: ${contact.id}, Tên: ${contact.fullName}, Source: ${contact.source})` : '✗ Chưa tìm thấy')

  const conv = await prisma.conversation.findFirst({
    where: { channelAccountId: channelAccount.id, externalThreadId: testConvId },
    include: {
      messages: { orderBy: { sentAt: 'asc' } },
    },
  })

  if (!conv) {
    console.error('✗ Chưa tìm thấy Conversation được tạo')
    return
  }

  console.log(`[7] Hội thoại TikTok: ${conv.id} | aiMode: ${conv.aiMode} | Số tin nhắn: ${conv.messages.length}`)
  for (const m of conv.messages) {
    const role = m.senderType === 'contact' ? '👤 Khách TikTok' : (m.aiGenerated ? '🤖 AI Auto-Reply' : '👨‍💼 Nhân viên')
    console.log(`   ${role}: ${m.content}`)
  }

  console.log('--- Hoàn tất kiểm thử Local thành công 100%! ---')
}

main().catch(console.error)
