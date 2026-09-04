/**
 * use-promotions.ts — Quản trị ưu đãi & đối soát điểm (proxy CRM qua backend).
 *
 * Endpoint: `modules/orders/promotion-admin-routes.ts`
 *   GET/POST   /admin/promotions            (?status=&q=)
 *   PUT/DELETE /admin/promotions/:id
 *   GET/POST   /admin/promotions/:id/customers   { phones: string[] }
 *   DELETE     /admin/promotions/:id/customers/:phone
 *   GET        /admin/points-reconcile?limit=&minGap=
 * Backend chỉ cho owner/admin/manager (403 với vai trò khác).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type { BadgeProps } from '@/components/ui/badge'
import type { Role } from '@/types/api'

// ─────────────────────────────────────────────────────────────────────────────
// Kiểu dữ liệu (khớp `crm-order-client.ts` → PromotionAdmin)
// ─────────────────────────────────────────────────────────────────────────────

export type PromotionType = 'percent' | 'amount' | 'freeship' | 'gift'
export type PromotionScope = 'system' | 'customer'
export type PromotionStatus = 'active' | 'paused' | 'ended'

export interface Promotion {
  id: number
  code: string | null
  name: string
  description: string | null
  type: PromotionType
  value: number
  max_discount: number | null
  min_order: number
  scope: PromotionScope
  conditions: Record<string, unknown>
  valid_from: string | null
  valid_to: string | null
  status: PromotionStatus
  max_uses: number | null
  used_count: number
  assigned_count: number
}

export type PromotionInput = Omit<Promotion, 'id' | 'used_count' | 'assigned_count'>

export interface PromotionCustomer {
  phone: string
  customer_code: string | null
  used: boolean
  name: string | null
}

export interface AssignCustomersResult {
  success: boolean
  added: number
  duplicated: number
  not_in_crm: string[]
  message: string
}

export interface PointsReconcileItem {
  phone: string
  customer_code: string | null
  name: string | null
  ledger_balance: number
  computed_balance: number
  gap: number
  entry_count: number
  last_entry_at: string | null
}

export interface PointsReconcile {
  summary: { customers_with_points: number; mismatched: number; matched: number; total_gap: number }
  items: PointsReconcileItem[]
  returned: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Nhãn / hằng số hiển thị
// ─────────────────────────────────────────────────────────────────────────────

export const PROMO_TYPES: Array<{ id: PromotionType; label: string; hint: string }> = [
  { id: 'percent', label: 'Giảm theo %', hint: 'Giảm N% tiền hàng' },
  { id: 'amount', label: 'Giảm số tiền', hint: 'Giảm cố định N đồng' },
  { id: 'freeship', label: 'Miễn phí vận chuyển', hint: 'Phí ship về 0' },
  { id: 'gift', label: 'Tặng quà', hint: 'Ghi nhận để nhân viên tự thêm quà vào đơn' },
]
export const PROMO_TYPE_LABELS: Record<PromotionType, string> = Object.fromEntries(
  PROMO_TYPES.map((t) => [t.id, t.label]),
) as Record<PromotionType, string>

export const PROMO_STATUS_LABELS: Record<PromotionStatus, string> = {
  active: 'Đang chạy',
  paused: 'Tạm dừng',
  ended: 'Kết thúc',
}
export function promoStatusVariant(s?: string | null): BadgeProps['variant'] {
  if (s === 'active') return 'success'
  if (s === 'paused') return 'warning'
  return 'secondary'
}

export const PROMO_SCOPE_LABELS: Record<PromotionScope, string> = {
  system: 'Toàn hệ thống',
  customer: 'Riêng khách',
}

/** Điều kiện áp dụng — khoá đúng như CRM nhận. */
export const PROMO_CONDITION_FIELDS: Array<{
  key: string
  label: string
  type: 'number' | 'text' | 'bool'
}> = [
  { key: 'min_purchase_count', label: 'Đã mua tối thiểu (lần)', type: 'number' },
  { key: 'min_gmv', label: 'Tổng chi tiêu tối thiểu (đ)', type: 'number' },
  { key: 'min_points', label: 'Điểm tối thiểu', type: 'number' },
  { key: 'customer_groups', label: 'Nhóm KH (cách nhau dấu phẩy)', type: 'text' },
  { key: 'birthday_month', label: 'Chỉ trong tháng sinh nhật', type: 'bool' },
]

