import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getDashboardOverview,
  getDashboardPerformance,
  getCustomerManagement,
  getCustomersList,
  getCustomerDetail,
  getEmployeeOverview,
  getEmployeeTopProducts,
  getEmployeeRegionStats,
  getCustomerNotes,
  createCustomerNote,
  getStaffList,
  getCustomerGroups,
  getAdminTopProducts,
  getManagerOverview,
  getManagerPerformance,
  getManagerCustomerManagement,
  getManagerStaffList,
} from "@/services/dashboardService";
import * as dashboardService from "@/services/dashboardService";

export const useDashboardOverview = (fromDate?: string, toDate?: string) => {
  return useQuery({
    queryKey: ["dashboard", "overview", fromDate, toDate],
    queryFn: () => getDashboardOverview(fromDate, toDate),
    staleTime: 0,
    retry: 2,
    refetchOnMount: true,
  });
};

export const useDashboardPerformance = (fromDate?: string, toDate?: string) => {
  return useQuery({
    queryKey: ["dashboard", "performance", fromDate, toDate],
    queryFn: () => getDashboardPerformance(fromDate, toDate),
    staleTime: 0, // Luôn coi dữ liệu là stale, mỗi lần mount lại sẽ gọi API
    retry: 2,
    refetchOnMount: true, // Gọi lại API mỗi khi component mount
  });
};

export const useManagerOverview = (fromDate?: string, toDate?: string) => {
  return useQuery({
    queryKey: ["dashboard", "manager-overview", fromDate, toDate],
    queryFn: () => getManagerOverview(fromDate, toDate),
    staleTime: 0,
    retry: 2,
    refetchOnMount: true,
  });
};

export const useManagerPerformance = (fromDate?: string, toDate?: string) => {
  return useQuery({
    queryKey: ["dashboard", "manager-performance", fromDate, toDate],
    queryFn: () => getManagerPerformance(fromDate, toDate),
    staleTime: 0,
    retry: 2,
    refetchOnMount: true,
  });
};

export const useCustomerManagement = (roleId: number = 4) => {
  return useQuery({
    queryKey: ["dashboard", "customer-management", roleId],
    queryFn: () => getCustomerManagement(roleId),
    staleTime: 5 * 60 * 1000, // Cache 5 phút
    retry: 2,
  });
};

export const useManagerCustomerManagement = (roleId: number = 4) => {
  return useQuery({
    queryKey: ["dashboard", "manager-customer-management", roleId],
    queryFn: () => getManagerCustomerManagement(roleId),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
};

export const useEmployeeOverview = (fromDate?: string, toDate?: string) => {
  return useQuery({
    queryKey: ["dashboard", "employee-overview", fromDate, toDate],
    queryFn: () => getEmployeeOverview(fromDate, toDate),
    staleTime: 0,
    retry: 2,
    refetchOnMount: true,
  });
};

export const useEmployeeTopProducts = (
  limit: number = 100,
  sortBy: "gmv" | "so_lan_mua" = "gmv",
) => {
  return useQuery({
    queryKey: ["dashboard", "employee-top-products", limit, sortBy],
    queryFn: () => getEmployeeTopProducts(limit, sortBy),
    staleTime: 0,
    retry: 2,
    refetchOnMount: true,
  });
};

export const useEmployeeRegionStats = () => {
  return useQuery({
    queryKey: ["dashboard", "employee-region-stats"],
    queryFn: () => getEmployeeRegionStats(),
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
};

export const useMyFNTargetData = () => {
  return useQuery({
    queryKey: ["dashboard", "my-fn-target"],
    queryFn: () => dashboardService.getMyFNTargetData(),
    staleTime: 0,
    retry: 2,
    refetchOnMount: true,
  });
};

export const useAdminTopProducts = (
  limit: number = 100,
  sortBy: "gmv" | "so_lan_mua" = "gmv",
  fromDate?: string,
  toDate?: string,
) => {
  return useQuery({
    queryKey: [
      "dashboard",
      "admin-top-products",
      limit,
      sortBy,
      fromDate,
      toDate,
    ],
    queryFn: () => getAdminTopProducts(limit, sortBy, fromDate, toDate),
    staleTime: 0,
    retry: 2,
    refetchOnMount: true,
  });
};

export const useEmployeeRegionCustomers = (mien: string) => {
  return useQuery({
    queryKey: ["dashboard", "employee-region-customers", mien],
    queryFn: () => dashboardService.getEmployeeRegionCustomers(mien),
    staleTime: 5 * 60 * 1000,
    retry: 2,
    enabled: !!mien,
  });
};

export const useCustomersList = (
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
) => {
  return useQuery({
    queryKey: [
      "dashboard",
      "customers",
      filterType,
      page,
      pageSize,
      searchCustomerId,
      searchPhoneNumber,
      gmvMin,
      gmvMax,
      pfMin,
      pfMax,
      aovMin,
      aovMax,
      mien,
      nhomKh,
      staffId,
      sortBy,
      sortOrder,
      csLaiToday,
    ],
    queryFn: () =>
      getCustomersList(
        filterType,
        page,
        pageSize,
        searchCustomerId,
        searchPhoneNumber,
        gmvMin,
        gmvMax,
        pfMin,
        pfMax,
        aovMin,
        aovMax,
        mien,
        nhomKh,
        staffId,
        sortBy,
        sortOrder,
        csLaiToday,
      ),
    staleTime: 2 * 60 * 1000, // Cache 2 phút
    retry: 2,
  });
};

export const useCustomerDetail = (
  customerId: number,
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: ["customer", "detail", customerId],
    queryFn: () => getCustomerDetail(customerId),
    enabled: enabled && customerId > 0,
    staleTime: 5 * 60 * 1000, // Cache 5 phút
    retry: 2,
  });
};

export const useCustomerNotes = (customerId: number) => {
  return useQuery({
    queryKey: ["customer", "notes", customerId],
    queryFn: () => getCustomerNotes(customerId),
    enabled: customerId > 0,
    staleTime: 1 * 60 * 1000, // Cache 1 phút
    retry: 2,
  });
};

export const useCreateCustomerNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      customerId,
      noiDung,
      loaiGhiChu,
    }: {
      customerId: number;
      noiDung: string;
      loaiGhiChu?: string;
    }) => createCustomerNote(customerId, noiDung, loaiGhiChu),
    onSuccess: (_, variables) => {
      // Invalidate và refetch danh sách notes sau khi tạo mới
      queryClient.invalidateQueries({
        queryKey: ["customer", "notes", variables.customerId],
      });
    },
  });
};

