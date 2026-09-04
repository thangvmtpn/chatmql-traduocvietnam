import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { ArrowLeft, Play, Ban, Send, XCircle, SkipForward, Users } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { DataTable, type Column } from '@/components/shared/data-table'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loading, ErrorState } from '@/components/shared/feedback'
import { toast } from 'sonner'
import { apiError } from '@/lib/api-client'
import { ProgressBar } from './progress-bar'
import {
  useZnsCampaign,
  useStartZnsCampaign,
  useCancelZnsCampaign,
  campaignStatusLabel,
  campaignStatusVariant,
  recipientStatusLabel,
  recipientStatusVariant,
  type ZnsCampaignRecipient,
} from '@/hooks/use-zns'

export function ZnsCampaignDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: campaign, isLoading, isError } = useZnsCampaign(id)

  const startMutation = useStartZnsCampaign()
  const cancelMutation = useCancelZnsCampaign()

  if (isLoading) return <Loading label="Đang tải chiến dịch..." />
  if (isError || !campaign) return <ErrorState message="Không tải được chiến dịch." />

  const done = campaign.sentCount + campaign.failedCount + campaign.skippedCount
  const canStart = campaign.status === 'draft' || campaign.status === 'queued'
  const canCancel = campaign.status === 'running' || campaign.status === 'queued'

  async function handleStart() {
    try {
      const res = await startMutation.mutateAsync(campaign!.id)
      toast.success(`Đã bắt đầu: ${res.enqueued} gửi, ${res.skipped} bỏ qua`)
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  async function handleCancel() {
    try {
      await cancelMutation.mutateAsync(campaign!.id)
      toast.success('Đã hủy chiến dịch')
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  const columns: Column<ZnsCampaignRecipient>[] = [
    {
      key: 'phone',
      header: 'Số điện thoại',
      cell: (r) => <span className="tabular-nums">{r.phone}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      cell: (r) => <Badge variant={recipientStatusVariant(r.status)}>{recipientStatusLabel(r.status)}</Badge>,
    },
    {
      key: 'error',
      header: 'Lỗi',
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{r.errorMessage || '—'}</span>
      ),
    },
    {
      key: 'processedAt',
      header: 'Xử lý lúc',
      cell: (r) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {r.processedAt ? dayjs(r.processedAt).format('DD/MM/YYYY HH:mm') : '—'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        description={`${campaign.channelAccount?.displayName || 'OA'} · Mẫu ${campaign.templateId}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate('/zns-campaigns')}>
              <ArrowLeft className="h-4 w-4" /> Danh sách
            </Button>
            {canStart && (
              <Button onClick={handleStart} disabled={startMutation.isPending}>
                <Play className="h-4 w-4" /> Bắt đầu
              </Button>
            )}
            {canCancel && (
              <Button variant="outline" onClick={handleCancel} disabled={cancelMutation.isPending}>
                <Ban className="h-4 w-4" /> Hủy
              </Button>
            )}
          </div>
        }
      />

      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={campaignStatusVariant(campaign.status)}>
              {campaignStatusLabel(campaign.status)}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Tạo {dayjs(campaign.createdAt).format('DD/MM/YYYY HH:mm')}
              {campaign.scheduledAt &&
                ` · Lên lịch ${dayjs(campaign.scheduledAt).format('DD/MM/YYYY HH:mm')}`}
              {campaign.startedAt &&
                ` · Bắt đầu ${dayjs(campaign.startedAt).format('DD/MM/YYYY HH:mm')}`}
            </span>
          </div>
          <ProgressBar
            value={done}
            total={campaign.totalCount}
            tone={
              campaign.failedCount > 0
                ? 'warning'
                : campaign.status === 'completed'
                  ? 'success'
                  : 'primary'
            }
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            Đã xử lý {done}/{campaign.totalCount}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Tổng người nhận" value={campaign.totalCount} icon={Users} />
        <StatCard label="Đã gửi" value={campaign.sentCount} icon={Send} tone="success" />
        <StatCard label="Thất bại" value={campaign.failedCount} icon={XCircle} tone="destructive" />
        <StatCard label="Bỏ qua" value={campaign.skippedCount} icon={SkipForward} tone="warning" />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Người nhận</h2>
        <DataTable
          columns={columns}
          rows={campaign.recipients ?? []}
          rowKey={(r) => r.id}
          emptyTitle="Chưa có người nhận nào được xử lý"
        />
      </div>
    </div>
  )
}
