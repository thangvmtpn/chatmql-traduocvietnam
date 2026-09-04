import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { Plus, Play, Ban, Send, Megaphone, CheckCircle2, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { DataTable, type Column } from '@/components/shared/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { apiError } from '@/lib/api-client'
import { ProgressBar } from './progress-bar'
import { CreateCampaignDialog } from './create-campaign-dialog'
import {
  useZnsCampaigns,
  useOaAccounts,
  useZnsTemplates,
  useStartZnsCampaign,
  useCancelZnsCampaign,
  campaignStatusLabel,
  campaignStatusVariant,
  CAMPAIGN_STATUS_LABELS,
  type ZnsCampaign,
  type ZnsTemplate,
} from '@/hooks/use-zns'

const ALL = '__all__'

export function ZnsCampaignsPage() {
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>(ALL)

  const params = useMemo(
    () => (statusFilter === ALL ? { limit: 100 } : { status: statusFilter, limit: 100 }),
    [statusFilter],
  )
  const { data: campaigns, isLoading, isError } = useZnsCampaigns(params)

  const startMutation = useStartZnsCampaign()
  const cancelMutation = useCancelZnsCampaign()

  const stats = useMemo(() => {
    const list = campaigns ?? []
    return {
      total: list.length,
      running: list.filter((c) => c.status === 'running' || c.status === 'queued').length,
      completed: list.filter((c) => c.status === 'completed').length,
      sent: list.reduce((sum, c) => sum + (c.sentCount ?? 0), 0),
    }
  }, [campaigns])

  async function handleStart(c: ZnsCampaign) {
    try {
      const res = await startMutation.mutateAsync(c.id)
      toast.success(`Đã bắt đầu: ${res.enqueued} gửi, ${res.skipped} bỏ qua`)
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  async function handleCancel(c: ZnsCampaign) {
    try {
      await cancelMutation.mutateAsync(c.id)
      toast.success('Đã hủy chiến dịch')
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  const columns: Column<ZnsCampaign>[] = [
    {
      key: 'name',
      header: 'Chiến dịch',
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{c.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {c.channelAccount?.displayName || 'OA'} · {c.createdBy?.fullName || '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'template',
      header: 'Mẫu',
      cell: (c) => <span className="tabular-nums text-muted-foreground">{c.templateId}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      cell: (c) => <Badge variant={campaignStatusVariant(c.status)}>{campaignStatusLabel(c.status)}</Badge>,
    },
    {
      key: 'progress',
      header: 'Tiến độ',
      className: 'w-[200px]',
      cell: (c) => {
        const done = c.sentCount + c.failedCount + c.skippedCount
        const tone = c.failedCount > 0 ? 'warning' : c.status === 'completed' ? 'success' : 'primary'
        return (
          <div className="space-y-1">
            <ProgressBar value={done} total={c.totalCount} tone={tone} />
            <p className="text-xs text-muted-foreground tabular-nums">
              {c.sentCount}/{c.totalCount} đã gửi
              {c.failedCount > 0 && ` · ${c.failedCount} lỗi`}
            </p>
          </div>
        )
      },
    },
    {
      key: 'scheduledAt',
      header: 'Lên lịch',
      cell: (c) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {c.scheduledAt ? dayjs(c.scheduledAt).format('DD/MM/YYYY HH:mm') : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (c) => {
        const canStart = c.status === 'draft' || c.status === 'queued'
        const canCancel = c.status === 'running' || c.status === 'queued'
        return (
          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            {canStart && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleStart(c)}
                disabled={startMutation.isPending}
              >
                <Play className="h-4 w-4" /> Bắt đầu
              </Button>
            )}
            {canCancel && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleCancel(c)}
                disabled={cancelMutation.isPending}
              >
                <Ban className="h-4 w-4" /> Hủy
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chiến dịch ZNS"
        description="Gửi Zalo Notification Service hàng loạt theo mẫu đã duyệt."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Tạo chiến dịch
          </Button>
        }
      />

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns">Chiến dịch</TabsTrigger>
          <TabsTrigger value="templates">Mẫu ZNS</TabsTrigger>
        </TabsList>

        {/* ── Tab: Chiến dịch ─────────────────────────────────────────── */}
        <TabsContent value="campaigns" className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Tổng chiến dịch" value={stats.total} icon={Megaphone} />
            <StatCard label="Đang chạy" value={stats.running} icon={Loader2} tone="warning" />
            <StatCard label="Hoàn thành" value={stats.completed} icon={CheckCircle2} tone="success" />
            <StatCard label="Tổng đã gửi" value={stats.sent} icon={Send} tone="primary" />
          </div>

          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
                {Object.entries(CAMPAIGN_STATUS_LABELS).map(([v, label]) => (
                  <SelectItem key={v} value={v}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DataTable
            columns={columns}
            rows={campaigns ?? []}
            loading={isLoading}
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(`/zns-campaigns/${c.id}`)}
            emptyTitle={isError ? 'Không tải được dữ liệu' : 'Chưa có chiến dịch nào'}
          />
        </TabsContent>

        {/* ── Tab: Mẫu ZNS ────────────────────────────────────────────── */}
        <TabsContent value="templates">
          <ZnsTemplatesTab />
        </TabsContent>
      </Tabs>

      <CreateCampaignDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

// ── Tab Mẫu ZNS (chỉ đọc) ──────────────────────────────────────────
function ZnsTemplatesTab() {
  const accountsQuery = useOaAccounts()
  const [accountId, setAccountId] = useState('')

  // Chọn tài khoản đầu tiên khi có dữ liệu
  const effectiveAccountId = accountId || accountsQuery.data?.[0]?.id || ''
  const templatesQuery = useZnsTemplates(effectiveAccountId || undefined)

  const columns: Column<ZnsTemplate>[] = [
    {
      key: 'templateId',
      header: 'Mã mẫu',
      cell: (t) => <span className="tabular-nums text-muted-foreground">{t.templateId}</span>,
    },
    {
      key: 'name',
      header: 'Tên mẫu',
      cell: (t) => <span className="font-medium">{t.templateName}</span>,
    },
    {
      key: 'type',
      header: 'Loại',
      cell: (t) => (t.templateType ? <Badge variant="secondary">{t.templateType}</Badge> : '—'),
    },
    {
      key: 'params',
      header: 'Số tham số',
      align: 'right',
      cell: (t) => <span className="tabular-nums">{t.params?.length ?? 0}</span>,
    },
    {
      key: 'status',
      header: 'Trạng thái',
      cell: (t) => (
        <Badge variant={t.status === 'ENABLE' ? 'success' : t.status === 'DISABLE' ? 'destructive' : 'warning'}>
          {t.status}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={effectiveAccountId} onValueChange={setAccountId}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Chọn tài khoản Zalo OA" />
          </SelectTrigger>
          <SelectContent>
            {accountsQuery.data?.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.displayName || a.externalPageId || a.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Danh sách mẫu ZNS đã duyệt, đồng bộ từ Zalo OA.
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={templatesQuery.data ?? []}
        loading={templatesQuery.isLoading || accountsQuery.isLoading}
        rowKey={(t) => t.id}
        emptyTitle={
          !effectiveAccountId ? 'Chưa kết nối tài khoản OA nào' : 'Chưa có mẫu ZNS nào'
        }
      />
    </div>
  )
}
