/**
 * crm-products-client.ts — Đọc sản phẩm TRỰC TIẾP từ CRM (nguồn sự thật duy nhất).
 *
 * Khác với bảng `products` nội bộ (dùng cho RAG của AI), module này KHÔNG lưu
 * gì cả: mỗi lần tìm là một lần hỏi CRM, nên giá/tồn kho luôn đúng thời điểm.
 *
 * Hai đường lấy dữ liệu, chọn bằng biến môi trường:
 *   1. `bridge`   → /api/external/chatmql/products/catalog, xác thực bằng
 *                   service key X-ChatMQL-API-Key (KHÔNG hết hạn) — nên dùng.
 *   2. `dashboard`→ /api/dashboard/search-products, xác thực bằng Bearer JWT
 *                   của MỘT tài khoản CRM. Token này hết hạn theo phiên đăng
 *                   nhập nên chỉ hợp cho thử nghiệm, trừ khi CRM cấp token
 *                   dịch vụ dài hạn.
 *
 * Token/key chỉ nằm ở backend, không bao giờ đi ra trình duyệt.
 */
import { logger } from '../../shared/logger.js'
import { fetchProductCatalog } from '../orders/crm-order-client.js'

const TIMEOUT_MS = 15_000

/** Nguồn dữ liệu đang bật. Thiếu cấu hình dashboard thì tự về bridge. */
export type CrmProductSource = 'bridge' | 'dashboard'

export function resolveSource(): CrmProductSource {
  const want = (process.env.CRM_PRODUCT_SOURCE || '').toLowerCase()
  if (want === 'dashboard' && process.env.CRM_DASHBOARD_TOKEN) return 'dashboard'
  return 'bridge'
}

/** Hình dạng chung trả về cho frontend — độc lập với nguồn. */
export interface CrmProduct {
  id: string | number | null
  code: string | null
  name: string
  price: number | null
  inventory: number | null
  unit: string | null
  weight: number | null
  warehouseId: number | null
  warehouseName: string | null
  /** Bản ghi gốc của CRM — giữ lại để hiện thêm cột mà không phải sửa backend. */
  raw: Record<string, unknown>
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

/** Lấy giá trị đầu tiên có thật trong danh sách khoá ứng viên. */
function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k]
  }
  return undefined
}

/**
 * CRM đặt tên trường không thống nhất giữa các endpoint (`code_product`, `sku`,
 * `ma_sp`…), nên dò theo danh sách khoá thay vì cứng một tên. `raw` luôn đi kèm
 * để không mất dữ liệu nào.
 */
export function normalizeProduct(row: Record<string, unknown>): CrmProduct {
  return {
    id: (pick(row, ['id', 'product_id', 'id_product']) as string | number) ?? null,
    code: str(pick(row, ['code', 'code_product', 'sku', 'ma_sp', 'product_code'])),
    name: str(pick(row, ['name', 'product_name', 'ten_sp', 'title'])) ?? '(không tên)',
    price: num(pick(row, ['price', 'gia_ban', 'sale_price', 'unit_price', 'price_sale'])),
    inventory: num(pick(row, ['inventory', 'ton_kho', 'stock', 'quantity', 'so_luong'])),
    unit: str(pick(row, ['unit', 'don_vi', 'unit_name', 'dvt'])),
    weight: num(pick(row, ['weight', 'khoi_luong', 'trong_luong'])),
    warehouseId: num(pick(row, ['warehouse_id', 'id_kho', 'kho_id'])),
    warehouseName: str(pick(row, ['warehouse_name', 'ten_kho', 'kho'])),
    raw: row,
  }
}

/** Bóc mảng bản ghi ra khỏi các kiểu vỏ bọc phổ biến của CRM. */
function extractRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>
    for (const k of ['data', 'products', 'items', 'results', 'rows']) {
      const v = o[k]
      if (Array.isArray(v)) return v as Record<string, unknown>[]
      // Vỏ hai lớp kiểu { data: { data: [...] } }
      if (v && typeof v === 'object') {
        const inner = extractRows(v)
        if (inner.length) return inner
      }
    }
  }
  return []
}

async function searchViaDashboard(q: string, limit: number): Promise<CrmProduct[]> {
  const base = (process.env.CRM_DASHBOARD_API_URL || 'https://apicrm.traduoc.vn').replace(/\/$/, '')
  const token = process.env.CRM_DASHBOARD_TOKEN || ''
  if (!token) throw new Error('CRM_DASHBOARD_TOKEN chưa cấu hình')

  const url = `${base}/api/dashboard/search-products?q=${encodeURIComponent(q)}&limit=${limit}&exclude_deal_soc=false`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      // 401 gần như luôn là token hết hạn — nói rõ để nhân viên biết phải làm gì.
      const hint = res.status === 401 || res.status === 403
        ? 'Token CRM đã hết hạn hoặc không hợp lệ — cập nhật CRM_DASHBOARD_TOKEN.'
        : text.slice(0, 200)
      throw new Error(`CRM trả lỗi ${res.status}: ${hint}`)
    }
    const rows = extractRows(text ? JSON.parse(text) : null)
    if (!rows.length && text) {
      logger.warn({ sample: text.slice(0, 300) }, '[crm-products] Không bóc được mảng sản phẩm từ phản hồi CRM')
    } else if (rows.length) {
      // Ghi khoá thật của CRM một lần để chỉnh normalizeProduct nếu lệch tên.
      logger.debug({ keys: Object.keys(rows[0]) }, '[crm-products] khoá dữ liệu CRM')
    }
    return rows.map(normalizeProduct)
  } finally {
    clearTimeout(timer)
  }
}

async function searchViaBridge(q: string, limit: number): Promise<CrmProduct[]> {
  // Bridge trả cả danh mục theo kho; lọc theo từ khoá ngay tại backend.
  const { products } = await fetchProductCatalog({ q: q || undefined })
  const needle = q.trim().toLowerCase()
  const rows = (products as unknown as Record<string, unknown>[])
    .filter((p) => {
      if (!needle) return true
      const hay = `${p.name ?? ''} ${p.code ?? ''}`.toLowerCase()
      return hay.includes(needle)
    })
    .slice(0, limit)
  return rows.map(normalizeProduct)
}

/** Tìm sản phẩm trên CRM. Không đụng gì tới bảng products nội bộ. */
export async function searchCrmProducts(
  q: string,
  limit = 20,
): Promise<{ source: CrmProductSource; products: CrmProduct[] }> {
  const source = resolveSource()
  const safeLimit = Math.min(100, Math.max(1, limit))
  const products = source === 'dashboard'
    ? await searchViaDashboard(q, safeLimit)
    : await searchViaBridge(q, safeLimit)
  return { source, products }
}
