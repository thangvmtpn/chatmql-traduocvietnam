import { useState } from "react";
import useAuthStore from "@/stores/useAuthStore";
import Sidebar from "@/components/Sidebar/Sidebar";
import Header from "@/components/Header/Header";
import { useManagerActivities } from "@/hooks/useActivities";
import { useManagerStaffList } from "@/hooks/useDashboard";
import "@/layouts/ManagerLayout/ManagerLayout.css";
import "./ManagerActivities.css";

export default function ManagerActivities() {
  const user = useAuthStore((s) => s.user);

  // Filters state
  const today = new Date().toISOString().split("T")[0];
  const [logType, setLogType] = useState<"sales_diary" | "system_log">("sales_diary");
  const [staffId, setStaffId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data: staffList } = useManagerStaffList(true);
  const { data: activitiesData, isLoading, isError } = useManagerActivities(
    logType,
    page,
    limit,
    staffId,
    fromDate,
    toDate
  );

  if (!user || (user.role_id !== 1 && user.role_id !== 2)) {
    return (
      <div className="manager-layout">
        <Header title="Lỗi truy cập" userName={user?.name || "User"} />
        <div className="manager-container">
          <Sidebar user={user!} />
          <main className="main-content">
            <div className="forbidden-content">
              <span className="material-symbols-outlined">lock</span>
              <h2>Không có quyền truy cập trang này</h2>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDateChange = (type: "from" | "to", value: string) => {
    if (type === "from") setFromDate(value);
    if (type === "to") setToDate(value);
    setPage(1);
  };

  const handleStaffChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setStaffId(val === "all" ? null : Number(val));
    setPage(1);
  };

  return (
    <div className="manager-layout">
      <Header title="Nhật ký hoạt động" userName={user?.name || "User"} />
      <div className="manager-container">
        <Sidebar user={user} />
        <main className="main-content">

        <div className="activities-page">
          <div className="activities-header">
            <div>
              <h1 className="activities-title">
                <span className="material-symbols-outlined">history</span>
                Nhật ký hoạt động
              </h1>
              <p className="activities-subtitle">Theo dõi lịch sử cskh và thao tác của nhân sự</p>
            </div>
          </div>

          <div className="activities-card">
            {/* Filter Bar */}
            <div className="activities-filter-bar">
              <div className="filter-group">
                <button
                  className={`tab-btn ${logType === "sales_diary" ? "active" : ""}`}
                  onClick={() => { setLogType("sales_diary"); setPage(1); }}
                >
                  <span className="material-symbols-outlined">assignment</span>
                  Nhật ký CSKH
                </button>
                <button
                  className={`tab-btn ${logType === "system_log" ? "active" : ""}`}
                  onClick={() => { setLogType("system_log"); setPage(1); }}
                >
                  <span className="material-symbols-outlined">memory</span>
                  Lịch sử hệ thống
                </button>
              </div>

              <div className="filter-controls">
                <select className="filter-select" onChange={handleStaffChange} value={staffId || "all"}>
                  <option value="all">-- Tất cả nhân sự --</option>
                  {staffList?.map((staff) => (
                    staff.id_acc ? <option key={staff.id_acc} value={staff.id_acc}>{staff.name}</option> : null
                  ))}
                </select>

                <div className="date-inputs">
                  <input
                    type="date"
                    className="filter-date"
                    value={fromDate}
                    onChange={(e) => handleDateChange("from", e.target.value)}
                  />
                  <span>-</span>
                  <input
                    type="date"
                    className="filter-date"
                    value={toDate}
                    onChange={(e) => handleDateChange("to", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="activities-table-wrapper">
              {isLoading ? (
                <div className="activities-loading">Đang tải dữ liệu...</div>
              ) : isError ? (
                <div className="activities-error">Đã có lỗi xảy ra khi tải dữ liệu</div>
              ) : !activitiesData?.data || activitiesData.data.length === 0 ? (
                <div className="activities-empty">
                  <span className="material-symbols-outlined">inbox</span>
                  <p>Không có dữ liệu trong thời gian này.</p>
                </div>
              ) : (
                <>
                  <table className="activities-table">
                    <thead>
                      <tr>
                        <th style={{ width: "160px" }}>Thời gian</th>
                        <th style={{ width: "150px" }}>Nhân sự</th>
                        {logType === "sales_diary" && (
                          <>
                            <th style={{ width: "150px" }}>Khách hàng</th>
                            <th style={{ width: "120px" }}>Số điện thoại</th>
                          </>
                        )}
                        <th style={{ width: "140px" }}>Loại hành động</th>
                        <th>Nội dung</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activitiesData.data.map((item) => (
                        <tr key={item.id}>
                          <td className="time-cell">
                            {new Date(item.created_at).toLocaleString("vi-VN", {
                              hour: "2-digit", minute: "2-digit", second: "2-digit",
                              day: "2-digit", month: "2-digit", year: "numeric"
                            })}
                          </td>
                          <td className="staff-cell">{item.staff_name || "N/A"}</td>
                          {logType === "sales_diary" && (
                            <>
                              <td className="customer-cell">
                                {item.customer_name ? (
                                  <div>
                                    <div className="customer-name">{item.customer_name}</div>
                                    <div className="customer-code">{item.customer_code}</div>
                                  </div>
                                ) : (
                                  item.customer_code || "N/A"
                                )}
                              </td>
                              <td className="phone-cell">
                                {item.customer_phone || "-"}
                              </td>
                            </>
                          )}
                          <td>
                            <span className="action-badge">
                              {item.action_type || "Ghi chú"}
                            </span>
                          </td>
                          <td className="content-cell">
                            {logType === "system_log" && item.content?.startsWith("{") ? (
                              <pre className="json-content">{JSON.stringify(JSON.parse(item.content), null, 2)}</pre>
                            ) : (
                              item.content || "-"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination */}
                  {activitiesData.total > limit && (
                    <div className="pagination">
                      <button
                        onClick={() => handlePageChange(page - 1)}
                        disabled={page === 1}
                        className="page-btn"
                      >
                        <span className="material-symbols-outlined">chevron_left</span>
                      </button>
                      <span>Trang {page} / {Math.ceil(activitiesData.total / limit)}</span>
                      <button
                        onClick={() => handlePageChange(page + 1)}
                        disabled={page * limit >= activitiesData.total}
                        className="page-btn"
                      >
                        <span className="material-symbols-outlined">chevron_right</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        </main>
      </div>
    </div>
  );
}
