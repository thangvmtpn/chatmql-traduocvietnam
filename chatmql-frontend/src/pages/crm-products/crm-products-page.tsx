/**
 * crm-products-page.tsx — Module "Sản phẩm (CRM)".
 *
 * Khác hẳn trang "Sản phẩm & Tri thức": ở đây ChatMQL KHÔNG sở hữu dữ liệu.
 * Mỗi lần gõ là một lần hỏi thẳng CRM, nên giá và tồn kho luôn là số thật của
 * hệ thống nội bộ — không có bản sao để lệch. Vì vậy trang này chỉ để tra cứu,
 * không có nút thêm/sửa/xoá; muốn đổi sản phẩm thì đổi bên CRM.
 */
import { useEffect, useMemo, useState } from 'react'
import { Loader2, PackageSearch, RefreshCw, Search, ServerCog } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { ErrorState, Loading } from '@/components/shared/feedback'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiError } from '@/lib/api-client'
import { formatVnd } from '@/lib/order-calc'
import { SOURCE_LABELS, useCrmProductSearch, useCrmProductSource, type CrmProduct } from '@/hooks/use-crm-products'

/** Cột phụ lấy từ `raw` — CRM trả gì thêm thì hiện nấy, không cần sửa backend. */
const EXTRA_KEYS = ['vat_note', 'status', 'barcode', 'category', 'nhom_sp'] as const

function formatNumber(n: number | null): string {
  return n == null ? '—' : new Intl.NumberFormat('vi-VN').format(n)
}

export function CrmProductsPage() {
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const sourceQ = useCrmProductSource()
  const searchQ = useCrmProductSearch(q, 50)

  // Chống gọi CRM mỗi lần gõ một ký tự.
  useEffect(() => {
    const t = setTimeout(() => setQ(input), 400)
    return () => clearTimeout(t)
  }, [input])

  const products = searchQ.data?.products ?? []
  const extraCols = useMemo(() => {
    const present = new Set<string>()
    for (const p of products) {
      for (const k of EXTRA_KEYS) if (p.raw?.[k] != null && p.raw[k] !== '') present.add(k)
    }
    return [...present]
  }, [products])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sản phẩm (CRM)"
        description="Tra cứu sản phẩm lấy trực tiếp từ hệ thống CRM — giá và tồn kho là số thật, không phải bản sao."
        actions={
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => searchQ.refetch()}
            disabled={!q || searchQ.isFetching}
          >
            <RefreshCw className={searchQ.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Tải lại
          </Button>
        }
      />

      {sourceQ.data && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ServerCog className="h-3.5 w-3.5" />
          Nguồn dữ liệu: <b className="text-foreground">{SOURCE_LABELS[sourceQ.data.source]}</b>
          {sourceQ.data.source === 'dashboard' && (
            <span className="text-warning">· token có hạn, hết hạn phải cấu hình lại</span>
          )}
        </p>
      )}

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Gõ tên hoặc mã sản phẩm để tìm trên CRM…"
          className="pl-9"
          autoFocus
        />
        {searchQ.isFetching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {!q ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <PackageSearch className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Nhập từ khoá để tra cứu</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Dữ liệu không lưu ở ChatMQL. Mỗi lần tìm là một lần hỏi CRM, nên kết quả luôn khớp
            với hệ thống nội bộ.
          </p>
        </div>
      ) : searchQ.isLoading ? (
        <Loading className="py-16" />
      ) : searchQ.error ? (
        <ErrorState message={apiError(searchQ.error)} />
      ) : products.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Không tìm thấy sản phẩm nào khớp “{q}”.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Mã</th>
                <th className="px-3 py-2 text-left font-medium">Tên sản phẩm</th>
                <th className="px-3 py-2 text-right font-medium">Giá</th>
                <th className="px-3 py-2 text-right font-medium">Tồn</th>
                <th className="px-3 py-2 text-left font-medium">ĐVT</th>
                <th className="px-3 py-2 text-left font-medium">Kho</th>
                {extraCols.map((k) => (
                  <th key={k} className="px-3 py-2 text-left font-medium">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => <Row key={`${p.code ?? p.id ?? i}`} p={p} extraCols={extraCols} />)}
            </tbody>
          </table>
        </div>
      )}

      {products.length > 0 && (
        <p className="text-xs text-muted-foreground">{products.length} sản phẩm · dữ liệu thời điểm hiện tại từ CRM</p>
      )}
    </div>
  )
}

function Row({ p, extraCols }: { p: CrmProduct; extraCols: string[] }) {
  return (
    <tr className="border-t hover:bg-accent/30">
      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{p.code ?? '—'}</td>
      <td className="px-3 py-2 font-medium">{p.name}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {p.price == null ? '—' : formatVnd(p.price)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
        {p.inventory == null ? '—' : p.inventory > 0
          ? <span className="font-semibold text-success">{formatNumber(p.inventory)}</span>
          : <Badge variant="destructive">Hết hàng</Badge>}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{p.unit ?? '—'}</td>
      <td className="px-3 py-2 text-muted-foreground">{p.warehouseName ?? (p.warehouseId != null ? `#${p.warehouseId}` : '—')}</td>
      {extraCols.map((k) => (
        <td key={k} className="px-3 py-2 text-xs text-muted-foreground">{String(p.raw?.[k] ?? '—')}</td>
      ))}
    </tr>
  )
}
