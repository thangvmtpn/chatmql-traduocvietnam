import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { API_ORIGIN } from '@/lib/config'
import { useApiQuery } from '@/hooks/use-api'
import type { BadgeProps } from '@/components/ui/badge'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Báo giá — nối thẳng vào backend TDVN (`src/modules/quotes/*`).
 * ─────────────────────────────────────────────────────────────────────────────
 *  Đã đăng nhập:   GET/POST /quotes · GET/PATCH/DELETE /quotes/:id · POST /quotes/:id/send
 *  Công khai:      GET /api/public/quotes/:token   (KHÔNG JWT, axios trần)
 *
 *  Backend trả envelope `{ success, data, meta }`, tiền đã đổi Decimal → number.
 *  Kiểu `Quote` ở đây là bản "phẳng" cho màn hình (code/token/customer…), ánh xạ
 *  từ bản ghi backend trong `toQuote()` để trang không phải biết cấu trúc gốc.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Sản phẩm (endpoint thật: GET /products) ──────────────────────────
export interface Product {
  id: string
  name: string
  code: string | null
  priceType: string | null
  price: number | null
  priceMax: number | null
  currency: string | null
  status: string
  category: { id: string; name: string } | null
}

interface ProductListResponse {
  success: boolean
  data: Product[]
  meta: { page: number; pageSize: number; total: number; totalPages: number }
}

export interface ProductQueryParams {
  page?: number
  pageSize?: number
  search?: string
  status?: string
}

/** Danh sách sản phẩm — dùng để chọn vào dòng báo giá. */
export function useProducts(params: ProductQueryParams = {}) {
  return useApiQuery<ProductListResponse>(
    ['products', params],
    '/products',
    params as Record<string, unknown>,
    { placeholderData: (prev) => prev },
  )
}

// ── Kiểu dữ liệu báo giá ─────────────────────────────────────────────
export interface QuoteLine {
  id: string
  productId: string | null
  name: string
  quantity: number
  unitPrice: number
}

/** Khớp `QUOTE_STATUSES` phía backend (quote-types.ts). */
export type QuoteStatus =
  | 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired' | 'canceled'

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Nháp',
  sent: 'Đã gửi',
  viewed: 'Khách đã xem',
  accepted: 'Đã chấp nhận',
  rejected: 'Từ chối',
  expired: 'Hết hiệu lực',
  canceled: 'Đã huỷ',
}

/** Trạng thái người dùng chọn được trên form: nháp, hoặc gửi luôn cho khách. */
export const EDITABLE_STATUSES: QuoteStatus[] = ['draft', 'sent']

export function quoteStatusVariant(status?: string | null): BadgeProps['variant'] {
  switch (status) {
    case 'accepted':
      return 'success'
    case 'sent':
    case 'viewed':
      return 'warning'
    case 'rejected':
    case 'expired':
    case 'canceled':
      return 'destructive'
    default:
      return 'secondary'
  }
}

export interface Quote {
  id: string
  /** `publicToken` — ghép thành link /q/:token. Danh sách không trả → rỗng, chi tiết mới có. */
  token: string
  /** Số chứng từ BG-2026-0001 (`number`). */
  code: string
  title: string
  customerId: string | null
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  /** Ghi chú HIỂN THỊ cho khách (`notes`). */
  note: string | null
  currency: string
  status: QuoteStatus
  lines: QuoteLine[]
  /** Tổng backend đã tính (sau chiết khấu/thuế). */
  total: number
  validUntil: string | null
  createdAt: string
  updatedAt: string
}

export interface QuoteInput {
  id?: string
  title: string
  /** Bắt buộc — backend cần `contactId` thuộc org. */
  customerId: string | null
  customerName: string
  customerPhone?: string | null
  customerEmail?: string | null
  note?: string | null
  currency?: string
  /** 'sent' = lưu xong gọi thêm POST /quotes/:id/send (kênh link). */
  status?: QuoteStatus
  lines: QuoteLine[]
}

// ── Tính toán ────────────────────────────────────────────────────────
export function lineTotal(line: Pick<QuoteLine, 'quantity' | 'unitPrice'>): number {
  return (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)
}

export function quoteTotal(lines: QuoteLine[]): number {
  return lines.reduce((sum, l) => sum + lineTotal(l), 0)
}

