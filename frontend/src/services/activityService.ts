import api from "./api";

export interface ActivityLog {
  id: number;
  created_at: string;
  action_type: string | null;
  content: string | null;
  staff_name: string | null;
  customer_code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
}

export interface ActivityLogsResponse {
  data: ActivityLog[];
  total: number;
  page: number;
  limit: number;
}

export const getManagerActivities = async (
  logType: "sales_diary" | "system_log",
  page: number,
  limit: number,
  staffId?: number | null,
  fromDate?: string,
  toDate?: string
): Promise<ActivityLogsResponse> => {
  const params: any = { log_type: logType, page, limit };
  if (staffId) params.staff_id = staffId;
  if (fromDate) params.from_date = fromDate;
  if (toDate) params.to_date = toDate;

  const response = await api.get<ActivityLogsResponse>("/api/dashboard/manager/activities", { params });
  return response.data;
};
