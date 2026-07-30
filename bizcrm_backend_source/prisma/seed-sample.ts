import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ZALO_ACCOUNTS = [
  { name: 'Nguyễn Văn A - Sale Zalo', phone: '0901234561' },
  { name: 'Trần Thị B - CSKH', phone: '0901234562' },
  { name: 'Lê Văn C - Support', phone: '0901234563' },
  { name: 'Phạm Thị D - Sale', phone: '0901234564' },
  { name: 'Hoàng Văn E - Sale', phone: '0901234565' },
]

const CUSTOMERS = [
  { name: 'Khách hàng VIP 1', phone: '0981111111' },
  { name: 'Chị Hoa (Quận 1)', phone: '0982222222' },
  { name: 'Anh Tuấn Công ty TNHH', phone: '0983333333' },
  { name: 'Chú Minh Khách quen', phone: '0984444444' },
  { name: 'Em Trang (SV)', phone: '0985555555' },
  { name: 'Khách hàng Tiềm năng', phone: '0986666666' },
  { name: 'Anh Hùng IT', phone: '0987777777' },
  { name: 'Chị Lan Mua hàng', phone: '0988888888' },
  { name: 'Cô Mai Sài Gòn', phone: '0989999999' },
  { name: 'Anh Bình', phone: '0980000000' },
]

const MESSAGES = [
  [
    { type: 'contact', text: 'Chào shop, mình muốn hỏi về sản phẩm phần mềm CRM.' },
    { type: 'self', text: 'Dạ shop chào anh/chị ạ. Anh/chị đang quan tâm đến gói cơ bản hay gói nâng cao ạ?' },
    { type: 'contact', text: 'Cho mình xin báo giá gói nâng cao nhé, mình có khoảng 5 nhân viên.' },
    { type: 'self', text: 'Dạ vâng, em xin phép gửi anh/chị bảng giá chi tiết. Anh/chị xem qua nhé.' },
  ],
  [
    { type: 'contact', text: 'Shop ơi, địa chỉ văn phòng mình ở đâu vậy?' },
    { type: 'self', text: 'Dạ văn phòng bên em ở 123 Đường ABC, Quận 1, TP.HCM ạ.' },
    { type: 'contact', text: 'Ok, chiều mình ghé qua xem trực tiếp phần mềm được không?' },
    { type: 'self', text: 'Dạ được ạ, shop mong được đón tiếp anh/chị. Trước khi qua anh/chị cứ nhắn em nhé.' },
  ],
  [
    { type: 'contact', text: 'Hệ thống bên mình có hỗ trợ tự động trả lời không em?' },
    { type: 'self', text: 'Dạ hệ thống có tính năng cài đặt tin nhắn mẫu và rule tự động (Automation) anh/chị nhé.' },
    { type: 'contact', text: 'Tuyệt quá, tư vấn thêm giúp mình nha.' },
  ],
  [
    { type: 'contact', text: 'Cảm ơn shop đã hỗ trợ nhiệt tình, phần mềm xài rất mượt.' },
    { type: 'self', text: 'Dạ vâng, cảm ơn anh/chị đã tin tưởng sử dụng dịch vụ của bên em. Có bất kỳ vấn đề gì cứ nhắn em ạ.' },
  ]
]

async function main() {
  console.log('🔄 Bắt đầu tạo dữ liệu mẫu...')

  // 1. Setup Org & User
  let org = await prisma.organization.findFirst()
  if (!org) {
    org = await prisma.organization.create({
      data: { name: 'Công ty Cổ phần BizCRM (Sample)' }
    })
    console.log('✅ Tạo Organization mẫu')
  } else {
    console.log(`ℹ️ Sử dụng Organization: ${org.name}`)
  }

  let user = await prisma.user.findFirst({ where: { orgId: org.id } })
  if (!user) {
    user = await prisma.user.create({
      data: {
        orgId: org.id,
        email: 'sample_admin@bizcrm.vn',
        passwordHash: 'dummyhash',
        fullName: 'Admin User',
        role: 'owner'
      }
    })
    console.log('✅ Tạo User mẫu')
  } else {
    console.log(`ℹ️ Sử dụng User: ${user.fullName}`)
  }

  // 2. Create Zalo Accounts
  for (let i = 0; i < ZALO_ACCOUNTS.length; i++) {
    const accData = ZALO_ACCOUNTS[i]
    const zaloUid = `sample_zalo_acc_${i}`
    
    let zaloAcc = await prisma.zaloAccount.findUnique({ where: { zaloUid } })
    if (!zaloAcc) {
      zaloAcc = await prisma.zaloAccount.create({
        data: {
          orgId: org.id,
          ownerUserId: user.id,
          zaloUid,
          displayName: accData.name,
          phone: accData.phone,
          status: 'connected',
          avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(accData.name)}&background=random`
        }
      })
      console.log(`✅ Tạo Zalo Account: ${accData.name}`)
    }

    // 3. For each Zalo Account, create some Contacts & Conversations
    for (let j = 0; j < 4; j++) {
      const custData = CUSTOMERS[(i * 4 + j) % CUSTOMERS.length]
      const contactZaloUid = `sample_contact_${i}_${j}`

      // Create Contact
      let contact = await prisma.contact.findFirst({ where: { zaloUid: contactZaloUid } })
      if (!contact) {
        contact = await prisma.contact.create({
          data: {
            orgId: org.id,
            zaloUid: contactZaloUid,
            phone: custData.phone,
            fullName: custData.name,
            crmName: `${custData.name}`,
            source: 'Zalo',
            lifecycleStage: 'qualified',
            assignedUserId: user.id,
            avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(custData.name)}&background=random`
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
            unreadCount: Math.floor(Math.random() * 3) // 0-2 unread messages
          }
        })

        // Create Messages for this Conversation
        const msgThread = MESSAGES[(i + j) % MESSAGES.length]
        let messageTime = Date.now() - 1000 * 60 * 60 * 24 // Bắt đầu từ hôm qua
        
        for (const msg of msgThread) {
          messageTime += 1000 * 60 * 5 // Mỗi tin nhắn cách nhau 5 phút
          await prisma.message.create({
            data: {
              conversationId: conversation.id,
              zaloMsgId: `msg_${crypto.randomUUID()}`,
              senderType: msg.type,
              senderUid: msg.type === 'contact' ? contactZaloUid : zaloUid,
              senderName: msg.type === 'contact' ? contact.fullName : zaloAcc.displayName,
              content: msg.text,
              contentType: 'text',
              sentAt: new Date(messageTime)
            }
          })
        }
        console.log(`   + Tạo Conversation & Messages cho: ${custData.name}`)
      }
    }
  }

  console.log('🎉 Hoàn thành tạo dữ liệu mẫu!')
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi tạo dữ liệu:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
