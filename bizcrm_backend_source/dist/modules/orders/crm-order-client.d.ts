export interface CrmOrderItem {
    product_code: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    /** Dòng quà tặng — không tính vào tiền hàng. */
    is_gift?: boolean;
}
export interface CrmCreateOrderPayload {
    request_id: string;
    customer_phone: string;
    customer_name: string;
    shipping_address: string;
    city?: string;
    items: CrmOrderItem[];
    discount_amount?: number;
    shipping_fee?: number;
    payment_method?: 'cod' | 'vietqr' | 'bank_transfer';
    shipping_provider?: 'jt_express' | 'viettel_post' | 'vnpost' | 'other';
    seller_name?: string;
    /** Phần trước @ của email ChatMQL — khóa map chính xác sang account_users bên CRM. */
    seller_username?: string;
    notes?: string;
    order_status_id?: number;
    warehouse_id?: number;
    province_id?: number;
    province_name?: string;
    ward_id?: number;
    ward_name?: string;
    address_detail?: string;
    deposit_amount?: number;
    order_type?: string;
    order_source?: string;
    self_shipping?: boolean;
    is_fragile?: boolean;
    is_exchange?: boolean;
    type_fee_delivery?: 'PP_CASH' | 'CC_CASH';
}
export interface CrmCreateOrderResult {
    success: boolean;
    /** 'ok' = vào đủ CRM+FM. 'partial' = mới vào CRM, FM sẽ được đẩy lại sau. */
    status: 'ok' | 'partial';
    message: string;
    order_code: string;
    request_id: string;
    subtotal: number;
    discount_amount: number;
    shipping_fee: number;
    total_amount: number;
    payment_method: string;
    vietqr_url: string | null;
    crm_saved: boolean;
    fm_saved: boolean;
    fm_error: string | null;
    /** true khi CRM nhận ra request_id đã xử lý rồi và trả lại đơn cũ. */
    replayed: boolean;
}
/** Lỗi có mang HTTP status, để route phía trên map sang mã trả về cho client. */
export declare class CrmApiError extends Error {
    readonly status: number;
    readonly detail?: unknown | undefined;
    constructor(message: string, status: number, detail?: unknown | undefined);
}
/** Tạo đơn trên CRM. Idempotent theo request_id. */
export declare function createOrderOnCrm(payload: CrmCreateOrderPayload): Promise<CrmCreateOrderResult>;
/** Tra trạng thái đồng bộ CRM/FM của một đơn. */
export declare function getOrderSyncStatus(orderCode: string): Promise<{
    order_code: string;
    request_id: string;
    crm_saved: boolean;
    fm_saved: boolean;
    fm_attempts: number;
    last_error: string | null;
}>;
/** Đẩy lại các đơn đã vào CRM nhưng còn kẹt ở FM. */
export declare function reconcilePendingFm(limit?: number): Promise<{
    scanned: number;
    fixed: string[];
    still_failing: Array<{
        order_code: string;
        error: string;
    }>;
}>;
/** Danh mục sản phẩm (CRM lấy từ FM). */
export declare function fetchProducts(): Promise<{
    products: any[];
}>;
/** Hồ sơ khách hàng trong CRM theo số điện thoại. */
export declare function fetchCustomer(phone: string): Promise<{
    found: boolean;
    customer: any;
}>;
/** Lịch sử đơn hàng của khách trong CRM. */
export declare function fetchCustomerOrders(phone: string): Promise<{
    orders: any[];
}>;
export interface OrderStatus {
    id: number;
    label: string;
    group_id: number | null;
    group: string | null;
}
export interface Warehouse {
    id: number;
    name: string;
}
export interface Province {
    id: number;
    name: string;
}
export interface Ward {
    id: number;
    name: string;
}
export interface CatalogProduct {
    id: number;
    code: string;
    name: string;
    price: number;
    weight: number | null;
    inventory: number;
    unit: string | null;
    vat_note: string | null;
    warehouse_id: number | null;
    status: string | null;
}
/** Trạng thái đơn hàng (14 mức, có nhóm cha). */
export interface SalesStatsPeriod {
    orders: number;
    gmv: number;
    aov: number;
}
export interface SalesScope {
    today: SalesStatsPeriod;
    yesterday: SalesStatsPeriod;
    week: SalesStatsPeriod;
    month: SalesStatsPeriod;
    daily: Array<{
        date: string;
        orders: number;
        gmv: number;
    }>;
    by_status: Array<{
        status: string;
        orders: number;
    }>;
    customers: number;
    by_staff?: Array<{
        name: string;
        orders: number;
        gmv: number;
    }>;
    staff_name?: string;
    id_acc?: number;
}
export interface SalesStats {
    org: SalesScope;
    /** null khi username không khớp tài khoản CRM nào. */
    mine: SalesScope | null;
}
/**
 * Thống kê bán hàng cho dashboard — đơn hàng nằm ở CRM nên phải hỏi CRM.
 * @param username phần trước @ của email ChatMQL, để CRM tách được số của riêng
 *                 nhân sự đó. Bỏ trống thì chỉ có số toàn công ty.
 */
