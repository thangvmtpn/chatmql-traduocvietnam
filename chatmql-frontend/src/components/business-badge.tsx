import { Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BusinessBadgeProps {
  isBusiness?: boolean
  tier?: string | null
  className?: string
  showIcon?: boolean
}

export function BusinessBadge({
  isBusiness = true,
  tier,
  className,
  showIcon = true,
}: BusinessBadgeProps) {
  if (!isBusiness) return null

  const tierNormalized = tier?.trim().toLowerCase()
  let label = 'Business'
  if (tierNormalized === 'standard') label = 'Biz Standard'
  else if (tierNormalized === 'pro') label = 'Biz Pro'
  else if (tierNormalized === 'elite') label = 'Biz Elite'
  else if (tier?.trim()) label = `Biz ${tier.trim()}`

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40 select-none',
        className,
      )}
      title={`Tài khoản Zalo Business${tier ? ` (${tier})` : ''}`}
    >
      {showIcon && <Briefcase className="h-2.5 w-2.5 shrink-0" />}
      <span className="truncate">{label}</span>
    </span>
  )
}