export const useUpdateCustomerNextContactTime = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      customerId,
      thoiGianCsLai,
    }: {
      customerId: number;
      thoiGianCsLai: string;
    }) =>
      dashboardService.updateCustomerNextContactTime(customerId, thoiGianCsLai),
    onSuccess: (_, variables) => {
      // Invalidate customer detail để refetch
      queryClient.invalidateQueries({
        queryKey: ["customer", "detail", variables.customerId],
      });
    },
  });
};

export const useUpdateCustomerNextSalesTime = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      customerId,
      ngayHenBanhang,
    }: {
      customerId: number;
      ngayHenBanhang: string;
    }) =>
      dashboardService.updateCustomerNextSalesTime(customerId, ngayHenBanhang),
    onSuccess: (_, variables) => {
      // Invalidate customer detail để refetch
      queryClient.invalidateQueries({
        queryKey: ["customer", "detail", variables.customerId],
      });
    },
  });
};

export const useUpdateCustomerDaGoi = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      customerId,
      daGoi,
    }: {
      customerId: number;
      daGoi: boolean;
    }) => dashboardService.updateCustomerDaGoi(customerId, daGoi),
    onSuccess: (_, variables) => {
      // Invalidate customer list để refetch
      queryClient.invalidateQueries({
        queryKey: ["dashboard", "customers"],
      });
      queryClient.invalidateQueries({
        queryKey: ["cskh-schedule"],
      });
      queryClient.invalidateQueries({
        queryKey: ["customer", "detail", variables.customerId],
      });
    },
  });
};

/**
 * Hook để lấy danh sách accounts
 */
export const useAccounts = () => {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => dashboardService.getAccounts(),
  });
};

/**
 * Hook để lấy danh sách nhân viên có khách hàng
 */
export const useStaffList = (
  filterType: "all" | "handed_over" = "handed_over",
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: ["staff-list", filterType],
    queryFn: () => getStaffList(filterType),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
};

export const useManagerStaffList = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ["manager-staff-list"],
    queryFn: () => getManagerStaffList(),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
};

/**
 * Hook để lấy danh sách nhóm khách hàng chưa bàn giao
 */
export const useCustomerGroups = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ["customer-groups"],
    queryFn: () => getCustomerGroups(),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
};

/**
 * Hook để bàn giao khách hàng
 */
export const useAssignCustomers = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      customerIds,
      accountId,
    }: {
      customerIds: number[];
      accountId: number;
    }) => dashboardService.assignCustomers(customerIds, accountId),
    onSuccess: () => {
      // Invalidate danh sách khách hàng để refetch
      queryClient.invalidateQueries({
        queryKey: ["dashboard", "customers"],
      });
    },
  });
};

/**
 * Hook để tìm kiếm sản phẩm
 */
export const useSearchProducts = (
  query: string,
  limit: number = 10,
  excludeDealSoc: boolean = false,
) => {
  return useQuery({
    queryKey: ["search-products", query, limit, excludeDealSoc],
    queryFn: () =>
      dashboardService.searchProducts(query, limit, excludeDealSoc),
    enabled: query.length >= 0, // Cho phép tìm kiếm trống để lấy tất cả
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
};

/**
 * Hook để lấy danh sách khách hàng mua sản phẩm
 */
export const useProductCustomers = (
  codeProduct: string,
  sortBy: "gmv" | "so_lan_mua" = "gmv",
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: ["product-customers", codeProduct, sortBy],
    queryFn: () => dashboardService.getProductCustomers(codeProduct, sortBy),
    enabled: enabled && !!codeProduct,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });
};

/**
 * Hook để lấy dữ liệu FN Target Dashboard
 */
export const useFNTargetData = () => {
  return useQuery({
    queryKey: ["dashboard", "fn-target"],
    queryFn: () => dashboardService.getFNTargetData(),
    staleTime: 0,
    retry: 2,
    refetchOnMount: true,
  });
};

/**
 * Hook để lấy dữ liệu F0 Target Dashboard
 */
export const useF0TargetData = () => {
  return useQuery({
    queryKey: ["dashboard", "f0-target"],
    queryFn: () => dashboardService.getF0TargetData(),
    staleTime: 0,
    retry: 2,
    refetchOnMount: true,
  });
};
