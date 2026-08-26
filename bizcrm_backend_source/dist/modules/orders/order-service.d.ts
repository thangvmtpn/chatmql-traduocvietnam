import { type CrmCreateOrderResult } from './crm-order-client.js';
export interface OrderItemInput {
    productId?: string | number;
    productCode: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    /** Dòng quà tặng — không tính vào tiền hàng. */
    isGift?: boolean;
}
export interface CreateOrderInput {
    orgId: string;
    contactId?: string;
    conversationId?: string;
    createdUserId?: string;
    sellerName?: string;
    /** Username nhân sự lên đơn (phần trước @ của email). Backend tự điền. */
    sellerUsername?: string;
    customerName: string;
    customerPhone: string;
    shippingAddress: string;
    city?: string;
    items: OrderItemInput[];
    discountAmount?: number;
    shippingFee?: number;
    paymentMethod?: 'cod' | 'vietqr' | 'bank_transfer';
    shippingProvider?: 'jt_express' | 'viettel_post' | 'vnpost' | 'other';
    notes?: string;
    /** Trạng thái đơn do nhân viên chọn. Bỏ trống = Chờ xử lý. */
    orderStatusId?: number;
    warehouseId?: number;
    provinceId?: number;
    provinceName?: string;
    wardId?: number;
    wardName?: string;
    /** Số nhà/đường. shippingAddress vẫn là địa chỉ đầy đủ đã ghép. */
    addressDetail?: string;
    /** Tiền khách chuyển khoản trước; COD còn phải thu = tổng - số này. */
    depositAmount?: number;
    orderType?: string;
    orderSource?: string;
    selfShipping?: boolean;
    isFragile?: boolean;
    isExchange?: boolean;
    /**
     * Khóa chống trùng đơn. Nên do trình duyệt sinh và giữ nguyên qua các lần
     * bấm lại, để timeout rồi thử lại không đẻ ra đơn thứ hai.
     */
    requestId?: string;
}
export interface CreateOrderResult extends CrmCreateOrderResult {
    contactUpdated: boolean;
    chatMessageCreated: boolean;
}
/**
 * Tạo đơn: gọi CRM, rồi cập nhật dữ liệu phía ChatMQL.
 *
 * Ném CrmApiError nếu CRM từ chối hoặc không ghi được — khi đó KHÔNG có đơn
 * nào được tạo, và cũng không đụng gì tới dữ liệu ChatMQL.
 */
export declare function createOrderAndSync(input: CreateOrderInput): Promise<CreateOrderResult>;
/** Mã đơn dùng cho hiển thị tạm ở client trước khi CRM trả về. */
export declare function generateOrderCode(): string;
