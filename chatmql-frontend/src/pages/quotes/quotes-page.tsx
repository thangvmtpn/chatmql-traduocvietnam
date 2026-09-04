import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plus, Trash2, Copy, ExternalLink, X } from 'lucide-react'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/page-header'
import { DataTable, type Column } from '@/components/shared/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/misc'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatNumber } from '@/lib/utils'
import { useContacts, type ContactListItem } from '@/hooks/use-contacts'
import {
  useQuotes,
  useSaveQuote,
  useDeleteQuote,
  useProducts,
  lineTotal,
  quoteTotal,
  quoteStatusVariant,
  quoteError,
  QUOTE_STATUS_LABELS,
  EDITABLE_STATUSES,
  type Quote,
  type QuoteLine,
  type QuoteStatus,
} from '@/hooks/use-quotes'

const NONE = '__none__'

function newLine(): QuoteLine {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    productId: null,
    name: '',
    quantity: 1,
    unitPrice: 0,
  }
}

function publicUrl(token: string): string {
  return `${window.location.origin}/q/${token}`
}

export function QuotesPage() {
  const { data: quotes = [], isLoading } = useQuotes()
  const deleteQuote = useDeleteQuote()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Quote | null>(null)

  const openCreate = () => {
    setEditing(null)
    setOpen(true)
  }
  const openEdit = (q: Quote) => {
    setEditing(q)
    setOpen(true)
  }

  const copyLink = async (token: string) => {
    if (!token) {
      toast.error('Báo giá chưa có link công khai')
      return
    }
    try {
      await navigator.clipboard.writeText(publicUrl(token))
      toast.success('Đã sao chép link báo giá công khai')
    } catch {
      toast.error('Không sao chép được, hãy copy thủ công')
    }
  }

  const onDelete = (q: Quote) => {
    if (!window.confirm(`Xóa báo giá "${q.code}"?`)) return
    deleteQuote.mutate(q.id, {
      onSuccess: () => toast.success('Đã xóa báo giá'),
      onError: (e) => toast.error(quoteError(e)),
    })
  }

  const columns: Column<Quote>[] = [
    {
      key: 'code',
      header: 'Mã / Tiêu đề',
      cell: (q) => (
        <div className="min-w-0">
          <p className="font-medium">{q.code}</p>
          <p className="truncate text-xs text-muted-foreground">{q.title || 'Không có tiêu đề'}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Khách hàng',
      cell: (q) => (
        <div className="min-w-0">
          <p className="truncate">{q.customerName || '—'}</p>
          {q.customerPhone && (
            <p className="truncate text-xs text-muted-foreground">{q.customerPhone}</p>
          )}
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Số dòng',
      align: 'right',
      cell: (q) => <span>{q.lines.length}</span>,
    },
    {
      key: 'total',
      header: 'Tổng tiền',
      align: 'right',
      cell: (q) => (
        <span className="font-semibold">
          {formatNumber(q.total || quoteTotal(q.lines))} {q.currency}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Trạng thái',
      cell: (q) => (
        <Badge variant={quoteStatusVariant(q.status)}>{QUOTE_STATUS_LABELS[q.status]}</Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Ngày tạo',
      cell: (q) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {dayjs(q.createdAt).format('DD/MM/YYYY')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (q) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="Sao chép link công khai"
            onClick={(e) => {
              e.stopPropagation()
              copyLink(q.token)
            }}
          >
            <Copy />
          </Button>
          {/* Trang công khai chỉ mở được sau khi gửi (backend trả 404 với bản nháp) */}
          {q.token && q.status !== 'draft' && (
            <Button variant="ghost" size="icon" title="Xem báo giá công khai" asChild>
              <Link to={`/q/${q.token}`} target="_blank" onClick={(e) => e.stopPropagation()}>
                <ExternalLink />
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            title="Xóa"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(q)
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Báo giá"
        description="Tạo báo giá cho khách hàng và chia sẻ link công khai."
        actions={
          <Button onClick={openCreate}>
            <Plus /> Tạo báo giá
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={quotes}
        loading={isLoading}
        rowKey={(q) => q.id}
        onRowClick={openEdit}
        emptyTitle="Chưa có báo giá nào"
      />

      <QuoteFormDialog
        open={open}
        onOpenChange={setOpen}
        quote={editing}
        onSaved={(q, isNew) => {
          setOpen(false)
          if (isNew && q.status !== 'draft') {
            copyLink(q.token)
          } else {
            toast.success(isNew ? 'Đã tạo báo giá (nháp)' : 'Đã lưu báo giá')
          }
        }}
      />
    </div>
  )
}

// ── Dialog tạo / sửa báo giá ─────────────────────────────────────────
function QuoteFormDialog({
  open,
  onOpenChange,
  quote,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  quote: Quote | null
  onSaved: (quote: Quote, isNew: boolean) => void
}) {
  const saveQuote = useSaveQuote()
  const { data: contactsData } = useContacts({ page: 1, limit: 100 })
  const { data: productsData } = useProducts({ page: 1, pageSize: 100, status: 'active' })

  const contacts = contactsData?.contacts ?? []
  const products = productsData?.data ?? []

  const [title, setTitle] = useState('')
  const [customerId, setCustomerId] = useState<string>(NONE)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<QuoteStatus>('draft')
  const [lines, setLines] = useState<QuoteLine[]>([newLine()])

  // Nạp dữ liệu khi mở dialog
  useEffect(() => {
    if (!open) return
    if (quote) {
      setTitle(quote.title)
      setCustomerId(quote.customerId ?? NONE)
      setCustomerName(quote.customerName)
      setCustomerPhone(quote.customerPhone ?? '')
      setCustomerEmail(quote.customerEmail ?? '')
      setNote(quote.note ?? '')
      setStatus(quote.status)
      setLines(quote.lines.length ? quote.lines : [newLine()])
    } else {
      setTitle('')
      setCustomerId(NONE)
      setCustomerName('')
      setCustomerPhone('')
      setCustomerEmail('')
      setNote('')
      setStatus('draft')
      setLines([newLine()])
    }
  }, [open, quote])

  const onPickCustomer = (id: string) => {
    setCustomerId(id)
    if (id === NONE) return
    const c: ContactListItem | undefined = contacts.find((x) => x.id === id)
    if (c) {
      setCustomerName(c.crmName || c.fullName || '')
      setCustomerPhone(c.phone ?? '')
      setCustomerEmail(c.email ?? '')
    }
  }

  const updateLine = (id: string, patch: Partial<QuoteLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  const onPickProduct = (lineId: string, productId: string) => {
    if (productId === NONE) {
      updateLine(lineId, { productId: null })
      return
    }
    const p = products.find((x) => x.id === productId)
    if (p) {
      updateLine(lineId, {
        productId: p.id,
        name: p.name,
        unitPrice: p.price ?? 0,
      })
    }
  }

  const addLine = () => setLines((prev) => [...prev, newLine()])
  const removeLine = (id: string) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev))

  const total = useMemo(() => quoteTotal(lines), [lines])

  // Backend chỉ cho sửa nội dung khi còn nháp; đã gửi thì phải tạo bản mới.
  const locked = !!quote && quote.status !== 'draft'

  const canSave =
    !locked && customerId !== NONE && lines.some((l) => l.name.trim().length > 0)

  const onSubmit = () => {
    if (!canSave) {
      toast.error(locked
        ? 'Báo giá đã gửi cho khách — không sửa được nữa'
        : 'Cần chọn khách hàng và ít nhất một dòng sản phẩm')
      return
    }
    const cleanLines = lines
      .filter((l) => l.name.trim().length > 0)
      .map((l) => ({
        ...l,
        name: l.name.trim(),
        quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0,
      }))

    saveQuote.mutate(
      {
        id: quote?.id,
        title: title.trim(),
        customerId: customerId === NONE ? null : customerId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || null,
        customerEmail: customerEmail.trim() || null,
        note: note.trim() || null,
        status,
        lines: cleanLines,
      },
      {
        onSuccess: (saved) => onSaved(saved, !quote),
        onError: (e) => toast.error(quoteError(e)),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{quote ? (locked ? `Báo giá ${quote.code}` : 'Sửa báo giá') : 'Tạo báo giá mới'}</DialogTitle>
          <DialogDescription>
            {locked
              ? 'Báo giá đã gửi cho khách nên chỉ xem, không sửa được.'
              : 'Chọn khách hàng, thêm sản phẩm và hệ thống sẽ tự tính tổng tiền.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tiêu đề báo giá</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Báo giá gói dịch vụ tháng 8"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Trạng thái</Label>
              {/* Chỉ chọn Nháp / Đã gửi — các trạng thái khác do khách hoặc hệ thống chuyển */}
              <Select value={status} onValueChange={(v) => setStatus(v as QuoteStatus)} disabled={locked}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(locked ? [status] : EDITABLE_STATUSES).map((s) => (
                    <SelectItem key={s} value={s}>
                      {QUOTE_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Khách hàng *</Label>
              {/* Backend cần `contactId` — phải là khách đã có trong CRM */}
              <Select value={customerId} onValueChange={onPickCustomer} disabled={locked}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn khách hàng..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Chọn khách hàng —</SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.crmName || c.fullName || 'Chưa có tên'}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Thông tin bên mua lấy từ hồ sơ khách — sửa ở màn Khách hàng */}
            <div className="space-y-1.5">
              <Label>Tên khách hàng</Label>
              <Input value={customerName} readOnly placeholder="Lấy từ hồ sơ khách hàng" />
            </div>
            <div className="space-y-1.5">
              <Label>Số điện thoại</Label>
              <Input value={customerPhone} readOnly placeholder="Lấy từ hồ sơ khách hàng" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={customerEmail} readOnly placeholder="Lấy từ hồ sơ khách hàng" />
            </div>
          </div>

          {/* Dòng sản phẩm */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Sản phẩm / Dịch vụ</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus /> Thêm dòng
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left font-semibold">Sản phẩm</th>
                    <th className="px-3 py-2 text-right font-semibold">SL</th>
                    <th className="px-3 py-2 text-right font-semibold">Đơn giá</th>
                    <th className="px-3 py-2 text-right font-semibold">Thành tiền</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-b last:border-0 align-top">
                      <td className="px-3 py-2">
                        <div className="space-y-1.5">
                          <Select
                            value={l.productId ?? NONE}
                            onValueChange={(v) => onPickProduct(l.id, v)}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Chọn từ danh mục..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>— Nhập tay —</SelectItem>
                              {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                  {p.price != null ? ` · ${formatNumber(p.price)}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={l.name}
                            onChange={(e) => updateLine(l.id, { name: e.target.value })}
                            placeholder="Tên sản phẩm / dịch vụ"
                            className="h-8"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          value={l.quantity}
                          onChange={(e) =>
                            updateLine(l.id, { quantity: Number(e.target.value) })
                          }
                          className="h-8 w-20 text-right tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          value={l.unitPrice}
                          onChange={(e) =>
                            updateLine(l.id, { unitPrice: Number(e.target.value) })
                          }
                          className="h-8 w-32 text-right tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatNumber(lineTotal(l))}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => removeLine(l.id)}
                          disabled={lines.length <= 1}
                          title="Xóa dòng"
                        >
                          <X />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td colSpan={3} className="px-3 py-2.5 text-right font-semibold">
                      Tổng cộng
                    </td>
                    <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums">
                      {formatNumber(total)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Ghi chú</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Điều khoản, thời hạn báo giá, ghi chú giao hàng..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          {!locked && (
            <Button onClick={onSubmit} disabled={!canSave || saveQuote.isPending}>
              <FileText /> {quote ? 'Lưu thay đổi' : status === 'sent' ? 'Tạo & gửi link' : 'Tạo nháp'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
