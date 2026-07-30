import api from "./api";

// ==================== TYPES ====================

export interface SubChannelData {
  kenh: string;
  code_seller?: string;
  sub_label: string;
  muc_tieu: number;
  so_don: number;
  doanh_thu: number;
  aov: number;
  cpbh?: number;
  lich_ban_hang?: number;
  so_don_tu_lich?: number;
  ti_le_chot?: number;
  is_fn?: boolean;
}

export interface ChannelData {
  kenh: string;
  muc_tieu: number;
  so_don: number;
  doanh_thu: number;
  aov: number;
  cpbh?: number;
  lich_ban_hang?: number;
  so_don_tu_lich?: number;
  ti_le_chot?: number;
  is_group?: boolean;
  is_upsell?: boolean;
  sub?: SubChannelData[];
}

export interface BaoCaoF0Response {
  from_date: string;
  to_date: string;
  channels: ChannelData[];
}

export interface InvoiceDetail {
  code_invoice: string;
  name_customer: string;
  phone_number: string;
  subtotal: number;
  time_create: string;
  status_value: string;
  name_seller: string;
  name_salechannel: string;
  kenh_ban: string;
}

export interface ChiTietResponse {
  kenh: string;
  from_date: string;
  to_date: string;
  invoices: InvoiceDetail[];
}

// ==================== API CALLS ====================

export const getBaoCaoF0 = async (
  fromDate: string,
  toDate: string,
): Promise<BaoCaoF0Response> => {
  const response = await api.get<BaoCaoF0Response>("/api/bao-cao-f0", {
    params: { from_date: fromDate, to_date: toDate },
  });
  return response.data;
};

export const getChiTietHoaDon = async (
  kenh: string,
  fromDate: string,
  toDate: string,
): Promise<ChiTietResponse> => {
  const response = await api.get<ChiTietResponse>("/api/bao-cao-f0/chi-tiet", {
    params: { kenh, from_date: fromDate, to_date: toDate },
  });
  return response.data;
};

export const assignKenhF0 = async (
  codeInvoice: string,
  sourceKenh: string,
  targetKenh: string,
): Promise<{ success: boolean; updated: number; target_kenh: string }> => {
  const response = await api.put("/api/bao-cao-f0/assign-kenh", {
    code_invoice: codeInvoice,
    source_kenh: sourceKenh,
    target_kenh: targetKenh,
  });
  return response.data;
};

// ==================== FN TYPES ====================

export interface SellerData {
  id_seller: number;
  name_seller: string;
  code_seller?: string;
  so_don: number;
  doanh_thu: number;
  aov: number;
}

export interface BaoCaoFNResponse {
  from_date: string;
  to_date: string;
  sellers: SellerData[];
}

export interface ChiTietFNResponse {
  name_seller: string;
  from_date: string;
  to_date: string;
  invoices: InvoiceDetail[];
}

// ==================== FN API CALLS ====================

export const getBaoCaoFN = async (
  fromDate: string,
  toDate: string,
): Promise<BaoCaoFNResponse> => {
  const response = await api.get<BaoCaoFNResponse>("/api/bao-cao-fn", {
    params: { from_date: fromDate, to_date: toDate },
  });
  return response.data;
};

// ==================== SALES TARGET ====================

export interface SalesTarget {
  kenh: string;
  muc_tieu: number;
}

export const getSalesTargets = async (): Promise<SalesTarget[]> => {
  const response = await api.get<SalesTarget[]>("/api/sales-target");
  return response.data;
};

export const upsertSalesTarget = async (
  kenh: string,
  mucTieu: number,
): Promise<SalesTarget> => {
  const response = await api.post<SalesTarget>("/api/sales-target", {
    kenh,
    muc_tieu: mucTieu,
  });
  return response.data;
};

// ==================== FN API CALLS ====================

export const getChiTietNhanVien = async (
  codeSeller: string,
  nameSeller: string,
  fromDate: string,
  toDate: string,
): Promise<ChiTietFNResponse> => {
  const response = await api.get<ChiTietFNResponse>(
    "/api/bao-cao-fn/chi-tiet",
    {
      params: {
        code_seller: codeSeller,
        name_seller: nameSeller,
        from_date: fromDate,
        to_date: toDate,
      },
    },
  );
  return response.data;
};
