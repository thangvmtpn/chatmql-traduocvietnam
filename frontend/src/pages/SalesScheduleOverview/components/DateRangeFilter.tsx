import DatePicker, { registerLocale } from "react-datepicker";
import { vi } from "date-fns/locale/vi";
import "react-datepicker/dist/react-datepicker.css";

registerLocale("vi", vi);

type Props = {
  fromDate: Date;
  toDate: Date;
  onChange: (from: Date, to: Date) => void;
  onSearch: () => void;
};

export default function DateRangeFilter({
  fromDate,
  toDate,
  onChange,
  onSearch,
}: Props) {
  return (
    <div className="date-range-filter">
      <span className="tra-cuu-lich-label">
        <span className="material-symbols-outlined">search</span>
        TRA CỨU LỊCH
      </span>
      <div className="date-range-inputs">
        <div className="date-range-item">
          <label>Từ ngày</label>
          <DatePicker
            selected={fromDate}
            onChange={(date: Date | null) => date && onChange(date, toDate)}
            dateFormat="dd/MM/yyyy"
            locale="vi"
            className="datepicker-input"
            selectsStart
            startDate={fromDate}
            endDate={toDate}
          />
        </div>
        <span className="date-range-separator">—</span>
        <div className="date-range-item">
          <label>Đến ngày</label>
          <DatePicker
            selected={toDate}
            onChange={(date: Date | null) => date && onChange(fromDate, date)}
            dateFormat="dd/MM/yyyy"
            locale="vi"
            className="datepicker-input"
            selectsEnd
            startDate={fromDate}
            endDate={toDate}
            minDate={fromDate}
          />
        </div>
        <button className="btn-search" onClick={onSearch}>
          <span className="material-symbols-outlined">search</span>
          Tra cứu
        </button>
      </div>
    </div>
  );
}
