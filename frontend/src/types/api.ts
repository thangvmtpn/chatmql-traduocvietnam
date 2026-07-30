// API Response Types
export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  status?: number;
}

export interface ApiError {
  message: string;
  status?: number;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Auth Types
export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: {
    id: string | number;
    id_acc?: string | number; // Account ID từ backend
    user_id?: string | number; // Mã nhân viên
    username: string;
    name?: string;
    email?: string;
    chuc_vu?: string; // Chức danh
    role?: string;
    role_id?: number;
    department_id?: number;
    department_name?: string; // Tên phòng ban
  };
}

// User Types
export interface UserResponse {
  id: string | number;
  user_id?: string | number; // Mã nhân viên
  username: string;
  name?: string;
  email?: string;
  chuc_vu?: string; // Chức danh
  role?: string;
  role_id?: number;
  department_id?: number;
  department_name?: string; // Tên phòng ban
  created_at?: string;
  updated_at?: string;
}

// Lead Types
export interface Lead {
  id: string | number;
  customer_name: string;
  phone?: string;
  email?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

// Invoice Types
export interface Invoice {
  id: string | number;
  invoice_number: string;
  customer_id: string | number;
  amount: number;
  status: string;
  created_at?: string;
  updated_at?: string;
}

// Notification Types
export interface Notification {
  id: string | number;
  title: string;
  message: string;
  type?: "info" | "warning" | "error" | "success";
  read?: boolean;
  created_at?: string;
}

// Product Types
export interface Product {
  id: string | number;
  name: string;
  description?: string;
  price: number;
  stock?: number;
  category?: string;
  created_at?: string;
  updated_at?: string;
}

// Role Types
export interface Role {
  id: number;
  name: string;
  description?: string;
  permissions?: string[];
}

// Purchase History Types
export interface PurchaseHistory {
  id_hd?: string | number;
  thoi_gian?: string;
  ma_hd?: string;
  so_tien?: number;
  ten_sp?: string;
  trang_thai?: string;
}

// Customer Detail Types
export interface CustomerDetail {
  id_kh: number;
  ma_kh: string;
  ten_kh: string;
  sdt1: string;
  sdt2?: string;
  dia_chi2?: string;
  gmv?: number;
  name_pt?: string;
  nguon_data?: string;
  thoi_gian_capnhat?: string;
  thoi_gian_cs_lai?: string;
  ngay_hen_banhang?: string;
  nghe_nghiep?: string;
  dac_thu_sp?: string;
  nhu_cau_sd?: string;
  loai_kh?: string;
  ghi_chu_them1?: string;
  lich_su_mua?: PurchaseHistory[];
  ngay_sinh?: string;
  tuoi?: number;
  recency?: number;
  chu_ky?: number;
  [key: string]: any;
}

// Top Customer Types
export interface TopCustomer {
  stt: number;
  id_kh: number;
  ma_kh: string;
  ten_khach_hang: string;
  sdt: string;
  gmv: number;
  gmv_truoc_2026?: number;
  aov: number;
  so_lan_mua: number;
  nhom_kh: string;
  thoi_gian_tao: string | null;
}

export interface TopCustomersResponse {
  success: boolean;
  data: TopCustomer[];
  total: number;
}

// Employee Overview Response
export interface EmployeeOverviewResponse {
  tong_khach_hang_dau_ky: number;
  tong_khach_hang_cuoi_ky: number;
  so_don_hang_dau_ky: number;
  so_don_hang_cuoi_ky: number;
  gmv_dau_ky: number;
  gmv_cuoi_ky: number;
  gmv_truoc_2026?: number;
  arpu_dau_ky: number;
  arpu_cuoi_ky: number;
  pf_dau_ky: number;
  pf_cuoi_ky: number;
  from_date: string;
  to_date: string;
}

// Top Product Types
export interface TopProduct {
  stt: number;
  code_product: string;
  name_product: string;
  gmv: number;
  so_lan_mua: number;
  so_don_hang: number;
}

export interface TopProductsResponse {
  success: boolean;
  data: TopProduct[];
  total: number;
  sort_by: string;
}

// Invoice Order Types
export interface InvoiceOrder {
  id_invoice: number;
  code_invoice: string;
  time_create: string;
  time_update: string | null;
  time_start_hoan: string | null;
  id_creator: number;
  code_creator: string;
  name_creator: string;
  id_seller: number;
  code_seller: string;
  name_seller: string;
  id_customer: number | null;
  code_customer: string | null;
  phone_number: string;
  id_salechannel: number;
  name_salechannel: string;
  subtotal: number;
  gift_amount: number;
  discount: number;
  total_amount: number;
  fee_delivery: number;
  type_fee_delivery: string | null;
  cod_need_payment: number;
  description: string | null;
  send_zns: boolean;
  id_status: number;
  status_value: string;
  name_customer: string;
  id_subchannel: number | null;
  subchannel: string | null;
  type_channel: string | null;
  fee_platform: number;
  address?: string | null;
  code_delivery?: string | null;
}

export interface InvoiceOrdersResponse {
  success: boolean;
  data: InvoiceOrder[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export interface InvoiceOrdersStats {
  total_orders: number;
  total_revenue: number;
  total_gift_amount: number;
  delivered_orders: number;
  processing_orders: number;
  cancelled_orders: number;
}

export interface InvoiceOrdersStatsResponse {
  success: boolean;
  data: InvoiceOrdersStats;
}

export interface InvoiceProduct {
  id_invoice_detail: number;
  code_invoice: string;
  id_product: number;
  code_product: string;
  name_product: string;
  sub_code_product: string | null;
  sub_name_code_product: string | null;
  quantity: number;
  sub_price: number;
  discount_price: number;
  price: number;
  total: number;
  type_product: string;
}

export interface InvoiceDetailData {
  invoice: InvoiceOrder;
  products: InvoiceProduct[];
  delivery_info?: {
    code_delivery?: string;
    id_partner_delivery?: number;
    address?: string;
  };
}

export interface InvoiceDetailResponse {
  success: boolean;
  data: InvoiceDetailData;
}
