/**
 * employee-accounts-dialog.tsx — Gán tài khoản giao tiếp cho MỘT nhân viên.
 *
 * Chiều ngược lại của khung "Theo tài khoản" (đi từ tài khoản → chọn người).
 * Cả hai sửa cùng một bảng `ChannelAccountAccess` — quan hệ nhiều-nhiều:
 *   · một nhân viên phụ trách nhiều tài khoản
 *   · một tài khoản có nhiều nhân viên cùng dùng chung
 *
 * Chỉ liệt kê tài khoản đã kết nối thật (`?connected=true`), gom theo nền tảng
 * để dễ tìm khi tổ chức có nhiều kênh (Zalo OA · Zalo cá nhân · Facebook…).
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Check, Loader2, Search, Wifi, WifiOff } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/misc'
import { Input } from '@/components/ui/input'
import { Loading, EmptyState } from '@/components/shared/feedback'
import { useTeam, useGrantZaloAccess, useRevokeZaloAccess, type TeamMember } from '@/hooks/use-settings'
import { useZaloAccounts } from '@/hooks/use-integrations'
import { apiError } from '@/lib/api-client'
import { PLATFORM_LABEL, cleanPhoneNumber, formatAccountWithPhone } from './settings-utils'
import { BusinessBadge } from '@/components/business-badge'
import { cn } from '@/lib/utils'

interface Props {
  member: TeamMember | null
  onClose: () => void
}

/** owner/admin/manager bỏ qua ACL nên gán cho họ là vô nghĩa. */
function needsExplicitAccess(role: string): boolean {
  return role === 'member'
}

export function EmployeeAccountsDialog({ member, onClose }: Props) {
  // Lấy toàn bộ tài khoản kênh (kể cả đang ngắt kết nối) để quản trị viên thấy và phân quyền
  const { data: accounts, isLoading } = useZaloAccounts()
  const { data: team } = useTeam()
  const grant = useGrantZaloAccess()
  const revoke = useRevokeZaloAccess()
  const [busy, setBusy] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Đọc bản MỚI NHẤT từ query thay vì prop `member` — prop là ảnh chụp lúc mở
  // popup, tick xong sẽ không đổi. Fallback về prop khi query chưa kịp về.
  const fresh = team?.find((m) => m.id === member?.id) ?? member
  const assigned = new Set((fresh?.accounts ?? []).map((a) => a.id))

  const toggle = async (accountId: string, name: string, checked: boolean) => {
    if (!member) return
    setBusy(accountId)
    try {
      if (checked) await grant.mutateAsync({ accountId, userId: member.id })
      else await revoke.mutateAsync({ accountId, userId: member.id })
      toast.success(checked ? `Đã giao ${name}` : `Đã gỡ ${name}`)
    } catch (e) {
      toast.error(apiError(e))
    } finally {
      setBusy(null)
    }
  }

  // Lọc theo từ khóa tìm kiếm (tên, số điện thoại hoặc nhãn business)
  const q = search.trim().toLowerCase()
  const filtered = (accounts ?? []).filter((a) => {
    if (!q) return true
    const name = (a.displayName ?? '').toLowerCase()
    const phone = (a.phone ?? '').toLowerCase()
    const clean = (cleanPhoneNumber(a.phone) ?? '').toLowerCase()
    const tier = (a.businessTier ?? '').toLowerCase()
    const matchBiz = (q === 'biz' || q === 'business') && a.isBusiness
    return name.includes(q) || phone.includes(q) || clean.includes(q) || matchBiz || (a.isBusiness && tier.includes(q))
  })

  // Sắp xếp: tài khoản đã được gán lên đầu để dễ thấy, sau đó ưu tiên tài khoản đang kết nối
  const sorted = [...filtered].sort((a, b) => {
    const aAssigned = assigned.has(a.id) ? 1 : 0
    const bAssigned = assigned.has(b.id) ? 1 : 0
    if (aAssigned !== bAssigned) return bAssigned - aAssigned
    const aOnline = (a.liveStatus ?? a.status) === 'connected' ? 1 : 0
    const bOnline = (b.liveStatus ?? b.status) === 'connected' ? 1 : 0
    return bOnline - aOnline
  })

  // Gom theo nền tảng, giữ thứ tự xuất hiện
  const byPlatform = new Map<number, typeof accounts>()
  for (const a of sorted) {
    const list = byPlatform.get(a.platform) ?? []
    list.push(a)
    byPlatform.set(a.platform, list)
  }

  const canAssign = member ? needsExplicitAccess(member.role) : false

  return (
    <Dialog open={!!member} onOpenChange={(o) => { if (!o) { setSearch(''); onClose() } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Tài khoản phụ trách</DialogTitle>
          <DialogDescription className="text-xs">
            {member?.fullName || member?.email} — chọn những tài khoản giao tiếp nhân viên này được
            vào để trả lời khách. Một tài khoản có thể giao cho nhiều người cùng dùng.
          </DialogDescription>
        </DialogHeader>

        {canAssign && (accounts?.length ?? 0) > 3 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Tìm theo tên hoặc số điện thoại..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-xs"
            />
          </div>
        )}

        {!canAssign ? (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Chủ sở hữu, quản trị và quản lý <strong>luôn vào được mọi tài khoản</strong> nên không
            cần giao riêng.
          </div>
        ) : isLoading ? (
          <Loading label="Đang tải tài khoản…" />
        ) : !accounts?.length ? (
          <EmptyState
            icon={Wifi}
            title="Chưa có tài khoản nào được kết nối"
            description="Kết nối Zalo OA, Zalo cá nhân hoặc Facebook ở mục Tích hợp trước."
          />
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
            Không tìm thấy tài khoản nào khớp với "{search}"
          </div>
        ) : (
          <div className="max-h-[26rem] space-y-3 overflow-y-auto">
            {[...byPlatform.entries()].map(([platform, list]) => (
              <div key={platform}>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {PLATFORM_LABEL[platform] ?? `Nền tảng ${platform}`}
                </p>
                <ul className="divide-y rounded-lg border">
                  {(list ?? []).map((a) => {
                    const checked = assigned.has(a.id)
                    const online = (a.liveStatus ?? a.status) === 'connected'
                    const phoneLabel = cleanPhoneNumber(a.phone)
                    const name = a.displayName || 'Không tên'
                    const hasPhoneInName = phoneLabel && (
                      name.includes(phoneLabel) ||
                      name.replace(/\D/g, '').includes(phoneLabel.replace(/\D/g, ''))
                    )
                    const accountLabel = formatAccountWithPhone(a.displayName, a.phone)

                    return (
                      <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                        <Checkbox
                          checked={checked}
                          disabled={busy === a.id}
                          onCheckedChange={(v) => toggle(a.id, accountLabel, v === true)}
                          aria-label={accountLabel}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                            <span className="truncate">{name}</span>
                            {phoneLabel && !hasPhoneInName && (
                              <span className="shrink-0 rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[11px] font-normal text-muted-foreground">
                                {phoneLabel}
                              </span>
                            )}
                            {a.isBusiness && (
                              <BusinessBadge tier={a.businessTier} />
                            )}
                          </span>
                          <span className={cn(
                            'flex items-center gap-1 text-xs',
                            online ? 'text-success' : 'text-muted-foreground',
                          )}>
                            {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                            {online ? 'Đang kết nối' : 'Mất kết nối'}
                          </span>
                        </span>
                        {busy === a.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : checked ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        {canAssign && (
          <p className="text-xs text-muted-foreground">
            Đang phụ trách <Badge variant="secondary" className="mx-0.5">{assigned.size}</Badge>
            tài khoản.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
