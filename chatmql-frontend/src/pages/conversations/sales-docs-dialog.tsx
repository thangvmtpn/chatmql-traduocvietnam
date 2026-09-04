/**
 * sales-docs-dialog.tsx — Popup "Tài liệu bán hàng".
 *
 * Mở từ nút thư mục trên thanh soạn tin. Trước đây khối này nằm ở tab thứ tư của
 * cột phải, nhưng cột đó chỉ rộng 365px nên lưới ảnh bị bó thành 3 ô nhỏ; đưa ra
 * popup rộng thì nhân viên nhìn được nhiều tài liệu hơn trong một lần mở.
 *
 * Nguồn dữ liệu vẫn là `GET /library/items` — kho tài liệu ĐÃ DUYỆT (ảnh sản
 * phẩm + kho tri thức), gom theo danh mục. Gửi qua `POST /library/send`.
 *
 * Ba tab theo `kind` của backend:
 *   • Hình ảnh — lưới ảnh, chọn nhiều rồi gửi thẳng vào hội thoại
 *   • Content  — bài viết/kịch bản, chỉ copy (không gửi được dạng tệp)
 *   • Video    — lưới video đã duyệt, gửi như ảnh
 */
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Lock, Search, Send } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox, ScrollArea } from '@/components/ui/misc'
import { ErrorState, Loading } from '@/components/shared/feedback'
import { apiError } from '@/lib/api-client'
import { API_ORIGIN } from '@/lib/config'
import { cn } from '@/lib/utils'
import {
  LIBRARY_KIND_LABELS, useLibraryItems, useSendLibraryItems,
  type LibraryItem, type LibraryKind,
} from '@/hooks/use-library'

type DocsKind = Exclude<LibraryKind, 'all'>

/** `sendable=false` cho Content: backend chỉ gửi được ảnh/video, văn bản thì copy. */
const DOCS_TABS: Array<{ id: DocsKind; sendable: boolean }> = [
  { id: 'image', sendable: true },
  { id: 'content', sendable: false },
  { id: 'video', sendable: true },
]

