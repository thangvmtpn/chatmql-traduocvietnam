import { Fragment, useState } from "react";
import { ScheduleType } from "@/services/cskhScheduleService";
import {
  useSalesScheduleOverviewEmployeeList,
  useSalesScheduleOverviewEmployeeCustomers,
} from "@/hooks/useSalesScheduleOverview";
import { EmployeeScheduleStat } from "@/services/salesScheduleOverviewService";
import CustomerDetail from "@/components/CustomerDetail/CustomerDetail";
import "material-symbols";

type FilterParams = { ma_kh: string; ten_kh: string; sdt: string };

const TYPE_LABELS: Record<string, string> = {
  ban_hang: "Lịch Bán Hàng",
  cham_soc: "Lịch Chăm Sóc",
  chua_cau_hinh: "Chưa Cấu Hình",
  da_cau_hinh: "Đã Cấu Hình (Lịch BH Tương Lai)",
  don_trong_ky: "Khách Hàng Có Đơn Trong Kỳ",
  all: "Tất Cả",
};

type Props = {
  type: ScheduleType;
  fromDate?: string;
  toDate?: string;
  onClose: () => void;
};

const formatDateTime = (dateString?: string) => {
  if (!dateString) return "Chưa xác định";
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const getScheduleStatus = (dateString?: string) => {
  if (!dateString) return "upcoming";
  const scheduleDate = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (scheduleDate < today) return "overdue";
  if (scheduleDate >= today && scheduleDate < tomorrow) return "today";
  return "upcoming";
};

// ─── Sub-component: Danh sách KH của một nhân viên ───────────────────────────
function EmployeeCustomerPanel({
  idAcc,
  tenNhanVien,
  maNhanVien,
  type,
  fromDate,
  toDate,
  onBack,
}: {
  idAcc: number;
  tenNhanVien: string;
  maNhanVien: string;
  type: ScheduleType;
  fromDate?: string;
  toDate?: string;
  onBack: () => void;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [searchFilters, setSearchFilters] = useState<FilterParams>({ ma_kh: "", ten_kh: "", sdt: "" });
  const [appliedFilters, setAppliedFilters] = useState<FilterParams>({ ma_kh: "", ten_kh: "", sdt: "" });
  const [expandedCustomerId, setExpandedCustomerId] = useState<number | null>(null);

  const { data, isLoading, error } = useSalesScheduleOverviewEmployeeCustomers(
    idAcc,
    type,
    page,
    pageSize,
    fromDate,
    toDate,
    appliedFilters,
  );

  const handleApplySearch = () => { setAppliedFilters({ ...searchFilters }); setPage(1); };
  const handleClearSearch = () => {
    const empty: FilterParams = { ma_kh: "", ten_kh: "", sdt: "" };
    setSearchFilters(empty); setAppliedFilters(empty); setPage(1);
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleApplySearch();
  };

  return (
    <div className="p-4">
      {/* Breadcrumb back */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          background: "#eff6ff",
          borderRadius: "8px",
          cursor: "pointer",
          width: "fit-content",
          border: "1px solid #bfdbfe",
        }}
        onClick={onBack}
      >
        <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "#1d4ed8" }}>
          arrow_back
        </span>
        <span style={{ fontSize: "13px", color: "#1d4ed8", fontWeight: 500 }}>
          Quay lại danh sách
        </span>
      </div>

      {/* Employee info badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          margin: "12px 0 12px 0",
          padding: "10px 14px",
          background: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)",
          borderRadius: "10px",
          color: "#fff",
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>person</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: "15px" }}>{tenNhanVien}</div>
          <div style={{ fontSize: "12px", opacity: 0.85 }}>Mã NV: {maNhanVien || "—"}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: "20px", fontWeight: 700 }}>{data?.total ?? "—"}</div>
          <div style={{ fontSize: "11px", opacity: 0.85 }}>khách hàng</div>
        </div>
      </div>

      {/* Search bar */}
      <div className="detail-search-bar">
        <input
          type="text"
          placeholder="Mã KH..."
          value={searchFilters.ma_kh}
          onChange={(e) => setSearchFilters((p) => ({ ...p, ma_kh: e.target.value }))}
          onKeyDown={handleKeyDown}
        />
        <input
          type="text"
          placeholder="Tên khách hàng..."
          value={searchFilters.ten_kh}
          onChange={(e) => setSearchFilters((p) => ({ ...p, ten_kh: e.target.value }))}
          onKeyDown={handleKeyDown}
        />
        <input
          type="text"
          placeholder="Số điện thoại..."
          value={searchFilters.sdt}
          onChange={(e) => setSearchFilters((p) => ({ ...p, sdt: e.target.value }))}
          onKeyDown={handleKeyDown}
        />
        <button className="btn-search" onClick={handleApplySearch}>
          <span className="material-symbols-outlined">search</span>
          Tra cứu
        </button>
        <button className="btn-clear" onClick={handleClearSearch}>
          <span className="material-symbols-outlined">restart_alt</span>
          Xóa
        </button>
      </div>

      <div className="cskh-content">
        {isLoading ? (
          <div className="loading-container">
            <span className="material-symbols-outlined">progress_activity</span>
            <p>Đang tải dữ liệu...</p>
          </div>
        ) : error ? (
          <div className="error-container">
            <span className="material-symbols-outlined">error</span>
            <p>Có lỗi xảy ra khi tải dữ liệu</p>
          </div>
        ) : !data?.data || data.data.length === 0 ? (
          <div className="empty-container">
            <span className="material-symbols-outlined">inbox</span>
            <p>Không có khách hàng nào</p>
          </div>
        ) : (
          <>
            <table className="cskh-table">
              <thead>
                <tr>
                  <th>Mã KH</th>
                  <th>Tên Khách Hàng</th>
                  <th>Số Điện Thoại</th>
                  {(type === "all" || type === "cham_soc" || type === "chua_cau_hinh" || type === "don_trong_ky") && (
                    <th>Lịch Phản Hồi</th>
                  )}
                  {(type === "all" || type === "ban_hang" || type === "chua_cau_hinh" || type === "da_cau_hinh" || type === "don_trong_ky") && (
                    <th>Lịch Bán Hàng</th>
                  )}
                  <th style={{ textAlign: "center" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((customer: any) => {
                  const csTime = customer.thoi_gian_cs_lai;
                  const bhTime = customer.ngay_hen_banhang;
                  const csStatus = csTime ? getScheduleStatus(csTime) : "";
                  const bhStatus = bhTime ? getScheduleStatus(bhTime) : "";
                  const isExpanded = expandedCustomerId === customer.id_kh;

                  return (
                    <Fragment key={customer.id_kh}>
                      <tr className={`clickable-row ${isExpanded ? "selected" : ""}`}>
                        <td>
                          <div className="customer-code">{customer.ma_kh}</div>
                        </td>
                        <td>{customer.ten_khach_hang}</td>
                        <td>{customer.sdt1}</td>
                        {(type === "all" || type === "cham_soc" || type === "chua_cau_hinh" || type === "don_trong_ky") && (
                          <td>
                            {csTime ? (
                              <div className={`schedule-time ${csStatus}`}>
                                <span className="material-symbols-outlined">
                                  {csStatus === "overdue" ? "warning" : csStatus === "today" ? "today" : "schedule"}
                                </span>
                                {formatDateTime(csTime)}
                              </div>
                            ) : (
                              <div style={{ textAlign: "center", color: "#9ca3af" }}>-</div>
                            )}
                          </td>
                        )}
                        {(type === "all" || type === "ban_hang" || type === "chua_cau_hinh" || type === "da_cau_hinh" || type === "don_trong_ky") && (
                          <td>
                            {bhTime ? (
                              <div className={`schedule-time ${bhStatus}`}>
                                <span className="material-symbols-outlined">
                                  {bhStatus === "overdue" ? "warning" : bhStatus === "today" ? "today" : "schedule"}
                                </span>
                                {formatDateTime(bhTime)}
                              </div>
                            ) : (
                              <div style={{ textAlign: "center", color: "#9ca3af" }}>-</div>
                            )}
                          </td>
                        )}
                        <td>
                          <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                            <button
                              onClick={() =>
                                setExpandedCustomerId((prev) =>
                                  prev === customer.id_kh ? null : customer.id_kh
                                )
                              }
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "6px 10px",
                                borderRadius: "6px",
                                border: "1px solid #bfdbfe",
                                background: "#eff6ff",
                                cursor: "pointer",
                                color: "#1d4ed8",
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>
                                {isExpanded ? "visibility_off" : "visibility"}
                              </span>
                              {isExpanded ? "Đóng" : "Chi tiết"}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="detail-row">
                          <td
                            colSpan={(type === "all" || type === "chua_cau_hinh") ? 6 : (type === "da_cau_hinh") ? 5 : 5}
                            style={{ padding: 0 }}
                          >
                            <div
                              style={{
                                padding: "16px",
                                backgroundColor: "#f8fafc",
                                borderBottom: "1px solid #e2e8f0",
                                boxShadow: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
                              }}
                            >
                              <CustomerDetail customer={customer} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            <div className="pagination">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <span className="pagination-info">
                Trang {page} / {data.total_pages || 1}
              </span>
              <button
                onClick={() => setPage(Math.min(data.total_pages || 1, page + 1))}
                disabled={page === data.total_pages}
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component: Danh sách nhân viên ─────────────────────────────────────
export default function InlineDetail({ type, fromDate, toDate, onClose }: Props) {
  const [selectedEmployee, setSelectedEmployee] = useState<{
    emp: EmployeeScheduleStat;
    viewType: ScheduleType;
  } | null>(null);

  const { data, isLoading, error } = useSalesScheduleOverviewEmployeeList(
    type,
    fromDate,
    toDate,
  );

  const typeLabel = TYPE_LABELS[type] || "Chi Tiết";
  const dateLabel =
    fromDate === toDate
      ? `ngày ${fromDate?.split("-").reverse().join("/") ?? ""}`
      : `từ ${fromDate?.split("-").reverse().join("/")} đến ${toDate?.split("-").reverse().join("/")}`;

  return (
    <div className="inline-detail-section">
      <div className="inline-detail-header">
        <div className="inline-detail-title">
          <span className="material-symbols-outlined">calendar_month</span>
          {typeLabel} — {dateLabel}
          {selectedEmployee && (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: "16px", opacity: 0.5, margin: "0 4px" }}>
                chevron_right
              </span>
              <span style={{ color: "#1d4ed8" }}>{selectedEmployee.emp.ten_nhan_vien}</span>
            </>
          )}
        </div>
        <button className="inline-detail-close" onClick={onClose}>
          <span className="material-symbols-outlined">close</span>
          Thu gọn
        </button>
      </div>

      {selectedEmployee ? (
        <EmployeeCustomerPanel
          idAcc={selectedEmployee.emp.id_acc}
          tenNhanVien={selectedEmployee.emp.ten_nhan_vien}
          maNhanVien={selectedEmployee.emp.ma_nhan_vien}
          type={selectedEmployee.viewType}
          fromDate={fromDate}
          toDate={toDate}
          onBack={() => setSelectedEmployee(null)}
        />
      ) : (
        /* ── Tầng 1: Danh sách nhân viên ── */
        <div className="cskh-content">
          {isLoading ? (
            <div className="loading-container">
              <span className="material-symbols-outlined">progress_activity</span>
              <p>Đang tải dữ liệu...</p>
            </div>
          ) : error ? (
            <div className="error-container">
              <span className="material-symbols-outlined">error</span>
              <p>Có lỗi xảy ra khi tải dữ liệu</p>
            </div>
          ) : !data?.data || data.data.length === 0 ? (
            <div className="empty-container">
              <span className="material-symbols-outlined">inbox</span>
              <p>Không có nhân viên nào</p>
            </div>
          ) : (
            <table className="cskh-table">
              <thead>
                <tr>
                  <th style={{ width: "60px" }}>#</th>
                  <th>Mã Nhân Viên</th>
                  <th>Tên Nhân Viên</th>
                  <th style={{ textAlign: "center" }}>
                    {type === "ban_hang" && "Lịch Bán Hàng"}
                    {type === "cham_soc" && "Phản Hồi"}
                    {type === "chua_cau_hinh" && "Chưa Cấu Hình"}
                    {type === "da_cau_hinh" && "Đã Cấu Hình"}
                    {type === "don_trong_ky" && "Số Đơn"}
                    {type === "all" && "Số KH"}
                  </th>
                  <th style={{ textAlign: "center" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((emp, idx) => (
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
                        <span style={{ fontWeight: 500, color: "#111827" }}>
                          {emp.ten_nhan_vien}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 12px",
                          borderRadius: "20px",
                          background: emp.so_khach_hang > 0 ? "#dbeafe" : "#f3f4f6",
                          color: emp.so_khach_hang > 0 ? "#1d4ed8" : "#6b7280",
                          fontWeight: 700,
                          fontSize: "14px",
                          minWidth: "36px",
                        }}
                      >
                        {emp.so_khach_hang}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        onClick={() => setSelectedEmployee({ emp, viewType: type })}
                        disabled={emp.so_khach_hang === 0}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          border: emp.so_khach_hang > 0 ? "1px solid #bfdbfe" : "1px solid #e5e7eb",
                          background: emp.so_khach_hang > 0 ? "#eff6ff" : "#f9fafb",
                          cursor: emp.so_khach_hang > 0 ? "pointer" : "not-allowed",
                          color: emp.so_khach_hang > 0 ? "#1d4ed8" : "#9ca3af",
                          fontSize: "13px",
                          transition: "all 0.15s",
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>
                          visibility
                        </span>
                        Chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
