import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Zap,
  BarChart3,
  Package,
  FileText,
  Sparkles,
  Send,
  Puzzle,
  Settings,
  Database,
  BadgePercent,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/types/api'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  /**
   * Vai trò được vào. Bỏ trống = mọi vai trò.
   *
   * Danh sách này bám đúng chỗ BACKEND thực sự trả 403, không phải phỏng đoán:
   *   /api/v1/analytics/*  → chặn member  (CDP & Phân tích)
   *   /api/v1/automation/* → chặn member  (Tự động hóa)
   * Nguyên tắc BRD §5.3.1: "Không có quyền → KHÔNG render", không render rồi disable.
   */
  roles?: Role[]
  /**
   * Khoá quyền động (`module.view`). Có phân quyền động (RBAC) thì menu lọc
   * theo tập quyền của /me/permissions; thiếu khoá này thì mục luôn hiện.
   * Lọc theo `roles` vẫn chạy trước — server còn chặn 403 theo vai trò gốc ở
   * chính các route đó.
   */
  permission?: string
}

/** Menu chính của ứng dụng CRM (tiếng Việt, giữ nguyên nghiệp vụ). */
export const MAIN_NAV: NavItem[] = [
  { label: 'Tổng quan', to: '/dashboard', icon: LayoutDashboard, permission: 'dashboard.view' },
  { label: 'Hội thoại', to: '/conversations', icon: MessageSquare, permission: 'conversations.view' },
  { label: 'Khách hàng', to: '/customers', icon: Users, permission: 'contacts.view' },
  { label: 'Tự động hóa', to: '/automation', icon: Zap, roles: ['owner', 'admin', 'manager'], permission: 'automation.view' },
  { label: 'CDP', to: '/cdp', icon: Database, roles: ['owner', 'admin', 'manager'], permission: 'cdp.view' },
  { label: 'Phân tích', to: '/analytics', icon: BarChart3, roles: ['owner', 'admin', 'manager'], permission: 'analytics.view' },
  { label: 'Sản phẩm & Tri thức', to: '/knowledge-base', icon: Package, permission: 'products.view' },
  { label: 'Báo giá', to: '/quotes', icon: FileText, permission: 'quotes.view' },
  { label: 'Ưu đãi', to: '/promotions', icon: BadgePercent, roles: ['owner', 'admin', 'manager'], permission: 'promotions.view' },
  { label: 'AI', to: '/ai', icon: Sparkles, permission: 'ai.view' },
  { label: 'Chiến dịch ZNS', to: '/zns-campaigns', icon: Send, permission: 'zns.view' },
  { label: 'Tích hợp', to: '/integrations', icon: Puzzle, permission: 'integrations.view' },
  { label: 'Cài đặt', to: '/settings', icon: Settings, permission: 'settings.view' },
]

/** Lọc menu theo vai trò hiện tại. Server vẫn kiểm tra lại — đây chỉ là lớp trải nghiệm. */
export function navForRole(role?: Role): NavItem[] {
  if (!role) return []
  return MAIN_NAV.filter((item) => !item.roles || item.roles.includes(role))
}

/**
 * Lọc tiếp theo tập quyền động. `undefined` = quyền CHƯA TẢI XONG → chưa lọc,
 * để menu không nhấp nháy; tập đã tải (kể cả rỗng) thì lọc thật.
 */
export function filterNavByPermissions(items: NavItem[], perms?: Set<string>): NavItem[] {
  if (!perms) return items
  return items.filter((i) => !i.permission || perms.has(i.permission))
}
