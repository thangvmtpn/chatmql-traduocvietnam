/**
 * sales-docs-dialog.tsx — Popup "Tài liệu bán hàng" mở từ thanh soạn tin.
 *
 * Nguồn dữ liệu là THƯ VIỆN tài liệu bán hàng (module /sales-docs), duyệt đi từ
 * tổng quan: cây thư mục bên trái, tài nguyên bên phải.
 *
 * Ở đây CHỈ xem · chọn · gửi — không sửa trực tiếp. Muốn thêm/sửa thì bấm
 * "Quản lý" để mở module (mở tab mới, khỏi mất hội thoại đang dở).
 *
 * Tài liệu `internal` không hiện ở đây và backend cũng chặn gửi.
 */
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ExternalLink, FileText, Film, Folder, Image as ImageIcon, Link2, Lock, Package,
  Search, Send, Settings2, Type,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox, ScrollArea } from '@/components/ui/misc'
import { ErrorState, Loading } from '@/components/shared/feedback'
import { apiError } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import {
  KIND_LABELS, assetUrl, useDocAssets, useDocFolders, useSendDocAssets,
  type AssetKind, type DocAsset, type DocFolder,
} from '@/hooks/use-doc-library'

const ALL = '__all__'

const KIND_ICON: Record<AssetKind, typeof ImageIcon> = {
  product: Package, image: ImageIcon, video: Film, pdf: FileText, doc: FileText, text: Type, link: Link2,
}

/** Cây thư mục phẳng hoá theo thứ tự người dùng đã sắp xếp. */
function flatten(folders: DocFolder[]): Array<DocFolder & { depth: number }> {
  const byParent = new Map<string | null, DocFolder[]>()
  for (const f of folders) {
    const arr = byParent.get(f.parentId) ?? []
    arr.push(f)
    byParent.set(f.parentId, arr)
  }
  const out: Array<DocFolder & { depth: number }> = []
  const walk = (parentId: string | null, depth: number) => {
    for (const f of (byParent.get(parentId) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))) {
      out.push({ ...f, depth })
      walk(f.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

interface Props {
  convId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SalesDocsDialog({ convId, open, onOpenChange }: Props) {
  const [folderId, setFolderId] = useState<string>(ALL)
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  const foldersQ = useDocFolders()
  const assetsQ = useDocAssets({
    folderId: folderId === ALL ? undefined : folderId,
    q,
    pageSize: 100,
  })
  const send = useSendDocAssets()

  // Tài liệu nội bộ không được phép gửi khách nên không hiện ở màn này.
  const folders = useMemo(
    () => flatten((foldersQ.data ?? []).filter((f) => f.visibility !== 'internal')),
    [foldersQ.data],
  )
  const assets = (assetsQ.data?.items ?? []).filter((a) => a.visibility === 'sales')

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const s = new Set(prev)
      if (on) s.add(id)
      else s.delete(id)
      return s
    })

  const doSend = () => {
    const assetIds = [...selected]
    if (!assetIds.length) return
    send.mutate(
      { conversationId: convId, assetIds },
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[74vh] max-h-[74vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-base">Tài liệu bán hàng</DialogTitle>
              <DialogDescription className="flex items-center gap-1.5">
                <Lock className="h-3 w-3 shrink-0" />
                Chỉ xem và gửi — muốn sửa thì bấm Quản lý.
              </DialogDescription>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
              <a href="/sales-docs" target="_blank" rel="noreferrer" title="Mở module Tài liệu bán hàng ở tab mới">
                <Settings2 className="h-4 w-4" /> Quản lý <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[190px_1fr] overflow-hidden">
          {/* Cây thư mục — đi từ tổng quan */}
          <aside className="min-h-0 overflow-y-auto border-r p-2">
            <button
              type="button"
              onClick={() => setFolderId(ALL)}
              className={cn(
                'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs',
                folderId === ALL ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-accent',
              )}
            >
              <Folder className="h-3.5 w-3.5 shrink-0 opacity-70" /> Tất cả
            </button>
            {foldersQ.isLoading ? (
              <Loading className="py-6" />
            ) : (
              folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFolderId(f.id)}
                  style={f.depth ? { paddingLeft: 8 + f.depth * 12 } : undefined}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs',
                    folderId === f.id ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-accent',
                  )}
                >
                  <Folder className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="min-w-0 flex-1 truncate">{f.icon ? `${f.icon} ` : ''}{f.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{f.assetCount}</span>
                </button>
              ))
            )}
          </aside>

          {/* Lưới tài nguyên */}
          <section className="flex min-h-0 flex-col">
            <div className="relative px-4 py-2.5">
              <Search className="pointer-events-none absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm theo tên, mô tả, nội dung…"
                className="h-9 pl-8 text-sm"
              />
            </div>

            <ScrollArea className="min-h-0 flex-1 [&>div]:!block">
              <div className="px-4 pb-4">
                {assetsQ.isLoading ? (
                  <Loading className="py-10" />
                ) : assetsQ.error ? (
                  <ErrorState message={apiError(assetsQ.error)} />
                ) : assets.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Chưa có tài liệu nào được phép gửi khách ở mục này.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {assets.map((a) => (
                      <AssetPick
                        key={a.id}
                        a={a}
                        checked={selected.has(a.id)}
                        onToggle={(on) => toggle(a.id, on)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </section>
        </div>

        <div className="border-t px-5 py-3">
          <Button
            className="w-full font-bold"
            disabled={selected.size === 0 || send.isPending}
            onClick={doSend}
          >
            <Send /> {send.isPending ? 'Đang gửi…' : `Gửi vào chat (${selected.size})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Một tài nguyên chọn được. Bấm cả thẻ để tick, không cần nhắm đúng ô vuông. */
function AssetPick({
  a, checked, onToggle,
}: { a: DocAsset; checked: boolean; onToggle: (on: boolean) => void }) {
  const Icon = KIND_ICON[a.kind] ?? FileText
  const src = a.kind === 'product'
    ? assetUrl(a.images?.[0])
    : a.kind === 'image' ? assetUrl(a.thumbUrl || a.fileUrl) : undefined

  return (
    <label
      title={a.description || a.title}
      className={cn(
        'relative flex cursor-pointer flex-col overflow-hidden rounded-lg border-2 bg-card transition-shadow',
        checked ? 'border-primary ring-2 ring-primary/25' : 'border-transparent hover:border-border',
      )}
    >
      <div className="relative aspect-square bg-muted">
        {src ? (
          <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <Icon className="h-6 w-6" />
            <span className="text-[10px]">{KIND_LABELS[a.kind]}</span>
          </div>
        )}
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onToggle(v === true)}
          className="absolute left-1.5 top-1.5 z-10 bg-background"
        />
      </div>
      <div className="min-w-0 space-y-0.5 p-2">
        <p className="line-clamp-2 text-[11px] font-medium leading-snug">{a.title}</p>
        <div className="flex flex-wrap items-center gap-1">
          {a.productCodes.slice(0, 2).map((c) => (
            <span key={c} className="rounded bg-primary/10 px-1 font-mono text-[9px] text-primary">{c}</span>
          ))}
          {(a.images?.length ?? 0) > 1 && (
            <span className="text-[9px] text-muted-foreground">{a.images.length} ảnh</span>
          )}
        </div>
      </div>
    </label>
  )
}
