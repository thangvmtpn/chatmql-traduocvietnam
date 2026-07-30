import { create } from "zustand";

// Types
interface Modals {
  addUser: boolean;
  addInvoice: boolean;
  addProduct: boolean;
  addLead: boolean;
  [key: string]: boolean;
}

interface Filters {
  [key: string]: any;
}

interface UIState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  modals: Modals;
  openModal: (modalName: string) => void;
  closeModal: (modalName: string) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  filters: Filters;
  setFilter: (key: string, value: any) => void;
  clearFilters: () => void;
  currentPage: string;
  setCurrentPage: (page: string) => void;
}

// Store cho UI state (sidebar, modals, filters, etc.)
const useUIStore = create<UIState>((set) => ({
  // Sidebar
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  // Modal states
  modals: {
    addUser: false,
    addInvoice: false,
    addProduct: false,
    addLead: false,
  },
  openModal: (modalName) =>
    set((state) => ({
      modals: { ...state.modals, [modalName]: true },
    })),
  closeModal: (modalName) =>
    set((state) => ({
      modals: { ...state.modals, [modalName]: false },
    })),

  // Loading states
  loading: false,
  setLoading: (loading) => set({ loading }),

  // Filters
  filters: {},
  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    })),
  clearFilters: () => set({ filters: {} }),

  // Current page/tab
  currentPage: "dashboard",
  setCurrentPage: (page) => set({ currentPage: page }),
}));

export default useUIStore;
