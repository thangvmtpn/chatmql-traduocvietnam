import api from "./api";

export interface AccountFull {
  id_acc: number;
  user_id: string;
  name: string;
  chuc_vu: string;
  username: string;
  password: string;
  role_id: number;
  department_id: number | null;
  quyen_han: number | null;
  sub_account: number | null;
  trang_thai: string;
}

export interface AccountCreateData {
  user_id: string;
  name: string;
  chuc_vu?: string;
  username: string;
  password: string;
  role_id: number;
  department_id?: number | null;
  quyen_han?: number | null;
  sub_account?: number | null;
  trang_thai?: string;
}

export interface AccountUpdateData {
  user_id?: string;
  name?: string;
  chuc_vu?: string;
  username?: string;
  password?: string;
  role_id?: number;
  department_id?: number | null;
  quyen_han?: number | null;
  sub_account?: number | null;
  trang_thai?: string;
}

export const getAccountList = async (): Promise<AccountFull[]> => {
  const res = await api.get<{ success: boolean; data: AccountFull[]; total: number }>(
    "/api/admin/accounts"
  );
  return res.data.data;
};

export const createAccount = async (data: AccountCreateData): Promise<{ success: boolean; message: string; id_acc: number }> => {
  const res = await api.post("/api/admin/accounts", data);
  return res.data;
};

export const updateAccount = async (id_acc: number, data: AccountUpdateData): Promise<{ success: boolean; message: string }> => {
  const res = await api.put(`/api/admin/accounts/${id_acc}`, data);
  return res.data;
};

export const ROLE_LABELS: Record<number, string> = {
  1: "Admin",
  2: "Sub-Admin",
  3: "Quản lý",
  4: "Chuyên viên",
  5: "Thử việc",
  6: "Học việc",
};

// Chỉ những cấp bậc được phép chọn khi tạo tài khoản mới
export const CREATABLE_ROLES: { role_id: number; label: string }[] = [
  { role_id: 3, label: "Quản lý" },
  { role_id: 4, label: "Chuyên viên" },
  { role_id: 5, label: "Thử việc" },
  { role_id: 6, label: "Học việc" },
];
