/**
 * backfill-button.tsx — Nút "Kéo lịch sử" trên thanh tiêu đề hội thoại.
 *
 * Port từ mục 3 của `zalo-history-bridge.js`: gọi POST /conversations/:id/backfill
 * để lấy thêm tin nhắn cũ từ Zalo với khách này. Backend chỉ ghi vào DB, KHÔNG
 * kích hoạt AI trả lời hay automation.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { apiError } from '@/lib/api-client'
import { cn, formatNumber } from '@/lib/utils'
import { useBackfillConversation } from '@/hooks/use-zalo-sync'

const DEFAULT_MAX = 200

export function BackfillHistoryButton({
  convId,
  className,
}: {
  convId: string
  className?: string
}) {
  const backfill = useBackfillConversation()
  const [open, setOpen] = useState(false)
  const [maxMessages, setMaxMessages] = useState(String(DEFAULT_MAX))

  const running = backfill.isPending

  const run = () => {
    const n = parseInt(maxMessages, 10)
    const max = Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX
    setOpen(false)
    const t = toast.loading('Đang kéo lịch sử tin nhắn từ Zalo...')
    backfill.mutate(
      { convId, maxMessages: max },
      {
        onSuccess: (res) => {
          toast.success(
            `Đã kéo lịch sử với "${res.displayName || 'khách'}": +${formatNumber(res.inserted)} tin mới, ${formatNumber(res.skipped)} tin đã có.`,
            { id: t, duration: 5000 },
          )
        },
        onError: (err) => toast.error(apiError(err), { id: t }),
      },
    )
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(className)}
        disabled={running}
        onClick={() => setOpen(true)}
        title="Kéo thêm tin nhắn cũ từ Zalo với khách hàng này"
      >
        {running ? <Loader2 className="animate-spin" /> : <Download />}
        {running ? 'Đang kéo...' : 'Kéo lịch sử'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Kéo lịch sử tin nhắn?</DialogTitle>
            <DialogDescription>
              Hệ thống sẽ lấy các tin nhắn cũ của hội thoại này từ Zalo và lưu vào cơ sở dữ liệu
              để tra cứu. Tin đã có sẽ được bỏ qua. Thao tác này <b>không</b> kích hoạt AI trả lời
              hay bất kỳ automation nào.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="backfill-max">Số tin tối đa cần kéo</Label>
            <Input
              id="backfill-max"
              type="number"
              min={1}
              value={maxMessages}
              onChange={(e) => setMaxMessages(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) run()
              }}
            />
            <p className="text-xs text-muted-foreground">
              Tài khoản Zalo của hội thoại phải đang kết nối.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button onClick={run} disabled={running}>
              <Download /> Bắt đầu kéo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
