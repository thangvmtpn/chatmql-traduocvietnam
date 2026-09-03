/**
 * quote-send-service.ts — gửi link báo giá cho khách qua kênh chat đang có.
 *
 * KHÔNG dùng email (backend không có hạ tầng mail, và khách VN ở trên Zalo).
 * Tin nhắn gửi đi được ghi vào timeline hội thoại như tin thường.
 */
import { prisma } from '../../shared/prisma-client.js';
import { logger } from '../../shared/logger.js';
import { sendMessageCore } from '../chat/send-core.js';
import { formatMoney } from './money-to-words.js';
/** Base URL của frontend — link khách bấm vào. */
export function publicQuoteUrl(token) {
    const base = (process.env.FRONTEND_URL || 'http://localhost:4521').replace(/\/$/, '');
    return `${base}/q/${token}`;
}
function buildMessage(q, url) {
    const label = q.type === 'contract' ? 'hợp đồng' : 'báo giá';
    const lines = [
        `Em gửi anh/chị ${label} ${q.number} — ${formatMoney(q.total)}đ`,
    ];
    if (q.validUntil) {
        lines.push(`Hiệu lực đến ${q.validUntil.toLocaleDateString('vi-VN')}`);
    }
    lines.push(`Xem chi tiết: ${url}`);
    return lines.join('\n');
}
/**
 * Gửi link qua hội thoại gần nhất của contact.
 * `channel='link'` = chỉ trả URL, không gửi gì (sale tự copy).
 */
export async function sendQuoteToContact(orgId, quoteId, channel, userId) {
    const quote = await prisma.quote.findFirst({
        where: { id: quoteId, orgId, deletedAt: null },
        select: {
            id: true, number: true, total: true, validUntil: true, type: true,
            publicToken: true, contactId: true,
        },
    });
    if (!quote)
        throw new Error('Không tìm thấy báo giá');
    const url = publicQuoteUrl(quote.publicToken);
    if (channel === 'link')
        return { channel, delivered: false, url };
    // Hội thoại gần nhất của contact — LUÔN lọc theo orgId
    const conversation = await prisma.conversation.findFirst({
        where: { orgId, contactId: quote.contactId },
        orderBy: { lastMessageAt: 'desc' },
        select: { id: true },
    });
    if (!conversation) {
        return { channel, delivered: false, url, error: 'Khách hàng chưa có hội thoại nào — hãy copy link gửi thủ công' };
    }
    const text = buildMessage({ number: quote.number, total: Number(quote.total), validUntil: quote.validUntil, type: quote.type }, url);
    try {
        const res = await sendMessageCore({
            orgId, conversationId: conversation.id, text, sender: 'staff', repliedByUserId: userId,
        });
        return { channel, delivered: res.sentViaZalo, url, error: res.zaloError };
    }
    catch (err) {
        logger.error({ err, quoteId }, '[quotes] send via chat failed');
        return { channel, delivered: false, url, error: 'Gửi tin nhắn thất bại — hãy copy link gửi thủ công' };
    }
}
//# sourceMappingURL=quote-send-service.js.map