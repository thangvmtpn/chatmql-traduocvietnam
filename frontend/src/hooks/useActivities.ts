import { useQuery } from "@tanstack/react-query";
import { getManagerActivities } from "@/services/activityService";

export const useManagerActivities = (
  logType: "sales_diary" | "system_log",
  page: number,
  limit: number,
  staffId?: number | null,
  fromDate?: string,
  toDate?: string
) => {
  return useQuery({
    queryKey: ["manager-activities", logType, page, limit, staffId, fromDate, toDate],
    queryFn: () => getManagerActivities(logType, page, limit, staffId, fromDate, toDate),
    staleTime: 60 * 1000, // 1 minute
  });
};
