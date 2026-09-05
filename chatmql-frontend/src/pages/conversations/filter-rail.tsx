import { useMemo, useState } from 'react'
import { Inbox, Mail, MessageCircleWarning, Pin, Users, type LucideIcon } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/misc'
import { statusMeta, useZaloAccounts, type ChannelAccount } from '@/hooks/use-integrations'
import { CHANNEL_GROUPS, groupOfPlatform, type ChannelGroupId } from '@/lib/channel-groups'
import { BusinessBadge } from '@/components/business-badge'
import { FEATURES } from '@/lib/features'
import { cn, initials } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// Kiểu dữ liệu
// ─────────────────────────────────────────────────────────────────────────────

/** Bộ lọc nhanh của danh sách hội thoại. */
export type ConvFilter = 'all' | 'unread' | 'unreplied' | 'pinned'

export interface FilterRailProps {
  /** Bộ lọc đang được chọn. */
  filter: ConvFilter
  /** Đổi bộ lọc. */
  onFilterChange: (f: ConvFilter) => void
  /** Tài khoản kênh đang lọc (bỏ trống = tất cả tài khoản). */
  accountId?: string
  /** Đổi tài khoản kênh; `undefined` nghĩa là "Tất cả tài khoản". */
  onAccountChange: (id?: string) => void
  /** Số đếm hiển thị trên badge. */
  counts?: { unread: number; unreplied: number; total: number }
}

interface FilterItem {
  value: ConvFilter
  label: string
  icon: LucideIcon
}

const FILTER_ITEMS: FilterItem[] = [
  { value: 'all', label: 'Tất cả', icon: Inbox },
  { value: 'unread', label: 'Chưa đọc', icon: Mail },
  { value: 'unreplied', label: 'Chưa trả lời', icon: MessageCircleWarning },
  // Backend TDVN không có ghim → không có bộ lọc "Đã ghim".
  ...(FEATURES.CHAT_PIN ? [{ value: 'pinned' as const, label: 'Đã ghim', icon: Pin }] : []),
]

/** Rút gọn số lớn để badge không bị tràn (99+). */
function shortCount(n: number): string {
  return n > 99 ? '99+' : String(n)
}

// ─────────────────────────────────────────────────────────────────────────────
// Cột lọc dạng icon rail (ngoài cùng bên trái màn Hội thoại)
// ─────────────────────────────────────────────────────────────────────────────

