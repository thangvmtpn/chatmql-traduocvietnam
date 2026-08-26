/**
 * order-service.ts — Điều phối lên đơn từ ChatMQL.
 *
 * KIẾN TRÚC: CRM là chủ sở hữu duy nhất của đơn hàng.
 *
 *   Trình duyệt --(JWT nhân viên)--> ChatMQL backend --(service key)--> CRM API
 *                                          |
 *                                          +--> việc riêng của ChatMQL:
 *                                               cập nhật Contact, đăng thẻ đơn
 *                                               vào hội thoại, ghi log
 *
 * Trước đây file này tự ghi thẳng vào database crm/fm — tức là bản sao thứ hai
 * của nghiệp vụ lên đơn nằm song song với bridge Python, và hai bản đã lệch nhau.
 * Giờ toàn bộ việc ghi đơn nằm ở CRM; ở đây chỉ còn phần thuộc về ChatMQL.
 */
import { createHash } from 'crypto';
import { prisma } from '../../shared/prisma-client.js';
import { logger } from '../../shared/logger.js';
import { createOrderOnCrm, CrmApiError, } from './crm-order-client.js';
import { sendImageCore } from '../chat/send-image-core.js';
import { emitNewMessage } from '../realtime/socket-gateway.js';
import { transformMessageForFrontend } from '../chat/chat-routes.js';
import { SenderType } from '../../shared/constants.js';
/**
 * Khóa dự phòng khi client không gửi requestId: băm từ nội dung đơn + khung
 * thời gian 2 phút. Hai lần bấm liên tiếp cùng một giỏ hàng sẽ ra cùng khóa,
 * nên vẫn chặn được đa số ca bấm đúp. Client tự sinh khóa vẫn tốt hơn.
 */
function deriveRequestId(input) {
    const bucket = Math.floor(Date.now() / 120_000);
    const seed = [
        input.orgId,
        input.conversationId ?? input.contactId ?? '',
        input.customerPhone,
        input.items.map(i => `${i.productCode}x${i.quantity}@${i.unitPrice}`).join('|'),
        input.discountAmount ?? 0,
        input.shippingFee ?? 0,
        bucket,
    ].join('::');
    return `chatmql-${createHash('sha256').update(seed).digest('hex').slice(0, 32)}`;
}
function formatVnd(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}
/**
 * Bỏ số điện thoại lặp ở cuối tên. Rất nhiều contact Zalo được đặt tên kèm số
 * ("Anh Thông Bình Phước 0918587052"), in nguyên si ra thẻ đơn thì thành
 * "Anh Thông Bình Phước 0918587052 (0918587052)".
 */
function cleanCustomerName(name, phone) {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits)
        return name.trim();
    // Về phần số thuê bao (bỏ 84 hoặc 0 đứng đầu) để khớp được cả hai cách viết:
    // tên lưu "84829881052" trong khi số chuẩn hoá là "0829881052".
    const tail = digits.replace(/^(?:84|0)/, '');
    return name
        .replace(new RegExp(`\\s*(?:84|0)?${tail}\\s*$`), '')
        .trim() || name.trim();
}
/**
 * Thẻ đơn hàng đăng vào hội thoại.
 *
 * VIẾT BẰNG VĂN BẢN THUẦN, không markdown: khung chat ChatMQL in thẳng nội dung
 * ra màn hình, nên `**đậm**` hiện nguyên cả hai dấu sao — khách nhìn thấy y hệt
 * nhân viên. Muốn nhấn mạnh thì dùng chữ HOA và ký tự phân cách.
 */
