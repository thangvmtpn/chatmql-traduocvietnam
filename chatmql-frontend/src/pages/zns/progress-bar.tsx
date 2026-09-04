import { cn } from '@/lib/utils'

type Tone = 'primary' | 'success' | 'warning' | 'destructive'

const toneMap: Record<Tone, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
}

/** Thanh tiến độ đơn giản (div + width%). Không hardcode màu. */
export function ProgressBar({
  value,
  total,
  tone = 'primary',
  className,
}: {
  value: number
  total: number
  tone?: Tone
  className?: string
}) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn('h-full rounded-full transition-all', toneMap[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
