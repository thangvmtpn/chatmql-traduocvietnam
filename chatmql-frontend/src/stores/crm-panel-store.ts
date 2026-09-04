/**
 * crm-panel-store.ts — trạng thái cột phải màn Hội thoại (TDVN).
 *
 * Khung chat (nút "Lên đơn") và cột phải (4 tab: Thông tin · Ghi chú nhanh ·
 * Tạo đơn · Tài liệu bán hàng) là hai cây component khác nhau, nên tab đang mở
 * đặt ở store nhỏ này thay vì truyền prop xuyên nhiều lớp.
 */
import { create } from 'zustand'

export type CrmTab = 'info' | 'notes' | 'order'

interface CrmPanelState {
  activeTab: CrmTab
  setTab: (tab: CrmTab) => void
  /** Mở thẳng tab Tạo đơn — dùng cho nút "Lên đơn" trên thanh công cụ chat. */
  openOrder: () => void
}

export const useCrmPanelStore = create<CrmPanelState>((set) => ({
  activeTab: 'info',
  setTab: (tab) => set({ activeTab: tab }),
  openOrder: () => set({ activeTab: 'order' }),
}))
