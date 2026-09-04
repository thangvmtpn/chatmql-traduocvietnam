/**
 * promotions-admin-page.tsx — Quản trị ưu đãi & đối soát điểm.
 *
 * Port từ `order-ui-bridge.js` (openPromotionAdmin): danh sách + lọc, form
 * tạo/sửa trong dialog, gán/gỡ khách theo số điện thoại, bảng đối soát điểm.
 * Route nên đặt sau ProtectedRoute roles owner/admin/manager; ở đây vẫn ẩn nút
 * ghi cho vai trò khác để không hiện thao tác mà backend sẽ chặn 403.
 */
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import {
  Calculator, Loader2, Pencil, Plus, Save, Search, Tag, Trash2, UserPlus, Users, X,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import { DataTable, type Column } from '@/components/shared/data-table'
import { ErrorState, Loading } from '@/components/shared/feedback'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox, Textarea } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { apiError } from '@/lib/api-client'
import { cn, formatNumber } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'
import {
  usePromotions, useCreatePromotion, useUpdatePromotion, useDeletePromotion,
  usePromotionCustomers, useAssignPromotionCustomers, useUnassignPromotionCustomer,
  usePointsReconcile, canManagePromotions, emptyPromotionInput,
  PROMO_TYPES, PROMO_STATUS_LABELS, PROMO_SCOPE_LABELS, PROMO_CONDITION_FIELDS, promoStatusVariant,
  type Promotion, type PromotionInput, type PromotionType, type PromotionScope, type PromotionStatus,
  type PromotionCustomer, type PointsReconcileItem,
} from '@/hooks/use-promotions'

const STATUS_ALL = '__all__'

const vnd = (n: number | null | undefined) => `${formatNumber(n ?? 0)}đ`

function valueText(p: Promotion) {
  if (p.type === 'percent') return `${p.value}%${p.max_discount ? ` (tối đa ${vnd(p.max_discount)})` : ''}`
  if (p.type === 'amount') return vnd(p.value)
  if (p.type === 'freeship') return 'Miễn ship'
  return 'Tặng quà'
}

const fmtDate = (iso: string | null) => (iso ? dayjs(iso).format('DD/MM/YYYY HH:mm') : null)
const toLocalInput = (iso: string | null) => (iso ? dayjs(iso).format('YYYY-MM-DDTHH:mm') : '')

export function PromotionsAdminPage() {
  const role = useAuthStore((s) => s.user?.role)
  const canEdit = canManagePromotions(role)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quản trị ưu đãi"
        description="Tạo, sửa ưu đãi, gán khách hàng và đối soát điểm tích luỹ (dữ liệu từ CRM)."
      />
      {!canEdit && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          Chỉ chủ tài khoản, quản trị viên và quản lý mới được chỉnh sửa ưu đãi. Bạn đang ở chế độ xem.
        </p>
      )}
      <Tabs defaultValue="promotions">
        <TabsList>
          <TabsTrigger value="promotions">
            <Tag className="mr-1.5 h-4 w-4" /> Ưu đãi
          </TabsTrigger>
          <TabsTrigger value="points">
            <Calculator className="mr-1.5 h-4 w-4" /> Đối soát điểm
          </TabsTrigger>
        </TabsList>
        <TabsContent value="promotions">
          <PromotionsTab canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="points">
          <PointsReconcileTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ══════════════════════════ Tab: Ưu đãi ══════════════════════════

