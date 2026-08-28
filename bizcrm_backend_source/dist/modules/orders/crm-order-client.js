/**
 * crm-order-client.ts — HTTP client server-to-server sang CRM bridge.
 *
 * CRM là chủ sở hữu duy nhất của đơn hàng. ChatMQL KHÔNG ghi thẳng vào
 * database crm/fm nữa — mọi thao tác đều đi qua đây, để nghiệp vụ lên đơn
 * chỉ tồn tại ở đúng một nơi.
 *
 * Service key nằm ở backend, không bao giờ lộ ra trình duyệt.
 */
import { logger } from '../../shared/logger.js';
const DEFAULT_TIMEOUT_MS = 20_000;
/**
 * Timeout riêng cho việc tạo đơn, phải DÀI HƠN thời gian xấu nhất phía CRM.
 * CRM chờ tối đa ~8s cho FM rồi vẫn trả về kết quả "partial" hợp lệ; nếu client
 * bỏ cuộc sớm hơn thì nhân viên thấy "mất kết nối" trong khi đơn đã tạo xong.
 */
const CREATE_ORDER_TIMEOUT_MS = 45_000;
/** Lỗi có mang HTTP status, để route phía trên map sang mã trả về cho client. */
export class CrmApiError extends Error {
    status;
    detail;
    constructor(message, status, detail) {
        super(message);
        this.status = status;
        this.detail = detail;
        this.name = 'CrmApiError';
    }
}
function baseUrl() {
    return (process.env.CRM_ORDER_API_URL || 'http://host.docker.internal:8000').replace(/\/$/, '');
}
function apiKey() {
    return process.env.CRM_ORDER_API_KEY || 'traduoc_chatmql_secret_2026';
}
async function callCrm(path, init) {
    const url = `${baseUrl()}/api/external/chatmql${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let res;
    try {
        res = await fetch(url, {
            method: init.method,
            headers: {
                'Content-Type': 'application/json',
                'X-ChatMQL-API-Key': apiKey(),
            },
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
            signal: controller.signal,
        });
    }
    catch (err) {
        // Timeout / CRM sập / DNS hỏng — người gọi phải phân biệt được với lỗi nghiệp vụ.
        const reason = err?.name === 'AbortError' ? 'CRM không phản hồi kịp' : err?.message;
        logger.error({ err, url }, '[crm-client] Không kết nối được CRM');
        throw new CrmApiError(`Không kết nối được CRM: ${reason}`, 504);
    }
    finally {
        clearTimeout(timer);
    }
    const text = await res.text();
    let parsed = null;
    try {
        parsed = text ? JSON.parse(text) : null;
    }
    catch {
        /* CRM trả về không phải JSON — giữ nguyên text bên dưới */
    }
    if (!res.ok) {
        const detail = parsed?.detail ?? text?.slice(0, 300) ?? '';
        logger.warn({ url, status: res.status, detail }, '[crm-client] CRM trả lỗi');
        throw new CrmApiError(`CRM trả lỗi ${res.status}: ${detail}`, res.status, detail);
    }
    return parsed;
}
/** Tạo đơn trên CRM. Idempotent theo request_id. */
export async function createOrderOnCrm(payload) {
    return callCrm('/order/create', {
        method: 'POST',
        body: payload,
        timeoutMs: CREATE_ORDER_TIMEOUT_MS,
    });
}
/** Tra trạng thái đồng bộ CRM/FM của một đơn. */
export async function getOrderSyncStatus(orderCode) {
    return callCrm(`/order/${encodeURIComponent(orderCode)}/status`, { method: 'GET' });
}
/** Đẩy lại các đơn đã vào CRM nhưng còn kẹt ở FM. */
export async function reconcilePendingFm(limit = 20) {
    return callCrm(`/order/reconcile-fm?limit=${limit}`, { method: 'POST', timeoutMs: 60_000 });
}
/** Danh mục sản phẩm (CRM lấy từ FM). */
export async function fetchProducts() {
    return callCrm('/products', { method: 'GET' });
}
/** Hồ sơ khách hàng trong CRM theo số điện thoại. */
export async function fetchCustomer(phone) {
    return callCrm(`/customer?phone=${encodeURIComponent(phone)}`, { method: 'GET' });
}
/** Lịch sử đơn hàng của khách trong CRM. */
export async function fetchCustomerOrders(phone) {
    return callCrm(`/customer/orders?phone=${encodeURIComponent(phone)}`, { method: 'GET' });
}
/**
 * Thống kê bán hàng cho dashboard — đơn hàng nằm ở CRM nên phải hỏi CRM.
 * @param username phần trước @ của email ChatMQL, để CRM tách được số của riêng
 *                 nhân sự đó. Bỏ trống thì chỉ có số toàn công ty.
 */
export async function fetchSalesStats(username) {
    const q = username ? `?username=${encodeURIComponent(username)}` : '';
    return callCrm(`/stats/sales${q}`, { method: 'GET' });
}
export async function fetchOrderStatuses() {
    return callCrm('/lookups/order-statuses', { method: 'GET' });
}
/** Kho xuất hàng. */
export async function fetchWarehouses() {
    return callCrm('/lookups/warehouses', { method: 'GET' });
}
/** Tỉnh/thành phố. */
export async function fetchProvinces() {
    return callCrm('/lookups/provinces', { method: 'GET' });
}
/** Phường/xã thuộc một tỉnh. */
export async function fetchWards(provinceId) {
    return callCrm(`/lookups/wards?id_prov=${provinceId}`, { method: 'GET' });
}
/** Danh mục sản phẩm đầy đủ (tồn kho, đơn vị, VAT, khối lượng). */
export async function fetchProductCatalog(opts = {}) {
    const qs = new URLSearchParams();
    if (opts.warehouseId)
        qs.set('warehouse_id', String(opts.warehouseId));
    if (opts.q?.trim())
        qs.set('q', opts.q.trim());
    const suffix = qs.toString() ? `?${qs}` : '';
    return callCrm(`/products/catalog${suffix}`, { method: 'GET' });
}
/** Đặt lịch tiếp cận bán hàng / chăm sóc kế tiếp cho khách trong CRM. */
export async function updateCustomerSchedule(payload) {
    return callCrm('/customer/schedule', { method: 'POST', body: payload });
}
/** Sổ cái tích điểm ("Lá") của khách. */
export async function fetchCustomerPoints(phone, limit = 100) {
    return callCrm(`/customer/points?phone=${encodeURIComponent(phone)}&limit=${limit}`, { method: 'GET' });
}
/** Ưu đãi đang chạy — gắn riêng khách + toàn hệ thống. */
export async function fetchPromotions(phone) {
    const qs = phone ? `?phone=${encodeURIComponent(phone)}` : '';
    return callCrm(`/promotions${qs}`, { method: 'GET' });
}
/** Kiểm tra mã ưu đãi và tính tiền giảm. Không ghi gì. */
export async function applyPromotion(input) {
    return callCrm('/promotions/apply', { method: 'POST', body: input });
}
export async function adminListPromotions(opts = {}) {
    const qs = new URLSearchParams();
    if (opts.status)
        qs.set('status', opts.status);
    if (opts.q)
        qs.set('q', opts.q);
    const suffix = qs.toString() ? `?${qs}` : '';
    return callCrm(`/admin/promotions${suffix}`, { method: 'GET' });
}
export async function adminCreatePromotion(body) {
    return callCrm('/admin/promotions', { method: 'POST', body });
}
export async function adminUpdatePromotion(id, body) {
    return callCrm(`/admin/promotions/${id}`, { method: 'PUT', body });
}
export async function adminDeletePromotion(id) {
    return callCrm(`/admin/promotions/${id}`, { method: 'DELETE' });
}
export async function adminListAssigned(id) {
    return callCrm(`/admin/promotions/${id}/customers`, { method: 'GET' });
}
export async function adminAssignCustomers(id, phones) {
    return callCrm(`/admin/promotions/${id}/customers`, { method: 'POST', body: { phones } });
}
export async function adminUnassignCustomer(id, phone) {
    return callCrm(`/admin/promotions/${id}/customers/${encodeURIComponent(phone)}`, { method: 'DELETE' });
}
/** Đối soát điểm — khách có số dư lệch giữa sổ cái và tổng cộng dồn. */
export async function adminPointsReconcile(opts = {}) {
    const qs = new URLSearchParams();
    if (opts.limit)
        qs.set('limit', String(opts.limit));
    if (opts.minGap !== undefined)
        qs.set('min_gap', String(opts.minGap));
    const suffix = qs.toString() ? `?${qs}` : '';
    return callCrm(`/admin/points/reconcile${suffix}`, { method: 'GET' });
}
/** Sản phẩm khách đã mua, gộp từ toàn bộ lịch sử đơn (nguồn: CRM). */
export async function fetchCustomerProducts(phone) {
    return callCrm(`/customer/products?phone=${encodeURIComponent(phone)}`, { method: 'GET' });
}
//# sourceMappingURL=crm-order-client.js.map