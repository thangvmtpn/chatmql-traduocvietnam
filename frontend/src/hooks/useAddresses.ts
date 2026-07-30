import { useQuery } from "@tanstack/react-query";
import { getProvinces, getWardsByProvince } from "@/services/addressService";

/**
 * Hook để lấy danh sách tỉnh/thành phố
 */
export function useProvinces() {
  return useQuery({
    queryKey: ["provinces"],
    queryFn: getProvinces,
    staleTime: 1000 * 60 * 60, // Cache 1 giờ
  });
}

/**
 * Hook để lấy danh sách phường/xã theo tỉnh
 */
export function useWards(id_prov: number | null) {
  return useQuery({
    queryKey: ["wards", id_prov],
    queryFn: () => getWardsByProvince(id_prov!),
    enabled: id_prov !== null && id_prov > 0, // Chỉ fetch khi đã chọn tỉnh
    staleTime: 1000 * 60 * 60, // Cache 1 giờ
  });
}
