/**
 * use-crm-products.ts — Sản phẩm đọc THẲNG từ CRM (không lưu ở ChatMQL).
 * Backend: GET /crm-products/search, /crm-products/source (crm-products-routes.ts).
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

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
  /** Bản ghi gốc CRM — dùng khi cần cột chưa được chuẩn hoá. */
  raw: Record<string, unknown>
}

export type CrmProductSource = 'bridge' | 'dashboard'

export const SOURCE_LABELS: Record<CrmProductSource, string> = {
  bridge: 'Cầu nối ChatMQL ↔ CRM (service key)',
  dashboard: 'API dashboard CRM (Bearer token)',
}

export function useCrmProductSource() {
  return useQuery<{ source: CrmProductSource; dashboardConfigured: boolean }>({
    queryKey: ['crm-products', 'source'],
    queryFn: async () => (await api.get('/crm-products/source')).data,
    staleTime: 5 * 60_000,
  })
}

/** Tìm sản phẩm trên CRM. `enabled=false` khi ô tìm còn trống. */
export function useCrmProductSearch(q: string, limit = 20) {
  const term = q.trim()
  return useQuery<{ source: CrmProductSource; products: CrmProduct[] }>({
    queryKey: ['crm-products', 'search', term, limit],
    enabled: term.length > 0,
    // Giá và tồn kho đổi liên tục bên CRM — giữ cache ngắn thôi.
    staleTime: 30_000,
    queryFn: async () =>
      (await api.get('/crm-products/search', { params: { q: term, limit } })).data,
  })
}
