import { runHarness } from '../src/modules/ai/harness/reply-generator.js'
import { prisma } from '../src/shared/prisma-client.js'

const ORG_ID = '0b9bc4f2-85d4-4ce0-9933-f22b41712708' // Bizino AI

async function test5TierFunnel() {
  console.log('======================================================================')
  console.log('   KIỂM THỬ MÔ PHỎNG 5 TẦNG BÁN HÀNG AI CHAT (LOCAL TEST ENVIRONMENT)  ')
  console.log('======================================================================\n')

  const channel = await prisma.channelAccount.findFirst({
    where: { orgId: ORG_ID },
  })

  // Find or create a clean sandbox conversation
  let conv = await prisma.conversation.create({
    data: {
      orgId: ORG_ID,
      channelAccountId: channel?.id || '00000000-0000-0000-0000-000000000000',
      threadType: 'user',
      externalThreadId: `sandbox-5tier-${Date.now()}`,
      displayName: 'Khách Thử Nghiệm 5 Tầng',
      aiMode: 'auto',
    },
  })

  const turns = [
    {
      step: 'TẦNG 1 & 2: PHÂN LOẠI & KHAI THÁC GU VỊ',
      customerMessage: 'Shop có những loại trà nào vậy tư vấn giúp tôi với?',
    },
    {
      step: 'TẦNG 2 & 3: LÀM RÕ GU & GIA TĂNG NIỀM TIN VÙNG TRỒNG',
      customerMessage: 'Tôi thích loại gu đậm đà truyền thống, tiền chát hậu ngọt sâu để uống mỗi sáng, trà bên shop có chuẩn Tân Cương không?',
    },
    {
      step: 'TẦNG 4: BÁO GIÁ & ĐẶT CÂU HỎI ĐÓNG CHỐT 2 CHỌN 1',
      customerMessage: 'Dòng Vạn Thịnh Trà và Vạn Khang Trà giá thế nào shop, có freeship không?',
    },
    {
      step: 'TẦNG 5: BONUS GỢI Ý COMBO BÁNH KẸO TRABA & XIN ĐỊA CHỈ',
      customerMessage: 'Thế lấy tôi 500g Vạn Thịnh Trà nhé, gửi về Hà Nội cho tôi.',
    },
  ]

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]
    console.log(`\n======================================================================`)
    console.log(`👉 [LƯỢT ${i + 1}] ${turn.step}`)
    console.log(`💬 Khách nhắn: "${turn.customerMessage}"`)

    // Save customer message to DB so history context accumulates
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderType: 'contact',
        contentType: 'text',
        content: turn.customerMessage,
        sentAt: new Date(),
      },
    })

    const started = Date.now()
    const result = await runHarness(ORG_ID, conv.id, turn.customerMessage, 'auto')
    const elapsed = Date.now() - started

    console.log(`⏱️ Thời gian phản hồi: ${elapsed}ms`)
    console.log(`🔍 Router Intents:`, result.routerDecision?.intents || [])

    if (result.handoff?.should) {
      console.log(`🚨 [HANDOFF]: Chuyển nhân viên! (${result.handoff.reason})`)
    }

    if (result.reply) {
      console.log(`\n🤖 [AI TRẢ LỜI]:\n${result.reply}`)

      // Save AI reply to DB for next turns
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          senderType: 'agent',
          contentType: 'text',
          content: result.reply,
          sentAt: new Date(),
        },
      })
    }
  }

  // Cleanup sandbox conversation
  await prisma.message.deleteMany({ where: { conversationId: conv.id } })
  await prisma.conversation.delete({ where: { id: conv.id } })

  console.log(`\n======================================================================`)
  console.log('🎉 HOÀN TẤT KIỂM THỬ GIẢ LẬP 5 TẦNG BÁN HÀNG TRÊN LOCAL!')
}

test5TierFunnel()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
