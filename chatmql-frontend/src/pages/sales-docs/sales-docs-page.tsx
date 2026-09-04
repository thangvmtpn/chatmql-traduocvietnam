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
import { useAllProductDocs, useProductDoc } from '@/hooks/use-product-docs'
import { useDocFolders, type DocFolder } from '@/hooks/use-doc-library'
import { SalesDocEditDialog } from './sales-doc-edit-dialog'

const ROOT = '/sales-docs'
/** Phần tài liệu mà trang tổng quan cần — không cần cả bản ghi. */
type ProductDocLite = {
  productCode: string
  folderId: string | null
  description: string | null
  images: string[]
  videoUrls: string[]
}

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
  if (catId) return <CategoryView folderId={decodeURIComponent(catId)} />
  return <RootView />
}

// ── Cấp 1: Tổng quan ────────────────────────────────────────────────

/**
 * Trang đầu phải trả lời ngay 2 câu hỏi của người mở tài liệu bán hàng:
 * "giá bao nhiêu" và "công ty bán những gì". Nên bố cục là:
 *   1. Bảng giá tổng sản phẩm (thu gọn được)
 *   2. Cây danh mục nhiều cấp (Trà > Trà xanh > sản phẩm)
 *
 * Cây danh mục lấy từ `doc_folders` — do admin tự dựng, lồng bao nhiêu cấp cũng
 * được. Sản phẩm gắn vào một nhánh qua `product_docs.folderId`. Sản phẩm chưa
 * gắn thì gom vào nhánh ảo "Chưa phân loại" để không biến mất.
 */