export function FilterRail({
  filter,
  onFilterChange,
  accountId,
  onAccountChange,
  counts,
}: FilterRailProps) {
  const { data: accounts, isLoading } = useZaloAccounts()
  const list: ChannelAccount[] = accounts ?? []
  const selected = accountId ? list.find((a) => a.id === accountId) : undefined
  const selectedPhone = selected?.phone ? (selected.phone.startsWith('+84') ? '0' + selected.phone.slice(3) : selected.phone) : null
  const selectedName = selected?.displayName ?? 'Không tên'
  const selectedFullName = selectedPhone && !selectedName.includes(selectedPhone) && !selectedName.replace(/\D/g, '').includes(selectedPhone.replace(/\D/g, ''))
    ? `${selectedName} (${selectedPhone})`
    : selectedName

  // Tab loại kênh trong bảng chọn tài khoản. `null` = "Tất cả".
  const [group, setGroup] = useState<ChannelGroupId | null>(null)

  // Chỉ hiện tab của nhóm thật sự có tài khoản — công ty không dùng sàn TMĐT
  // thì không phải nhìn một tab rỗng mỗi lần mở bảng.
  const groupTabs = useMemo(() => {
    const count = new Map<ChannelGroupId, number>()
    for (const a of list) {
      const g = groupOfPlatform(a.platform)
      count.set(g, (count.get(g) ?? 0) + 1)
    }
    return CHANNEL_GROUPS
      .filter((g) => (count.get(g.id) ?? 0) > 0)
      .map((g) => ({ ...g, count: count.get(g.id) ?? 0 }))
  }, [list])

  // Nhóm đang chọn biến mất (tài khoản cuối bị gỡ) thì rơi về "Tất cả".
  const activeGroup = group && groupTabs.some((g) => g.id === group) ? group : null
  const visible = activeGroup ? list.filter((a) => groupOfPlatform(a.platform) === activeGroup) : list

  const countOf = (value: ConvFilter): number => {
    if (!counts) return 0
    if (value === 'unread') return counts.unread
    if (value === 'unreplied') return counts.unreplied
    return 0
  }

  return (
    <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r bg-background py-3">
      {/* ── Ô vuông chọn tài khoản ─────────────────────────────── */}
      {isLoading ? (
        <div
          className="h-10 w-10 animate-pulse rounded-lg border bg-muted"
          aria-label="Đang tải tài khoản"
        />
      ) : (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Chọn tài khoản"
                  className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border bg-background transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {selected ? (
                    <Avatar className="h-8 w-8 rounded-md">
                      <AvatarImage src={selected.avatarUrl ?? undefined} alt={selectedName} />
                      <AvatarFallback className="rounded-md text-xs">
                        {initials(selected.displayName)}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <Users className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">
              {selected
                ? `${selectedFullName}${selected.isBusiness ? ` [Business${selected.businessTier ? ` - ${selected.businessTier.toUpperCase()}` : ''}]` : ''}`
                : 'Tất cả tài khoản'}
            </TooltipContent>
          </Tooltip>

          <DropdownMenuContent side="right" align="start" className="w-64">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs font-semibold">Tài khoản kênh</span>
              {selected && (
                <button
                  type="button"
                  onClick={() => onAccountChange(undefined)}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Bỏ lọc
                </button>
              )}
            </div>

            {/* Tab phân loại kênh */}
            {groupTabs.length > 1 && (
              <div className="px-1.5 pb-1">
                <div className="grid grid-cols-4 gap-0.5 rounded-md bg-muted/60 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setGroup(null)}
                    className={cn(
                      'rounded px-1.5 py-1 font-medium transition-colors',
                      !activeGroup ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Tất cả
                  </button>
                  {groupTabs.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGroup(g.id)}
                      className={cn(
                        'truncate rounded px-1.5 py-1 font-medium transition-colors',
                        activeGroup === g.id ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {g.label} ({g.count})
                    </button>
                  ))}
                </div>
              </div>
            )}

            <DropdownMenuSeparator />

            {visible.map((acc) => {
              const meta = statusMeta(acc.liveStatus, acc.isDisabled)
              const name = acc.displayName ?? 'Không tên'
              const phoneLabel = acc.phone ? (acc.phone.startsWith('+84') ? '0' + acc.phone.slice(3) : acc.phone) : null
              const hasPhoneInName = phoneLabel && (
                name.includes(phoneLabel) ||
                name.replace(/\D/g, '').includes(phoneLabel.replace(/\D/g, ''))
              )
              const fullName = phoneLabel && !hasPhoneInName ? `${name} (${phoneLabel})` : name

              return (
                <DropdownMenuItem
                  key={acc.id}
                  onSelect={() => onAccountChange(acc.id)}
                  className={cn('gap-2', accountId === acc.id && 'bg-accent text-accent-foreground')}
                >
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={acc.avatarUrl ?? undefined} alt={fullName} />
                    <AvatarFallback className="text-xs">{initials(acc.displayName)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate" title={fullName}>{fullName}</span>
                  {acc.isBusiness && (
                    <BusinessBadge tier={acc.businessTier} showIcon={false} className="px-1 py-0 text-[9px]" />
                  )}
                  <Badge variant={meta.variant} className="shrink-0 px-1.5 py-0 text-[10px]">
                    {meta.label}
                  </Badge>
                </DropdownMenuItem>
              )
            })}

            {visible.length === 0 && (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                {list.length === 0 ? 'Chưa có tài khoản kênh nào' : 'Nhóm này chưa có tài khoản nào'}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* ── Ngăn cách ──────────────────────────────────────────── */}
      <Separator className="my-2 w-8" />

      {/* ── Nhóm nút lọc (chỉ icon) ───────────────────────────── */}
      <nav className="flex flex-col items-center gap-1" aria-label="Bộ lọc hội thoại">
        {FILTER_ITEMS.map(({ value, label, icon: Icon }) => {
          const active = filter === value
          const count = countOf(value)
          return (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={label}
                  aria-pressed={active}
                  onClick={() => onFilterChange(value)}
                  className={cn(
                    'relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {count > 0 && (
                    <span
                      className={cn(
                        'absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none',
                        active
                          ? 'bg-primary-foreground text-primary'
                          : 'bg-destructive text-destructive-foreground',
                      )}
                    >
                      {shortCount(count)}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          )
        })}
      </nav>
    </aside>
  )
}

/** Một tab loại kênh trong bảng chọn tài khoản. */
function GroupTab({
  label, count, active, onClick,
}: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-transparent bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  )
}
