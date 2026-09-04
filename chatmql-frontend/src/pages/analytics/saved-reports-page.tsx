import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Play, Trash2, ArrowLeft, FileBarChart } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { DataTable, type Column } from '@/components/shared/data-table'
import { ErrorState } from '@/components/shared/feedback'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { apiError } from '@/lib/api-client'
import {
  RANGE_OPTIONS,
  type RangeKey,
  rangeToParams,
  useSavedReports,
  useCreateSavedReport,
  useDeleteSavedReport,
  useRunSavedReport,
  type SavedReport,
  type RunReportResult,
} from '@/hooks/use-analytics'

// Loại báo cáo có runner ở backend.
const REPORT_TYPES: { value: string; label: string }[] = [
  { value: 'kpi-summary', label: 'Tổng hợp KPI' },
  { value: 'conversion-funnel', label: 'Phễu chuyển đổi' },
  { value: 'team-leaderboard', label: 'Hiệu suất đội ngũ' },
]

function typeLabel(type: string): string {
  return REPORT_TYPES.find((t) => t.value === type)?.label ?? type
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

// ── Dialog tạo báo cáo ──────────────────────────────────────────────
function CreateReportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('kpi-summary')
  const [range, setRange] = useState<RangeKey>('30d')
  const create = useCreateSavedReport()

  function reset() {
    setName('')
    setType('kpi-summary')
    setRange('30d')
  }

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Vui lòng nhập tên báo cáo')
      return
    }
    create.mutate(
      { name: trimmed, type, config: rangeToParams(range) },
      {
        onSuccess: () => {
          toast.success('Đã tạo báo cáo')
          reset()
          onOpenChange(false)
        },
        onError: (err) => toast.error(apiError(err)),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tạo báo cáo mới</DialogTitle>
          <DialogDescription>Lưu cấu hình báo cáo để chạy lại bất cứ lúc nào.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="report-name">Tên báo cáo</Label>
            <Input
              id="report-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: KPI tháng này"
            />
          </div>

          <div className="space-y-2">
            <Label>Loại báo cáo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Khoảng thời gian</Label>
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'Đang lưu...' : 'Tạo báo cáo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Dialog kết quả chạy ─────────────────────────────────────────────
function RunResultDialog({
  result,
  onClose,
}: {
  result: RunReportResult | null
  onClose: () => void
}) {
  const entries =
    result && result.data && typeof result.data === 'object'
      ? Object.entries(result.data as Record<string, unknown>)
      : []

  return (
    <Dialog open={!!result} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kết quả: {result ? typeLabel(result.type) : ''}</DialogTitle>
          <DialogDescription>Chạy lúc {formatDateTime(result?.ranAt)}</DialogDescription>
        </DialogHeader>

        {result?.note ? (
          <p className="text-sm text-muted-foreground">{result.note}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có dữ liệu.</p>
        ) : (
          <div className="rounded-lg border">
            <dl className="divide-y">
              {entries.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium tabular-nums">
                    {typeof v === 'object' ? (
                      <pre className="max-w-[16rem] overflow-x-auto text-xs">{JSON.stringify(v)}</pre>
                    ) : (
                      String(v)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Trang chính ─────────────────────────────────────────────────────
export function SavedReportsPage() {
  const { data, isLoading, isError } = useSavedReports()
  const del = useDeleteSavedReport()
  const run = useRunSavedReport()
  const [createOpen, setCreateOpen] = useState(false)
  const [runResult, setRunResult] = useState<RunReportResult | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)

  const reports = data?.data ?? []

  function handleRun(r: SavedReport) {
    setRunningId(r.id)
    run.mutate(r.id, {
      onSuccess: (res) => setRunResult(res),
      onError: (err) => toast.error(apiError(err)),
      onSettled: () => setRunningId(null),
    })
  }

  function handleDelete(r: SavedReport) {
    if (!window.confirm(`Xóa báo cáo "${r.name}"?`)) return
    del.mutate(r.id, {
      onSuccess: () => toast.success('Đã xóa báo cáo'),
      onError: (err) => toast.error(apiError(err)),
    })
  }

  const columns: Column<SavedReport>[] = [
    { key: 'name', header: 'Tên báo cáo', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'type', header: 'Loại', cell: (r) => <Badge variant="secondary">{typeLabel(r.type)}</Badge> },
    { key: 'created', header: 'Ngày tạo', cell: (r) => formatDateTime(r.createdAt) },
    { key: 'lastRun', header: 'Chạy gần nhất', cell: (r) => formatDateTime(r.lastRunAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleRun(r)}
            disabled={run.isPending && runningId === r.id}
          >
            <Play className="h-4 w-4" />
            {run.isPending && runningId === r.id ? 'Đang chạy...' : 'Chạy'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDelete(r)}
            aria-label="Xóa báo cáo"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Báo cáo đã lưu"
        description="Lưu và chạy lại các báo cáo phân tích."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/analytics">
                <ArrowLeft className="h-4 w-4" />
                Về Phân tích
              </Link>
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Tạo báo cáo
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6">
          {isError ? (
            <ErrorState />
          ) : (
            <DataTable
              columns={columns}
              rows={reports}
              loading={isLoading}
              rowKey={(r) => r.id}
              emptyTitle="Chưa có báo cáo nào"
            />
          )}
        </CardContent>
      </Card>

      {reports.length === 0 && !isLoading && !isError && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <FileBarChart className="h-4 w-4" />
          Nhấn "Tạo báo cáo" để bắt đầu.
        </p>
      )}

      <CreateReportDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RunResultDialog result={runResult} onClose={() => setRunResult(null)} />
    </div>
  )
}
