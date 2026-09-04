/**
 * sales-docs-page.tsx — Module "Tài liệu bán hàng", duyệt như một cây thư mục:
 *
 *   /sales-docs              Tổng quan: biểu giá + thư mục danh mục
 *   /sales-docs/c/:catId     Một danh mục: lưới sản phẩm
 *   /sales-docs/p/:productId Chi tiết: bộ ảnh · mô tả · video
 *   /sales-docs?code=XXX     Lối tắt từ màn "Sản phẩm (CRM)" theo mã
 *
 * HAI NGUỒN GHÉP LẠI:
 *   • Dữ liệu gốc (mã, tên, giá, tồn, danh mục) — hệ thống nguồn (CRM/TDVN), chỉ đọc.
 *   • Tri thức bán hàng (ảnh, mô tả, video) — bảng `product_docs` của ChatMQL,
 *     gắn theo MÃ sản phẩm, admin soạn tại đây, AI đọc khi tư vấn.
 *
 * Bảng `products` nội bộ KHÔNG còn được dùng ở đây và sẽ ngừng dùng hẳn khi
 * nguồn sản phẩm chính thức chạy — xem docs/cau-truc-du-lieu-san-pham.md.
 */
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ChevronRight, ExternalLink, Folder, FolderOpen, ImageOff, Pencil, PlayCircle, ReceiptText,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { ErrorState, Loading } from '@/components/shared/feedback'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiError } from '@/lib/api-client'
import { formatVnd } from '@/lib/order-calc'
import { cn } from '@/lib/utils'
import { useMyPermissions } from '@/hooks/use-settings'
import { resolveImageUrl } from '@/hooks/use-products'
import { useCrmProductList, type CrmProduct } from '@/hooks/use-crm-products'
import { useProductDoc, useProductDocsByCodes } from '@/hooks/use-product-docs'
import { SalesDocEditDialog } from './sales-doc-edit-dialog'

const ROOT = '/sales-docs'
const UNCATEGORIZED = 'Chưa phân loại'

/** Nhận diện YouTube → id để nhúng; link khác trả null. */
function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/))([\w-]{6,})/i)
  return m ? m[1] : null
}

function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)
}

function priceText(p: CrmProduct): string {
  if (p.price == null && p.priceMax == null) return 'Liên hệ'
  if (p.priceMax != null && p.price != null && p.priceMax !== p.price) {
    return `${formatVnd(p.price)} – ${formatVnd(p.priceMax)}`
  }
  return formatVnd(p.price ?? p.priceMax)
}

/** Toàn bộ sản phẩm từ hệ thống nguồn — mọi cấp của module đều dựa vào đây. */
function useAllProducts() {
  return useCrmProductList({ pageSize: 200 })
}

function Crumbs({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground" aria-label="Đường dẫn">
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
          {it.to
            ? <Link to={it.to} className="hover:text-foreground hover:underline">{it.label}</Link>
            : <span className="font-medium text-foreground">{it.label}</span>}
        </span>
      ))}
    </nav>
  )
}

export function SalesDocsPage() {
  const { catId, productId } = useParams<{ catId?: string; productId?: string }>()
  const [params] = useSearchParams()
  // Lối tắt ?code= từ màn "Sản phẩm (CRM)".
  const code = productId ?? params.get('code') ?? undefined
  if (code) return <ProductDetailView code={decodeURIComponent(code)} />
  if (catId) return <CategoryView category={decodeURIComponent(catId)} />
  return <RootView />
}

// ── Cấp 1: Tổng quan ────────────────────────────────────────────────

