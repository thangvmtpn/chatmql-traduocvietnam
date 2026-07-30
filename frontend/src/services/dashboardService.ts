import api from "./api";
import { CustomerDetail } from "../types/api";

export interface DashboardPerformance {
  so_don_hang: number;
  doanh_so: number;
  aov: number;
  from_date: string;
  to_date: string;
}

export interface OverviewData {
  so_khach_hang_phu_trach_dau_ky: number;
  so_khach_hang_phu_trach_cuoi_ky: number;
  so_don_hang_dau_ky: number;
  so_don_hang_cuoi_ky: number;
  gmv_dau_ky: number;
  gmv_cuoi_ky: number;
  gmv_truoc_2026_dau_ky: number;
  gmv_truoc_2026_cuoi_ky: number;
  don_hang_truoc_2026_dau_ky: number;
  don_hang_truoc_2026_cuoi_ky: number;
  arpu_dau_ky: number;
  arpu_cuoi_ky: number;
  pf_dau_ky: number;
  pf_cuoi_ky: number;
  from_date: string;
  to_date: string;
}

export interface EmployeeOverviewData {
  tong_khach_hang_dau_ky: number;
  tong_khach_hang_cuoi_ky: number;
  so_don_hang_dau_ky: number;
  so_don_hang_cuoi_ky: number;
  gmv_dau_ky: number;
  gmv_cuoi_ky: number;
  gmv_truoc_2026?: number;
  don_hang_truoc_2026_dau_ky?: number;
  don_hang_truoc_2026_cuoi_ky?: number;
  arpu_dau_ky: number;
  arpu_cuoi_ky: number;
  pf_dau_ky: number;
  pf_cuoi_ky: number;
  from_date: string;
  to_date: string;
}

export interface CustomerManagement {
  so_khach_hang_dang_quan_ly: number;
  so_khach_hang_da_ban_giao: number;
  so_khach_hang_chua_ban_giao: number;
  so_nhan_su_dang_phu_trach: number;
}

export interface MyFNTargetData {
  co_hoi: number;
  so_don_du_kien: number;
  doanh_so_du_kien: number;
  aov_du_kien: number;
  ti_le_chuyen_doi: number;
  so_don_yesterday: number;
  doanh_so_yesterday: number;
  aov_yesterday: number;
  cap1: number;
  cap2: number;
  cap3: number;
  cap4: number;
  cap5: number;
}

export interface MyFNTargetResponse {
  success: boolean;
  data: MyFNTargetData;
  date: string;
  yesterday: string;
}

export interface RegionStat {
  phan_loai: string;
  so_khach_hang: number;
  ty_trong: number;
}

export interface RegionStatsResponse {
  success: boolean;
  data: RegionStat[];
  tong_khach_hang: number;
}

export interface RegionStat {
  phan_loai: string;
  so_khach_hang: number;
  ty_trong: number;
}

export interface RegionStatsResponse {
  success: boolean;
  data: RegionStat[];
  tong_khach_hang: number;
}

export interface Customer {
  id_kh?: number;
  ma_kh: string;
  nhom_kh: string;
  ten_khach_hang: string;
  sdt: string;
  dia_chi: string;
  dia_chi2?: string;
  gmv: number;
  gmv_truoc_2026?: number;
  so_lan_mua: number;
  aov: number;
  tham_nien: number;
  pf: number;
  chu_ky?: number;
  recency?: number;
  ngay_sinh?: string;
  gioi_tinh: string;
  tuoi: number | null;
  trang_thai: string;
  da_goi?: boolean;
}