function RootView() {
  const q = useAllProducts()
  const foldersQ = useDocFolders()
  const docsQ = useAllProductDocs()
  const [showPrices, setShowPrices] = useState(false)

  const products = q.data?.products ?? []
  const folders = foldersQ.data ?? []
  const docs = docsQ.data ?? []

  /** Mã sản phẩm → thư mục đang gắn. */
  const folderOfCode = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const d of docs) m.set(d.productCode.toUpperCase(), d.folderId)
    return m
  }, [docs])

  /** Sản phẩm thuộc TRỰC TIẾP một thư mục (không tính thư mục con). */
  const productsByFolder = useMemo(() => {
    const m = new Map<string | null, CrmProduct[]>()
    for (const p of products) {
      const fid = p.code ? folderOfCode.get(p.code.toUpperCase()) ?? null : null
      const arr = m.get(fid) ?? []
      arr.push(p)
      m.set(fid, arr)
    }
    return m
  }, [products, folderOfCode])

  const childrenOf = useMemo(() => {
    const m = new Map<string | null, DocFolder[]>()
    for (const f of folders) {
      const arr = m.get(f.parentId) ?? []
      arr.push(f)
      m.set(f.parentId, arr)
    }
    for (const [, arr] of m) arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    return m
  }, [folders])

  /** Tổng sản phẩm của một nhánh, tính cả cây con. */
  const totalOf = useMemo(() => {
    const memo = new Map<string, number>()
    const walk = (id: string): number => {
      if (memo.has(id)) return memo.get(id)!
      let n = (productsByFolder.get(id) ?? []).length
      for (const c of childrenOf.get(id) ?? []) n += walk(c.id)
      memo.set(id, n)
      return n
    }
    for (const f of folders) walk(f.id)
    return memo
  }, [folders, childrenOf, productsByFolder])

  const unfiled = productsByFolder.get(null) ?? []
  const roots = childrenOf.get(null) ?? []
  const loading = q.isLoading || foldersQ.isLoading || docsQ.isLoading

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tài liệu bán hàng"
        description="Bảng giá tổng và toàn bộ danh mục sản phẩm kèm mô tả, hình ảnh, video — nhân viên tra cứu, AI đọc khi tư vấn."
        actions={
          <Button variant="outline" className="gap-1.5" asChild>
            <Link to={`${ROOT}/library`}><FolderOpen className="h-4 w-4" /> Thư viện tài liệu</Link>
          </Button>
        }
      />
      <Crumbs items={[{ label: 'Tài liệu bán hàng' }]} />

      {loading ? (
        <Loading className="py-16" />
      ) : q.error ? (
        <ErrorState message={apiError(q.error)} />
      ) : (
        <>
          {/* 1. Bảng giá tổng — thu gọn mặc định để cây danh mục nằm ngay tầm mắt. */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ReceiptText className="h-4 w-4 text-primary" /> Bảng giá tổng sản phẩm
                  </CardTitle>
                  <CardDescription>
                    {products.length} sản phẩm · {docs.length} đã có tài liệu
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowPrices((v) => !v)}>
                  {showPrices ? 'Thu gọn' : 'Xem bảng giá'}
                </Button>
              </div>
            </CardHeader>
            {showPrices && (
              <CardContent className="p-0">
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/95 text-xs uppercase text-muted-foreground backdrop-blur">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Sản phẩm</th>
                        <th className="px-4 py-2 text-left font-medium">Mã</th>
                        <th className="px-4 py-2 text-right font-medium">Giá</th>
                        <th className="px-4 py-2 text-center font-medium">Tài liệu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => {
                        const d = p.code ? docs.find((x) => x.productCode === p.code!.toUpperCase()) : undefined
                        const has = !!(d && (d.description || d.images.length || d.videoUrls.length))
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
                              {has ? <Badge variant="secondary">Đã có</Badge> : <span className="text-xs text-muted-foreground">Chưa soạn</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>

          {/* 2. Cây danh mục nhiều cấp */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <FolderOpen className="h-4 w-4" /> Danh mục sản phẩm
            </h2>

            {roots.length === 0 && unfiled.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Chưa có danh mục nào. Tạo cây danh mục ở <Link to={`${ROOT}/library`} className="text-primary hover:underline">Thư viện tài liệu</Link>,
                rồi gán sản phẩm vào danh mục khi soạn tài liệu.
              </p>
            ) : (
              <div className="space-y-1.5">
                {roots.map((f) => (
                  <CategoryNode
                    key={f.id}
                    folder={f}
                    depth={0}
                    childrenOf={childrenOf}
                    productsByFolder={productsByFolder}
                    totalOf={totalOf}
                    docs={docs}
                  />
                ))}
                {unfiled.length > 0 && (
                  <details className="rounded-lg border">
                    <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">
                      Chưa phân loại <span className="text-muted-foreground">({unfiled.length})</span>
                    </summary>
                    <div className="grid grid-cols-2 gap-3 border-t p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {unfiled.map((p) => (
                        <ProductCard key={p.code ?? p.name} p={p} doc={p.code ? docs.find((d) => d.productCode === p.code!.toUpperCase()) : undefined} />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/**
 * Một nhánh của cây danh mục. Mở sẵn hai cấp đầu để người xem thấy ngay cấu
 * trúc; sâu hơn thì phải bấm, tránh trang dài lê thê.
 */
function CategoryNode({
  folder, depth, childrenOf, productsByFolder, totalOf, docs,
}: {
  folder: DocFolder
  depth: number
  childrenOf: Map<string | null, DocFolder[]>
  productsByFolder: Map<string | null, CrmProduct[]>
  totalOf: Map<string, number>
  docs: ProductDocLite[]
}) {
  const kids = childrenOf.get(folder.id) ?? []
  const own = productsByFolder.get(folder.id) ?? []
  const total = totalOf.get(folder.id) ?? 0

  return (
    <details open={depth < 2} className={cn('rounded-lg border', depth > 0 && 'border-dashed')}>
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm">
        <Folder className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="font-medium">{folder.icon ? `${folder.icon} ` : ''}{folder.name}</span>
        <span className="text-xs text-muted-foreground">({total} sản phẩm)</span>
        {folder.description && (
          <span className="ml-2 hidden truncate text-xs text-muted-foreground sm:inline">{folder.description}</span>
        )}
      </summary>

      <div className="space-y-3 border-t p-3">
        {kids.length > 0 && (
          <div className="space-y-1.5">
            {kids.map((k) => (
              <CategoryNode
                key={k.id}
                folder={k}
                depth={depth + 1}
                childrenOf={childrenOf}
                productsByFolder={productsByFolder}
                totalOf={totalOf}
                docs={docs}
              />
            ))}
          </div>
        )}

        {own.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {own.map((p) => (
              <ProductCard key={p.code ?? p.name} p={p} doc={p.code ? docs.find((d) => d.productCode === p.code!.toUpperCase()) : undefined} />
            ))}
          </div>
        ) : kids.length === 0 ? (
          <p className="text-xs text-muted-foreground">Chưa có sản phẩm nào trong danh mục này.</p>
        ) : null}
      </div>
    </details>
  )
}

// ── Cấp 2: Một danh mục (folderId) ──────────────────────────────────

/** Xem riêng một nhánh — gồm cả sản phẩm của các thư mục con. */
function CategoryView({ folderId }: { folderId: string }) {
  const q = useAllProducts()
  const foldersQ = useDocFolders()
  const docsQ = useAllProductDocs()

  const folders = foldersQ.data ?? []
  const docs = docsQ.data ?? []
  const folder = folders.find((f) => f.id === folderId)

  // Nhánh này gồm chính nó + toàn bộ thư mục con.
  const branchIds = useMemo(() => {
    const childrenOf = new Map<string | null, string[]>()
    for (const f of folders) {
      const arr = childrenOf.get(f.parentId) ?? []
      arr.push(f.id)
      childrenOf.set(f.parentId, arr)
    }
    const out = new Set<string>([folderId])
    const stack = [folderId]
    while (stack.length) {
      const cur = stack.pop()!
      for (const c of childrenOf.get(cur) ?? []) if (!out.has(c)) { out.add(c); stack.push(c) }
    }
    return out
  }, [folders, folderId])

  const products = useMemo(() => {
    const codeToFolder = new Map(docs.map((d) => [d.productCode.toUpperCase(), d.folderId]))
    return (q.data?.products ?? []).filter((p) => {
      const fid = p.code ? codeToFolder.get(p.code.toUpperCase()) : null
      return fid ? branchIds.has(fid) : false
    })
  }, [q.data, docs, branchIds])

  const loading = q.isLoading || foldersQ.isLoading || docsQ.isLoading

  return (
    <div className="space-y-6">
      <PageHeader
        title={folder ? `${folder.icon ? `${folder.icon} ` : ''}${folder.name}` : 'Danh mục'}
        description={folder?.description || `${products.length} sản phẩm trong nhánh này (tính cả danh mục con).`}
      />
      <Crumbs items={[{ label: 'Tài liệu bán hàng', to: ROOT }, { label: folder?.name ?? '…' }]} />

      {loading ? (
        <Loading className="py-16" />
      ) : q.error ? (
        <ErrorState message={apiError(q.error)} />
      ) : products.length === 0 ? (
        <p className="text-sm text-muted-foreground">Danh mục này chưa có sản phẩm nào được gán.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((p) => (
            <ProductCard
              key={p.code ?? p.name}
              p={p}
              doc={p.code ? docs.find((d) => d.productCode === p.code!.toUpperCase()) : undefined}
            />
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