export declare function fetchSalesStats(username?: string): Promise<SalesStats>;
export declare function fetchOrderStatuses(): Promise<{
    statuses: OrderStatus[];
}>;
/** Kho xuất hàng. */
export declare function fetchWarehouses(): Promise<{
    warehouses: Warehouse[];
}>;
/** Tỉnh/thành phố. */
export declare function fetchProvinces(): Promise<{
    provinces: Province[];
}>;
/** Phường/xã thuộc một tỉnh. */
export declare function fetchWards(provinceId: number): Promise<{
    wards: Ward[];
}>;
/** Danh mục sản phẩm đầy đủ (tồn kho, đơn vị, VAT, khối lượng). */
export declare function fetchProductCatalog(opts?: {
    warehouseId?: number;
    q?: string;
}): Promise<{
    products: CatalogProduct[];
}>;
export interface CustomerSchedulePayload {
    phone: string;
    /** ISO 8601. Chuỗi rỗng = xóa lịch. Bỏ trống = giữ nguyên. */
    next_sales_at?: string;
    next_care_at?: string;
    appointment_type?: string;
    care_note?: string;
}
/** Đặt lịch tiếp cận bán hàng / chăm sóc kế tiếp cho khách trong CRM. */
export declare function updateCustomerSchedule(payload: CustomerSchedulePayload): Promise<{
    success: boolean;
    id_kh: number;
    next_sales_at: string | null;
    next_care_at: string | null;
    appointment_type: string | null;
}>;
export interface PointsLedger {
    phone: string;
    balance: number;
    total_earned: number;
    total_spent: number;
    entry_count: number;
    rank: string | null;
    rank_reward: string | null;
    /** true = số dư sổ cái lệch tổng cộng dồn; khách này cần đối soát điểm. */
    balance_mismatch: boolean;
    computed_balance: number;
    entries: Array<{
        at: string | null;
        ref: string | null;
        delta: number;
        balance_after: number | null;
        kind: 'earn' | 'spend';
        category: string;
    }>;
}
export interface Promotion {
    id: number;
    code: string | null;
    name: string;
    description: string | null;
    type: 'percent' | 'amount' | 'freeship' | 'gift';
    value: number;
    max_discount: number | null;
    min_order: number;
    scope: 'system' | 'customer';
    conditions: Record<string, unknown>;
    from: string | null;
    to: string | null;
    source: 'system' | 'customer';
    used: boolean;
    eligible: boolean;
    conditions_text: string[];
}
/** Sổ cái tích điểm ("Lá") của khách. */
export declare function fetchCustomerPoints(phone: string, limit?: number): Promise<PointsLedger>;
/** Ưu đãi đang chạy — gắn riêng khách + toàn hệ thống. */
export declare function fetchPromotions(phone?: string): Promise<{
    promotions: Promotion[];
    customer: Record<string, unknown> | null;
    total: number;
}>;
/** Kiểm tra mã ưu đãi và tính tiền giảm. Không ghi gì. */
export declare function applyPromotion(input: {
    code: string;
    phone?: string;
    order_subtotal: number;
}): Promise<{
    valid: boolean;
    promotion: Promotion;
    discount_amount: number;
    free_shipping: boolean;
    message: string;
}>;
export interface PromotionAdmin {
    id: number;
    code: string | null;
    name: string;
    description: string | null;
    type: 'percent' | 'amount' | 'freeship' | 'gift';
    value: number;
    max_discount: number | null;
    min_order: number;
    scope: 'system' | 'customer';
    conditions: Record<string, unknown>;
    valid_from: string | null;
    valid_to: string | null;
    status: 'active' | 'paused' | 'ended';
    max_uses: number | null;
    used_count: number;
    assigned_count: number;
}
export type PromotionInput = Omit<PromotionAdmin, 'id' | 'used_count' | 'assigned_count'>;
export declare function adminListPromotions(opts?: {
    status?: string;
    q?: string;
}): Promise<{
    promotions: PromotionAdmin[];
    total: number;
}>;
export declare function adminCreatePromotion(body: PromotionInput): Promise<{
    success: boolean;
    id: number;
    message: string;
}>;
export declare function adminUpdatePromotion(id: number, body: PromotionInput): Promise<{
    success: boolean;
    message: string;
}>;
export declare function adminDeletePromotion(id: number): Promise<{
    success: boolean;
    message: string;
}>;
export declare function adminListAssigned(id: number): Promise<{
    customers: Array<{
        phone: string;
        customer_code: string | null;
        used: boolean;
        name: string | null;
    }>;
    total: number;
}>;
export declare function adminAssignCustomers(id: number, phones: string[]): Promise<{
    success: boolean;
    added: number;
    duplicated: number;
    not_in_crm: string[];
    message: string;
}>;
export declare function adminUnassignCustomer(id: number, phone: string): Promise<{
    success: boolean;
    message: string;
}>;
/** Đối soát điểm — khách có số dư lệch giữa sổ cái và tổng cộng dồn. */
export declare function adminPointsReconcile(opts?: {
    limit?: number;
    minGap?: number;
}): Promise<{
    summary: {
        customers_with_points: number;
        mismatched: number;
        matched: number;
        total_gap: number;
    };
    items: Array<{
        phone: string;
        customer_code: string | null;
        name: string | null;
        ledger_balance: number;
        computed_balance: number;
        gap: number;
        entry_count: number;
        last_entry_at: string | null;
    }>;
    returned: number;
}>;
/** Sản phẩm khách đã mua, gộp từ toàn bộ lịch sử đơn (nguồn: CRM). */
export declare function fetchCustomerProducts(phone: string): Promise<{
    products: Array<{
        code: string;
        name: string | null;
        price: number | null;
        unit: string | null;
        quantity: number;
        order_count: number;
        last_bought_at: string | null;
        is_gift: boolean;
        orders: Array<{
            code: string;
            at: string | null;
            status: string | null;
        }>;
    }>;
    total: number;
    order_count: number;
}>;
