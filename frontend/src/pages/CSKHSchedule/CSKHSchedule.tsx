import { useState } from "react";
import "react-datepicker/dist/react-datepicker.css";
import { useCSKHOverviewStats, useSalesResult } from "@/hooks/useCSKHSchedule";
import useAuthStore from "@/stores/useAuthStore";
import BaseLayout from "@/layouts/BaseLayout/BaseLayout";
import ScheduleOverview from "./components/ScheduleStats";
import DateRangeFilter from "./components/CustomerFilterBar";
import SalesResultTable from "./components/SalesResultTable";
import InlineScheduleDetail from "./components/InlineScheduleDetail";
import "./CSKHSchedule.css";
import "material-symbols";
import { ScheduleType } from "@/services/cskhScheduleService";

const toDateStr = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

function CSKHSchedule() {
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

  const { data: stats } = useCSKHOverviewStats(appliedFromStr, appliedToStr);
  const { data: salesResult, isLoading: salesLoading } = useSalesResult(
    appliedFromStr,
    appliedToStr,
    activeView === "sales_result",
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
    // collapse any open panel when date range changes
    setActiveView(null);
    setActiveDetailType(null);
  };

  const title = "Lịch bán hàng của tôi";

  if (!user) return null;

  return (
    <BaseLayout
      user={user}
      title={title}
      subtitle={`Quản lý và theo dõi ${title.toLowerCase()}`}
    >
      <div className="cskh-schedule">
        <div className="cskh-header">
          <h1>
            <span className="material-symbols-outlined">calendar_today</span>{" "}
            {title}
          </h1>

          <div className="cskh-guide-section">
            <div className="guide-title">
              <span className="material-symbols-outlined">help_outline</span>
              Hướng dẫn cấu hình lịch bán hàng
            </div>
            <div className="guide-content">
              Lịch bán hàng ={" "}
              <button
                className="guide-link-btn"
                onClick={() => console.log("Show guide")}
              >
                Lịch chốt & Lịch phản hồi
              </button>
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
              data={salesResult}
              isLoading={salesLoading}
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

export default CSKHSchedule;
