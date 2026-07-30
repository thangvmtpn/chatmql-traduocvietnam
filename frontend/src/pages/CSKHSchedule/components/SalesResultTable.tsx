import { SalesResultStats } from "@/services/cskhScheduleService";
import "material-symbols";

type Props = {
  data?: SalesResultStats;
  isLoading: boolean;
  fromDate: string;
  toDate: string;
};

const vnd = (v: number) => v.toLocaleString("vi-VN");

const fmtDate = (d?: string) => {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
};

export default function SalesResultTable({
  data,
  isLoading,
  fromDate,
  toDate,
}: Props) {
  const sameDay = fromDate === toDate;
  const dateLabel = sameDay
    ? fmtDate(fromDate)
    : `${fmtDate(fromDate)} — ${fmtDate(toDate)}`;

  const khNote = sameDay ? "trong ngày" : "theo bộ lọc ngày";
  const donNote = sameDay ? "từ KH có lịch" : "từ KH có lịch trong khoảng";
  const thucTeNote = sameDay ? "tổng đơn trong ngày" : "tổng đơn trong khoảng";

  return (
    <div className="sales-result-section">
      {/* Title bar */}
      <div className="sales-result-title-bar">
        <span className="material-symbols-outlined">query_stats</span>
        <span>KẾT QUẢ BÁN HÀNG THEO LỊCH BÁN HÀNG — CƠ HỘI BÁN HÀNG</span>
        <span className="sales-result-date-badge">
          <span className="material-symbols-outlined">today</span>
          {dateLabel}
        </span>
      </div>

      <div className="sales-result-table-wrap">
        <table className="sales-result-table">
          <thead>
            <tr>
              <th>
                Mục tiêu (KH đầu kỳ)
                <br />
                <span className="col-note">{khNote}</span>
              </th>
              <th>
                Còn lại
                <br />
                <span className="col-note">Đang có lịch</span>
              </th>
              <th>
                Số đơn
                <br />
                <span className="col-note">{donNote}</span>
              </th>
              <th>GMV</th>
              <th>AOV</th>
              <th>
                Tỉ lệ chốt
                <br />
                <span className="col-note">đơn / KH đầu kỳ</span>
              </th>
              <th>
                Số đơn thực tế
                <br />
                <span className="col-note">{thucTeNote}</span>
              </th>
              <th>
                Tỉ lệ tổng
                <br />
                <span className="col-note">tổng đơn / KH đầu kỳ</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="sales-result-loading">
                  <span className="material-symbols-outlined">
                    progress_activity
                  </span>
                  Đang tải...
                </td>
              </tr>
            ) : (
              <tr>
                <td className="val-primary">
                  {(data?.so_khach_hang ?? 0).toLocaleString("vi-VN")}
                </td>
                <td className="val-default">
                  {(data?.so_khach_hang_hien_tai ?? data?.so_khach_hang ?? 0).toLocaleString("vi-VN")}
                </td>
                <td className="val-default">
                  {(data?.so_don ?? 0).toLocaleString("vi-VN")}
                </td>
                <td className="val-money">{vnd(data?.gmv ?? 0)}</td>
                <td className="val-money">{vnd(data?.aov ?? 0)}</td>
                <td>
                  <span
                    className={`val-rate ${
                      (data?.ti_le_chot_lich ?? 0) >= 50
                        ? "rate-good"
                        : (data?.ti_le_chot_lich ?? 0) >= 20
                          ? "rate-mid"
                          : "rate-low"
                    }`}
                  >
                    {(data?.ti_le_chot_lich ?? 0).toFixed(2)}%
                  </span>
                </td>
                <td className="val-default">
                  {(data?.so_don_thuc_te ?? 0).toLocaleString("vi-VN")}
                </td>
                <td>
                  <span
                    className={`val-rate ${
                      (data?.ti_le_tong ?? 0) >= 50
                        ? "rate-good"
                        : (data?.ti_le_tong ?? 0) >= 20
                          ? "rate-mid"
                          : "rate-low"
                    }`}
                  >
                    {(data?.ti_le_tong ?? 0).toFixed(2)}%
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
