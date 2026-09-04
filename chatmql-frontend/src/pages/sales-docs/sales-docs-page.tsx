/**
 * sales-docs-page.tsx — Module "Tài liệu bán hàng" (admin quản trị), duyệt như
 * một cây thư mục:
 *
 *   /sales-docs              Tổng quan: biểu giá toàn bộ sản phẩm + thư mục danh mục
 *   /sales-docs/c/:catId     Một danh mục: lưới sản phẩm (ảnh · tên · mã · giá)
 *   /sales-docs/p/:productId Chi tiết sản phẩm: bộ ảnh · mô tả · video
 *
 * Nguồn dữ liệu là chính bảng sản phẩm/danh mục (GET /products, /product-categories,
 * /products/:id) — không tạo bảng riêng, để nhân viên tra cứu ở đây và AI tư vấn
 * cùng đọc MỘT dữ liệu. Chỉ hiện sản phẩm `active` (bản nháp/lưu trữ không phải
 * tài liệu bán hàng). Admin (quyền products.update) có nút chỉnh mô tả/ảnh/video.
 */
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ChevronRight, ExternalLink, Folder, FolderOpen, ImageOff, Pencil, PlayCircle, ReceiptText,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { ErrorState, Loading } from '@/components/shared/feedback'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiError } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { useMyPermissions } from '@/hooks/use-settings'
import {
  formatProductPrice, resolveImageUrl, useProduct, useProductCategories, useProducts,
  type Product, type ProductCategory,
} from '@/hooks/use-products'
import { SalesDocEditDialog } from './sales-doc-edit-dialog'

/** Backend giới hạn pageSize ≤ 100 — đủ cho catalog hiện tại (~80 SP). */
const PAGE_SIZE = 100
const ROOT = '/sales-docs'

// ── Tiện ích ────────────────────────────────────────────────────────

/** Sắp xếp danh mục theo cây cha-con (kèm độ sâu) để hiển thị đúng thứ tự. */
function flattenTree(items: ProductCategory[]): Array<ProductCategory & { depth: number }> {
  const byParent = new Map<string | null, ProductCategory[]>()
  for (const it of items) {
    const arr = byParent.get(it.parentId ?? null) ?? []
    arr.push(it)
    byParent.set(it.parentId ?? null, arr)
  }
  const out: Array<ProductCategory & { depth: number }> = []
  const walk = (parentId: string | null, depth: number) => {
    const children = (byParent.get(parentId) ?? []).sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
    )
    for (const c of children) {
      out.push({ ...c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  // Danh mục mồ côi (cha đã xoá) vẫn phải hiện — không được "mất" sản phẩm.
  const seen = new Set(out.map((o) => o.id))
  for (const it of items) if (!seen.has(it.id)) out.push({ ...it, depth: 0 })
  return out
}

/** Nhận diện YouTube → id để nhúng; link khác trả null. */
function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/))([\w-]{6,})/i)
  return m ? m[1] : null
}

function isDirectVideo(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)
}

// ── Breadcrumb ──────────────────────────────────────────────────────

