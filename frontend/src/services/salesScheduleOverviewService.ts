import api from "./api";
import { CSKHOverviewStats, CSKHScheduleResponse, SalesResultStats, FilterParams, ScheduleType } from "./cskhScheduleService";

export interface EmployeeScheduleStat {
  id_acc: number;
  ma_nhan_vien: string;
  ten_nhan_vien: string;
  so_khach_hang: number;
  chua_cau_hinh_count?: number;
  da_cau_hinh_count?: number;
}

export interface EmployeeSalesResult {
  id_acc: number;
  ma_nhan_vien: string;
  ten_nhan_vien: string;
  so_khach_hang: number;
  so_khach_hang_hien_tai?: number;
  so_don: number;
  gmv: number;
  aov: number;
  ti_le_chot_lich: number;
  so_don_thuc_te: number;
  ti_le_tong: number;
}

export interface EmployeeSalesResultResponse {
  data: EmployeeSalesResult[];
}

export interface EmployeeListResponse {
  data: EmployeeScheduleStat[];
  total: number;
  schedule_type: string;
}

export interface EmployeeCustomerResponse extends CSKHScheduleResponse {
  nhan_vien: {
    id_acc: number;
    ma_nhan_vien: string;
    ten_nhan_vien: string;
  };
}

export const salesScheduleOverviewService = {
  getStats: async (
    fromDate?: string | null,
    toDate?: string | null,
  ): Promise<CSKHOverviewStats> => {
    const params: Record<string, any> = {};
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    const response = await api.get("/api/sales-schedule-overview/stats", { params });
    return response.data;
  },

  getSchedule: async (
    scheduleType: ScheduleType = "all",
    page: number = 1,
    pageSize: number = 30,
    fromDate?: string | null,
    toDate?: string | null,
    filters?: FilterParams,
  ): Promise<CSKHScheduleResponse> => {
    const params: Record<string, any> = {
      schedule_type: scheduleType,
      page,
      page_size: pageSize,
    };
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    if (filters) {
      if (filters.ma_kh) params.ma_kh = filters.ma_kh;
      if (filters.ten_kh) params.ten_kh = filters.ten_kh;
      if (filters.sdt) params.sdt = filters.sdt;
    }
    const response = await api.get("/api/sales-schedule-overview", { params });
    return response.data;
  },

  getSalesResult: async (
    fromDate?: string | null,
    toDate?: string | null,
  ): Promise<SalesResultStats> => {
    const params: Record<string, any> = {};
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    const response = await api.get("/api/sales-schedule-overview/ket-qua-ban-hang", { params });
    return response.data;
  },

  getSalesResultByEmployee: async (
    fromDate?: string | null,
    toDate?: string | null,
  ): Promise<EmployeeSalesResultResponse> => {
    const params: Record<string, any> = {};
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    const response = await api.get("/api/sales-schedule-overview/ket-qua-ban-hang/nhan-vien", { params });
    return response.data;
  },

  getEmployeeList: async (
    scheduleType: ScheduleType = "all",
    fromDate?: string | null,
    toDate?: string | null,
  ): Promise<EmployeeListResponse> => {
    const params: Record<string, any> = { schedule_type: scheduleType };
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    const response = await api.get("/api/sales-schedule-overview/nhan-vien", { params });
    return response.data;
  },

  getEmployeeCustomers: async (
    idAcc: number,
    scheduleType: ScheduleType = "all",
    page: number = 1,
    pageSize: number = 30,
    fromDate?: string | null,
    toDate?: string | null,
    filters?: FilterParams,
  ): Promise<EmployeeCustomerResponse> => {
    const params: Record<string, any> = {
      schedule_type: scheduleType,
      page,
      page_size: pageSize,
    };
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    if (filters) {
      if (filters.ma_kh) params.ma_kh = filters.ma_kh;
      if (filters.ten_kh) params.ten_kh = filters.ten_kh;
      if (filters.sdt) params.sdt = filters.sdt;
    }
    const response = await api.get(`/api/sales-schedule-overview/nhan-vien/${idAcc}`, { params });
    return response.data;
  },
};
