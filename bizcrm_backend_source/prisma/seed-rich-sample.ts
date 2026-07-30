import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const RICH_CUSTOMERS = [
  { 
    name: 'Phạm Thu Hương', 
    phone: '0934567890', 
    email: 'huong.pham@gmail.com',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop',
    tags: JSON.stringify(['VIP', 'Quan tâm', 'Sài Gòn']),
    metadata: JSON.stringify({ company: 'ABC Corp', position: 'Giám đốc Marketing', budget: '50M' }),
    address: 'Quận 1, TP.HCM'
  },
  { 
    name: 'Trần Văn Mạnh', 
    phone: '0987654321', 
    email: 'manh.tran@yahoo.com',
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop',
    tags: JSON.stringify(['Chuyển đổi', 'Hà Nội']),
    metadata: JSON.stringify({ company: 'XYZ Tech', position: 'Trưởng phòng IT', interest: 'Automation' }),
    address: 'Cầu Giấy, Hà Nội'
  },
  { 
    name: 'Lê Yến Nhi', 
    phone: '0912345678', 
    email: 'nhi.le@outlook.com',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop',
    tags: JSON.stringify(['Tiềm năng', 'Đà Nẵng']),
    metadata: JSON.stringify({ source: 'Facebook Ads', campaign: 'Summer Sale 2026' }),
    address: 'Hải Châu, Đà Nẵng'
  },
  { 
    name: 'Võ Minh Đạt', 
    phone: '0909998877', 
    email: 'dat.vo.minh@startup.vn',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop',
    tags: JSON.stringify(['Mới', 'Khách hàng Startup']),
    metadata: JSON.stringify({ industry: 'SaaS', teamSize: 15 }),
    address: 'Thủ Đức, TP.HCM'
  }
]

const MESSAGES_WITH_PHONE_AND_INFO = [
  [
    { type: 'contact', text: 'Chào em, chị thấy quảng cáo phần mềm CRM bên mình, chị đang cần cho phòng Marketing.' },
    { type: 'self', text: 'Dạ shop chào chị ạ. Em có thể xin số điện thoại và email của chị để gửi tài liệu chi tiết được không ạ?' },
    { type: 'contact', text: 'Số của chị là 0934567890 nhé. Em gửi qua email huong.pham@gmail.com giúp chị.' },
    { type: 'self', text: 'Dạ em cảm ơn chị Hương. Em đã ghi nhận và sẽ gửi email ngay ạ. Chị kiểm tra hộp thư nhé.' },
  ],
  [
    { type: 'self', text: 'Chào anh Mạnh, em thấy anh vừa để lại thông tin đăng ký dùng thử phần mềm.' },
    { type: 'contact', text: 'Đúng rồi em. Anh muốn tích hợp hệ thống cũ của công ty anh.' },
    { type: 'self', text: 'Dạ anh có thể chia sẻ số điện thoại hoặc Zalo kỹ thuật viên bên anh để team em tiện trao đổi kỹ thuật không ạ?' },
    { type: 'contact', text: 'Số của anh luôn nhé: 0987654321. Email anh là manh.tran@yahoo.com' },
    { type: 'self', text: 'Dạ em cảm ơn anh. Chiều nay team kỹ thuật bên em sẽ liên hệ số này để hỗ trợ anh ạ.' }
  ],
  [
    { type: 'contact', text: 'Cho mình hỏi phần mềm bên mình có chiết khấu cho Startup không?' },
    { type: 'self', text: 'Dạ bên em đang có chương trình hỗ trợ doanh nghiệp SME và Startup. Anh/chị cho em xin số điện thoại để em gọi tư vấn gói phù hợp nhé.' },
    { type: 'contact', text: 'Tuyệt quá, em gọi số 0909998877 (Đạt) nhé. Cảm ơn em.' },
    { type: 'self', text: 'Dạ em chào anh Đạt, em sẽ gọi cho anh sau 5 phút nữa ạ.' }
  ],
  [
    { type: 'contact', text: 'Em ơi, chị muốn nhận báo giá qua email.' },
    { type: 'self', text: 'Dạ chị cho em xin địa chỉ email và số điện thoại để em tiện liên lạc nhé.' },
    { type: 'contact', text: 'Email của chị là nhi.le@outlook.com, SĐT: 0912345678' },
    { type: 'self', text: 'Dạ em đã gửi báo giá qua email nhi.le@outlook.com rồi ạ, chị Nhi check giúp em nha.' }
  ]
]

