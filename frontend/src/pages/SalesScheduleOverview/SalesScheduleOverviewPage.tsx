import { useState } from "react";
import "react-datepicker/dist/react-datepicker.css";
import {
  useSalesScheduleOverviewStats,
} from "@/hooks/useSalesScheduleOverview";
import useAuthStore from "@/stores/useAuthStore";
import BaseLayout from "@/layouts/BaseLayout/BaseLayout";
import ScheduleOverview from "./components/OverviewStats";
import DateRangeFilter from "./components/DateRangeFilter";
import SalesResultTable from "./components/SalesResultPanel";
import InlineScheduleDetail from "./components/InlineDetail";
import "../CSKHSchedule/CSKHSchedule.css";
import "material-symbols";
import { ScheduleType } from "@/services/cskhScheduleService";

const toDateStr = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

function SalesScheduleOverviewPage() {
  const user = useAuthStore((state) => state.user);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [fromDate, setFromDate] = useState<Date>(today);
  const [toDate, setToDate] = useState<Date>(today);
  const [appliedDates, setAppliedDates] = useState<{ from: Date; to: Date }>({
    from: today,
    to: today,
  });

  const [activeView, setActiveView] = useState<
    "sales_result" | "detail" | null
  >(null);
  const [activeDetailType, setActiveDetailType] = useState<ScheduleType | null>(
    null,
  );

  const appliedFromStr = toDateStr(appliedDates.from);
  const appliedToStr = toDateStr(appliedDates.to);

  const { data: stats } = useSalesScheduleOverviewStats(
    appliedFromStr,
    appliedToStr,
  );

  const handleViewDetail = (type: ScheduleType) => {
    if (activeView === "detail" && activeDetailType === type) {
      setActiveView(null);
      setActiveDetailType(null);
    } else {
      setActiveView("detail");
      setActiveDetailType(type);
    }
  };

  const handleViewSalesResult = () => {
    if (activeView === "sales_result") {
      setActiveView(null);
    } else {
      setActiveView("sales_result");
      setActiveDetailType(null);
    }
  };

  const handleDateRangeChange = (from: Date, to: Date) => {
    setFromDate(from);
    setToDate(to);
  };

  const handleSearch = () => {
    setAppliedDates({ from: fromDate, to: toDate });
    setActiveView(null);
    setActiveDetailType(null);
  };

  const title = "Tổng quan lịch bán hàng";

  if (!user) return null;

  return (
    <BaseLayout
      user={user}
      title={title}
      subtitle="Lịch bán hàng phòng kinh doanh & phát triển thị trường"
    >
      <div className="cskh-schedule">
        <div className="cskh-header">
          <h1>
            <span className="material-symbols-outlined">calendar_today</span>{" "}
            {title}
          </h1>

          <div className="cskh-guide-section">
            <div className="guide-title">
              <span className="material-symbols-outlined">info</span>
              Thông tin
            </div>
            <div className="guide-content">
              Dữ liệu được tổng hợp từ{" "}
              <strong>tất cả nhân viên kinh doanh</strong>
            </div>
          </div>

          <DateRangeFilter
            fromDate={fromDate}
            toDate={toDate}
            onChange={handleDateRangeChange}
            onSearch={handleSearch}
          />

          <ScheduleOverview
            stats={stats}
            onViewDetail={handleViewDetail}
            onViewSalesResult={handleViewSalesResult}
            salesResultActive={activeView === "sales_result"}
          />

          {activeView === "sales_result" && (
            <SalesResultTable
              fromDate={appliedFromStr}
              toDate={appliedToStr}
            />
          )}

          {activeView === "detail" && activeDetailType && (
            <InlineScheduleDetail
              type={activeDetailType}
              fromDate={appliedFromStr}
              toDate={appliedToStr}
              onClose={() => {
                setActiveView(null);
                setActiveDetailType(null);
              }}
            />
          )}
        </div>
      </div>
    </BaseLayout>
  );
}

export default SalesScheduleOverviewPage;
