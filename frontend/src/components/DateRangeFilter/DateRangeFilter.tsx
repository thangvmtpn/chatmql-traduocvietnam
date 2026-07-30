import { useState, useEffect, useRef } from "react";
import "./DateRangeFilter.css";

export type DateFilterType = "today" | "week" | "month" | "custom";

interface DateRangeFilterProps {
  onFilterChange: (
    fromDate: string,
    toDate: string,
    filterType?: DateFilterType,
  ) => void;
  resetTrigger?: boolean;
  defaultFilterType?: DateFilterType | null;
  defaultFromDate?: string;
  defaultToDate?: string;
}

export default function DateRangeFilter({
  onFilterChange,
  resetTrigger = false,
  defaultFilterType = null,
  defaultFromDate = "",
  defaultToDate = "",
}: DateRangeFilterProps) {
  const [filterType, setFilterType] = useState<DateFilterType | null>(
    defaultFilterType,
  );
  const [customFromDate, setCustomFromDate] = useState(defaultFromDate);
  const [customToDate, setCustomToDate] = useState(defaultToDate);
  const [showCustom, setShowCustom] = useState(defaultFilterType === "custom");
  const [isInitialized, setIsInitialized] = useState(false);

  // Khởi tạo mặc định
  useEffect(() => {
    if (!isInitialized && defaultFilterType) {
      setFilterType(defaultFilterType);
      setIsInitialized(true);
    }
  }, [defaultFilterType, isInitialized]);

  const prevResetTrigger = useRef(resetTrigger);
  useEffect(() => {
    if (resetTrigger !== prevResetTrigger.current) {
      setFilterType(defaultFilterType || null);
      setShowCustom(defaultFilterType === "custom" ? true : false);
      setCustomFromDate("");
      setCustomToDate("");
      prevResetTrigger.current = resetTrigger;
    }
  }, [resetTrigger, defaultFilterType]);

  // Helper functions để tính toán date range
  const getDateRange = (type: DateFilterType): { from: string; to: string } => {
    const today = new Date();
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    switch (type) {
      case "today":
        return { from: formatDate(today), to: formatDate(today) };

      case "week": {
        // Tuần này (Thứ 2 đến Chủ nhật)
        const dayOfWeek = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { from: formatDate(monday), to: formatDate(sunday) };
      }

      case "month": {
        // Tháng này
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return { from: formatDate(firstDay), to: formatDate(lastDay) };
      }

      case "custom":
        return { from: customFromDate, to: customToDate };

      default:
        return { from: formatDate(today), to: formatDate(today) };
    }
  };

  const handleFilterTypeChange = (type: DateFilterType) => {
    setFilterType(type);
    setShowCustom(type === "custom");

    if (type !== "custom") {
      const { from, to } = getDateRange(type);
      onFilterChange(from, to, type);
    }
  };

  const handleCustomApply = () => {
    if (customFromDate && customToDate) {
      if (customFromDate > customToDate) {
        alert("Ngày bắt đầu phải nhỏ hơn ngày kết thúc");
        return;
      }
      onFilterChange(customFromDate, customToDate, "custom");
    }
  };

  const handleReset = () => {
    setFilterType(null);
    setShowCustom(false);
    setCustomFromDate("");
    setCustomToDate("");
  };

  return (
    <div className="date-range-filter">
      <div className="filter-buttons">
        <button
          className={`filter-btn ${filterType === "today" ? "active" : ""}`}
          onClick={() => handleFilterTypeChange("today")}
        >
          <span className="material-symbols-outlined">today</span>
          Hôm nay
        </button>
        <button
          className={`filter-btn ${filterType === "week" ? "active" : ""}`}
          onClick={() => handleFilterTypeChange("week")}
        >
          <span className="material-symbols-outlined">date_range</span>
          Tuần này
        </button>
        <button
          className={`filter-btn ${filterType === "month" ? "active" : ""}`}
          onClick={() => handleFilterTypeChange("month")}
        >
          <span className="material-symbols-outlined">calendar_month</span>
          Tháng này
        </button>
        <button
          className={`filter-btn ${filterType === "custom" ? "active" : ""}`}
          onClick={() => handleFilterTypeChange("custom")}
        >
          <span className="material-symbols-outlined">tune</span>
          Tùy chỉnh
        </button>
      </div>

      {showCustom && (
        <div className="custom-date-inputs">
          <div className="date-input-group">
            <label>Từ ngày:</label>
            <input
              type="date"
              value={customFromDate}
              onChange={(e) => setCustomFromDate(e.target.value)}
            />
          </div>
          <div className="date-input-group">
            <label>Đến ngày:</label>
            <input
              type="date"
              value={customToDate}
              onChange={(e) => setCustomToDate(e.target.value)}
            />
          </div>
          <button className="apply-btn" onClick={handleCustomApply}>
            <span className="material-symbols-outlined">check</span>
            Áp dụng
          </button>
          <button className="reset-btn" onClick={handleReset}>
            <span className="material-symbols-outlined">refresh</span>
            Đặt lại
          </button>
        </div>
      )}
    </div>
  );
}
