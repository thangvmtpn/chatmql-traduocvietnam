import { useQuery } from "@tanstack/react-query";
import {
  cskhScheduleService,
  ScheduleType,
  FilterParams,
} from "@/services/cskhScheduleService";

export const useCSKHSchedule = (
  scheduleType: ScheduleType = "all",
  page: number = 1,
  pageSize: number = 30,
  fromDate?: string | null,
  toDate?: string | null,
  filters?: FilterParams,
) => {
  return useQuery({
    queryKey: [
      "cskh-schedule",
      scheduleType,
      page,
      pageSize,
      fromDate,
      toDate,
      filters,
    ],
    queryFn: () =>
      cskhScheduleService.getSchedule(
        scheduleType,
        page,
        pageSize,
        fromDate,
        toDate,
        filters,
      ),
  });
};

export const useCSKHOverviewStats = (
  fromDate?: string | null,
  toDate?: string | null,
) => {
  return useQuery({
    queryKey: ["cskh-overview-stats", fromDate, toDate],
    queryFn: () => cskhScheduleService.getStats(fromDate, toDate),
    refetchInterval: 60000,
  });
};

export const useSalesResult = (
  fromDate?: string | null,
  toDate?: string | null,
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: ["cskh-sales-result", fromDate, toDate],
    queryFn: () => cskhScheduleService.getSalesResult(fromDate, toDate),
    refetchInterval: 60000,
    enabled,
  });
};
