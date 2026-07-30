import api from "./api";

export interface CSKHCustomer {
  id_kh: number;
  ma_kh: string;
  ten_khach_hang: string;
  sdt1: string;
  dia_chi: string;
  ngay_sinh?: string;
  gioi_tinh?: string;
  nghe_nghiep?: string;
  nhom_kh?: string;
  trang_thai?: string;
  id_acc: number;
  thoi_gian_cs_lai?: string;
  ngay_hen_banhang?: string;
  tan_suat_mua?: string;
  ghi_chu?: string;
  gmv?: number;
  nhan_vien_pt?: string;
}

export interface CSKHScheduleResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  schedule_type: string;
  data: CSKHCustomer[];
}

export interface CSKHOverviewStats {
  total: number;
  don_trong_ky?: number;
  lich_ban_hang: number;
  lich_cham_soc: number;
  chua_cau_hinh: number;
  da_cau_hinh: number;
}

export interface SalesResultStats {
  so_khach_hang: number;
  so_khach_hang_hien_tai?: number;
  so_don: number;
  gmv: number;
  aov: number;
  ti_le_chot_lich: number;
  so_don_thuc_te: number;
  ti_le_tong: number;
}

export interface FilterParams {
  ma_kh?: string;
  ten_kh?: string;
  sdt?: string;
}

export type ScheduleType = "all" | "ban_hang" | "cham_soc" | "chua_cau_hinh" | "da_cau_hinh" | "don_trong_ky";

export const cskhScheduleService = {
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

    const response = await api.get("/api/cskh-schedule", { params });
    return response.data;
  },

  getStats: async (
    fromDate?: string | null,
    toDate?: string | null,
  ): Promise<CSKHOverviewStats> => {
    const params: Record<string, any> = {};
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    const response = await api.get("/api/cskh-schedule/stats", { params });
    return response.data;
  },

  getSalesResult: async (
    fromDate?: string | null,
    toDate?: string | null,
  ): Promise<SalesResultStats> => {
    const params: Record<string, any> = {};
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    const response = await api.get("/api/cskh-schedule/ket-qua-ban-hang", {
      params,
    });
    return response.data;
  },
};
