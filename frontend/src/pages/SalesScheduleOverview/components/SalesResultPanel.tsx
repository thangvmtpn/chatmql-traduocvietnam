import { useSalesScheduleOverviewSalesResultByEmployee } from "@/hooks/useSalesScheduleOverview";
import "material-symbols";

type Props = {
  fromDate: string;
  toDate: string;
};

const vnd = (v: number) => v.toLocaleString("vi-VN");

const fmtDate = (d?: string) => {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
};

export default function SalesResultPanel({ fromDate, toDate }: Props) {
  const { data, isLoading, error } = useSalesScheduleOverviewSalesResultByEmployee(fromDate, toDate);

  const sameDay = fromDate === toDate;
  const dateLabel = sameDay
    ? fmtDate(fromDate)
    : `${fmtDate(fromDate)} — ${fmtDate(toDate)}`;

  return (
    <div className="sales-result-section">
      {/* Title bar */}
      <div className="sales-result-title-bar">
        <span className="material-symbols-outlined">query_stats</span>
        <span>KẾT QUẢ BÁN HÀNG THEO LỊCH BÁN HÀNG — TẤT CẢ NHÂN VIÊN KINH DOANH</span>
        <span className="sales-result-date-badge">
          <span className="material-symbols-outlined">today</span>
          {dateLabel}
        </span>
      </div>

      <div className="sales-result-table-wrap">
        <table className="cskh-table">
          <thead>
            <tr>
              <th style={{ width: "48px" }}>#</th>
              <th>Mã NV</th>
              <th>Tên Nhân Viên</th>
              <th style={{ textAlign: "center" }}>
                Số KH đầu kỳ
                <br />
                <span style={{ fontSize: "11px", fontWeight: 400, opacity: 0.7 }}>
                  {sameDay ? "trong ngày" : "theo bộ lọc"}
                </span>
              </th>
              <th style={{ textAlign: "center" }}>
                Còn lại
                <br />
                <span style={{ fontSize: "11px", fontWeight: 400, opacity: 0.7 }}>Đang có lịch</span>
              </th>
              <th style={{ textAlign: "center" }}>
                Số đơn
                <br />
                <span style={{ fontSize: "11px", fontWeight: 400, opacity: 0.7 }}>từ KH đầu kỳ</span>
              </th>
              <th style={{ textAlign: "right" }}>GMV</th>
              <th style={{ textAlign: "right" }}>AOV</th>
              <th style={{ textAlign: "center" }}>
                Tỉ lệ chốt
                <br />
                <span style={{ fontSize: "11px", fontWeight: 400, opacity: 0.7 }}>đơn / KH đầu kỳ</span>
              </th>
              <th style={{ textAlign: "center" }}>
                Số đơn thực tế
                <br />
                <span style={{ fontSize: "11px", fontWeight: 400, opacity: 0.7 }}>
                  {sameDay ? "tổng đơn trong ngày" : "tổng đơn trong khoảng"}
                </span>
              </th>
              <th style={{ textAlign: "center" }}>
                Tỉ lệ tổng
                <br />
                <span style={{ fontSize: "11px", fontWeight: 400, opacity: 0.7 }}>tổng đơn / KH đầu kỳ</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", padding: "32px", color: "#6b7280" }}>
                  <span className="material-symbols-outlined">progress_activity</span>
                  <p>Đang tải dữ liệu...</p>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", padding: "32px", color: "#dc2626" }}>
                  <span className="material-symbols-outlined">error</span>
                  <p>Có lỗi khi tải dữ liệu</p>
                </td>
              </tr>
            ) : !data?.data || data.data.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", padding: "32px", color: "#9ca3af" }}>
                  <span className="material-symbols-outlined">inbox</span>
                  <p>Không có dữ liệu</p>
                </td>
              </tr>
            ) : (
              data.data.map((emp, idx) => {
                const rateClass =
                  emp.ti_le_chot_lich >= 50 ? "rate-good"
                  : emp.ti_le_chot_lich >= 20 ? "rate-mid"
                  : "rate-low";

                return (
                  <tr key={emp.id_acc} className="clickable-row">
                    <td style={{ color: "#6b7280", fontSize: "13px" }}>{idx + 1}</td>
                    <td>
                      <div className="customer-code">{emp.ma_nhan_vien || "—"}</div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          className="material-symbols-outlined"
                          style={{
                            fontSize: "18px",
                            color: "#6366f1",
                            background: "#eef2ff",
                            borderRadius: "50%",
                            padding: "3px",
                          }}
                        >
                          person
                        </span>
                        <span style={{ fontWeight: 500, color: "#111827" }}>{emp.ten_nhan_vien}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: "20px",
                          background: emp.so_khach_hang > 0 ? "#dbeafe" : "#f3f4f6",
                          color: emp.so_khach_hang > 0 ? "#1d4ed8" : "#6b7280",
                          fontWeight: 700,
                          fontSize: "14px",
                        }}
                      >
                        {emp.so_khach_hang.toLocaleString("vi-VN")}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: "20px",
                          background: "#f3f4f6",
                          color: "#6b7280",
                          fontWeight: 700,
                          fontSize: "14px",
                        }}
                      >
                        {(emp.so_khach_hang_hien_tai ?? emp.so_khach_hang ?? 0).toLocaleString("vi-VN")}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ fontWeight: 600, color: emp.so_don > 0 ? "#111827" : "#9ca3af" }}>
                        {emp.so_don.toLocaleString("vi-VN")}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600, color: emp.gmv > 0 ? "#059669" : "#9ca3af" }}>
                      {emp.gmv > 0 ? vnd(emp.gmv) : "—"}
                    </td>
                    <td style={{ textAlign: "right", color: "#374151" }}>
                      {emp.aov > 0 ? vnd(emp.aov) : "—"}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {emp.so_khach_hang > 0 ? (
                        <span className={`val-rate ${rateClass}`}>
                          {emp.ti_le_chot_lich.toFixed(1)}%
                        </span>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ fontWeight: 600, color: (emp.so_don_thuc_te ?? 0) > 0 ? "#111827" : "#9ca3af" }}>
                        {(emp.so_don_thuc_te ?? 0).toLocaleString("vi-VN")}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {emp.so_khach_hang > 0 ? (
                        <span
                          className={`val-rate ${
                            (emp.ti_le_tong ?? 0) >= 50 ? "rate-good"
                            : (emp.ti_le_tong ?? 0) >= 20 ? "rate-mid"
                            : "rate-low"
                          }`}
                        >
                          {(emp.ti_le_tong ?? 0).toFixed(1)}%
                        </span>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {/* Footer tổng */}
          {data?.data && data.data.length > 0 && (
            <tfoot>
              <tr style={{ background: "#f1f5f9", fontWeight: 700 }}>
                <td colSpan={3} style={{ padding: "8px 12px", color: "#374151" }}>
                  Tổng
                </td>
                <td style={{ textAlign: "center", color: "#1d4ed8" }}>
                  {data.data.reduce((s, e) => s + e.so_khach_hang, 0).toLocaleString("vi-VN")}
                </td>
                <td style={{ textAlign: "center", color: "#6b7280" }}>
                  {data.data.reduce((s, e) => s + (e.so_khach_hang_hien_tai ?? e.so_khach_hang ?? 0), 0).toLocaleString("vi-VN")}
                </td>
                <td style={{ textAlign: "center" }}>
                  {data.data.reduce((s, e) => s + e.so_don, 0).toLocaleString("vi-VN")}
                </td>
                <td style={{ textAlign: "right", color: "#059669" }}>
                  {vnd(data.data.reduce((s, e) => s + e.gmv, 0))}
                </td>
                <td />
                {(() => {
                  const totalKH = data.data.reduce((s, e) => s + e.so_khach_hang, 0);
                  const totalDon = data.data.reduce((s, e) => s + e.so_don, 0);
                  const totalDonThucTe = data.data.reduce((s, e) => s + (e.so_don_thuc_te ?? 0), 0);
                  const tiLeChot = totalKH > 0 ? (totalDon / totalKH) * 100 : 0;
                  const tiLeTong = totalKH > 0 ? (totalDonThucTe / totalKH) * 100 : 0;
                  const rateClass = (r: number) =>
                    r >= 50 ? "rate-good" : r >= 20 ? "rate-mid" : "rate-low";
                  return (
                    <>
                      <td style={{ textAlign: "center" }}>
                        <span className={`val-rate ${rateClass(tiLeChot)}`}>
                          {tiLeChot.toFixed(1)}%
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {totalDonThucTe.toLocaleString("vi-VN")}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span className={`val-rate ${rateClass(tiLeTong)}`}>
                          {tiLeTong.toFixed(1)}%
                        </span>
                      </td>
                    </>
                  );
                })()}
                </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Legend Note for rate colors */}
      <div style={{
        padding: "12px 16px",
        background: "white",
        borderTop: "1px solid #e5e7eb",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "12px",
        fontSize: "13px",
        color: "#4b5563"
      }}>
        <span style={{ fontWeight: 600, color: "#111827", display: "flex", alignItems: "center", gap: "6px" }}>
          Chú thích màu sắc tỉ lệ:
        </span>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span className="val-rate rate-good" style={{ padding: "2px 8px", fontSize: "12px" }}>Tốt (≥ 50%)</span>
          <span className="val-rate rate-mid" style={{ padding: "2px 8px", fontSize: "12px" }}>Trung bình (20% - 49.9%)</span>
          <span className="val-rate rate-low" style={{ padding: "2px 8px", fontSize: "12px" }}>Cần cải thiện (&lt; 20%)</span>
        </div>
      </div>
    </div>
  );
}
