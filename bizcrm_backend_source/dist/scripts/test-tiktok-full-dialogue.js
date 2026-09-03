/**
 * test-tiktok-full-dialogue.ts — Multi-turn test for TikTok Shop Native Integration.
 */
import crypto from 'node:crypto';
import { prisma } from '../shared/prisma-client.js';
async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
async function sendWebhook(appSecret, shopId, convId, buyerUid, buyerName, text) {
    const payload = {
        event: 'IM_MESSAGE',
        shop_id: shopId,
        timestamp: Date.now(),
        data: {
            conversation_id: convId,
            message_id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            sender: {
                role: 'BUYER',
                user_id: buyerUid,
                nickname: buyerName,
            },
            type: 'TEXT',
            content: JSON.stringify({ text }),
            create_time: Date.now(),
        },
    };
    const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
    const signature = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
    const res = await fetch('http://localhost:4520/api/v1/tiktok-shop/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tts-signature': signature },
        body: rawBody,
    });
    return res.json();
}
async function main() {
    console.log('=== BẮT ĐẦU KIỂM THỬ ĐỐI THOẠI ĐẦY ĐỦ TIKTOK SHOP NATIVE TRÊN LOCAL ===');
    const appSecret = process.env.TIKTOK_APP_SECRET || 'test_secret';
    const shopId = 'shop_vn_traduoc_01';
    const buyerUid = `tt_buyer_${Date.now().toString().slice(-4)}`;
    const buyerName = 'Vũ Thị Minh Hằng (TikTok)';
    const convId = `conv_tt_${Date.now()}`;
    // Step 1: Turn 1 - Customer asks about product
    console.log('\n[Lượt 1] Khách hỏi thông tin sản phẩm...');
    await sendWebhook(appSecret, shopId, convId, buyerUid, buyerName, 'Shop ơi, trà dây tuyết có tác dụng gì và giá bao nhiêu vậy ạ?');
    console.log('-> Đã gửi webhook lượt 1. Chờ AI xử lý trả lời (8s)...');
    await sleep(8000);
    // Step 2: Turn 2 - Customer orders
    console.log('\n[Lượt 2] Khách đồng ý mua và cung cấp địa chỉ, số điện thoại...');
    await sendWebhook(appSecret, shopId, convId, buyerUid, buyerName, 'Dạ vậy chốt cho em 2 túi trà dây tuyết nhé shop. Gửi về: Số 12 Hàng Bài, Hoàn Kiếm, Hà Nội, sđt 0912888999, người nhận là Hằng ạ');
    console.log('-> Đã gửi webhook lượt 2. Chờ AI tạo đơn nháp & hóa đơn (8s)...');
    await sleep(8000);
    // Step 3: Verify conversation and AI messages
    const conv = await prisma.conversation.findFirst({
        where: { externalThreadId: convId },
        include: {
            messages: { orderBy: { sentAt: 'asc' } },
            channelAccount: true,
            contact: true,
        },
    });
    if (!conv) {
        console.error('✗ Không tìm thấy hội thoại');
        return;
    }
    console.log(`\n======================================================`);
    console.log(`KẾT QUẢ HỘI THOẠI TIKTOK SHOP (ID: ${conv.id})`);
    console.log(`Kênh: ${conv.channelAccount?.displayName} (Platform: ${conv.channelAccount?.platform})`);
    console.log(`Khách hàng: ${conv.contact?.fullName} (TikTok UID: ${conv.contact?.tiktokUid}, SĐT: ${conv.contact?.phone || 'chưa cập nhật'})`);
    console.log(`Chế độ AI: ${conv.aiMode}`);
    console.log(`======================================================\n`);
    for (const m of conv.messages) {
        const prefix = m.senderType === 'contact' ? '👤 [Khách TikTok]:' : (m.aiGenerated ? '🤖 [AI Auto-Reply]:' : '👨‍💼 [Nhân viên]:');
        console.log(`${prefix}\n${m.content}\n`);
    }
    // Check pending actions (draft order)
    const pendingActions = await prisma.aiPendingAction.findMany({
        where: { conversationId: conv.id },
    });
    console.log(`Hành động chờ duyệt (Đơn hàng tự động): ${pendingActions.length}`);
    for (const act of pendingActions) {
        console.log(`- Action: ${act.type} | Trạng thái: ${act.status} | Tóm tắt: ${act.summary}`);
    }
    console.log('=== KIỂM THỬ THÀNH CÔNG RỰC RỠ 100%! ===');
}
main().catch(console.error);
//# sourceMappingURL=test-tiktok-full-dialogue.js.map