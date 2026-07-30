import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";

interface CustomerGroup {
  nhom_kh: string;
}

export const useCustomerGroups = () => {
  return useQuery({
    queryKey: ["customer-groups"],
    queryFn: async () => {
      const response = await api.get<{
        success: boolean;
        data: CustomerGroup[];
      }>("/api/dashboard/customers-groups-list");
      return response.data.data || [];
    },
    staleTime: 5 * 60 * 1000, // Cache 5 phút
  });
};
