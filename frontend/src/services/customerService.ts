import api from "./api";
import { TopCustomersResponse } from "@/types/api";

export type SortByType = "gmv" | "so_lan_mua";

export interface SearchCustomersParams {
  customer_code?: string;
  customer_name?: string;
  phone?: string;
  vip_from?: string;
  vip_to?: string;
  age_from?: string;
  age_to?: string;
  thang_sinh?: string;
  con_giap?: string;
  gmv_from?: string;
  gmv_to?: string;
  order_count_from?: string;
  order_count_to?: string;
  mien?: string;
  gioi_tinh?: string;
  staff_id?: string;
  filter_type?: string;
  product_codes?: string[];
  purchase_date_from?: string;
  purchase_date_to?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: string;
}

export interface SearchCustomerResult {
  id_kh: number;
  ma_kh: string;
  ten_khach_hang: string;
  sdt: string;
  dia_chi: string;
  gmv: number;
  gmv_truoc_2026?: number;
  so_lan_mua: number;
  aov: number;
  ten_tinh: string;
  ten_xa: string;
  nhom_kh: string;
  mien: string;
  gioi_tinh: string;
  ngay_sinh?: string;
}

export interface SearchCustomersResponse {
  success: boolean;
  data: SearchCustomerResult[];
  total: number;
  total_pages: number;
  current_page: number;
  page_size: number;
}

export interface SearchTemplate {
  id: number;
  id_acc: number;
  name: string;
  filter_data: any;
  created_at: string;
}

export interface SearchTemplatesResponse {
  success: boolean;
  data: SearchTemplate[];
}


/**
 * Service để quản lý các API liên quan đến khách hàng
 */
export const customerService = {
  /**
   * Lấy danh sách top khách hàng
   * @param limit Số lượng khách hàng
   * @param sortBy Sắp xếp theo: 'gmv' hoặc 'so_lan_mua'
   */
  async getTopCustomers(
    limit: number = 100,
    sortBy: SortByType = "gmv",
  ): Promise<TopCustomersResponse> {
    const response = await api.get<TopCustomersResponse>(
      `/api/lead/top_customers?limit=${limit}&sort_by=${sortBy}`,
    );
    return response.data;
  },

  /**
   * Tìm kiếm chuyên sâu khách hàng
   * @param params Các tham số tìm kiếm
   */
  async searchCustomers(
    params: SearchCustomersParams,
  ): Promise<SearchCustomersResponse> {
    // Lọc bỏ các giá trị rỗng
    const filteredParams: any = {};
    Object.entries(params).forEach(([key, value]) => {
      if (value !== "" && value !== null && value !== undefined) {
        if (Array.isArray(value) && value.length === 0) return;
        filteredParams[key] = value;
      }
    });

    const response = await api.post<SearchCustomersResponse>(
      `/api/lead/search_advanced`,
      filteredParams,
    );
    return response.data;
  },

  /**
   * Lưu mẫu tìm kiếm chuyên sâu
   */
  async saveSearchTemplate(name: string, filterData: any) {
    const response = await api.post(
      `/api/lead/search_advanced/templates`,
      { name, filter_data: filterData }
    );
    return response.data;
  },

  /**
   * Lấy danh sách mẫu tìm kiếm
   */
  async getSearchTemplates(): Promise<SearchTemplatesResponse> {
    const response = await api.get<SearchTemplatesResponse>(
      `/api/lead/search_advanced/templates`
    );
    return response.data;
  },

  /**
   * Cập nhật mẫu tìm kiếm
   */
  async updateSearchTemplate(id: number, name: string, filterData: any) {
    const response = await api.put(
      `/api/lead/search_advanced/templates/${id}`,
      { name, filter_data: filterData }
    );
    return response.data;
  },

  /**
   * Xóa mẫu tìm kiếm
   */
  async deleteSearchTemplate(id: number) {
    const response = await api.delete(
      `/api/lead/search_advanced/templates/${id}`
    );
    return response.data;
  },
};