// ── Ánh xạ bản ghi backend → Quote ───────────────────────────────────
interface Envelope<T> {
  success: boolean
  data: T
  meta?: unknown
}

/**
 * Module báo giá trả lỗi dạng `{ success:false, error:{ code, message } }` —
 * `apiError()` chung chỉ đọc `error` là chuỗi nên sẽ ra "[object Object]".
 */
export function quoteError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const e = err.response?.data as { error?: string | { message?: string } } | undefined
    if (typeof e?.error === 'string') return e.error
    if (e?.error?.message) return e.error.message
  }
  return err instanceof Error ? err.message : 'Đã có lỗi xảy ra'
}

/** Bản ghi backend (LIST_SELECT / DETAIL_SELECT trong quote-service.ts). */
interface ApiQuote {
  id: string
  number: string
  status: string
  title: string | null
  currency: string
  total: number
  notes?: string | null
  publicToken?: string
  contactId?: string
  validUntil: string | null
  createdAt: string
  updatedAt: string
  contact?: { id: string; fullName: string | null; crmName: string | null; phone: string | null } | null
  lines?: Array<{
    id: string
    productId: string | null
    name: string
    quantity: number
    unitPrice: number
  }>
}

function toQuote(q: ApiQuote): Quote {
  return {
    id: q.id,
    token: q.publicToken ?? '',
    code: q.number,
    title: q.title ?? '',
    customerId: q.contact?.id ?? q.contactId ?? null,
    customerName: q.contact?.crmName || q.contact?.fullName || '',
    customerPhone: q.contact?.phone ?? null,
    customerEmail: null, // backend không trả email trong LIST_SELECT
    note: q.notes ?? null,
    currency: q.currency || 'VND',
    status: (q.status as QuoteStatus) || 'draft',
    lines: (q.lines ?? []).map((l) => ({
      id: l.id,
      productId: l.productId,
      name: l.name,
      quantity: Number(l.quantity) || 0,
      unitPrice: Number(l.unitPrice) || 0,
    })),
    total: Number(q.total) || 0,
    validUntil: q.validUntil,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  }
}

function toLineInput(lines: QuoteLine[]) {
  return lines.map((l) => ({
    productId: l.productId,
    name: l.name,
    quantity: Number(l.quantity) || 0,
    unitPrice: Number(l.unitPrice) || 0,
  }))
}

// ── Query hooks ──────────────────────────────────────────────────────
export function useQuotes() {
  return useQuery<Quote[]>({
    queryKey: ['quotes'],
    queryFn: async () => {
      // Danh sách không kèm `lines`/`publicToken` → gọi chi tiết cho từng dòng
      // (trang chỉ hiển thị 100 dòng đầu; N+1 chấp nhận được ở quy mô này).
      const { data } = await api.get<Envelope<ApiQuote[]>>('/quotes', { params: { page: 1, limit: 100 } })
      const details = await Promise.all(
        (data.data ?? []).map((q) =>
          api
            .get<Envelope<ApiQuote>>(`/quotes/${q.id}`)
            .then((r) => r.data.data)
            .catch(() => q),
        ),
      )
      return details.map(toQuote)
    },
  })
}

export function useQuote(id: string | undefined) {
  return useQuery<Quote>({
    queryKey: ['quote', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get<Envelope<ApiQuote>>(`/quotes/${id}`)
      return toQuote(data.data)
    },
  })
}

/** Bản báo giá khách nhìn thấy — allowlist `toPublicQuote` phía backend. */
export interface PublicQuote {
  code: string
  title: string
  status: QuoteStatus
  currency: string
  total: number
  totalInWords: string | null
  note: string | null
  validUntil: string | null
  createdAt: string
  customerName: string
  seller: {
    name: string | null
    taxCode: string | null
    address: string | null
    phone: string | null
    email: string | null
    bankInfo: string | null
    termsText: string | null
    footerNote: string | null
  }
  lines: QuoteLine[]
  /** Khách còn được bấm chấp nhận / từ chối không. */
  canRespond: boolean
}

interface ApiPublicQuote {
  number: string
  title: string | null
  status: string
  currency: string
  total: number
  totalInWords?: string
  notes?: string | null
  validUntil: string | null
  createdAt: string
  buyer?: { name: string; companyName?: string | null } | null
  seller?: Partial<PublicQuote['seller']>
  lines?: Array<{ name: string; quantity: number; unitPrice: number; amount: number }>
}