function RootView() {
  const q = useAllProducts()
  const products = q.data?.products ?? []
  const codes = useMemo(() => products.map((p) => p.code).filter((c): c is string => !!c), [products])
  const docsQ = useProductDocsByCodes(codes)

  const groups = useMemo(() => {
    const byCat = new Map<string, CrmProduct[]>()
    for (const p of products) {
      const key = p.categoryName || UNCATEGORIZED
      const arr = byCat.get(key) ?? []
      arr.push(p)
      byCat.set(key, arr)
    }
    return [...byCat.entries()]
      .sort(([a], [b]) => (a === UNCATEGORIZED ? 1 : b === UNCATEGORIZED ? -1 : a.localeCompare(b)))
      .map(([name, items]) => ({ name, items }))
  }, [products])

  const docCount = docsQ.data?.size ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tài liệu bán hàng"
        description="Biểu giá và tư liệu từng sản phẩm (ảnh · mô tả · video) để nhân viên tra cứu và AI đọc khi tư vấn."
        actions={
          <Button variant="outline" className="gap-1.5" asChild>
            <Link to={`${ROOT}/library`}><FolderOpen className="h-4 w-4" /> Thư viện tài liệu</Link>
          </Button>
        }
      />
      <Crumbs items={[{ label: 'Tài liệu bán hàng' }]} />

      {q.isLoading ? (
        <Loading className="py-16" />
      ) : q.error ? (
        <ErrorState message={apiError(q.error)} />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <FolderOpen className="h-4 w-4" /> Danh mục sản phẩm
            </h2>
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Hệ thống nguồn chưa trả về sản phẩm nào.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {groups.map((g) => (
                  <Link
                    key={g.name}
                    to={`${ROOT}/c/${encodeURIComponent(g.name)}`}
                    className="group flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/50 hover:bg-accent/40"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      <Folder className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium group-hover:text-primary">{g.name}</span>
                      <span className="block text-xs text-muted-foreground">{g.items.length} sản phẩm</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-4 w-4 text-primary" /> Biểu giá sản phẩm
              </CardTitle>
              <CardDescription>
                {products.length} sản phẩm · {docCount} đã có tài liệu · bấm tên để xem chi tiết
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Sản phẩm</th>
                      <th className="px-4 py-2 text-left font-medium">Mã</th>
                      <th className="px-4 py-2 text-right font-medium">Giá</th>
                      <th className="px-4 py-2 text-center font-medium">Tài liệu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <GroupRows key={g.name} group={g} docs={docsQ.data} />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function GroupRows({
  group, docs,
}: {
  group: { name: string; items: CrmProduct[] }
  docs?: Map<string, { images: string[]; videoUrls: string[]; description: string | null }>
}) {
  return (
    <>
      <tr className="bg-muted/30">
        <td colSpan={4} className="px-4 py-1.5 text-xs font-semibold">
          <Link to={`${ROOT}/c/${encodeURIComponent(group.name)}`} className="hover:text-primary hover:underline">
            📁 {group.name}
          </Link>
        </td>
      </tr>
      {group.items.map((p) => {
        const doc = p.code ? docs?.get(p.code) : undefined
        const has = !!(doc && (doc.description || doc.images.length || doc.videoUrls.length))
        return (
          <tr key={p.code ?? p.name} className="border-t hover:bg-accent/30">
            <td className="px-4 py-2">
              {p.code
                ? <Link to={`${ROOT}/p/${encodeURIComponent(p.code)}`} className="font-medium hover:text-primary hover:underline">{p.name}</Link>
                : <span className="font-medium">{p.name}</span>}
            </td>
            <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{p.code || '—'}</td>
            <td className="whitespace-nowrap px-4 py-2 text-right font-medium">{priceText(p)}</td>
            <td className="px-4 py-2 text-center">
              {has
                ? <Badge variant="secondary">Đã có</Badge>
                : <span className="text-xs text-muted-foreground">Chưa soạn</span>}
            </td>
          </tr>
        )
      })}
    </>
  )
}

// ── Cấp 2: Một danh mục ─────────────────────────────────────────────

function CategoryView({ category }: { category: string }) {
  const q = useCrmProductList({ category, pageSize: 200 })
  const products = q.data?.products ?? []
  const codes = useMemo(() => products.map((p) => p.code).filter((c): c is string => !!c), [products])
  const docsQ = useProductDocsByCodes(codes)

  return (
    <div className="space-y-6">
      <PageHeader title={category} description={`${products.length} sản phẩm trong danh mục này.`} />
      <Crumbs items={[{ label: 'Tài liệu bán hàng', to: ROOT }, { label: category }]} />

      {q.isLoading ? (
        <Loading className="py-16" />
      ) : q.error ? (
        <ErrorState message={apiError(q.error)} />
      ) : products.length === 0 ? (
        <p className="text-sm text-muted-foreground">Danh mục này chưa có sản phẩm.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((p) => (
            <ProductCard key={p.code ?? p.name} p={p} doc={p.code ? docsQ.data?.get(p.code) : undefined} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProductCard({ p, doc }: { p: CrmProduct; doc?: { images: string[]; videoUrls: string[] } }) {
  const src = resolveImageUrl(doc?.images?.[0])
  const inner = (
    <>
      <div className="relative aspect-square bg-muted">
        {src
          ? <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center text-muted-foreground"><ImageOff className="h-6 w-6" /></div>}
        {(doc?.videoUrls?.length ?? 0) > 0 && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-background/90 p-1 text-primary shadow" title="Có video">
            <PlayCircle className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="space-y-0.5 p-2.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">{p.name}</p>
        {p.code && <p className="font-mono text-[11px] text-muted-foreground">{p.code}</p>}
        <p className="text-sm font-semibold">{priceText(p)}</p>
      </div>
    </>
  )
  if (!p.code) return <div className="overflow-hidden rounded-lg border bg-card opacity-70">{inner}</div>
  return (
    <Link
      to={`${ROOT}/p/${encodeURIComponent(p.code)}`}
      className="group overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/50"
    >
      {inner}
    </Link>
  )
}

// ── Cấp 3: Chi tiết sản phẩm ────────────────────────────────────────

function ProductDetailView({ code }: { code: string }) {
  const listQ = useCrmProductList({ q: code, pageSize: 50 })
  const docQ = useProductDoc(code)
  const permsQ = useMyPermissions()
  const canEdit = permsQ.data?.has('products.update') ?? false
  const [editOpen, setEditOpen] = useState(false)
  const [activeImg, setActiveImg] = useState(0)

  const p = listQ.data?.products.find((x) => x.code?.toUpperCase() === code.toUpperCase())
  const doc = docQ.data
  const images = doc?.images ?? []
  const mainSrc = resolveImageUrl(images[Math.min(activeImg, Math.max(images.length - 1, 0))])
  const name = p?.name ?? doc?.name ?? code

  if (listQ.isLoading || docQ.isLoading) return <Loading className="py-16" />

  return (
    <div className="space-y-6">
      <PageHeader
        title={name}
        description={[`Mã: ${code}`, p?.categoryName].filter(Boolean).join(' · ')}
        actions={canEdit ? (
          <Button variant="outline" className="gap-1.5" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Chỉnh tài liệu
          </Button>
        ) : undefined}
      />
      <Crumbs items={[
        { label: 'Tài liệu bán hàng', to: ROOT },
        ...(p?.categoryName ? [{ label: p.categoryName, to: `${ROOT}/c/${encodeURIComponent(p.categoryName)}` }] : []),
        { label: name },
      ]} />

      {!p && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          Không tìm thấy mã <b>{code}</b> ở hệ thống nguồn — chỉ hiện tài liệu đã soạn. Sản phẩm có thể đã ngừng bán hoặc hệ thống nguồn đang lỗi.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="space-y-2">
          <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
            {mainSrc
              ? <img src={mainSrc} alt={name} className="h-full w-full object-contain" />
              : (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
                  <ImageOff className="h-8 w-8" /><span className="text-xs">Chưa có ảnh</span>
                </div>
              )}
          </div>
          {images.length > 1 && (
            <div className="grid grid-cols-5 gap-1.5">
              {images.map((u, i) => (
                <button
                  key={`${u}-${i}`}
                  type="button"
                  onClick={() => setActiveImg(i)}
                  className={cn(
                    'aspect-square overflow-hidden rounded-md border-2 bg-muted',
                    i === activeImg ? 'border-primary' : 'border-transparent hover:border-border',
                  )}
                  aria-label={`Ảnh ${i + 1}`}
                >
                  <img src={resolveImageUrl(u)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          {/* Dữ liệu gốc — chỉ đọc, thuộc hệ thống nguồn. */}
          <div className="flex flex-wrap items-center gap-2">
            {p && <span className="text-2xl font-bold text-primary">{priceText(p)}</span>}
            {p?.inventory != null && (
              p.inventory > 0
                ? <Badge variant="secondary">Tồn {p.inventory}{p.unit ? ` ${p.unit}` : ''}</Badge>
                : <Badge variant="destructive">Hết hàng</Badge>
            )}
            {p?.vatNote && <Badge variant="outline">{p.vatNote}</Badge>}
          </div>

          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Mô tả</h3>
            {doc?.description
              ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{doc.description}</p>
              : (
                <p className="text-sm italic text-muted-foreground">
                  Chưa có mô tả.{canEdit ? ' Bấm "Chỉnh tài liệu" để thêm.' : ''}
                </p>
              )}
          </section>

          {doc?.keywords && (
            <section className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Từ khoá / tên gọi khác</h3>
              <p className="text-xs text-muted-foreground">{doc.keywords}</p>
            </section>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <PlayCircle className="h-4 w-4" /> Video ({doc?.videoUrls?.length ?? 0})
        </h3>
        {!doc?.videoUrls?.length ? (
          <p className="text-sm italic text-muted-foreground">
            Chưa có video.{canEdit ? ' Dán link YouTube hoặc mp4 trong "Chỉnh tài liệu".' : ''}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {doc.videoUrls.map((v, i) => <VideoBlock key={`${v}-${i}`} url={v} />)}
          </div>
        )}
      </section>

      <SalesDocEditDialog code={code} productName={p?.name ?? doc?.name ?? null} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  )
}

function VideoBlock({ url }: { url: string }) {
  const yt = youtubeId(url)
  if (yt) {
    return (
      <div className="aspect-video overflow-hidden rounded-lg border bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${yt}`}
          title="Video sản phẩm"
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    )
  }
  if (isDirectVideo(url)) {
    return (
      <div className="aspect-video overflow-hidden rounded-lg border bg-black">
        <video src={resolveImageUrl(url)} controls preload="metadata" className="h-full w-full" />
      </div>
    )
  }
  return (
    <a
      href={url} target="_blank" rel="noreferrer"
      className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:border-primary/50 hover:text-primary"
    >
      <ExternalLink className="h-4 w-4 shrink-0" /><span className="truncate">{url}</span>
    </a>
  )
}
