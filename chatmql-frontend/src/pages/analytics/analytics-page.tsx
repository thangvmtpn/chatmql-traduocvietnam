import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  UserCheck,
  MessageSquare,
  MessagesSquare,
  Percent,
  Clock,
  BookMarked,
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { DataTable, type Column } from '@/components/shared/data-table'
import { Loading, EmptyState, ErrorState } from '@/components/shared/feedback'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatNumber } from '@/lib/utils'
import {
  RANGE_OPTIONS,
  type RangeKey,
  useKpiSummary,
  useConversionFunnel,
  useResponseTime,
  useTeamPerformance,
  useMessageVolume,
  useSources,
  formatSeconds,
  type TeamMember,
} from '@/hooks/use-analytics'

// Bảng màu lấy từ token CSS (KHÔNG hardcode hex trong logic màu).
const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(var(--primary) / 0.55)',
  'hsl(var(--muted-foreground))',
]

const axisStyle = { fontSize: 12, fill: 'hsl(var(--muted-foreground))' } as const
const gridStroke = 'hsl(var(--border))'

/** Tooltip theo token, tránh nền trắng cứng. */
const tooltipStyle = {
  contentStyle: {
    background: 'hsl(var(--popover))',
    border: '1px solid hsl(var(--border))',
    borderRadius: 8,
    fontSize: 12,
    color: 'hsl(var(--popover-foreground))',
  },
  labelStyle: { color: 'hsl(var(--foreground))', fontWeight: 600 },
} as const

function ChartCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// ── Tab: Tổng quan ──────────────────────────────────────────────────
function OverviewTab({ range }: { range: RangeKey }) {
  const kpi = useKpiSummary(range)
  const volume = useMessageVolume()
  const sources = useSources()

  const sourceData =
    sources.data?.map((s) => ({ name: s.source, value: s._count._all })) ?? []
  const hasSources = sourceData.some((s) => s.value > 0)

  return (
    <div className="space-y-6">
      {kpi.isError ? (
        <ErrorState />
      ) : kpi.isLoading || !kpi.data ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Khách hàng mới" value={kpi.data.totalContacts} icon={Users} hint="Trong kỳ" />
          <StatCard
            label="Đã chuyển đổi"
            value={kpi.data.convertedContacts}
            icon={UserCheck}
            tone="success"
          />
          <StatCard
            label="Tỷ lệ chuyển đổi"
            value={`${kpi.data.conversionRate}%`}
            icon={Percent}
            tone="warning"
          />
          <StatCard label="Tin nhắn" value={kpi.data.totalMessages} icon={MessageSquare} />
          <StatCard
            label="Hội thoại"
            value={kpi.data.totalConversations}
            icon={MessagesSquare}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Lưu lượng tin nhắn" description="7 ngày gần nhất (gửi đi / nhận về)">
            {volume.isLoading || !volume.data ? (
              <Loading />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={volume.data.data} margin={{ left: -16, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gRecv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} />
                  <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="sent"
                    name="Gửi đi"
                    stroke="hsl(var(--primary))"
                    fill="url(#gSent)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="received"
                    name="Nhận về"
                    stroke="hsl(var(--success))"
                    fill="url(#gRecv)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        <ChartCard title="Nguồn khách hàng" description="Phân bổ theo nguồn">
          {sources.isLoading || !sources.data ? (
            <Loading />
          ) : !hasSources ? (
            <EmptyState title="Chưa có dữ liệu nguồn" />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={sourceData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {sourceData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

// ── Tab: Phễu chuyển đổi ────────────────────────────────────────────
function FunnelTab({ range }: { range: RangeKey }) {
  const { data, isLoading, isError } = useConversionFunnel(range)

  if (isError) return <ErrorState />
  if (isLoading || !data) return <Loading />

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tổng liên hệ" value={data.totalContacts} icon={Users} />
        <StatCard label="Đã chuyển đổi" value={data.totalConverted} icon={UserCheck} tone="success" />
        <StatCard label="Tỷ lệ chuyển đổi" value={`${data.conversionRate}%`} icon={Percent} tone="warning" />
        <StatCard
          label="TG chuyển đổi TB"
          value={data.avgConversionDays != null ? `${data.avgConversionDays} ngày` : '—'}
          icon={Clock}
        />
      </div>

      <ChartCard title="Phễu chuyển đổi" description="Số liên hệ tích lũy theo từng giai đoạn">
        {data.stages.every((s) => s.count === 0) ? (
          <EmptyState title="Chưa có dữ liệu phễu" />
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={data.stages} layout="vertical" margin={{ left: 24, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
              <XAxis type="number" tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                tick={axisStyle}
                tickLine={false}
                axisLine={false}
                width={90}
              />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [formatNumber(v), 'Số liên hệ']} />
              <Bar dataKey="count" name="Số liên hệ" radius={[0, 6, 6, 0]}>
                {data.stages.map((s, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}

// ── Tab: Thời gian phản hồi ─────────────────────────────────────────
function ResponseTimeTab({ range }: { range: RangeKey }) {
  const { data, isLoading, isError } = useResponseTime(range)

  if (isError) return <ErrorState />
  if (isLoading || !data) return <Loading />

  const byUser = data.byUser.filter((u) => u.avgSeconds != null)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Phản hồi TB (tổng)" value={formatSeconds(data.overall)} icon={Clock} tone="success" />
        <StatCard label="Số ngày có dữ liệu" value={data.daily.length} icon={MessageSquare} />
        <StatCard label="Nhân viên có số liệu" value={byUser.length} icon={Users} />
      </div>

      <ChartCard title="Thời gian phản hồi theo ngày" description="Trung bình (giây) mỗi ngày">
        {data.daily.length === 0 ? (
          <EmptyState title="Chưa có dữ liệu phản hồi" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.daily} margin={{ left: -8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [formatSeconds(v), 'Phản hồi TB']} />
              <Line
                type="monotone"
                dataKey="avgSeconds"
                name="Phản hồi TB"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3, fill: 'hsl(var(--primary))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Thời gian phản hồi theo nhân viên" description="Trung bình (giây)">
        {byUser.length === 0 ? (
          <EmptyState title="Chưa có dữ liệu theo nhân viên" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byUser} margin={{ left: -8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="fullName" tick={axisStyle} tickLine={false} axisLine={false} />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => [formatSeconds(v), 'Phản hồi TB']} />
              <Bar dataKey="avgSeconds" name="Phản hồi TB" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}

// ── Tab: Hiệu suất nhân viên ────────────────────────────────────────
function TeamTab({ range }: { range: RangeKey }) {
  const { data, isLoading, isError } = useTeamPerformance(range)

  if (isError) return <ErrorState />
  if (isLoading || !data) return <Loading />

  const rows = data.users
  const columns: Column<TeamMember>[] = [
    { key: 'name', header: 'Nhân viên', cell: (r) => <span className="font-medium">{r.fullName}</span> },
    { key: 'msg', header: 'Tin nhắn đã gửi', align: 'right', cell: (r) => formatNumber(r.messagesSent) },
    { key: 'conv', header: 'KH chuyển đổi', align: 'right', cell: (r) => formatNumber(r.contactsConverted) },
    {
      key: 'appt',
      header: 'Lịch hẹn hoàn tất',
      align: 'right',
      cell: (r) => formatNumber(r.appointmentsCompleted),
    },
    {
      key: 'rt',
      header: 'Phản hồi TB',
      align: 'right',
      cell: (r) => formatSeconds(r.avgResponseTime),
    },
  ]

  return (
    <div className="space-y-6">
      <ChartCard title="Tin nhắn đã gửi theo nhân viên" description="Xếp hạng theo sản lượng">
        {rows.length === 0 || rows.every((r) => r.messagesSent === 0) ? (
          <EmptyState title="Chưa có dữ liệu hiệu suất" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={rows} margin={{ left: -8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="fullName" tick={axisStyle} tickLine={false} axisLine={false} />
              <YAxis tick={axisStyle} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="messagesSent"
                name="Tin nhắn"
                fill="hsl(var(--primary))"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                dataKey="contactsConverted"
                name="KH chuyển đổi"
                fill="hsl(var(--success))"
                radius={[6, 6, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <Card>
        <CardHeader>
          <CardTitle>Bảng hiệu suất</CardTitle>
          <CardDescription>Chi tiết từng nhân viên trong kỳ</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(r) => r.userId}
            emptyTitle="Chưa có nhân viên nào"
          />
        </CardContent>
      </Card>
    </div>
  )
}

// ── Trang chính ─────────────────────────────────────────────────────
export function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>('30d')

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phân tích"
        description="Chỉ số, phễu chuyển đổi, thời gian phản hồi và hiệu suất đội ngũ."
        actions={
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger className="w-40">
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
            <Button variant="outline" asChild>
              <Link to="/analytics/saved-reports">
                <BookMarked className="h-4 w-4" />
                Báo cáo đã lưu
              </Link>
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Tổng quan</TabsTrigger>
          <TabsTrigger value="funnel">Phễu chuyển đổi</TabsTrigger>
          <TabsTrigger value="response">Thời gian phản hồi</TabsTrigger>
          <TabsTrigger value="team">Hiệu suất nhân viên</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab range={range} />
        </TabsContent>
        <TabsContent value="funnel">
          <FunnelTab range={range} />
        </TabsContent>
        <TabsContent value="response">
          <ResponseTimeTab range={range} />
        </TabsContent>
        <TabsContent value="team">
          <TeamTab range={range} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
