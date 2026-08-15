import { runHarness } from '../src/modules/ai/harness/reply-generator.js'
import { prisma } from '../src/shared/prisma-client.js'

const ORG_ID = '0b9bc4f2-85d4-4ce0-9933-f22b41712708' // Bizino AI

async function testAi() {
  console.log('=== TEST SIMULATION AI CHAT - TRÀ XANH THÁI NGUYÊN ===\n')

  // Find or create a sandbox conversation
  let conv = await prisma.conversation.findFirst({
    where: { orgId: ORG_ID, externalThreadId: { startsWith: 'sandbox-test' } },
  })

  if (!conv) {
    const channel = await prisma.channelAccount.findFirst({
      where: { orgId: ORG_ID },
    })
    const contact = await prisma.contact.create({
      data: { orgId: ORG_ID, fullName: 'Nguyễn Văn Test (Khách Thử Nghiệm)' },
    })
    conv = await prisma.conversation.create({
      data: {
        orgId: ORG_ID,
        channelAccountId: channel?.id || 'dummy-channel',
        contactId: contact.id,
        threadType: 'user',
        externalThreadId: `sandbox-test-${Date.now()}`,
        displayName: 'Nguyễn Văn Test',
        aiMode: 'auto',
      },
    })
  }

  const testCases = [
    {
      title: '1. Khách hỏi trà uống buổi tối không mất ngủ',
      message: 'Shop ơi có loại trà nào uống buổi tối thơm ngon mà không bị mất ngủ không tư vấn giúp mình với?',
    },
    {
      title: '2. Khách hỏi quà biếu mừng thọ ông bà',
      message: 'Mình muốn tìm một dòng trà cao cấp để biếu mừng thọ ông bà 80 tuổi, shop có loại nào ý nghĩa sức khỏe trường thọ không?',
    },
    {
      title: '3. Khách hỏi về bộ ấm chén và bánh kẹo ăn kèm',
      message: 'Shop có bộ ấm chén Bát Tràng nào đẹp tiếp khách không, có bán kèm bánh kẹo quà quê gì ăn cùng trà không?',
    },
    {
      title: '4. Tình huống khiếu nại / đòi gặp người thật (Kiểm tra Handoff)',
      message: 'Chè giao về bị rách túi ẩm mốc hết rồi, tôi muốn gặp quản lý gấp để giải quyết đổi trả hoàn tiền!',
    },
  ]

  for (const tc of testCases) {
    console.log(`\n------------------------------------------------------------`)
    console.log(`📌 TEST CASE: ${tc.title}`)
    console.log(`💬 Khách nhắn: "${tc.message}"`)

    try {
      const result = await runHarness(ORG_ID, conv.id, tc.message, 'auto')

      console.log(`\n🔍 Router Decision:`, {
        shouldReply: result.routerDecision?.shouldReply,
        intents: result.routerDecision?.intents,
        needsKnowledge: result.routerDecision?.needsKnowledge,
        handoff: result.handoff,
      })

      if (result.handoff?.should) {
        console.log(`🚨 [HANDOFF KÍCH HOẠT]: Chuyển nhân viên! Lý do: ${result.handoff.reason}`)
      }

      if (result.reply) {
        console.log(`\n🤖 [AI TRẢ LỜI]:\n${result.reply}`)
      } else if (!result.handoff?.should) {
        console.log(`\n🤫 [AI IM LẶNG - KHÔNG CẦN TRẢ LỜI]`)
      }
    } catch (err: any) {
      console.error(`❌ Lỗi test:`, err?.message || err)
    }
  }

  console.log(`\n------------------------------------------------------------`)
  console.log('🎉 HOÀN THÀNH TEST SIMULATION!')
}

testAi()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