/** Lỗi trang công khai — 404 (không có), 410 (hết hạn / đã huỷ). */
export type PublicQuoteError = 'not_found' | 'expired' | 'gone' | 'error'

export function useQuoteByToken(token: string | undefined) {
  return useQuery<PublicQuote | null, PublicQuoteError>({
    queryKey: ['public-quote', token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      try {
        // axios trần — KHÔNG gắn Bearer, không auto-refresh (route công khai).
        const { data } = await axios.get<Envelope<ApiPublicQuote> & { meta?: { canRespond?: boolean } }>(
          `${API_ORIGIN}/api/public/quotes/${encodeURIComponent(token ?? '')}`,
        )
        const q = data.data
        return {
          code: q.number,
          title: q.title ?? '',
          status: (q.status as QuoteStatus) || 'sent',
          currency: q.currency || 'VND',
          total: Number(q.total) || 0,
          totalInWords: q.totalInWords ?? null,
          note: q.notes ?? null,
          validUntil: q.validUntil,
          createdAt: q.createdAt,
          customerName: [q.buyer?.name, q.buyer?.companyName].filter(Boolean).join(' — '),
          seller: {
            name: q.seller?.name ?? null,
            taxCode: q.seller?.taxCode ?? null,
            address: q.seller?.address ?? null,
            phone: q.seller?.phone ?? null,
            email: q.seller?.email ?? null,
            bankInfo: q.seller?.bankInfo ?? null,
            termsText: q.seller?.termsText ?? null,
            footerNote: q.seller?.footerNote ?? null,
          },
          lines: (q.lines ?? []).map((l, i) => ({
            id: String(i),
            productId: null,
            name: l.name,
            quantity: Number(l.quantity) || 0,
            unitPrice: Number(l.unitPrice) || 0,
          })),
          canRespond: Boolean(data.meta?.canRespond),
        }
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined
        const code = axios.isAxiosError(err)
          ? (err.response?.data as { error?: { code?: string } } | undefined)?.error?.code
          : undefined
        if (status === 404) throw 'not_found' satisfies PublicQuoteError
        if (status === 410) throw (code === 'EXPIRED' ? 'expired' : 'gone') satisfies PublicQuoteError
        throw 'error' satisfies PublicQuoteError
      }
    },
  })
}

/** Khách chấp nhận / từ chối trên trang công khai (không JWT). */
export function useRespondPublicQuote(token: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { action: 'accept' | 'reject'; reason?: string }) => {
      const { data } = await axios.post<Envelope<{ status: string }>>(
        `${API_ORIGIN}/api/public/quotes/${encodeURIComponent(token ?? '')}/respond`,
        vars,
      )
      return data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-quote', token] }),
  })
}

export function useSaveQuote() {
  const qc = useQueryClient()
  return useMutation<Quote, unknown, QuoteInput>({
    mutationFn: async (input) => {
      if (!input.customerId) throw new Error('Cần chọn khách hàng cho báo giá')
      const body = {
        title: input.title || null,
        notes: input.note ?? null,
        lines: toLineInput(input.lines),
      }
      let saved: ApiQuote
      if (input.id) {
        const { data } = await api.patch<Envelope<ApiQuote>>(`/quotes/${input.id}`, body)
        saved = data.data
      } else {
        const { data } = await api.post<Envelope<ApiQuote>>('/quotes', {
          ...body,
          contactId: input.customerId,
        })
        saved = data.data
      }
      // Form chọn "Đã gửi" → chuyển trạng thái qua route riêng (chỉ từ nháp).
      if (input.status === 'sent' && saved.status === 'draft') {
        const { data } = await api.post<Envelope<ApiQuote>>(`/quotes/${saved.id}/send`, { channel: 'link' })
        saved = { ...saved, ...data.data }
      }
      // POST/PATCH trả bản gọn — lấy chi tiết để có `lines` + `publicToken`.
      const { data: detail } = await api.get<Envelope<ApiQuote>>(`/quotes/${saved.id}`)
      return toQuote(detail.data)
    },
    onSuccess: (quote) => {
      qc.invalidateQueries({ queryKey: ['quotes'] })
      qc.invalidateQueries({ queryKey: ['quote', quote.id] })
    },
  })
}

export function useDeleteQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/quotes/${id}`)
      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  })
}
