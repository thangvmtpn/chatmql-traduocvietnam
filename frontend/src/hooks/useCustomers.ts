import { useQuery } from "@tanstack/react-query";
import { customerService, SortByType } from "@/services/customerService";

/**
 * Hook để lấy danh sách top khách hàng
 * @param limit Số lượng khách hàng
 * @param sortBy Sắp xếp theo: 'gmv' (mặc định) hoặc 'so_lan_mua'
 */
export const useTopCustomers = (
  limit: number = 100,
  sortBy: SortByType = "gmv",
) => {
  return useQuery({
    queryKey: ["topCustomers", limit, sortBy],
    queryFn: () => customerService.getTopCustomers(limit, sortBy),
    staleTime: 5 * 60 * 1000, // Cache 5 phút
    retry: 2,
  });
};