async function main() {
  console.log('🔄 Bắt đầu tạo thêm các Conversation với đầy đủ profile avatar, số điện thoại, email...')

  let org = await prisma.organization.findFirst()
  if (!org) {
    org = await prisma.organization.create({ data: { name: 'Công ty Cổ phần BizCRM (Sample)' } })
  }

  let user = await prisma.user.findFirst({ where: { orgId: org.id } })

  // Tìm một Zalo account ngẫu nhiên (hoặc tạo mới nếu chưa có)
  let zaloAcc = await prisma.zaloAccount.findFirst({ where: { orgId: org.id } })
  if (!zaloAcc) {
    zaloAcc = await prisma.zaloAccount.create({
      data: {
        orgId: org.id,
        ownerUserId: user!.id,
        zaloUid: `rich_zalo_acc`,
        displayName: 'Tư Vấn Viên Cao Cấp',
        phone: '0999999999',
        status: 'connected',
        avatarUrl: `https://ui-avatars.com/api/?name=TV&background=random`
      }
    })
  }

  for (let i = 0; i < RICH_CUSTOMERS.length; i++) {
    const custData = RICH_CUSTOMERS[i]
    const contactZaloUid = `rich_contact_uid_${i}`

    // Upsert Contact with rich data
    let contact = await prisma.contact.findFirst({ where: { zaloUid: contactZaloUid } })
    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          orgId: org.id,
          zaloUid: contactZaloUid,
          phone: custData.phone,
          email: custData.email,
          fullName: custData.name,
          crmName: custData.name,
          source: 'Zalo',
          lifecycleStage: 'qualified',
          assignedUserId: user!.id,
          avatarUrl: custData.avatarUrl,
          tags: JSON.parse(custData.tags),
          metadata: JSON.parse(custData.metadata),
          leadScore: 80 + Math.floor(Math.random() * 20), // 80 - 100 điểm
          notes: `Địa chỉ: ${custData.address}`
        }
      })
    }

    // Create Conversation
    let conversation = await prisma.conversation.findUnique({
      where: {
        zaloAccountId_externalThreadId: {
          zaloAccountId: zaloAcc.id,
          externalThreadId: contactZaloUid
        }
      }
    })

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          orgId: org.id,
          zaloAccountId: zaloAcc.id,
          contactId: contact.id,
          threadType: 'user',
          externalThreadId: contactZaloUid,
          lastMessageAt: new Date(),
          isReplied: true,
          unreadCount: 0
        }
      })

      // Create Messages for this Conversation
      const msgThread = MESSAGES_WITH_PHONE_AND_INFO[i % MESSAGES_WITH_PHONE_AND_INFO.length]
      let messageTime = Date.now() - 1000 * 60 * 60 * 5 // 5 tiếng trước
      
      for (const msg of msgThread) {
        messageTime += 1000 * 60 * 2 // Mỗi tin nhắn cách nhau 2 phút
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            zaloMsgId: `msg_${crypto.randomUUID()}`,
            senderType: msg.type,
            senderUid: msg.type === 'contact' ? contactZaloUid : zaloAcc.zaloUid,
            senderName: msg.type === 'contact' ? contact.fullName : zaloAcc.displayName,
            content: msg.text,
            contentType: 'text',
            sentAt: new Date(messageTime)
          }
        })
      }
      console.log(`   + Đã thêm KH có đủ profile (avatar, email, phone, tags): ${custData.name}`)
    } else {
      console.log(`   * Đã tồn tại hội thoại cho KH: ${custData.name}`)
    }
  }

  console.log('🎉 Đã thêm thành công các Customer cao cấp!')
}

main()
  .catch((e) => {
    console.error('❌ Lỗi:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