function PromotionsTab({ canEdit }: { canEdit: boolean }) {
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<string>(STATUS_ALL)
  useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const params = useMemo(
    () => ({ ...(status !== STATUS_ALL ? { status } : {}), ...(q ? { q } : {}) }),
    [status, q],
  )
  const { data, isLoading, isError, error } = usePromotions(params)
  const del = useDeletePromotion()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [customersOf, setCustomersOf] = useState<Promotion | null>(null)
  const [toDelete, setToDelete] = useState<Promotion | null>(null)

  const openCreate = () => { setEditing(null); setFormOpen(true) }
  const openEdit = (p: Promotion) => { setEditing(p); setFormOpen(true) }

  const handleDelete = () => {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => { toast.success('Đã xoá ưu đãi'); setToDelete(null) },
      onError: (err) => toast.error(apiError(err)),
    })
  }

  const columns: Column<Promotion>[] = [
    {
      key: 'name',
      header: 'Tên & mã',
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-medium">{p.name}</div>
          {p.code ? (
            <div className="font-mono text-xs text-primary">{p.code}</div>
          ) : (
            <div className="text-xs text-muted-foreground">tự động áp</div>
          )}
        </div>
      ),
    },
    { key: 'value', header: 'Loại / Giá trị', cell: (p) => <span className="whitespace-nowrap">{valueText(p)}</span> },
    {
      key: 'scope',
      header: 'Phạm vi',
      cell: (p) => (
        <span className="whitespace-nowrap">
          {PROMO_SCOPE_LABELS[p.scope]}
          {p.scope === 'customer' && (
            <span className="text-muted-foreground"> ({formatNumber(p.assigned_count)})</span>
          )}
        </span>
      ),
    },
    {
      key: 'valid',
      header: 'Hiệu lực',
      cell: (p) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {fmtDate(p.valid_from) ?? '—'} → {fmtDate(p.valid_to) ?? 'không hạn'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      cell: (p) => <Badge variant={promoStatusVariant(p.status)}>{PROMO_STATUS_LABELS[p.status] ?? p.status}</Badge>,
    },
    {
      key: 'used',
      header: 'Đã dùng',
      align: 'right',
      cell: (p) => `${formatNumber(p.used_count)}${p.max_uses ? ` / ${formatNumber(p.max_uses)}` : ''}`,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (p) => (
        <div className="flex justify-end gap-1">
          {p.scope === 'customer' && (
            <Button variant="outline" size="sm" onClick={() => setCustomersOf(p)} title="Khách được gán">
              <Users /> Khách
            </Button>
          )}
          {canEdit && (
            <>
              <Button variant="ghost" size="sm" onClick={() => openEdit(p)} title="Sửa">
                <Pencil />
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setToDelete(p)} title="Xoá">
                <Trash2 />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên hoặc mã..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={STATUS_ALL}>Tất cả trạng thái</SelectItem>
            {(Object.keys(PROMO_STATUS_LABELS) as PromotionStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{PROMO_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canEdit && (
          <Button className="ml-auto" onClick={openCreate}>
            <Plus /> Tạo ưu đãi
          </Button>
        )}
      </div>

      {isError ? (
        <ErrorState message={apiError(error)} />
      ) : (
        <DataTable
          columns={columns}
          rows={data?.promotions ?? []}
          rowKey={(p) => String(p.id)}
          loading={isLoading}
          emptyTitle={q || status !== STATUS_ALL ? 'Không có ưu đãi nào khớp bộ lọc' : 'Chưa có ưu đãi nào'}
        />
      )}
      {data && (
        <p className="text-xs text-muted-foreground">Tổng {formatNumber(data.total ?? data.promotions.length)} ưu đãi</p>
      )}

      <PromotionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
      />
      <PromotionCustomersDialog
        promotion={customersOf}
        onClose={() => setCustomersOf(null)}
        canEdit={canEdit}
      />

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Xoá ưu đãi?</DialogTitle>
            <DialogDescription>
              Xoá "{toDelete?.name}". Thao tác này không hoàn tác được.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>Hủy</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={del.isPending}>
              {del.isPending && <Loader2 className="animate-spin" />} Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Form tạo / sửa ─────────────────────────────────────────────────

type CondValues = Record<string, string | boolean>

function condToValues(c: Record<string, unknown> | null | undefined): CondValues {
  const out: CondValues = {}
  for (const f of PROMO_CONDITION_FIELDS) {
    const v = c?.[f.key]
    if (f.type === 'bool') out[f.key] = !!v
    else if (Array.isArray(v)) out[f.key] = v.join(', ')
    else out[f.key] = v == null ? '' : String(v)
  }
  return out
}

function valuesToCond(values: CondValues): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of PROMO_CONDITION_FIELDS) {
    const v = values[f.key]
    if (f.type === 'bool') { if (v === true) out[f.key] = true }
    else if (f.type === 'number') {
      const n = Number(v)
      if (v !== '' && Number.isFinite(n) && n > 0) out[f.key] = n
    } else {
      const arr = String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean)
      if (arr.length) out[f.key] = arr
    }
  }
  return out
}

function PromotionFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editing: Promotion | null
}) {
  const create = useCreatePromotion()
  const update = useUpdatePromotion()
  const pending = create.isPending || update.isPending

  const [form, setForm] = useState<PromotionInput>(emptyPromotionInput())
  const [valueStr, setValueStr] = useState('0')
  const [maxDiscountStr, setMaxDiscountStr] = useState('')
  const [minOrderStr, setMinOrderStr] = useState('0')
  const [maxUsesStr, setMaxUsesStr] = useState('')
  const [fromStr, setFromStr] = useState('')
  const [toStr, setToStr] = useState('')
  const [cond, setCond] = useState<CondValues>(condToValues({}))

  // Nạp lại form mỗi lần mở (theo bản ghi đang sửa hoặc trống).
  useEffect(() => {
    if (!open) return
    const base: PromotionInput = editing
      ? {
          code: editing.code, name: editing.name, description: editing.description, type: editing.type,
          value: editing.value, max_discount: editing.max_discount, min_order: editing.min_order,
          scope: editing.scope, conditions: editing.conditions ?? {}, valid_from: editing.valid_from,
          valid_to: editing.valid_to, status: editing.status, max_uses: editing.max_uses,
        }
      : emptyPromotionInput()
    setForm(base)
    setValueStr(String(base.value ?? 0))
    setMaxDiscountStr(base.max_discount == null ? '' : String(base.max_discount))
    setMinOrderStr(String(base.min_order ?? 0))
    setMaxUsesStr(base.max_uses == null ? '' : String(base.max_uses))
    setFromStr(toLocalInput(base.valid_from))
    setToStr(toLocalInput(base.valid_to))
    setCond(condToValues(base.conditions))
  }, [open, editing])

  const set = <K extends keyof PromotionInput>(k: K, v: PromotionInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const typeMeta = PROMO_TYPES.find((t) => t.id === form.type)
  const hasValue = form.type === 'percent' || form.type === 'amount'

  const num = (s: string): number | null => {
    if (s.trim() === '') return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }

  const submit = () => {
    const name = form.name.trim()
    if (!name) return toast.error('Chưa nhập tên ưu đãi')
    const body: PromotionInput = {
      code: (form.code ?? '').trim().toUpperCase() || null,
      name,
      description: (form.description ?? '').trim() || null,
      type: form.type,
      value: hasValue ? (num(valueStr) ?? 0) : 0,
      max_discount: form.type === 'percent' ? num(maxDiscountStr) : null,
      min_order: num(minOrderStr) ?? 0,
      scope: form.scope,
      conditions: valuesToCond(cond),
      valid_from: fromStr ? new Date(fromStr).toISOString() : null,
      valid_to: toStr ? new Date(toStr).toISOString() : null,
      status: form.status,
      max_uses: num(maxUsesStr),
    }
    const onError = (err: unknown) => toast.error(apiError(err))
    if (editing) {
      update.mutate(
        { id: editing.id, body },
        { onSuccess: () => { toast.success('Đã lưu ưu đãi'); onOpenChange(false) }, onError },
      )
    } else {
      create.mutate(body, {
        onSuccess: () => { toast.success('Đã tạo ưu đãi'); onOpenChange(false) },
        onError,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Sửa: ${editing.name}` : 'Tạo ưu đãi mới'}</DialogTitle>
          <DialogDescription>Ưu đãi ảnh hưởng trực tiếp tới doanh thu — kiểm tra kỹ trước khi lưu.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pf-name">Tên ưu đãi *</Label>
            <Input id="pf-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="VD: Giảm 10% cho khách VIP" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pf-desc">Mô tả</Label>
            <Input id="pf-desc" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Hiện cho nhân viên xem" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-code">Mã ưu đãi</Label>
            <Input id="pf-code" value={form.code ?? ''} onChange={(e) => set('code', e.target.value)} placeholder="Bỏ trống = tự động áp" className="uppercase" />
          </div>
          <div className="space-y-1.5">
            <Label>Phạm vi *</Label>
            <Select value={form.scope} onValueChange={(v) => set('scope', v as PromotionScope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="system">Toàn hệ thống — khách nào cũng dùng</SelectItem>
                <SelectItem value="customer">Riêng khách — phải gán từng người</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Loại ưu đãi *</Label>
            <Select value={form.type} onValueChange={(v) => set('type', v as PromotionType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROMO_TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {typeMeta && <p className="text-xs text-muted-foreground">{typeMeta.hint}</p>}
          </div>
          {hasValue && (
            <div className="space-y-1.5">
              <Label htmlFor="pf-value">{form.type === 'percent' ? 'Phần trăm giảm (%) *' : 'Số tiền giảm (đ) *'}</Label>
              <Input id="pf-value" type="number" min={0} value={valueStr} onChange={(e) => setValueStr(e.target.value)} />
            </div>
          )}
          {form.type === 'percent' && (
            <div className="space-y-1.5">
              <Label htmlFor="pf-max">Giảm tối đa (đ)</Label>
              <Input id="pf-max" type="number" min={0} value={maxDiscountStr} onChange={(e) => setMaxDiscountStr(e.target.value)} placeholder="Bỏ trống = không giới hạn" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="pf-min">Đơn tối thiểu (đ)</Label>
            <Input id="pf-min" type="number" min={0} value={minOrderStr} onChange={(e) => setMinOrderStr(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-from">Từ ngày</Label>
            <Input id="pf-from" type="datetime-local" value={fromStr} onChange={(e) => setFromStr(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-to">Đến ngày</Label>
            <Input id="pf-to" type="datetime-local" value={toStr} onChange={(e) => setToStr(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Trạng thái *</Label>
            <Select value={form.status} onValueChange={(v) => set('status', v as PromotionStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PROMO_STATUS_LABELS) as PromotionStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{PROMO_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-uses">Giới hạn lượt dùng</Label>
            <Input id="pf-uses" type="number" min={1} value={maxUsesStr} onChange={(e) => setMaxUsesStr(e.target.value)} placeholder="Bỏ trống = không giới hạn" />
          </div>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div>
            <p className="text-sm font-semibold">Điều kiện áp dụng</p>
            <p className="text-xs text-muted-foreground">
              Bỏ trống nghĩa là không ràng buộc. Khách phải thoả <b>tất cả</b> điều kiện đã điền.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {PROMO_CONDITION_FIELDS.map((f) =>
              f.type === 'bool' ? (
                <label key={f.key} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={cond[f.key] === true}
                    onCheckedChange={(v) => setCond((c) => ({ ...c, [f.key]: v === true }))}
                  />
                  {f.label}
                </label>
              ) : (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`pf-c-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`pf-c-${f.key}`}
                    type={f.type}
                    value={String(cond[f.key] ?? '')}
                    onChange={(e) => setCond((c) => ({ ...c, [f.key]: e.target.value }))}
                  />
                </div>
              ),
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Hủy</Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            {editing ? 'Lưu thay đổi' : 'Tạo ưu đãi'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Khách được gán ─────────────────────────────────────────────────

function PromotionCustomersDialog({
  promotion,
  onClose,
  canEdit,
}: {
  promotion: Promotion | null
  onClose: () => void
  canEdit: boolean
}) {
  const id = promotion?.id ?? null
  const { data, isLoading, isError, error } = usePromotionCustomers(id)
  const assign = useAssignPromotionCustomers()
  const unassign = useUnassignPromotionCustomer()
  const [phonesText, setPhonesText] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => { if (!promotion) setPhonesText('') }, [promotion])

  const handleAdd = () => {
    if (id == null) return
    const phones = phonesText.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)
    if (!phones.length) return toast.error('Chưa nhập số điện thoại nào')
    assign.mutate(
      { id, phones },
      {
        onSuccess: (res) => {
          setPhonesText('')
          if (res.not_in_crm?.length) {
            toast.warning(`${res.message} — ${res.not_in_crm.length} số chưa có trong CRM: ${res.not_in_crm.join(', ')}`)
          } else {
            toast.success(res.message || `Đã gán ${res.added} khách`)
          }
        },
        onError: (err) => toast.error(apiError(err)),
      },
    )
  }

  const handleRemove = (phone: string) => {
    if (id == null) return
    setRemoving(phone)
    unassign.mutate(
      { id, phone },
      {
        onSuccess: () => toast.success('Đã gỡ ưu đãi khỏi khách'),
        onError: (err) => toast.error(apiError(err)),
        onSettled: () => setRemoving(null),
      },
    )
  }

  const columns: Column<PromotionCustomer>[] = [
    { key: 'phone', header: 'Số điện thoại', cell: (c) => <span className="font-mono">{c.phone}</span> },
    {
      key: 'name',
      header: 'Tên khách',
      cell: (c) => c.name ? c.name : <span className="text-muted-foreground">Chưa có trong CRM</span>,
    },
    { key: 'code', header: 'Mã KH', cell: (c) => <span className="text-muted-foreground">{c.customer_code || '—'}</span> },
    {
      key: 'used',
      header: 'Đã dùng',
      cell: (c) => (
        <Badge variant={c.used ? 'secondary' : 'success'}>{c.used ? 'Đã dùng' : 'Chưa dùng'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (c) =>
        canEdit ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={removing === c.phone}
            onClick={() => handleRemove(c.phone)}
          >
            {removing === c.phone ? <Loader2 className="animate-spin" /> : <X />} Gỡ
          </Button>
        ) : null,
    },
  ]

  return (
    <Dialog open={!!promotion} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Khách được gán: {promotion?.name}</DialogTitle>
          <DialogDescription>Ưu đãi riêng — chỉ khách trong danh sách dưới đây dùng được.</DialogDescription>
        </DialogHeader>

        {canEdit && (
          <div className="space-y-2">
            <Label htmlFor="pc-phones">Thêm khách (mỗi số một dòng, hoặc cách nhau dấu phẩy)</Label>
            <Textarea
              id="pc-phones"
              rows={3}
              value={phonesText}
              onChange={(e) => setPhonesText(e.target.value)}
              placeholder={'0912345678\n0987654321'}
            />
            <Button size="sm" onClick={handleAdd} disabled={assign.isPending}>
              {assign.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />} Gán ưu đãi
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-semibold">Đã gán ({formatNumber(data?.customers.length ?? 0)})</p>
          {isError ? (
            <ErrorState message={apiError(error)} />
          ) : (
            <DataTable
              columns={columns}
              rows={data?.customers ?? []}
              rowKey={(c) => c.phone}
              loading={isLoading}
              emptyTitle="Chưa gán cho khách nào"
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════ Tab: Đối soát điểm ══════════════════════════

function PointsReconcileTab() {
  const { data, isLoading, isError, error } = usePointsReconcile({ limit: 200 })

  if (isLoading) return <Loading label="Đang đối soát điểm..." />
  if (isError || !data) return <ErrorState message={apiError(error) || 'Không tải được dữ liệu đối soát.'} />

  const s = data.summary
  const columns: Column<PointsReconcileItem>[] = [
    { key: 'phone', header: 'Số điện thoại', cell: (i) => <span className="font-mono">{i.phone}</span> },
    {
      key: 'name',
      header: 'Tên khách',
      cell: (i) => i.name ? i.name : <span className="text-muted-foreground">Chưa có trong CRM</span>,
    },
    { key: 'code', header: 'Mã KH', cell: (i) => <span className="text-muted-foreground">{i.customer_code || '—'}</span> },
    { key: 'ledger', header: 'Sổ cái', align: 'right', cell: (i) => formatNumber(i.ledger_balance) },
    { key: 'computed', header: 'Cộng dồn', align: 'right', cell: (i) => formatNumber(i.computed_balance) },
    {
      key: 'gap',
      header: 'Lệch',
      align: 'right',
      cell: (i) => (
        <span className={cn('font-semibold', Math.abs(i.gap) >= 50 ? 'text-destructive' : 'text-warning')}>
          {i.gap > 0 ? '+' : ''}{formatNumber(i.gap)}
        </span>
      ),
    },
    { key: 'entries', header: 'Giao dịch', align: 'right', cell: (i) => <span className="text-muted-foreground">{formatNumber(i.entry_count)}</span> },
    {
      key: 'last',
      header: 'Giao dịch cuối',
      cell: (i) => <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(i.last_entry_at) ?? '—'}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm leading-relaxed">
        Số dư điểm được tính bằng hai cách và đang lệch nhau ở một số khách: <b>sổ cái</b> là cột số dư
        CRM tự giữ sau mỗi giao dịch, <b>cộng dồn</b> là tổng tất cả giao dịch. Khách nào lệch nghĩa là
        sổ cái có lỗi — chưa nên dùng điểm của họ để trừ tiền cho tới khi kế toán xác nhận con số đúng.
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Khách có điểm" value={s.customers_with_points} icon={Users} />
        <StatCard label="Khớp" value={s.matched} tone="success" />
        <StatCard label="Lệch" value={s.mismatched} tone="warning" />
        <StatCard label="Tổng chênh" value={`${formatNumber(s.total_gap)} điểm`} tone="destructive" />
      </div>

      {!data.items.length ? (
        <p className="py-8 text-center text-sm text-success">Toàn bộ sổ cái điểm đều khớp.</p>
      ) : (
        <>
          <DataTable columns={columns} rows={data.items} rowKey={(i) => i.phone} />
          <p className="text-xs text-muted-foreground">
            Hiện {formatNumber(data.returned)}/{formatNumber(s.mismatched)} khách, sắp xếp theo mức lệch giảm dần.
          </p>
        </>
      )}
    </div>
  )
}