export interface CustomerListResponse {
  data: Customer[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface CustomerNote {
  id: number;
  id_kh: number;
  id_acc: number;
  noi_dung: string;
  thoi_gian: string;
  loai_ghi_chu: string;
  ten_nhan_vien?: string;
}

export interface StaffMember {
  id_acc: number;
  name: string;
  role_id: number;
  customer_count: number;
}

export interface CustomerGroup {
  nhom_kh: string;
  so_luong_kh: number;
}

export interface CustomerGroupsResponse {
  data: CustomerGroup[];
}

/**
 * Lấy dữ liệu tổng quan quản trị theo chỉ số quan trọng
 */
export const getDashboardOverview = async (
  fromDate?: string,
  toDate?: string,
): Promise<OverviewData> => {
  const params: Record<string, string> = {};
  if (fromDate) params.from_date = fromDate;
  if (toDate) params.to_date = toDate;

  const response = await api.get<OverviewData>("/api/dashboard/overview", {
    params,
  });
  return response.data;
};

/**
 * Lấy dữ liệu tổng quan kết quả kinh doanh
 */
export const getDashboardPerformance = async (
  fromDate?: string,
  toDate?: string,
): Promise<DashboardPerformance> => {
  const params: Record<string, string> = {};
  if (fromDate) params.from_date = fromDate;
  if (toDate) params.to_date = toDate;

  const response = await api.get<DashboardPerformance>(
    "/api/dashboard/performance",
    { params },
  );
  return response.data;
};

/**
 * Lấy dữ liệu tổng quan cho Manager
 */
export const getManagerOverview = async (
  fromDate?: string,
  toDate?: string,
): Promise<OverviewData> => {
  const params: Record<string, string> = {};
  if (fromDate) params.from_date = fromDate;
  if (toDate) params.to_date = toDate;

  const response = await api.get<OverviewData>("/api/dashboard/manager/overview", {
    params,
  });
  return response.data;
};

/**
 * Lấy dữ liệu performance cho Manager
 */
export const getManagerPerformance = async (
  fromDate?: string,
  toDate?: string,
): Promise<DashboardPerformance> => {
  const params: Record<string, string> = {};
  if (fromDate) params.from_date = fromDate;
  if (toDate) params.to_date = toDate;

  const response = await api.get<DashboardPerformance>(
    "/api/dashboard/manager/performance",
    { params },
  );
  return response.data;
};

/**
 * Lấy dữ liệu quản lý khách hàng
 */
export const getCustomerManagement = async (
  roleId: number = 4,
): Promise<CustomerManagement> => {
  const response = await api.get<CustomerManagement>(
    "/api/dashboard/customer-management",
    {
      params: { role_id: roleId },
    },
  );
  return response.data;
};

/**
 * Lấy dữ liệu quản lý khách hàng cho Manager
 */
export const getManagerCustomerManagement = async (
  roleId: number = 4,
): Promise<CustomerManagement> => {
  const response = await api.get<CustomerManagement>(
    "/api/dashboard/manager/customer-management",
    {
      params: { role_id: roleId },
    },
  );
  return response.data;
};

/**
 * Lấy dữ liệu tổng quan cho nhân viên
 */
export const getEmployeeOverview = async (
  fromDate?: string,
  toDate?: string,
): Promise<EmployeeOverviewData> => {
  const params: Record<string, string> = {};
  if (fromDate) params.from_date = fromDate;
  if (toDate) params.to_date = toDate;

  const response = await api.get<EmployeeOverviewData>(
    "/api/dashboard/employee-overview",
    { params },
  );
  return response.data;
};

/**
 * Lấy danh sách top sản phẩm của nhân viên
 */
export const getEmployeeTopProducts = async (
  limit: number = 100,
  sortBy: "gmv" | "so_lan_mua" = "gmv",
) => {
  const params: Record<string, string | number> = {
    limit,
    sort_by: sortBy,
  };

  const response = await api.get<any>("/api/dashboard/employee-top-products", {
    params,
  });
  return response.data.data || [];
};

/**
 * Lấy thống kê khách hàng theo vùng miền của nhân viên
 */
export const getEmployeeRegionStats =
  async (): Promise<RegionStatsResponse> => {
    const response = await api.get<RegionStatsResponse>(
      "/api/dashboard/employee-region-stats",
    );
    return response.data;
  };

/**
 * Lấy dữ liệu mục tiêu FN của nhân viên cá nhân
 */
export const getMyFNTargetData = async (): Promise<MyFNTargetResponse> => {
  const response = await api.get<MyFNTargetResponse>(
    "/api/dashboard/my-fn-target",
  );
  return response.data;
};

/**
 * Lấy danh sách khách hàng theo vùng miền
 */
export const getEmployeeRegionCustomers = async (mien: string) => {
  const params = { mien };
  const response = await api.get<any>(
    "/api/dashboard/employee-region-customers",
    { params },
  );
  return response.data.data || [];
};

/**
 * Lấy danh sách khách hàng
 */
export const getCustomersList = async (
  filterType: "all" | "handed_over" | "not_handed_over" = "all",
  page: number = 1,
  pageSize: number = 50,
  searchCustomerId?: string,
  searchPhoneNumber?: string,
  gmvMin?: string,
  gmvMax?: string,
  pfMin?: string,
  pfMax?: string,
  aovMin?: string,
  aovMax?: string,
  mien?: string,
  nhomKh?: string,
  staffId?: string,
  sortBy?: string,
  sortOrder?: "asc" | "desc",
  csLaiToday?: boolean,
): Promise<CustomerListResponse> => {
  const params: Record<string, string | number> = {
    filter_type: filterType,
    page,
    page_size: pageSize,
  };

  if (searchCustomerId) {
    params.customer_id = searchCustomerId;
  }

  if (searchPhoneNumber) {
    params.phone_number = searchPhoneNumber;
  }

  if (gmvMin) {
    params.gmv_min = gmvMin;
  }

  if (gmvMax) {
    params.gmv_max = gmvMax;
  }

  if (pfMin) {
    params.pf_min = pfMin;
  }

  if (pfMax) {
    params.pf_max = pfMax;
  }

  if (aovMin) {
    params.aov_min = aovMin;
  }

  if (aovMax) {
    params.aov_max = aovMax;
  }

  if (mien) {
    params.mien = mien;
  }

  if (nhomKh) {
    params.nhom_kh = nhomKh;
  }

  if (staffId) {
    params.staff_id = staffId;
  }

  if (sortBy) {
    params.sort_by = sortBy;
  }

  if (sortOrder) {
    params.sort_order = sortOrder;
  }

  if (csLaiToday) {
    params.cs_lai_today = "true";
  }

  const response = await api.get<CustomerListResponse>(
    "/api/dashboard/customers",
    { params },
  );
  return response.data;
};

/**
 * Lấy danh sách nhân viên có khách hàng được bàn giao
 */
export const getStaffList = async (
  filterType: "all" | "handed_over" = "handed_over",
): Promise<StaffMember[]> => {
  const response = await api.get<{ data: StaffMember[] }>(
    "/api/dashboard/staff-list",
    {
      params: { filter_type: filterType },
    },
  );
  return response.data.data;
};

export const getManagerStaffList = async (): Promise<StaffMember[]> => {
  const response = await api.get<{ data: StaffMember[] }>(
    "/api/dashboard/manager/staff-list",
  );
  return response.data.data;
};

/**
 * Lấy danh sách nhóm khách hàng chưa bàn giao với số lượng
 */
export const getCustomerGroups = async (): Promise<CustomerGroup[]> => {
  const response = await api.get<CustomerGroupsResponse>(
    "/api/dashboard/customers-groups",
  );
  return response.data.data;
};

/**
 * Lấy chi tiết khách hàng theo id
 */
export const getCustomerDetail = async (
  customerId: number,
): Promise<CustomerDetail> => {
  const response = await api.get<{ chi_tiet_kh: CustomerDetail }>(
    `/api/lead/chitiet/${customerId}`,
  );
  return response.data.chi_tiet_kh;
};

export interface UpdateCustomerData {
  id_kh: number;
  ten_khach_hang: string;
  sdt1: string;
  sdt2?: string;
  gioi_tinh?: string;
  ngay_sinh?: string;
  dia_chi?: string;
  dia_chi2?: string;
  nhom_kh?: string;
  nghe_nghiep?: string;
  dac_thu_sp?: string;
  nhu_cau_sd?: string;
  thoi_gian_cs_lai?: string;
  loai_kh?: string;
  ghi_chu_them1?: string;
  // Các trường bắt buộc từ API nhưng không update
  id_acc?: any;
  nhan_vien_pt?: any;
  ma_kh?: string;
  thoi_gian_capnhat?: any;
  nguon_data?: any;
  gmv?: any;
  aov?: any;
  tan_suat_mua?: any;
  so_lan_mua?: any;
  thoi_gian_tao?: any;
  name_pt?: any;
  nguoi_ban?: any;
  check_trung?: any;
}

/**
 * Cập nhật thông tin khách hàng
 */
export const updateCustomer = async (
  data: UpdateCustomerData,
): Promise<{ message: string }> => {
  const response = await api.put<{ message: string }>(
    "/api/lead/update_full",
    data,
  );
  return response.data;
};

/**
 * Lấy danh sách ghi chú của khách hàng
 */
export const getCustomerNotes = async (
  customerId: number,
): Promise<CustomerNote[]> => {
  const response = await api.get<CustomerNote[]>(
    `/api/customers/${customerId}/notes`,
  );
  return response.data;
};

/**
 * Tạo ghi chú mới cho khách hàng
 */
/**
 * Cập nhật thời gian chăm sóc lại cho khách hàng
 */
export const updateCustomerNextContactTime = async (
  customerId: number,
  thoiGianCsLai: string,
): Promise<{ message: string }> => {
  const response = await api.put<{ message: string }>(
    `/api/customers/${customerId}/next-contact-time`,
    { thoi_gian_cs_lai: thoiGianCsLai },
  );
  return response.data;
};

/**
 * Cập nhật thời gian bán hàng kế tiếp cho khách hàng
 */
export const updateCustomerNextSalesTime = async (
  customerId: number,
  ngayHenBanhang: string,
): Promise<{ message: string }> => {
  const response = await api.put<{ message: string }>(
    `/api/customers/${customerId}/next-sales-time`,
    { ngay_hen_banhang: ngayHenBanhang },
  );
  return response.data;
};

/**
 * Cập nhật trạng thái đã gọi cho khách hàng
 */
export const updateCustomerDaGoi = async (
  customerId: number,
  daGoi: boolean,
): Promise<{ message: string }> => {
  const response = await api.put<{ message: string }>(
    `/api/customers/${customerId}/da-goi`,
    { da_goi: daGoi },
  );
  return response.data;
};

/**
 * Tạo ghi chú mới cho khách hàng
 */
export const createCustomerNote = async (
  customerId: number,
  noiDung: string,
  loaiGhiChu: string = "ghi_chu",
): Promise<{ success: boolean; message: string }> => {
  const response = await api.post<{ success: boolean; message: string }>(
    `/api/customers/${customerId}/notes`,
    {
      noi_dung: noiDung,
      loai_ghi_chu: loaiGhiChu,
    },
  );
  return response.data;
};

/**
 * Interface cho Account/Nhân viên
 */
export interface Account {
  id_acc: number;
  name: string;
  chuc_vu?: string;
  role_id: number;
}

/**
 * Lấy danh sách accounts/nhân viên
 */
export const getAccounts = async (): Promise<Account[]> => {
  const response = await api.get<{ success: boolean; data: Account[] }>(
    "/api/accounts",
  );
  return response.data.data;
};

/**
 * Bàn giao khách hàng cho nhân viên
 */
export const assignCustomers = async (
  customerIds: number[],
  accountId: number,
): Promise<{ success: boolean; message: string; assigned_count: number }> => {
  const response = await api.post<{
    success: boolean;
    message: string;
    assigned_count: number;
  }>("/api/customers/assign", {
    customer_ids: customerIds,
    account_id: accountId,
  });
  return response.data;
};

/**
 * Lấy thông báo của user hiện tại
 */
export const getMyNotifications = async (): Promise<any[]> => {
  try {
    const response = await api.get<any[]>(
      "/api/notifications/my-notifications",
    );
    return response.data || [];
  } catch (error) {
    console.error("Error fetching my notifications:", error);
    return [];
  }
};

/**
 * Interface cho Product
 */
export interface Product {
  id_product: number;
  code_product: string;
  name_product: string;
  price: number;
  unit: string;
  status: string;
  weight?: number;
}

/**
 * Interface cho Product Customer
 */
export interface ProductCustomer {
  stt: number;
  code_customer: string;
  name_customer: string;
  phone_number: string;
  so_lan_mua: number;
  so_luong: number;
  gmv: number;
}

/**
 * Tìm kiếm sản phẩm theo tên
 */
export const searchProducts = async (
  query: string,
  limit: number = 10,
  excludeDealSoc: boolean = false,
): Promise<Product[]> => {
  const response = await api.get<{ success: boolean; data: Product[] }>(
    "/api/dashboard/search-products",
    {
      params: {
        q: query,
        limit,
        exclude_deal_soc: excludeDealSoc,
      },
    },
  );
  return response.data.data;
};

/**
 * Lấy danh sách khách hàng đã mua sản phẩm
 */
export const getProductCustomers = async (
  codeProduct: string,
  sortBy: "gmv" | "so_lan_mua" = "gmv",
): Promise<ProductCustomer[]> => {
  const response = await api.get<{
    success: boolean;
    data: ProductCustomer[];
    total: number;
  }>("/api/dashboard/product-customers", {
    params: {
      code_product: codeProduct,
      sort_by: sortBy,
    },
  });
  return response.data.data;
};

export interface AdminTopProduct {
  stt: number;
  code_product: string;
  name_product: string;
  gmv: number;
  so_lan_ban: number;
}

export interface AdminTopProductsResponse {
  success: boolean;
  data: AdminTopProduct[];
  total: number;
  sort_by: string;
}

/**
 * Lấy danh sách top sản phẩm bán chạy của toàn công ty (admin)
 */
export const getAdminTopProducts = async (
  limit: number = 100,
  sortBy: "gmv" | "so_lan_mua" = "gmv",
  fromDate?: string,
  toDate?: string,
): Promise<AdminTopProductsResponse> => {
  const params: Record<string, any> = {
    limit,
    sort_by: sortBy,
  };
  if (fromDate) params.from_date = fromDate;
  if (toDate) params.to_date = toDate;

  const response = await api.get<AdminTopProductsResponse>(
    "/api/dashboard/admin-top-products",
    {
      params,
    },
  );
  return response.data;
};

/**
 * Interface cho FN Target Data
 */
export interface FNTargetSalesman {
  id_acc: number;
  user_id: string;
  name: string;
  chuc_vu: string;
  co_hoi: number;
  so_don_du_kien: number;
  doanh_so_du_kien: number;
  aov_du_kien: number;
  // Kết quả ngày hôm qua
  so_don_yesterday: number;
  doanh_so_yesterday: number;
  aov_yesterday: number;
  ti_trong_yesterday: number;
  cap1: number;
  cap2: number;
  cap3: number;
  cap4: number;
  cap5: number;
}

export interface FNTargetResponse {
  success: boolean;
  data: FNTargetSalesman[];
  date: string;
  yesterday: string;
}

/**
 * Lấy dữ liệu FN Target Dashboard
 */
export const getFNTargetData = async (): Promise<FNTargetResponse> => {
  const response = await api.get<FNTargetResponse>("/api/dashboard/fn-target");
  return response.data;
};

// ============= F0 TARGET DASHBOARD =============

export interface F0ChannelData {
  channel: string;
  result: number;
  orders: number;
  aov: number;
  ti_trong: number;
}

export interface F0TargetResponse {
  success: boolean;
  data: F0ChannelData[];
  total_revenue: number;
  date: string;
  yesterday: string;
}

/**
 * Lấy dữ liệu F0 Target Dashboard
 */
export const getF0TargetData = async (): Promise<F0TargetResponse> => {
  const response = await api.get<F0TargetResponse>("/api/dashboard/f0-target");
  return response.data;
};
