import api from "./api";

// Interface cho dữ liệu trả về từ backend (tương đương class PhanHoiIP)
export interface ValidIP {
  id: number;
  dia_chi_ip: string;
  ghi_chu?: string | null;
  hoat_dong: boolean;
}

// Interface cho payload gửi lên khi thêm IP mới (tương đương class ThongTinIP)
export interface CreateIPPayload {
  dia_chi_ip: string;
  ghi_chu?: string;
}

// Interface cho response trả về khi xóa IP
export interface DeleteIPResponse {
  thong_bao: string;
}

/**
 * Lấy danh sách tất cả các địa chỉ IP hợp lệ
 */
export const getValidIPs = async (): Promise<ValidIP[]> => {
  // Nhớ kiểm tra lại đường dẫn API xem có dư/thiếu chữ /api nào không nhé
  const response = await api.get("/api/ip-hop-le/"); 
  console.log("API Response for getValidIPs:", response.data); // Debug log
  return response.data;
};

/**
 * Thêm một địa chỉ IP mới vào danh sách hợp lệ
 */
export const addValidIP = async (payload: CreateIPPayload): Promise<ValidIP> => {
  const response = await api.post("/api/ip-hop-le/", payload);
  return response.data;
};

/**
 * Xóa một địa chỉ IP khỏi danh sách hợp lệ
 * @param id ID của IP cần xóa
 */
export const deleteValidIP = async (id: number): Promise<DeleteIPResponse> => {
  const response = await api.delete(`/api/ip-hop-le/${id}`);
  return response.data;
};

// Export các helper functions gom lại thành 1 object service
export const authIPService = {
  getValidIPs,
  addValidIP,
  deleteValidIP,
};

export default authIPService;