function buildOrderCard(result, input) {
    const name = cleanCustomerName(input.customerName || '', input.customerPhone || '');
    const itemList = input.items
        .map(i => `• ${i.productName} × ${i.quantity}${i.isGift ? ' (quà tặng)' : ''}`)
        .join('\n');
    const payLabel = input.paymentMethod === 'vietqr'
        ? 'Chuyển khoản VietQR'
        : 'Thanh toán khi nhận hàng (COD)';
    const lines = [
        `🛍️ ĐƠN HÀNG MỚI — ${result.order_code}`,
        '━━━━━━━━━━━━━━━━━━━━',
        `👤 Người nhận: ${name}`,
        `📞 Điện thoại: ${input.customerPhone}`,
        `📍 Địa chỉ: ${input.shippingAddress}`,
        '',
        '📦 Sản phẩm:',
        itemList,
        '',
        `💰 Tổng thanh toán: ${formatVnd(result.total_amount)}`,
        `🚚 Hình thức: ${payLabel}`,
    ];
    if (input.notes?.trim())
        lines.push(`📝 Ghi chú: ${input.notes.trim()}`);
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(result.fm_saved
        ? '✅ Đơn đã đồng bộ lên CRM và hệ thống FM.'
        : '⚠️ Đơn đã ghi vào CRM nhưng CHƯA sang được FM — hệ thống sẽ tự đẩy lại.');
    if (result.vietqr_url) {
        lines.push('', '💳 Quét mã QR để chuyển khoản:', result.vietqr_url);
    }
    return lines.join('\n');
}
/**
 * Tạo đơn: gọi CRM, rồi cập nhật dữ liệu phía ChatMQL.
 *
 * Ném CrmApiError nếu CRM từ chối hoặc không ghi được — khi đó KHÔNG có đơn
 * nào được tạo, và cũng không đụng gì tới dữ liệu ChatMQL.
 */