/** Vai trò được quản trị ưu đãi — trùng ADMIN_ROLES ở backend. */
export const PROMO_ADMIN_ROLES: readonly Role[] = ['owner', 'admin', 'manager']
export function canManagePromotions(role?: Role | null): boolean {
  return !!role && PROMO_ADMIN_ROLES.includes(role)
}

export function emptyPromotionInput(): PromotionInput {
  return {
    code: null,
    name: '',
    description: null,
    type: 'percent',
    value: 0,
    max_discount: null,
    min_order: 0,
    scope: 'system',
    conditions: {},
    valid_from: null,
    valid_to: null,
    status: 'active',
    max_uses: null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────────────────

export const promotionKeys = {
  all: ['admin', 'promotions'] as const,
  list: (params: { status?: string; q?: string }) => ['admin', 'promotions', 'list', params] as const,
  customers: (id: number) => ['admin', 'promotions', 'customers', id] as const,
  reconcile: (params: { limit?: number; minGap?: number }) => ['admin', 'points-reconcile', params] as const,
}

// ─────────────────────────────────────────────────────────────────────────────
// Query
// ─────────────────────────────────────────────────────────────────────────────

export function usePromotions(params: { status?: string; q?: string } = {}, enabled = true) {
  return useQuery<{ promotions: Promotion[]; total: number }>({
    queryKey: promotionKeys.list(params),
    enabled,
    queryFn: async () => {
      const { data } = await api.get<{ promotions: Promotion[]; total: number }>('/admin/promotions', {
        params: {
          ...(params.status ? { status: params.status } : {}),
          ...(params.q ? { q: params.q } : {}),
        },
      })
      return data
    },
  })
}

export function usePromotionCustomers(id: number | null | undefined) {
  return useQuery<{ customers: PromotionCustomer[]; total: number }>({
    queryKey: promotionKeys.customers(id ?? 0),
    enabled: id != null,
    queryFn: async () => {
      const { data } = await api.get<{ customers: PromotionCustomer[]; total: number }>(
        `/admin/promotions/${id}/customers`,
      )
      return data
    },
  })
}

export function usePointsReconcile(params: { limit?: number; minGap?: number } = { limit: 200 }, enabled = true) {
  return useQuery<PointsReconcile>({
    queryKey: promotionKeys.reconcile(params),
    enabled,
    queryFn: async () => {
      const { data } = await api.get<PointsReconcile>('/admin/points-reconcile', {
        params: {
          ...(params.limit ? { limit: params.limit } : {}),
          ...(params.minGap !== undefined ? { minGap: params.minGap } : {}),
        },
      })
      return data
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation
// ─────────────────────────────────────────────────────────────────────────────

export function useCreatePromotion() {
  const qc = useQueryClient()
  return useMutation<{ success: boolean; id: number; message: string }, unknown, PromotionInput>({
    mutationFn: async (body) => (await api.post('/admin/promotions', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: promotionKeys.all }),
  })
}

export function useUpdatePromotion() {
  const qc = useQueryClient()
  return useMutation<{ success: boolean; message: string }, unknown, { id: number; body: PromotionInput }>({
    mutationFn: async ({ id, body }) => (await api.put(`/admin/promotions/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: promotionKeys.all }),
  })
}

export function useDeletePromotion() {
  const qc = useQueryClient()
  return useMutation<{ success: boolean; message: string }, unknown, number>({
    mutationFn: async (id) => (await api.delete(`/admin/promotions/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: promotionKeys.all }),
  })
}

export function useAssignPromotionCustomers() {
  const qc = useQueryClient()
  return useMutation<AssignCustomersResult, unknown, { id: number; phones: string[] }>({
    mutationFn: async ({ id, phones }) => (await api.post(`/admin/promotions/${id}/customers`, { phones })).data,
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: promotionKeys.customers(vars.id) })
      qc.invalidateQueries({ queryKey: promotionKeys.all })
    },
  })
}

export function useUnassignPromotionCustomer() {
  const qc = useQueryClient()
  return useMutation<{ success: boolean; message: string }, unknown, { id: number; phone: string }>({
    mutationFn: async ({ id, phone }) =>
      (await api.delete(`/admin/promotions/${id}/customers/${encodeURIComponent(phone)}`)).data,
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: promotionKeys.customers(vars.id) })
      qc.invalidateQueries({ queryKey: promotionKeys.all })
    },
  })
}