function Crumbs({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground" aria-label="Đường dẫn">
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
          {it.to ? (
            <Link to={it.to} className="hover:text-foreground hover:underline">{it.label}</Link>
          ) : (
            <span className="font-medium text-foreground">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

// ── Trang ───────────────────────────────────────────────────────────

export function SalesDocsPage() {
  const { catId, productId } = useParams<{ catId?: string; productId?: string }>()
  if (productId) return <ProductDetailView productId={productId} />
  if (catId) return <CategoryView catId={catId} />
  return <RootView />
}

// ── Cấp 1: Tổng quan (biểu giá + thư mục danh mục) ──────────────────

function RootView() {
  const catsQ = useProductCategories()
  const prodsQ = useProducts({ pageSize: PAGE_SIZE, status: 'active' })

  const cats = useMemo(() => flattenTree(catsQ.data ?? []), [catsQ.data])
  const products = prodsQ.data?.items ?? []

  // Biểu giá gom theo danh mục, giữ thứ tự cây; SP không có danh mục xuống cuối.
  const priceGroups = useMemo(() => {
    const byCat = new Map<string | null, Product[]>()
    for (const p of products) {
      const arr = byCat.get(p.categoryId ?? null) ?? []
      arr.push(p)
      byCat.set(p.categoryId ?? null, arr)
    }
    const groups = cats
      .filter((c) => (byCat.get(c.id) ?? []).length > 0)
      .map((c) => ({ id: c.id, name: c.name, items: byCat.get(c.id) ?? [] }))
    const orphan = byCat.get(null) ?? []
    if (orphan.length) groups.push({ id: '__none__', name: 'Chưa phân loại', items: orphan })
    return groups
  }, [cats, products])

  const loading = catsQ.isLoading || prodsQ.isLoading
  const error = catsQ.error ?? prodsQ.error

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tài liệu bán hàng"
        description="Biểu giá, danh mục và chi tiết từng sản phẩm (ảnh · mô tả · video) để nhân viên tra cứu khi tư vấn."
      />
      <Crumbs items={[{ label: 'Tài liệu bán hàng' }]} />

      {loading ? (
        <Loading className="py-16" />
      ) : error ? (
        <ErrorState message={apiError(error)} />
      ) : (
        <>
          {/* Thư mục danh mục */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <FolderOpen className="h-4 w-4" /> Danh mục sản phẩm
            </h2>
            {cats.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có danh mục nào. Tạo ở Sản phẩm &amp; Tri thức → Danh mục.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {cats.map((c) => (
                  <Link
                    key={c.id}
                    to={`${ROOT}/c/${c.id}`}
                    className={cn(
                      'group flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/50 hover:bg-accent/40',
                      c.depth > 0 && 'border-dashed',
                    )}
                    style={c.depth > 0 ? { marginLeft: Math.min(c.depth, 2) * 4 } : undefined}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-100 text-xl text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      {c.icon || <Folder className="h-5 w-5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium group-hover:text-primary">{c.name}</span>
                      <span className="block text-xs text-muted-foreground">{c.productCount} sản phẩm</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Biểu giá */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-4 w-4 text-primary" /> Biểu giá sản phẩm
              </CardTitle>
              <CardDescription>
                {products.length} sản phẩm đang bán · bấm vào tên để xem chi tiết
                {prodsQ.data && prodsQ.data.meta.total > products.length && (
                  <> · đang hiện {products.length}/{prodsQ.data.meta.total}</>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {priceGroups.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">Chưa có sản phẩm đang bán.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Sản phẩm</th>
                        <th className="px-4 py-2 text-left font-medium">Mã</th>
                        <th className="px-4 py-2 text-right font-medium">Giá</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceGroups.map((g) => (
                        <GroupRows key={g.id} group={g} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function GroupRows({ group }: { group: { id: string; name: string; items: Product[] } }) {
  return (
    <>
      <tr className="bg-muted/30">
        <td colSpan={3} className="px-4 py-1.5 text-xs font-semibold">
          {group.id === '__none__' ? (
            group.name
          ) : (
            <Link to={`${ROOT}/c/${group.id}`} className="hover:text-primary hover:underline">📁 {group.name}</Link>
          )}
        </td>
      </tr>
      {group.items.map((p) => (
        <tr key={p.id} className="border-t hover:bg-accent/30">
          <td className="px-4 py-2">
            <Link to={`${ROOT}/p/${p.id}`} className="font-medium hover:text-primary hover:underline">{p.name}</Link>
          </td>
          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{p.code || '—'}</td>
          <td className="whitespace-nowrap px-4 py-2 text-right font-medium">{formatProductPrice(p)}</td>
        </tr>
      ))}
    </>
  )
}

// ── Cấp 2: Một danh mục ─────────────────────────────────────────────

function CategoryView({ catId }: { catId: string }) {
  const catsQ = useProductCategories()
  const prodsQ = useProducts({ pageSize: PAGE_SIZE, status: 'active', categoryId: catId })
  const cat = catsQ.data?.find((c) => c.id === catId)
  const products = prodsQ.data?.items ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title={cat?.name ?? 'Danh mục'}
        description={cat?.description || `${products.length} sản phẩm đang bán trong danh mục này.`}
      />
      <Crumbs items={[{ label: 'Tài liệu bán hàng', to: ROOT }, { label: cat?.name ?? '…' }]} />

      {prodsQ.isLoading ? (
        <Loading className="py-16" />
      ) : prodsQ.error ? (
        <ErrorState message={apiError(prodsQ.error)} />
      ) : products.length === 0 ? (
        <p className="text-sm text-muted-foreground">Danh mục này chưa có sản phẩm đang bán.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      )}
    </div>
  )
}

function ProductCard({ p }: { p: Product }) {
  const src = resolveImageUrl(p.images?.[0])
  return (
    <Link to={`${ROOT}/p/${p.id}`} className="group overflow-hidden rounded-lg border bg-card transition-colors hover:border-primary/50">
      <div className="relative aspect-square bg-muted">
        {src ? (
          <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground"><ImageOff className="h-6 w-6" /></div>
        )}
        {p.videoUrls?.length > 0 && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-background/90 p-1 text-primary shadow" title="Có video">
            <PlayCircle className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="space-y-0.5 p-2.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug group-hover:text-primary">{p.name}</p>
        {p.code && <p className="font-mono text-[11px] text-muted-foreground">{p.code}</p>}
        <p className="text-sm font-semibold">{formatProductPrice(p)}</p>
      </div>
    </Link>
  )
}

// ── Cấp 3: Chi tiết sản phẩm ────────────────────────────────────────

function ProductDetailView({ productId }: { productId: string }) {
  const q = useProduct(productId)
  const permsQ = useMyPermissions()
  const canEdit = permsQ.data?.has('products.update') ?? false
  const [editOpen, setEditOpen] = useState(false)
  const [activeImg, setActiveImg] = useState(0)

  const p = q.data
  const images = p?.images ?? []
  const mainSrc = resolveImageUrl(images[Math.min(activeImg, Math.max(images.length - 1, 0))])

  if (q.isLoading) return <Loading className="py-16" />
  if (q.error || !p) return <ErrorState message={q.error ? apiError(q.error) : 'Không tìm thấy sản phẩm'} />

  return (
    <div className="space-y-6">
      <PageHeader
        title={p.name}
        description={[p.code && `Mã: ${p.code}`, p.category?.name].filter(Boolean).join(' · ') || undefined}
        actions={canEdit ? (
          <Button variant="outline" className="gap-1.5" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Chỉnh tài liệu
          </Button>
        ) : undefined}
      />
      <Crumbs items={[
        { label: 'Tài liệu bán hàng', to: ROOT },
        ...(p.category ? [{ label: p.category.name, to: `${ROOT}/c/${p.category.id}` }] : []),
        { label: p.name },
      ]} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* Bộ ảnh */}
        <div className="space-y-2">
          <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
            {mainSrc ? (
              <img src={mainSrc} alt={p.name} className="h-full w-full object-contain" />
            ) : (
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

        {/* Thông tin + mô tả */}
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xl font-bold text-primary">{formatProductPrice(p)}</span>
            {p.status !== 'active' && <Badge variant="secondary">Không hiển thị cho khách</Badge>}
            {p.tags?.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
          </div>

          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Mô tả</h3>
            {p.description ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{p.description}</p>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                Chưa có mô tả.{canEdit ? ' Bấm "Chỉnh tài liệu" để thêm.' : ''}
              </p>
            )}
          </section>

          {p.keywords && (
            <section className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Từ khoá / tên gọi khác</h3>
              <p className="text-xs text-muted-foreground">{p.keywords}</p>
            </section>
          )}
        </div>
      </div>

      {/* Video */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <PlayCircle className="h-4 w-4" /> Video ({p.videoUrls?.length ?? 0})
        </h3>
        {!p.videoUrls?.length ? (
          <p className="text-sm italic text-muted-foreground">
            Chưa có video.{canEdit ? ' Dán link YouTube hoặc mp4 trong "Chỉnh tài liệu".' : ''}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {p.videoUrls.map((v, i) => <VideoBlock key={`${v}-${i}`} url={v} />)}
          </div>
        )}
      </section>

      <SalesDocEditDialog product={p} open={editOpen} onOpenChange={setEditOpen} />
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
