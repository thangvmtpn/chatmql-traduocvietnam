/**
 * crm-order-client.ts — HTTP client server-to-server sang CRM bridge.
 *
 * CRM là chủ sở hữu duy nhất của đơn hàng. ChatMQL KHÔNG ghi thẳng vào
 * database crm/fm nữa — mọi thao tác đều đi qua đây, để nghiệp vụ lên đơn
 * chỉ tồn tại ở đúng một nơi.
 *
 * Service key nằm ở backend, không bao giờ lộ ra trình duyệt.
 */
import { logger } from '../../shared/logger.js'

const DEFAULT_TIMEOUT_MS = 20_000

/**
 * Timeout riêng cho việc tạo đơn, phải DÀI HƠN thời gian xấu nhất phía CRM.
 * CRM chờ tối đa ~8s cho FM rồi vẫn trả về kết quả "partial" hợp lệ; nếu client
 * bỏ cuộc sớm hơn thì nhân viên thấy "mất kết nối" trong khi đơn đã tạo xong.
 */
const CREATE_ORDER_TIMEOUT_MS = 45_000

export interface CrmOrderItem {
  product_code: string
  product_name: string
  quantity: number
  unit_price: number
  /** Dòng quà tặng — không tính vào tiền hàng. */
  is_gift?: boolean
}

export interface CrmCreateOrderPayload {
  request_id: string
  customer_phone: string
  customer_name: string
  shipping_address: string
  city?: string
  items: CrmOrderItem[]
  discount_amount?: number
  shipping_fee?: number
  payment_method?: 'cod' | 'vietqr' | 'bank_transfer'
  shipping_provider?: 'jt_express' | 'viettel_post' | 'vnpost' | 'other'
  seller_name?: string
  /** Phần trước @ của email ChatMQL — khóa map chính xác sang account_users bên CRM. */
  seller_username?: string
  notes?: string
  // Đợt 1
  order_status_id?: number
  warehouse_id?: number
  province_id?: number
  province_name?: string
  ward_id?: number
  ward_name?: string
  address_detail?: string
  // Đợt 3
  deposit_amount?: number
  order_type?: string
  order_source?: string
  self_shipping?: boolean
  is_fragile?: boolean
  is_exchange?: boolean
  type_fee_delivery?: 'PP_CASH' | 'CC_CASH'
}

export interface CrmCreateOrderResult {
  success: boolean
  /** 'ok' = vào đủ CRM+FM. 'partial' = mới vào CRM, FM sẽ được đẩy lại sau. */
  status: 'ok' | 'partial'
  message: string
  order_code: string
  request_id: string
  subtotal: number
  discount_amount: number
  shipping_fee: number
  total_amount: number
  payment_method: string
  vietqr_url: string | null
  crm_saved: boolean
  fm_saved: boolean
  fm_error: string | null
  /** true khi CRM nhận ra request_id đã xử lý rồi và trả lại đơn cũ. */
  replayed: boolean
}

/** Lỗi có mang HTTP status, để route phía trên map sang mã trả về cho client. */
export class CrmApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'CrmApiError'
  }
}

function baseUrl(): string {
  return (process.env.CRM_ORDER_API_URL || 'http://host.docker.internal:8000').replace(/\/$/, '')
}

function apiKey(): string {
  return process.env.CRM_ORDER_API_KEY || 'c39174092b71fae807183ef028e1920cae803970298a09f87c121e7841c2807e'
}

