import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox, ScrollArea, Separator } from '@/components/ui/misc'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loading } from '@/components/shared/feedback'
import { apiError } from '@/lib/api-client'
import {
  LIFECYCLE_STAGES,
  STAGE_LABELS,
  useContacts,
  type ContactListItem,
} from '@/hooks/use-contacts'
import {
  useOaAccounts,
  useZnsTemplates,
  useCreateZnsCampaign,
  type ZnsTemplate,
} from '@/hooks/use-zns'

const ALL = '__all__'
const CONTACT_LIMIT = 50

export function CreateCampaignDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const [accountId, setAccountId] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [templateData, setTemplateData] = useState<Record<string, string>>({})
  const [scheduledAt, setScheduledAt] = useState('')

  // Chọn người nhận
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState<string>(ALL)
  const [selected, setSelected] = useState<Map<string, string>>(new Map())

  const accountsQuery = useOaAccounts()
  const templatesQuery = useZnsTemplates(accountId || undefined)
  const createMutation = useCreateZnsCampaign()

  // Reset khi đóng dialog
  useEffect(() => {
    if (!open) {
      setName('')
      setAccountId('')
      setTemplateId('')
      setTemplateData({})
      setScheduledAt('')
      setSearchInput('')
      setSearch('')
      setStage(ALL)
      setSelected(new Map())
    }
  }, [open])

  // Debounce tìm kiếm contact
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400)
    return () => clearTimeout(t)
  }, [searchInput])

  const contactParams = useMemo(
    () => ({
      page: 1,
      limit: CONTACT_LIMIT,
      search: search || undefined,
      lifecycleStage: stage === ALL ? undefined : stage,
    }),
    [search, stage],
  )
  const contactsQuery = useContacts(contactParams)

  const selectedTemplate: ZnsTemplate | undefined = useMemo(
    () => templatesQuery.data?.find((t) => t.templateId === templateId),
    [templatesQuery.data, templateId],
  )

  // Khi đổi tài khoản OA → reset mẫu + tham số
  function handleAccountChange(v: string) {
    setAccountId(v)
    setTemplateId('')
    setTemplateData({})
  }

  // Khi đổi mẫu → khởi tạo map tham số rỗng
  function handleTemplateChange(v: string) {
    setTemplateId(v)
    const tmpl = templatesQuery.data?.find((t) => t.templateId === v)
    const next: Record<string, string> = {}
    for (const p of tmpl?.params ?? []) next[p.name] = ''
    setTemplateData(next)
  }

  function toggleContact(c: ContactListItem) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(c.id)) next.delete(c.id)
      else next.set(c.id, c.crmName || c.fullName || c.phone || 'Không tên')
      return next
    })
  }

  function toggleAllOnPage(rows: ContactListItem[], checked: boolean) {
    setSelected((prev) => {
      const next = new Map(prev)
      for (const c of rows) {
        if (checked) next.set(c.id, c.crmName || c.fullName || c.phone || 'Không tên')
        else next.delete(c.id)
      }
      return next
    })
  }

  const rows = contactsQuery.data?.contacts ?? []
  const allOnPageSelected = rows.length > 0 && rows.every((c) => selected.has(c.id))

  const canSubmit =
    !!name.trim() &&
    !!accountId &&
    !!templateId &&
    selected.size > 0 &&
    !createMutation.isPending

  async function handleSubmit() {
    // Kiểm tra tham số bắt buộc
    const missing = (selectedTemplate?.params ?? []).filter(
      (p) => p.require && !templateData[p.name]?.trim(),
    )
    if (missing.length > 0) {
      toast.error(`Thiếu tham số bắt buộc: ${missing.map((m) => m.name).join(', ')}`)
      return
    }

    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        channelAccountId: accountId,
        templateId,
        templateData,
        contactIds: Array.from(selected.keys()),
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      })
      toast.success('Đã tạo chiến dịch nháp')
      onOpenChange(false)
    } catch (err) {
      toast.error(apiError(err))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tạo chiến dịch ZNS</DialogTitle>
          <DialogDescription>
            Chọn mẫu, người nhận và điền tham số. Chiến dịch được tạo ở trạng thái nháp — bấm Bắt
            đầu để gửi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tên */}
          <div className="space-y-1.5">
            <Label htmlFor="zns-name">Tên chiến dịch</Label>
            <Input
              id="zns-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Nhắc lịch hẹn tháng 9"
            />
          </div>

          {/* OA + Mẫu */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tài khoản OA</Label>
              <Select value={accountId} onValueChange={handleAccountChange}>
                <SelectTrigger>
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
            </div>

            <div className="space-y-1.5">
              <Label>Mẫu ZNS</Label>
              <Select
                value={templateId}
                onValueChange={handleTemplateChange}
                disabled={!accountId || templatesQuery.isLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !accountId
                        ? 'Chọn tài khoản trước'
                        : templatesQuery.isLoading
                          ? 'Đang tải mẫu...'
                          : 'Chọn mẫu ZNS'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {templatesQuery.data?.map((t) => (
                    <SelectItem key={t.templateId} value={t.templateId}>
                      {t.templateName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {accountId && !templatesQuery.isLoading && (templatesQuery.data?.length ?? 0) === 0 && (
            <p className="text-xs text-muted-foreground">
              Tài khoản này chưa có mẫu ZNS nào được duyệt.
            </p>
          )}

          {/* Tham số mẫu */}
          {selectedTemplate && selectedTemplate.params.length > 0 && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">Tham số mẫu</p>
              <p className="text-xs text-muted-foreground">
                Có thể dùng biến động, ví dụ{' '}
                <code className="rounded bg-muted px-1">{'{{contact.fullName}}'}</code>,{' '}
                <code className="rounded bg-muted px-1">{'{{contact.phone}}'}</code>.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {selectedTemplate.params.map((p) => (
                  <div key={p.name} className="space-y-1">
                    <Label className="flex items-center gap-1 text-xs">
                      {p.name}
                      {p.require && <span className="text-destructive">*</span>}
                      {p.type && (
                        <span className="font-normal text-muted-foreground">({p.type})</span>
                      )}
                    </Label>
                    <Input
                      value={templateData[p.name] ?? ''}
                      onChange={(e) =>
                        setTemplateData((prev) => ({ ...prev, [p.name]: e.target.value }))
                      }
                      placeholder={`Giá trị cho ${p.name}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lên lịch */}
          <div className="space-y-1.5">
            <Label htmlFor="zns-schedule">Lên lịch (tùy chọn)</Label>
            <Input
              id="zns-schedule"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>

          <Separator />

          {/* Chọn người nhận */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Người nhận</Label>
              <Badge variant={selected.size > 0 ? 'default' : 'secondary'}>
                Đã chọn {selected.size}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Tìm theo tên, SĐT..."
                  className="pl-9"
                />
              </div>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Giai đoạn" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Tất cả giai đoạn</SelectItem>
                  {LIFECYCLE_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border">
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <Checkbox
                  checked={allOnPageSelected}
                  onCheckedChange={(v) => toggleAllOnPage(rows, v === true)}
                  disabled={rows.length === 0}
                />
                <span className="text-xs text-muted-foreground">
                  Chọn tất cả ({rows.length} liên hệ hiển thị)
                </span>
              </div>
              <ScrollArea className="h-52">
                {contactsQuery.isLoading ? (
                  <Loading label="Đang tải liên hệ..." />
                ) : rows.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Không tìm thấy liên hệ phù hợp.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {rows.map((c) => (
                      <li
                        key={c.id}
                        className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40"
                        onClick={() => toggleContact(c)}
                      >
                        <Checkbox
                          checked={selected.has(c.id)}
                          onCheckedChange={() => toggleContact(c)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {c.crmName || c.fullName || 'Chưa có tên'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {c.phone || 'Chưa có SĐT'}
                          </p>
                        </div>
                        {!c.phone && (
                          <Badge variant="warning" className="shrink-0">
                            Thiếu SĐT
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </div>
            <p className="text-xs text-muted-foreground">
              Liên hệ không có số điện thoại hợp lệ sẽ bị bỏ qua khi gửi.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {createMutation.isPending ? 'Đang tạo...' : 'Tạo chiến dịch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
