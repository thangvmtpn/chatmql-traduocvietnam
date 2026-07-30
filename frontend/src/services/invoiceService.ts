import api from "./api";

// Interface cho Invoice
export interface Invoice {
  time_create: string;
  time_update: string;
  id_creator: number;
  code_creator: string;
  name_creator: string;
  id_seller: number;
  code_seller: string;
  name_seller: string;
  id_customer: number;
  code_customer: string;
  name_customer: string;
  phone_number: string;
  id_salechannel: number;
  name_salechannel: string;
  subtotal: number;
  gift_amount: number;
  discount: number;
  total_amount: number;
  fee_delivery: number;
  type_fee_delivery: string;
  shipping_method?: string;
  cod_need_payment: number;
  description?: string;
  send_zns: boolean;
  id_status: number;
  status_value: string;
  id_subchannel?: number | null;
  subchannel?: string | null;
  type_channel?: string | null;
  fee_platform: number;
  is_doi_hang?: boolean;
}

// Interface cho Invoice Detail - Cập nhật theo schema backend
export interface InvoiceDetail {
  id_product: number;
  code_product: string;
  name_product: string;
  sub_code_product?: string | null;
  sub_name_code_product?: string | null;
  quantity: number;
  sub_price: number; // Giá trước chiết khấu
  discount_price: number; // Số tiền chiết khấu
  price: number; // Giá sau chiết khấu
  total: number; // Thành tiền = price * quantity
  type_product?: string | null;
}

// Interface cho Delivery Information - Cập nhật theo schema backend
export interface DeliveryInformation {
  time_create?: string;
  time_update?: string;
  code_delivery?: string | null;
  id_partner_delivery?: number | null;
  partner_delivery?: string | null;
  receiver: string;
  contact_number: string;
  prov: string; // Tỉnh/Thành phố
  city?: string | null; // Thành phố (nếu có)
  area: string; // Phường/Xã
  address: string; // Địa chỉ chi tiết
  height: number;
  width: number;
  length: number;
  weight: number;
  codfee: number;
  fee_delivery: number;
  id_status?: number;
  description?: string | null;
}

// Interface cho data gửi lên API
export interface CreateInvoicePayload {
  invoice: Invoice;
  invoice_details: InvoiceDetail[];
  delivery_info?: DeliveryInformation | null;
}

// Interface cho Sale Channel
export interface SaleChannel {
  id_salechannel: number;
  name_salechannel: string;
  type: string;
  icon?: string;
}

// Interface cho Delivery Partner
export interface DeliveryPartner {
  id_partner: number;
  name_partner: string;
  code_partner: string;
  is_active: boolean;
}

// Lấy danh sách kênh bán hàng
export const getSaleChannels = async (): Promise<SaleChannel[]> => {
  const response = await api.get("/api/invoice/sale_channels");
  return response.data;
};

// Lấy danh sách đối tác vận chuyển
export const getDeliveryPartners = async (): Promise<DeliveryPartner[]> => {
  const response = await api.get("/api/invoice/delivery_partners");
  return response.data;
};

// Tạo hóa đơn mới
export const createInvoice = async (
  payload: CreateInvoicePayload,
): Promise<{ message: string; code_invoice: string }> => {
  const response = await api.post("/api/invoice/create", payload);
  return response.data;
};

// Export các helper functions nếu cần
export const invoiceService = {
  getSaleChannels,
  getDeliveryPartners,
  createInvoice,
};

export default invoiceService;