export async function createOrderAndSync(input) {
    if (!input.items?.length) {
        throw new CrmApiError('Đơn hàng phải có ít nhất 1 sản phẩm', 400);
    }
    const requestId = input.requestId?.trim() || deriveRequestId(input);
    // ── 1. CRM tạo đơn (nguồn sự thật) ────────────────────────────────
    const result = await createOrderOnCrm({
        request_id: requestId,
        customer_phone: input.customerPhone,
        customer_name: input.customerName,
        shipping_address: input.shippingAddress,
        city: input.city ?? '',
        items: input.items.map(i => ({
            product_code: i.productCode,
            product_name: i.productName,
            quantity: i.quantity,
            unit_price: i.unitPrice,
            is_gift: i.isGift ?? false,
        })),
        discount_amount: input.discountAmount ?? 0,
        shipping_fee: input.shippingFee ?? 0,
        payment_method: input.paymentMethod ?? 'cod',
        shipping_provider: input.shippingProvider ?? 'jt_express',
        seller_name: input.sellerName,
        seller_username: input.sellerUsername,
        notes: input.notes ?? '',
        order_status_id: input.orderStatusId,
        warehouse_id: input.warehouseId,
        province_id: input.provinceId,
        province_name: input.provinceName,
        ward_id: input.wardId,
        ward_name: input.wardName,
        address_detail: input.addressDetail,
        deposit_amount: input.depositAmount ?? 0,
        order_type: input.orderType,
        order_source: input.orderSource,
        self_shipping: input.selfShipping ?? false,
        is_fragile: input.isFragile ?? false,
        is_exchange: input.isExchange ?? false,
    });
    logger.info({ orderCode: result.order_code, requestId, status: result.status, replayed: result.replayed }, '[orders] CRM đã nhận đơn');
    // Gọi lại trùng request_id: đơn đã tồn tại, không lặp lại phần việc local
    // (nếu không sẽ đẻ ra thẻ đơn hàng thứ hai trong hội thoại).
    if (result.replayed) {
        return { ...result, contactUpdated: false, chatMessageCreated: false };
    }
    // ── 2. Việc riêng của ChatMQL — hỏng ở đây KHÔNG làm hỏng đơn ──────
    let contactUpdated = false;
    if (input.contactId) {
        try {
            const contact = await prisma.contact.findFirst({
                where: { id: input.contactId, orgId: input.orgId },
                select: { id: true, phone: true, metadata: true },
            });
            if (contact) {
                const meta = contact.metadata && typeof contact.metadata === 'object'
                    ? { ...contact.metadata }
                    : {};
                meta.address = input.shippingAddress;
                if (input.city)
                    meta.city = input.city;
                meta.lastOrderCode = result.order_code;
                meta.lastOrderAt = new Date().toISOString();
                const data = {
                    metadata: meta,
                    leadScore: { increment: 10 },
                };
                // Hơn 8.000 contact đến từ Zalo không có số điện thoại, nên nhân viên
                // phải gõ tay khi lên đơn. Ghi số đó lại vào contact — nếu không, lần
                // sau mở hội thoại vẫn trống, và khung LỊCH SỬ ĐƠN HÀNG (tra theo
                // contact.phone) sẽ mãi không hiện gì dù đơn đã tạo thành công.
                // Chỉ điền khi đang trống, không đè lên số đã có.
                if (!contact.phone?.trim() && input.customerPhone?.trim()) {
                    data.phone = input.customerPhone.trim();
                    logger.info({ contactId: contact.id, orderCode: result.order_code }, '[orders] Lưu số điện thoại nhân viên nhập vào contact');
                }
                await prisma.contact.update({
                    where: { id: contact.id },
                    data: data,
                });
                contactUpdated = true;
            }
            else {
                logger.warn({ contactId: input.contactId }, '[orders] Không tìm thấy contact để cập nhật');
            }
        }
        catch (err) {
            logger.error({ err, orderCode: result.order_code }, '[orders] Cập nhật contact thất bại');
        }
    }
    let chatMessageCreated = false;
    if (input.conversationId) {
        try {
            const orderMsg = await prisma.message.create({
                data: {
                    conversationId: input.conversationId,
                    senderType: SenderType.SELF,
                    senderName: input.sellerName || 'Staff',
                    repliedByUserId: input.createdUserId || null,
                    contentType: 'text',
                    content: buildOrderCard(result, input),
                    sentAt: new Date(),
                },
            });
            chatMessageCreated = true;
            await prisma.conversation.update({
                where: { id: input.conversationId },
                data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
            }).catch(() => { });
            try {
                const fePayload = transformMessageForFrontend({
                    ...orderMsg,
                    senderType: SenderType.SELF,
                    senderName: input.sellerName || 'Staff',
                });
                emitNewMessage(input.orgId, input.conversationId, fePayload);
            }
            catch { /* socket error non-fatal */ }
            // Nếu đơn hàng thanh toán qua VietQR và có link QR -> Gửi trực tiếp ảnh mã QR vào hội thoại
            if (result.vietqr_url) {
                try {
                    await sendImageCore({
                        orgId: input.orgId,
                        conversationId: input.conversationId,
                        imageUrl: result.vietqr_url,
                        caption: `Mã QR thanh toán cho đơn hàng ${result.order_code}`,
                        sender: 'staff',
                        repliedByUserId: input.createdUserId || null,
                    });
                    logger.info({ orderCode: result.order_code, conversationId: input.conversationId }, '[orders] Đã gửi ảnh mã QR VietQR vào hội thoại');
                }
                catch (err) {
                    logger.error({ err, orderCode: result.order_code }, '[orders] Gửi ảnh mã QR VietQR thất bại');
                }
            }
        }
        catch (err) {
            logger.error({ err, orderCode: result.order_code }, '[orders] Không đăng được thẻ đơn vào hội thoại');
        }
    }
    return { ...result, contactUpdated, chatMessageCreated };
}
/** Mã đơn dùng cho hiển thị tạm ở client trước khi CRM trả về. */
export function generateOrderCode() {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `HD_${yy}${mm}${dd}${suffix}`;
}
//# sourceMappingURL=order-service.js.map