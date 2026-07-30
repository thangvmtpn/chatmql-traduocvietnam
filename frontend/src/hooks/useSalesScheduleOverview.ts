import { useQuery } from "@tanstack/react-query";
import { salesScheduleOverviewService } from "@/services/salesScheduleOverviewService";
import { ScheduleType, FilterParams } from "@/services/cskhScheduleService";

export const useSalesScheduleOverviewStats = (
  fromDate?: string | null,
  toDate?: string | null,
) => {
  return useQuery({
    queryKey: ["sales-schedule-overview-stats", fromDate, toDate],
    queryFn: () => salesScheduleOverviewService.getStats(fromDate, toDate),
    refetchInterval: 60000,
  });
};

export const useSalesScheduleOverview = (
  scheduleType: ScheduleType = "all",
  page: number = 1,
  pageSize: number = 30,
  fromDate?: string | null,
  toDate?: string | null,
  filters?: FilterParams,
) => {
  return useQuery({
    queryKey: [
      "sales-schedule-overview",
      scheduleType,
      page,
      pageSize,
      fromDate,
      toDate,
      filters,
    ],
    queryFn: () =>
      salesScheduleOverviewService.getSchedule(
        scheduleType,
        page,
        pageSize,
        fromDate,
        toDate,
        filters,
      ),
  });
};

export const useSalesScheduleOverviewSalesResult = (
  fromDate?: string | null,
  toDate?: string | null,
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: ["sales-schedule-overview-sales-result", fromDate, toDate],
    queryFn: () => salesScheduleOverviewService.getSalesResult(fromDate, toDate),
    refetchInterval: 60000,
    enabled,
  });
};

export const useSalesScheduleOverviewSalesResultByEmployee = (
  fromDate?: string | null,
  toDate?: string | null,
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: ["sales-schedule-overview-sales-result-nhan-vien", fromDate, toDate],
    queryFn: () => salesScheduleOverviewService.getSalesResultByEmployee(fromDate, toDate),
    refetchInterval: 60000,
    enabled,
  });
};

export const useSalesScheduleOverviewEmployeeList = (
  scheduleType: ScheduleType = "all",
  fromDate?: string | null,
  toDate?: string | null,
  enabled: boolean = true,
) => {
  return useQuery({
    queryKey: ["sales-schedule-overview-nhan-vien", scheduleType, fromDate, toDate],
    queryFn: () => salesScheduleOverviewService.getEmployeeList(scheduleType, fromDate, toDate),
    enabled,
  });
};

export const useSalesScheduleOverviewEmployeeCustomers = (
  idAcc: number | null,
  scheduleType: ScheduleType = "all",
  page: number = 1,
  pageSize: number = 30,
  fromDate?: string | null,
  toDate?: string | null,
  filters?: FilterParams,
) => {
  return useQuery({
    queryKey: [
      "sales-schedule-overview-nhan-vien-kh",
      idAcc,
      scheduleType,
      page,
      pageSize,
      fromDate,
      toDate,
      filters,
    ],
    queryFn: () =>
      salesScheduleOverviewService.getEmployeeCustomers(
        idAcc!,
        scheduleType,
        page,
        pageSize,
        fromDate,
        toDate,
        filters,
      ),
    enabled: idAcc !== null,
  });
};
