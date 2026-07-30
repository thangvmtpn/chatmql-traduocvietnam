import api from "./api";

export interface Province {
  id_prov: number;
  prov: string;
}

export interface Ward {
  id_ward: number;
  ward: string;
  id_prov: number;
}

/**
 * Lấy danh sách tất cả tỉnh/thành phố
 */
export async function getProvinces(): Promise<Province[]> {
  const response = await api.get<Province[]>("/api/addresses/provinces");
  return response.data;
}

/**
 * Lấy danh sách phường/xã theo tỉnh/thành phố
 */
export async function getWardsByProvince(id_prov: number): Promise<Ward[]> {
  const response = await api.get<Ward[]>(`/api/addresses/wards/${id_prov}`);
  return response.data;
}
