// Cấu hình API URLs
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

// API endpoints
export const API_ENDPOINTS = {
  // Auth
  LOGIN: "/api/login",
  REGISTER: "/api/register",
  LOGOUT: "/api/logout",

  // Users
  USERS: "/api/users",
  USER_DETAIL: (id: string | number) => `/api/users/${id}`,
  ALL_USERS: "/api/user/all-users",

  // Roles
  ROLES: "/api/roles",
  ROLE_DETAIL: (id: string | number) => `/api/roles/${id}`,

  // Lead
  LEADS: "/api/leads",
  LEAD_DETAIL: (id: string | number) => `/api/leads/${id}`,

  // Hóa đơn
  HOA_DON: "/api/hoa-don",
  HOA_DON_DETAIL: (id: string | number) => `/api/hoa-don/${id}`,

  // Thông báo
  THONG_BAO: "/api/thong-bao",
  THONG_BAO_DETAIL: (id: string | number) => `/api/thong-bao/${id}`,

  // Sản phẩm
  SAN_PHAM: "/api/san-pham",
  SAN_PHAM_DETAIL: (id: string | number) => `/api/san-pham/${id}`,

  // Phân quyền
  PHAN_QUYEN: "/api/phan-quyen",

  // Invoice - Đơn hàng
  MY_ORDERS: "/api/invoices/my-orders",
  MY_ORDERS_STATS: "/api/invoices/my-orders/stats",
  INVOICE_DETAIL: (code_invoice: string) =>
    `/api/invoices/detail/${code_invoice}`,
  UPDATE_INVOICE: (code_invoice: string) =>
    `/api/invoices/${code_invoice}/update`,
  CREATE_INVOICE: "/api/invoice/create",
  SALE_CHANNELS: "/api/invoice/sale_channels",
  DELIVERY_PARTNERS: "/api/invoice/delivery_partners",
  SEARCH_INVOICES: "/api/invoices/search",
  ALL_INVOICES: "/api/invoices",
  INVOICE_DELIVERY_HISTORY: (code_delivery: string, partner_id?: number) =>
    partner_id
      ? `/api/invoices/history/${code_delivery}?partner_id=${partner_id}`
      : `/api/invoices/history/${code_delivery}`,
};
