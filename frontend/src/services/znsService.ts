import api from "./api";

export interface SendZNSPayload {
  phone: string;
  ten_kh: string;
  ma_don_hang?: string;
  template_id: number;
}

export interface SendZNSResponse {
  error?: string;
  [key: string]: unknown;
}

export const sendZNS = async (
  payload: SendZNSPayload,
): Promise<SendZNSResponse> => {
  const response = await api.post<SendZNSResponse>("/api/zns/send", payload);
  return response.data;
};
