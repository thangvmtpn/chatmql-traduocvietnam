import { useParams } from 'react-router-dom'
import { FileText, Check, X, Loader2 } from 'lucide-react'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import { BrandLogo } from '@/components/shared/brand-logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loading, EmptyState } from '@/components/shared/feedback'
import { formatNumber } from '@/lib/utils'
import {
  useQuoteByToken,
  useRespondPublicQuote,
  lineTotal,
  quoteStatusVariant,
  quoteError,
  QUOTE_STATUS_LABELS,
  type PublicQuoteError,
} from '@/hooks/use-quotes'

/** Thông điệp theo mã lỗi của `GET /api/public/quotes/:token`. */
const ERROR_TEXT: Record<PublicQuoteError, { title: string; description: string }> = {
  not_found: {
    title: 'Không tìm thấy báo giá',
    description: 'Link có thể không đúng hoặc báo giá chưa được gửi. Vui lòng liên hệ người gửi.',
  },
  expired: {
    title: 'Báo giá đã hết hiệu lực',
    description: 'Vui lòng liên hệ để nhận báo giá mới.',
  },
  gone: {
    title: 'Báo giá không còn khả dụng',
    description: 'Báo giá này đã được thu hồi hoặc huỷ.',
  },
  error: {
    title: 'Không tải được báo giá',
    description: 'Hệ thống đang gặp sự cố, vui lòng thử lại sau.',
  },
}

/**
 * Trang xem báo giá công khai — KHÔNG cần đăng nhập.
 * Được wire NGOÀI AppLayout (route `/q/:token`).
 * Dữ liệu từ `GET /api/public/quotes/:token` (allowlist phía backend, không JWT).
 */
export function PublicQuotePage() {
  const { token } = useParams<{ token: string }>()
  const { data: quote, isLoading, error } = useQuoteByToken(token)
  const respond = useRespondPublicQuote(token)

  const onRespond = (action: 'accept' | 'reject') => {
    const reason = action === 'reject' ? (window.prompt('Lý do từ chối (không bắt buộc):') ?? undefined) : undefined
    respond.mutate(
      { action, reason: reason || undefined },
      {
        onSuccess: () => toast.success(action === 'accept' ? 'Cảm ơn bạn đã chấp nhận báo giá' : 'Đã ghi nhận phản hồi của bạn'),
        onError: (e) => toast.error(quoteError(e)),
      },
    )
  }

  const errText = error ? ERROR_TEXT[error] ?? ERROR_TEXT.error : null

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <BrandLogo />
          <span className="text-sm font-medium text-muted-foreground">Báo giá</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {isLoading ? (
          <Loading label="Đang tải báo giá..." />
        ) : !quote ? (
          <EmptyState
            icon={FileText}
            title={errText?.title ?? ERROR_TEXT.not_found.title}
            description={errText?.description ?? ERROR_TEXT.not_found.description}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            {/* Tiêu đề */}
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-6 py-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {quote.code}
                </p>
                <h1 className="mt-1 text-xl font-bold tracking-tight">
                  {quote.title || 'Báo giá'}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ngày tạo: {dayjs(quote.createdAt).format('DD/MM/YYYY')}
                  {quote.validUntil && ` · Hiệu lực đến ${dayjs(quote.validUntil).format('DD/MM/YYYY')}`}
                </p>
              </div>
              <Badge variant={quoteStatusVariant(quote.status)}>
                {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
              </Badge>
            </div>

            {/* Bên bán / bên mua */}
            <div className="grid gap-3 border-b px-6 py-4 text-sm sm:grid-cols-2">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bên bán</p>
                <p className="font-medium">{quote.seller.name || '—'}</p>
                {quote.seller.taxCode && <p className="text-muted-foreground">MST: {quote.seller.taxCode}</p>}
                {quote.seller.address && <p className="text-muted-foreground">{quote.seller.address}</p>}
                {(quote.seller.phone || quote.seller.email) && (
                  <p className="text-muted-foreground">
                    {[quote.seller.phone, quote.seller.email].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Khách hàng</p>
                <p className="font-medium">{quote.customerName || '—'}</p>
              </div>
            </div>

            {/* Bảng sản phẩm */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-6 py-2.5 text-left font-semibold">Sản phẩm / Dịch vụ</th>
                    <th className="px-4 py-2.5 text-right font-semibold">SL</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Đơn giá</th>
                    <th className="px-6 py-2.5 text-right font-semibold">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lines.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="px-6 py-3">{l.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatNumber(l.quantity)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatNumber(l.unitPrice)}
                      </td>
                      <td className="px-6 py-3 text-right font-medium tabular-nums">
                        {formatNumber(lineTotal(l))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30">
                    <td colSpan={3} className="px-6 py-3 text-right font-semibold">
                      Tổng cộng
                    </td>
                    <td className="px-6 py-3 text-right text-lg font-bold tabular-nums">
                      {formatNumber(quote.total)} {quote.currency}
                    </td>
                  </tr>
                  {quote.totalInWords && (
                    <tr>
                      <td colSpan={4} className="px-6 pb-3 text-right text-xs italic text-muted-foreground">
                        Bằng chữ: {quote.totalInWords}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>

            {/* Ghi chú + điều khoản + thanh toán */}
            {(quote.note || quote.seller.termsText || quote.seller.bankInfo) && (
              <div className="space-y-3 border-t px-6 py-4">
                {quote.note && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ghi chú</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{quote.note}</p>
                  </div>
                )}
                {quote.seller.termsText && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Điều khoản</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{quote.seller.termsText}</p>
                  </div>
                )}
                {quote.seller.bankInfo && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Thanh toán</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{quote.seller.bankInfo}</p>
                  </div>
                )}
              </div>
            )}

            {/* Khách phản hồi — chỉ khi backend cho phép (meta.canRespond) */}
            {quote.canRespond && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/20 px-6 py-4">
                <Button variant="outline" onClick={() => onRespond('reject')} disabled={respond.isPending}>
                  <X /> Từ chối
                </Button>
                <Button onClick={() => onRespond('accept')} disabled={respond.isPending}>
                  {respond.isPending ? <Loader2 className="animate-spin" /> : <Check />} Chấp nhận báo giá
                </Button>
              </div>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {quote?.seller.footerNote || 'Báo giá được tạo bởi hệ thống ChatMQL — Trà Dược Việt Nam.'}
        </p>
      </main>
    </div>
  )
}
