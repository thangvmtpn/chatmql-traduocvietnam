import { useState } from 'react'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import { MessageCircle, Plus, RefreshCw, LogIn, Unplug, Loader2, Briefcase, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loading, ErrorState, EmptyState } from '@/components/shared/feedback'
import { apiError } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import {
  useZaloAccounts,
  useConnectZalo,
  useZaloLogin,
  useZaloReconnect,
  useDeleteZaloAccount,
  useUpdateZaloAccount,
  statusMeta,
  type ChannelAccount,
} from '@/hooks/use-integrations'
import { BusinessBadge } from '@/components/business-badge'
import { ChannelCard } from './channel-card'
import { QrLoginDialog } from './qr-login-dialog'

export function ZaloPersonalTab() {
  const { data, isLoading, isError } = useZaloAccounts('personal')
  const connect = useConnectZalo()
  const login = useZaloLogin()
  const reconnect = useZaloReconnect()
  const remove = useDeleteZaloAccount()
  const updateAccount = useUpdateZaloAccount()

  const [qrAccountId, setQrAccountId] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [toDelete, setToDelete] = useState<ChannelAccount | null>(null)

  const openQr = (accountId: string) => {
    setQrAccountId(accountId)
    setQrOpen(true)
  }

  const handleConnect = () => {
    connect.mutate(undefined, {
      onSuccess: (res) => openQr(res.accountId),
      onError: (e) => toast.error(apiError(e)),
    })
  }

  const handleRelogin = (acc: ChannelAccount) => {
    login.mutate(acc.id, {
      onSuccess: () => openQr(acc.id),
      onError: (e) => toast.error(apiError(e)),
    })
  }

  const handleReconnect = (acc: ChannelAccount) => {
    reconnect.mutate(acc.id, {
      onSuccess: () => toast.success('Đang kết nối lại bằng phiên đã lưu...'),
      onError: (e) => toast.error(apiError(e)),
    })
  }

  const handleDelete = () => {
    if (!toDelete) return
    remove.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Đã ngắt kết nối tài khoản')
        setToDelete(null)
      },
      onError: (e) => toast.error(apiError(e)),
    })
  }

  const handleSetBusiness = async (acc: ChannelAccount, isBusiness: boolean, tier: string | null) => {
    try {
      await updateAccount.mutateAsync({
        id: acc.id,
        isBusiness,
        businessTier: isBusiness ? tier : null,
      })
      toast.success(
        isBusiness
          ? `Đã gắn nhãn Business${tier ? ` (${tier.toUpperCase()})` : ''} cho "${acc.displayName || acc.phone || 'tài khoản'}"`
          : `Đã chuyển "${acc.displayName || acc.phone || 'tài khoản'}" về tài khoản cá nhân thường`,
      )
    } catch (err) {
      toast.error(apiError(err) || 'Không thể cập nhật loại tài khoản')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Kết nối tài khoản Zalo cá nhân bằng mã QR để đồng bộ hội thoại và bạn bè.
        </p>
        <Button onClick={handleConnect} disabled={connect.isPending}>
          {connect.isPending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Plus />
          )}
          Kết nối
        </Button>
      </div>

      {isLoading ? (
        <Loading label="Đang tải tài khoản Zalo..." />
      ) : isError ? (
        <ErrorState />
      ) : !data?.length ? (
        <EmptyState
          icon={MessageCircle}
          title="Chưa có tài khoản Zalo cá nhân"
          description="Nhấn Kết nối và quét mã QR bằng ứng dụng Zalo trên điện thoại."
        />
      ) : (
        <div className="space-y-3">
          {data.map((acc) => {
            const st = acc.liveStatus
            const isConnected = st === 'connected' && !acc.isDisabled
            const isUpdating = updateAccount.isPending && updateAccount.variables?.id === acc.id
            const currentTier = acc.businessTier?.toLowerCase()

            return (
              <ChannelCard
                key={acc.id}
                icon={<MessageCircle className="h-5 w-5" />}
                avatarUrl={acc.avatarUrl}
                title={acc.displayName || acc.phone || 'Tài khoản Zalo'}
                subtitle={
                  <>
                    {acc.phone ? `${acc.phone} · ` : ''}
                    {acc.lastConnectedAt
                      ? `Kết nối lần cuối ${dayjs(acc.lastConnectedAt).format('DD/MM/YYYY HH:mm')}`
                      : 'Chưa từng kết nối'}
                  </>
                }
                badge={<BusinessBadge isBusiness={acc.isBusiness} tier={acc.businessTier} />}
                status={statusMeta(st, acc.isDisabled)}
                actions={
                  <>
                    {/* Menu cấu hình nhãn Business */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant={acc.isBusiness ? 'outline' : 'ghost'}
                          size="sm"
                          disabled={isUpdating}
                          className={cn(
                            'h-8 gap-1.5 text-xs',
                            acc.isBusiness &&
                              'border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 hover:text-amber-800 dark:text-amber-300',
                          )}
                          title="Gắn nhãn hoặc đổi gói Zalo Business"
                        >
                          {isUpdating ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Briefcase className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          )}
                          <span>
                            {acc.isBusiness
                              ? acc.businessTier
                                ? `Biz: ${acc.businessTier.toUpperCase()}`
                                : 'Business'
                              : 'Gắn Business'}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="text-xs">Loại tài khoản Zalo</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleSetBusiness(acc, false, null)}
                          className="flex items-center justify-between text-xs"
                        >
                          <span>Cá nhân thông thường</span>
                          {!acc.isBusiness && <Check className="h-4 w-4 text-primary" />}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground">
                          Gói Zalo Business (zBiz)
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => handleSetBusiness(acc, true, 'standard')}
                          className="flex items-center justify-between text-xs"
                        >
                          <span>Gói Standard (Chuẩn)</span>
                          {acc.isBusiness && currentTier === 'standard' && (
                            <Check className="h-4 w-4 text-amber-600" />
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleSetBusiness(acc, true, 'pro')}
                          className="flex items-center justify-between text-xs"
                        >
                          <span>Gói Pro (Nâng cao)</span>
                          {acc.isBusiness && (!currentTier || currentTier === 'pro') && (
                            <Check className="h-4 w-4 text-amber-600" />
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleSetBusiness(acc, true, 'elite')}
                          className="flex items-center justify-between text-xs"
                        >
                          <span>Gói Elite (Cao cấp)</span>
                          {acc.isBusiness && currentTier === 'elite' && (
                            <Check className="h-4 w-4 text-amber-600" />
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {!isConnected && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReconnect(acc)}
                          disabled={reconnect.isPending}
                          title="Kết nối lại bằng phiên đã lưu"
                        >
                          <RefreshCw /> Kết nối lại
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRelogin(acc)}
                          disabled={login.isPending}
                        >
                          <LogIn /> Đăng nhập QR
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setToDelete(acc)}
                      title="Ngắt kết nối"
                    >
                      <Unplug />
                    </Button>
                  </>
                }
              />
            )
          })}
        </div>
      )}

      <QrLoginDialog accountId={qrAccountId} open={qrOpen} onOpenChange={setQrOpen} />

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ngắt kết nối tài khoản?</DialogTitle>
            <DialogDescription>
              Phiên đăng nhập Zalo sẽ bị ngắt. Lịch sử hội thoại vẫn được giữ lại (chỉ đọc).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={remove.isPending}>
              {remove.isPending && <Loader2 className="animate-spin" />}
              Ngắt kết nối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