async function callCrm<T>(
  path: string,
  init: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; timeoutMs?: number },
): Promise<T> {
  const url = `${baseUrl()}/api/external/chatmql${path}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, {
      method: init.method,
      headers: {
        'Content-Type': 'application/json',
        'X-ChatMQL-API-Key': apiKey(),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    })
  } catch (err: any) {
    // Timeout / CRM sập / DNS hỏng — người gọi phải phân biệt được với lỗi nghiệp vụ.
    const reason = err?.name === 'AbortError' ? 'CRM không phản hồi kịp' : err?.message
    logger.error({ err, url }, '[crm-client] Không kết nối được CRM')
    throw new CrmApiError(`Không kết nối được CRM: ${reason}`, 504)
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()
  let parsed: any = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    /* CRM trả về không phải JSON — giữ nguyên text bên dưới */
  }

  if (!res.ok) {
    const detail = parsed?.detail ?? text?.slice(0, 300) ?? ''
    logger.warn({ url, status: res.status, detail }, '[crm-client] CRM trả lỗi')
    throw new CrmApiError(`CRM trả lỗi ${res.status}: ${detail}`, res.status, detail)
  }
  return parsed as T
}

/** Tạo đơn trên CRM. Idempotent theo request_id. */
export async function createOrderOnCrm(
  payload: CrmCreateOrderPayload,
): Promise<CrmCreateOrderResult> {
  return callCrm<CrmCreateOrderResult>('/order/create', {
    method: 'POST',
    body: payload,
    timeoutMs: CREATE_ORDER_TIMEOUT_MS,
  })
}

/** Tra trạng thái đồng bộ CRM/FM của một đơn. */
export async function getOrderSyncStatus(orderCode: string): Promise<{
  order_code: string
  request_id: string
  crm_saved: boolean
  fm_saved: boolean
  fm_attempts: number
  last_error: string | null
}> {
  return callCrm(`/order/${encodeURIComponent(orderCode)}/status`, { method: 'GET' })
}

/** Đẩy lại các đơn đã vào CRM nhưng còn kẹt ở FM. */
export async function reconcilePendingFm(limit = 20): Promise<{
  scanned: number
  fixed: string[]
  still_failing: Array<{ order_code: string; error: string }>
}> {
  return callCrm(`/order/reconcile-fm?limit=${limit}`, { method: 'POST', timeoutMs: 60_000 })
}

/** Danh mục sản phẩm (CRM lấy từ FM). */
export async function fetchProducts(): Promise<{ products: any[] }> {
  return callCrm('/products', { method: 'GET' })
}

/** Hồ sơ khách hàng trong CRM theo số điện thoại. */
export async function fetchCustomer(phone: string): Promise<{ found: boolean; customer: any }> {
  return callCrm(`/customer?phone=${encodeURIComponent(phone)}`, { method: 'GET' })
}

/** Lịch sử đơn hàng của khách trong CRM. */
export async function fetchCustomerOrders(phone: string): Promise<{ orders: any[] }> {
  return callCrm(`/customer/orders?phone=${encodeURIComponent(phone)}`, { method: 'GET' })
}

// ── Đợt 1: dữ liệu tra cứu cho form tạo đơn ─────────────────────────

export interface OrderStatus { id: number; label: string; group_id: number | null; group: string | null }
export interface Warehouse { id: number; name: string }
export interface Province { id: number; name: string }
export interface Ward { id: number; name: string }

export interface CatalogProduct {
  id: number
  code: string
  name: string
  price: number
  weight: number | null
  inventory: number
  unit: string | null
  vat_note: string | null
  warehouse_id: number | null
  status: string | null
}

/** Trạng thái đơn hàng (14 mức, có nhóm cha). */
export interface SalesStatsPeriod { orders: number; gmv: number; aov: number }
export interface SalesScope {
  today: SalesStatsPeriod
  yesterday: SalesStatsPeriod
  week: SalesStatsPeriod
  month: SalesStatsPeriod
  daily: Array<{ date: string; orders: number; gmv: number }>
  by_status: Array<{ status: string; orders: number }>
  customers: number
  by_staff?: Array<{ name: string; orders: number; gmv: number }>
  staff_name?: string
  id_acc?: number
}
export interface SalesStats {
  org: SalesScope
  /** null khi username không khớp tài khoản CRM nào. */
  mine: SalesScope | null
}

/**
 * Thống kê bán hàng cho dashboard — đơn hàng nằm ở CRM nên phải hỏi CRM.
 * @param username phần trước @ của email ChatMQL, để CRM tách được số của riêng
 *                 nhân sự đó. Bỏ trống thì chỉ có số toàn công ty.
 */
export async function fetchSalesStats(username?: string): Promise<SalesStats> {
  const q = username ? `?username=${encodeURIComponent(username)}` : ''
  return callCrm(`/stats/sales${q}`, { method: 'GET' })
}

export async function fetchOrderStatuses(): Promise<{ statuses: OrderStatus[] }> {
  return callCrm('/lookups/order-statuses', { method: 'GET' })
}

/** Kho xuất hàng. */
export async function fetchWarehouses(): Promise<{ warehouses: Warehouse[] }> {
  return callCrm('/lookups/warehouses', { method: 'GET' })
}

/** Tỉnh/thành phố. */
export async function fetchProvinces(): Promise<{ provinces: Province[] }> {
  return callCrm('/lookups/provinces', { method: 'GET' })
}

/** Phường/xã thuộc một tỉnh. */
export async function fetchWards(provinceId: number): Promise<{ wards: Ward[] }> {
  return callCrm(`/lookups/wards?id_prov=${provinceId}`, { method: 'GET' })
}

/** Danh mục sản phẩm đầy đủ (tồn kho, đơn vị, VAT, khối lượng). */
export async function fetchProductCatalog(opts: { warehouseId?: number; q?: string } = {}): Promise<{ products: CatalogProduct[] }> {
  const qs = new URLSearchParams()
  if (opts.warehouseId) qs.set('warehouse_id', String(opts.warehouseId))
  if (opts.q?.trim()) qs.set('q', opts.q.trim())
  const suffix = qs.toString() ? `?${qs}` : ''
  return callCrm(`/products/catalog${suffix}`, { method: 'GET' })
}

// ── Đợt 2: hồ sơ khách hàng ─────────────────────────────────────────

export interface CustomerSchedulePayload {
  phone: string
  /** ISO 8601. Chuỗi rỗng = xóa lịch. Bỏ trống = giữ nguyên. */
  next_sales_at?: string
  next_care_at?: string
  appointment_type?: string
  care_note?: string
}

/** Đặt lịch tiếp cận bán hàng / chăm sóc kế tiếp cho khách trong CRM. */
export async function updateCustomerSchedule(payload: CustomerSchedulePayload): Promise<{
  success: boolean
  id_kh: number
  next_sales_at: string | null
  next_care_at: string | null
  appointment_type: string | null
}> {
  return callCrm('/customer/schedule', { method: 'POST', body: payload })
}

// ── Đợt 5: điểm thưởng & ưu đãi ─────────────────────────────────────

export interface PointsLedger {
  phone: string
  balance: number
  total_earned: number
  total_spent: number
  entry_count: number
  rank: string | null
  rank_reward: string | null
  /** true = số dư sổ cái lệch tổng cộng dồn; khách này cần đối soát điểm. */
  balance_mismatch: boolean
  computed_balance: number
  entries: Array<{
    at: string | null
    ref: string | null
    delta: number
    balance_after: number | null
    kind: 'earn' | 'spend'
    category: string
  }>
}

export interface Promotion {
  id: number
  code: string | null
  name: string
  description: string | null
  type: 'percent' | 'amount' | 'freeship' | 'gift'
  value: number
  max_discount: number | null
  min_order: number
  scope: 'system' | 'customer'
  conditions: Record<string, unknown>
  from: string | null
  to: string | null
  source: 'system' | 'customer'
  used: boolean
  eligible: boolean
  conditions_text: string[]
}

/** Sổ cái tích điểm ("Lá") của khách. */
export async function fetchCustomerPoints(phone: string, limit = 100): Promise<PointsLedger> {
  return callCrm(`/customer/points?phone=${encodeURIComponent(phone)}&limit=${limit}`, { method: 'GET' })
}

/** Ưu đãi đang chạy — gắn riêng khách + toàn hệ thống. */
export async function fetchPromotions(phone?: string): Promise<{
  promotions: Promotion[]
  customer: Record<string, unknown> | null
  total: number
}> {
  const qs = phone ? `?phone=${encodeURIComponent(phone)}` : ''
  return callCrm(`/promotions${qs}`, { method: 'GET' })
}

/** Kiểm tra mã ưu đãi và tính tiền giảm. Không ghi gì. */
export async function applyPromotion(input: {
  code: string
  phone?: string
  order_subtotal: number
}): Promise<{
  valid: boolean
  promotion: Promotion
  discount_amount: number
  free_shipping: boolean
  message: string
}> {
  return callCrm('/promotions/apply', { method: 'POST', body: input })
}

// ── Quản trị ưu đãi ─────────────────────────────────────────────────

export interface PromotionAdmin {
  id: number
  code: string | null
  name: string
  description: string | null
  type: 'percent' | 'amount' | 'freeship' | 'gift'
  value: number
  max_discount: number | null
  min_order: number
  scope: 'system' | 'customer'
  conditions: Record<string, unknown>
  valid_from: string | null
  valid_to: string | null
  status: 'active' | 'paused' | 'ended'
  max_uses: number | null
  used_count: number
  assigned_count: number
}

export type PromotionInput = Omit<PromotionAdmin, 'id' | 'used_count' | 'assigned_count'>

export async function adminListPromotions(opts: { status?: string; q?: string } = {}) {
  const qs = new URLSearchParams()
  if (opts.status) qs.set('status', opts.status)
  if (opts.q) qs.set('q', opts.q)
  const suffix = qs.toString() ? `?${qs}` : ''
  return callCrm<{ promotions: PromotionAdmin[]; total: number }>(`/admin/promotions${suffix}`, { method: 'GET' })
}

export async function adminCreatePromotion(body: PromotionInput) {
  return callCrm<{ success: boolean; id: number; message: string }>('/admin/promotions', { method: 'POST', body })
}

export async function adminUpdatePromotion(id: number, body: PromotionInput) {
  return callCrm<{ success: boolean; message: string }>(`/admin/promotions/${id}`, { method: 'PUT', body })
}

export async function adminDeletePromotion(id: number) {
  return callCrm<{ success: boolean; message: string }>(`/admin/promotions/${id}`, { method: 'DELETE' })
}

export async function adminListAssigned(id: number) {
  return callCrm<{ customers: Array<{ phone: string; customer_code: string | null; used: boolean; name: string | null }>; total: number }>(
    `/admin/promotions/${id}/customers`, { method: 'GET' })
}

export async function adminAssignCustomers(id: number, phones: string[]) {
  return callCrm<{ success: boolean; added: number; duplicated: number; not_in_crm: string[]; message: string }>(
    `/admin/promotions/${id}/customers`, { method: 'POST', body: { phones } })
}

export async function adminUnassignCustomer(id: number, phone: string) {
  return callCrm<{ success: boolean; message: string }>(
    `/admin/promotions/${id}/customers/${encodeURIComponent(phone)}`, { method: 'DELETE' })
}

/** Đối soát điểm — khách có số dư lệch giữa sổ cái và tổng cộng dồn. */
export async function adminPointsReconcile(opts: { limit?: number; minGap?: number } = {}) {
  const qs = new URLSearchParams()
  if (opts.limit) qs.set('limit', String(opts.limit))
  if (opts.minGap !== undefined) qs.set('min_gap', String(opts.minGap))
  const suffix = qs.toString() ? `?${qs}` : ''
  return callCrm<{
    summary: { customers_with_points: number; mismatched: number; matched: number; total_gap: number }
    items: Array<{
      phone: string
      customer_code: string | null
      name: string | null
      ledger_balance: number
      computed_balance: number
      gap: number
      entry_count: number
      last_entry_at: string | null
    }>
    returned: number
  }>(`/admin/points/reconcile${suffix}`, { method: 'GET' })
}

/** Sản phẩm khách đã mua, gộp từ toàn bộ lịch sử đơn (nguồn: CRM). */
export async function fetchCustomerProducts(phone: string) {
  return callCrm<{
    products: Array<{
      code: string; name: string | null; price: number | null; unit: string | null
      quantity: number; order_count: number; last_bought_at: string | null
      is_gift: boolean
      orders: Array<{ code: string; at: string | null; status: string | null }>
    }>
    total: number
    order_count: number
  }>(`/customer/products?phone=${encodeURIComponent(phone)}`, { method: 'GET' })
}