/** Đường dẫn tương đối từ backend → URL tuyệt đối để trình duyệt tải được. */
function mediaUrl(u?: string | null): string | undefined {
  if (!u) return undefined
  if (/^https?:\/\//i.test(u) || u.startsWith('data:')) return u
  return `${API_ORIGIN}${u.startsWith('/') ? '' : '/'}${u}`
}

interface Props {
  convId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SalesDocsDialog({ convId, open, onOpenChange }: Props) {
  const [kind, setKind] = useState<DocsKind>('image')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[70vh] max-h-[70vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="text-base">Tài liệu bán hàng</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Lock className="h-3 w-3 shrink-0" />
            Chỉ hiển thị tài liệu <b className="font-semibold">đã duyệt</b> — được phép gửi ra ngoài cho khách.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={kind}
          onValueChange={(v) => setKind(v as DocsKind)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="px-5 pt-3">
            <TabsList className="grid w-full grid-cols-3">
              {DOCS_TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>{LIBRARY_KIND_LABELS[t.id]}</TabsTrigger>
              ))}
            </TabsList>
          </div>

          {DOCS_TABS.map((t) => (
            <TabsContent
              key={t.id}
              value={t.id}
              className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
            >
              {/* Chỉ mount tab đang mở — mỗi tab là một lời gọi /library/items riêng. */}
              {kind === t.id && <DocsPane convId={convId} kind={t.id} sendable={t.sendable} />}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ── Nội dung một tab ────────────────────────────────────────────────

function DocsPane({ convId, kind, sendable }: { convId: string; kind: DocsKind; sendable: boolean }) {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const itemsQ = useLibraryItems(kind)
  const send = useSendLibraryItems()

  // Đổi hội thoại thì bỏ hết lựa chọn — tránh gửi nhầm tài liệu sang khách khác.
  useEffect(() => { setSelected(new Set()) }, [convId])

  const query = q.trim().toLowerCase()
  const match = (it: LibraryItem) =>
    !query || `${it.title || ''} ${it.meta?.sku || ''} ${it.content || ''}`.toLowerCase().includes(query)

  const groups = (itemsQ.data?.groups ?? [])
    .map((g) => ({ ...g, items: g.items.filter(match) }))
    .filter((g) => g.items.length > 0)

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const s = new Set(prev)
      if (on) s.add(id)
      else s.delete(id)
      return s
    })

  const copy = async (it: LibraryItem) => {
    try {
      await navigator.clipboard.writeText(it.content || '')
      setCopiedId(it.id)
      setTimeout(() => setCopiedId((c) => (c === it.id ? null : c)), 1600)
    } catch {
      toast.error('Trình duyệt chặn sao chép. Bôi đen rồi Ctrl+C.')
    }
  }

  const doSend = () => {
    const itemIds = [...selected]
    if (!itemIds.length) return
    send.mutate(
      { conversationId: convId, itemIds },
      {
        onSuccess: (r) => {
          setSelected(new Set())
          if (r.skipped.length) {
            toast.warning(`Đã gửi ${r.sent}, bỏ qua ${r.skipped.length}: ${r.skipped.map((s) => s.reason).join('; ')}`)
          } else {
            toast.success(`Đã gửi ${r.sent} tài liệu vào hội thoại`)
          }
        },
        onError: (err) => toast.error(`Không gửi được: ${apiError(err)}`),
      },
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-5 py-3">
        <Search className="pointer-events-none absolute left-7.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm theo tên, mã…"
          className="h-9 pl-8 text-sm"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1 [&>div]:!block">
        <div className="px-5 pb-4">
          {itemsQ.isLoading ? (
            <Loading className="py-10" />
          ) : itemsQ.isError ? (
            <ErrorState message={`Không tải được: ${apiError(itemsQ.error)}`} />
          ) : groups.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {kind === 'content'
                ? 'Chưa có tài liệu content nào.'
                : `Chưa có ${kind === 'video' ? 'video' : 'hình ảnh'} nào được duyệt.`}
            </p>
          ) : kind === 'content' ? (
            <div className="space-y-2">
              {groups.flatMap((g) => g.items).map((it) => (
                <div key={it.id} className="rounded-lg border px-3 py-2.5">
                  <div className="mb-1 flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate text-sm font-semibold">{it.title}</div>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn('h-7 shrink-0 px-2 text-xs', copiedId === it.id && 'border-success/40 bg-success/10 text-success')}
                      onClick={() => copy(it)}
                    >
                      {copiedId === it.id ? <><Check /> Đã copy</> : <><Copy /> Copy</>}
                    </Button>
                  </div>
                  <div className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                    {it.content || ''}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.id} className="mb-4">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold">📁 {g.name}</div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {g.items.map((it) => {
                    const on = selected.has(it.id)
                    const src = mediaUrl(it.thumbUrl || it.fullUrl)
                    return (
                      <label
                        key={it.id}
                        title={`${it.title}${it.meta?.sku ? ` — Mã: ${it.meta.sku}` : ''}`}
                        className={cn(
                          'relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border-2 bg-muted transition-shadow',
                          on ? 'border-primary ring-2 ring-primary/25' : 'border-transparent hover:border-border',
                        )}
                      >
                        <Checkbox
                          checked={on}
                          onCheckedChange={(v) => toggle(it.id, v === true)}
                          className="absolute left-1.5 top-1.5 z-10 bg-background"
                        />
                        {src && (
                          <img
                            src={src}
                            alt=""
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none' }}
                          />
                        )}
                        <span className="relative text-[22px] leading-none drop-shadow">
                          {kind === 'video' ? '🎬' : '🍵'}
                        </span>
                        <span className="relative max-w-full truncate px-1 text-[9.5px] font-semibold text-foreground drop-shadow-sm">
                          {it.title}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {sendable && (
        <div className="border-t px-5 py-3">
          <Button
            className="w-full font-bold"
            disabled={selected.size === 0 || send.isPending}
            onClick={doSend}
          >
            <Send /> {send.isPending ? 'Đang gửi…' : `Gửi vào chat (${selected.size})`}
          </Button>
        </div>
      )}
    </div>
  )
}
