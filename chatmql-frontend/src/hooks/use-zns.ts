import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { useApiQuery } from '@/hooks/use-api'
import type { BadgeProps } from '@/components/ui/badge'

// ── Trạng thái chiến dịch ZNS ────────────────────────────────────────
export type ZnsCampaignStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  queued: 'Chờ chạy',
  running: 'Đang chạy',
  completed: 'Hoàn thành',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
}

export function campaignStatusLabel(status?: string | null): string {
  if (!status) return '—'
  return CAMPAIGN_STATUS_LABELS[status] ?? status
}

export function campaignStatusVariant(status?: string | null): BadgeProps['variant'] {
  switch (status) {
    case 'completed':
      return 'success'
    case 'running':
      return 'default'
    case 'queued':
      return 'warning'
    case 'failed':
      return 'destructive'
    case 'cancelled':
      return 'secondary'
    default:
      return 'secondary'
  }
}

// ── Trạng thái người nhận ────────────────────────────────────────────
export const RECIPIENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ gửi',
  sent: 'Đã gửi',
  failed: 'Thất bại',
  skipped: 'Bỏ qua',
}

export function recipientStatusLabel(status?: string | null): string {
  if (!status) return '—'
  return RECIPIENT_STATUS_LABELS[status] ?? status
}

export function recipientStatusVariant(status?: string | null): BadgeProps['variant'] {
  switch (status) {
    case 'sent':
      return 'success'
    case 'failed':
      return 'destructive'
    case 'skipped':
      return 'warning'
    default:
      return 'secondary'
  }
}

// ── Kiểu dữ liệu ─────────────────────────────────────────────────────
/** Tài khoản Zalo OA — dùng để chọn nguồn gửi ZNS. */
export interface OaAccount {
  id: string
  platform: string
  displayName: string | null
  avatarUrl: string | null
  externalPageId: string | null
  status: string | null
  liveStatus?: string | null
}

/** Tham số của một mẫu ZNS (theo cấu trúc Zalo). */
export interface ZnsTemplateParam {
  name: string
  require?: boolean
  type?: string
  maxLength?: number
  minLength?: number
  acceptNull?: boolean
}

/** Mẫu ZNS (chỉ đọc, đồng bộ từ Zalo). */
export interface ZnsTemplate {
  id: string
  channelAccountId: string
  templateId: string
  templateName: string
  status: string // ENABLE | DISABLE | PENDING_REVIEW
  templateType: string | null
  params: ZnsTemplateParam[]
  previewUrl: string | null
  fetchedAt: string
}

export interface ZnsCampaign {
  id: string
  orgId: string
  channelAccountId: string
  name: string
  templateId: string
  templateData: Record<string, string>
  contactIds: string[]
  status: ZnsCampaignStatus
  scheduledAt: string | null
  startedAt: string | null
  completedAt: string | null
  totalCount: number
  sentCount: number
  failedCount: number
  skippedCount: number
  createdByUserId: string
  createdAt: string
  channelAccount?: { id: string; displayName: string | null; externalPageId: string | null } | null
  createdBy?: { id: string; fullName: string | null } | null
}

export interface ZnsCampaignRecipient {
  id: string
  contactId: string | null
  phone: string
  status: string
  errorMessage: string | null
  processedAt: string | null
}

export interface ZnsCampaignDetail extends ZnsCampaign {
  recipients: ZnsCampaignRecipient[]
}

export interface CreateCampaignInput {
  name: string
  channelAccountId: string
  templateId: string
  templateData: Record<string, string>
  contactIds: string[]
  scheduledAt?: string | null
}

// ── Query hooks ──────────────────────────────────────────────────────
/** Danh sách tài khoản Zalo OA (nguồn gửi ZNS). */
export function useOaAccounts() {
  return useApiQuery<OaAccount[]>(['zalo-accounts', { type: 'oa' }], '/zalo-accounts', {
    type: 'oa',
  })
}

/** Danh sách mẫu ZNS đã duyệt của một tài khoản OA. */
export function useZnsTemplates(accountId: string | undefined, refresh?: boolean) {
  return useQuery<ZnsTemplate[]>({
    queryKey: ['zns-templates', { accountId, refresh: refresh ? 1 : 0 }],
    queryFn: async () => {
      const { data } = await api.get<ZnsTemplate[]>('/zns/templates', {
        params: { accountId, ...(refresh ? { refresh: '1' } : {}) },
      })
      return data
    },
    enabled: !!accountId,
  })
}

/** Danh sách chiến dịch ZNS. */
export function useZnsCampaigns(params?: { status?: string; limit?: number }) {
  return useApiQuery<ZnsCampaign[]>(
    ['zns-campaigns', params ?? {}],
    '/zns/campaigns',
    params as Record<string, unknown> | undefined,
    { placeholderData: (prev) => prev },
  )
}

/** Chi tiết một chiến dịch + danh sách người nhận. Tự động refetch khi đang chạy. */
export function useZnsCampaign(id: string | undefined, recipientLimit = 200) {
  return useQuery<ZnsCampaignDetail>({
    queryKey: ['zns-campaign', id, { recipientLimit }],
    queryFn: async () => {
      const { data } = await api.get<ZnsCampaignDetail>(`/zns/campaigns/${id}`, {
        params: { recipientLimit },
      })
      return data
    },
    enabled: !!id,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'running' || s === 'queued' ? 4000 : false
    },
  })
}

// ── Mutation hooks ───────────────────────────────────────────────────
export function useCreateZnsCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateCampaignInput) => {
      const { data } = await api.post<ZnsCampaign>('/zns/campaigns', input)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['zns-campaigns'] }),
  })
}

export function useStartZnsCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/zns/campaigns/${id}/start`)
      return data as { ok: boolean; enqueued: number; skipped: number }
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['zns-campaigns'] })
      qc.invalidateQueries({ queryKey: ['zns-campaign', id] })
    },
  })
}

export function useCancelZnsCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/zns/campaigns/${id}/cancel`)
      return data as { ok: boolean }
    },
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ['zns-campaigns'] })
      qc.invalidateQueries({ queryKey: ['zns-campaign', id] })
    },
  })
}
