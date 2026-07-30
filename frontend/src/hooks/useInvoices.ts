import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import api from "@/services/api";
import { API_ENDPOINTS } from "@/config/api";
import type {
  InvoiceOrdersResponse,
  InvoiceOrdersStatsResponse,
  InvoiceDetailResponse,
} from "@/types/api";
import type { AxiosError } from "axios";

// Hook để lấy danh sách đơn hàng của tôi
export const useMyOrders = (
  params: {
    page?: number;
    limit?: number;
    status?: string;
    code_invoice?: string;
    from_date?: string;
    to_date?: string;
  } = {},
) => {
  return useQuery<InvoiceOrdersResponse>({
    queryKey: ["myOrders", params],
    queryFn: async () => {
      const response = await api.get(API_ENDPOINTS.MY_ORDERS, { params });
      return response.data;
    },
  });
};

// Hook để tìm kiếm hoá đơn theo mã (role 1,2: tất cả; role 4: chỉ của mình)
export const useSearchInvoices = (
  params: {
    code_invoice?: string;
    page?: number;
    limit?: number;
  } = {},
  enabled = true,
) => {
  return useQuery<InvoiceOrdersResponse>({
    queryKey: ["searchInvoices", params],
    queryFn: async () => {
      const response = await api.get(API_ENDPOINTS.SEARCH_INVOICES, { params });
      return response.data;
    },
    enabled: enabled && !!params.code_invoice,
  });
};

// Hook để lấy chi tiết đơn hàng
export const useInvoiceDetail = (code_invoice: string | undefined) => {
  return useQuery<InvoiceDetailResponse>({
    queryKey: ["invoiceDetail", code_invoice],
    queryFn: async () => {
      if (!code_invoice) throw new Error("Mã đơn hàng không hợp lệ");
      const response = await api.get(
        API_ENDPOINTS.INVOICE_DETAIL(code_invoice),
      );
      return response.data;
    },
    enabled: !!code_invoice,
  });
};

// Hook để lấy thống kê đơn hàng của tôi
export const useMyOrdersStats = (
  params: {
    from_date?: string;
    to_date?: string;
    status?: string;
  } = {},
) => {
  return useQuery<InvoiceOrdersStatsResponse>({
    queryKey: ["myOrdersStats", params],
    queryFn: async () => {
      const response = await api.get(API_ENDPOINTS.MY_ORDERS_STATS, { params });
      return response.data;
    },
  });
};

// Hook để lấy tất cả hoá đơn với bộ lọc (admin xem tất cả, nhân viên xem của mình)
export const useAllInvoices = (
  params: {
    page?: number;
    limit?: number;
    status_value?: string;
    id_salechannel?: number;
    id_salechannel_list?: string;
    code_invoice?: string;
    from_date?: string;
    to_date?: string;
  } = {},
  enabled = true,
) => {
  return useQuery<InvoiceOrdersResponse>({
    queryKey: ["allInvoices", params],
    queryFn: async () => {
      const response = await api.get(API_ENDPOINTS.ALL_INVOICES, { params });
      return response.data;
    },
    enabled,
  });
};

// Hook để lấy danh sách hóa đơn
export const useInvoices = (params = {}) => {
  return useQuery({
    queryKey: ["invoices", params],
    queryFn: async () => {
      const response = await api.get(API_ENDPOINTS.HOA_DON, { params });
      return response.data;
    },
  });
};

// Hook để lấy lịch sử vận chuyển
export const useDeliveryHistory = (
  code_delivery: string | undefined,
  partner_id?: number,
  enabled = false,
) => {
  return useQuery<
    {
      time: string;
      trackingCode: string;
      partner: string;
      status: string;
      statusText: string;
      detail: string | null;
      creator: string | null;
    }[]
  >({
    queryKey: ["deliveryHistory", code_delivery, partner_id],
    queryFn: async () => {
      if (!code_delivery) return [];
      const url = API_ENDPOINTS.INVOICE_DELIVERY_HISTORY(
        code_delivery,
        partner_id,
      );
      const response = await api.get(url);
      return response.data;
    },
    enabled: enabled && !!code_delivery,
  });
};

// Hook để lấy chi tiết hóa đơn
export const useInvoice = (invoiceId: string | number | null | undefined) => {
  return useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      if (!invoiceId) return null;
      const response = await api.get(API_ENDPOINTS.HOA_DON_DETAIL(invoiceId));
      return response.data;
    },
    enabled: !!invoiceId,
  });
};

// Hook để tạo hóa đơn mới
export const useCreateInvoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invoiceData: any) => {
      const response = await api.post(
        API_ENDPOINTS.CREATE_INVOICE,
        invoiceData,
      );
      return response.data;
    },
    onSuccess: () => {
      // Invalidate tất cả queries liên quan đến đơn hàng
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["myOrders"] });
      queryClient.invalidateQueries({ queryKey: ["myOrdersStats"] });
    },
    onError: (error: AxiosError<any>) => {
      toast.error(error.response?.data?.detail || "Có lỗi xảy ra!");
    },
  });
};

// Hook để cập nhật hóa đơn
export const useUpdateInvoice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      invoiceId,
      invoiceData,
    }: {
      invoiceId: string | number;
      invoiceData: any;
    }) => {
      const response = await api.put(
        API_ENDPOINTS.HOA_DON_DETAIL(invoiceId),
        invoiceData,
      );
      return response.data;
    },
    onSuccess: (
      _data: any,
      variables: { invoiceId: string | number; invoiceData: any },
    ) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({
        queryKey: ["invoice", variables.invoiceId],
      });
      toast.success("Cập nhật hóa đơn thành công!");
    },
    onError: (error: AxiosError<any>) => {
      toast.error(error.response?.data?.detail || "Có lỗi xảy ra!");
    },
  });
};
