import { Fragment, useState } from "react";
import { formatDateTime, getScheduleStatus } from "../utils";
import { useUpdateCustomerDaGoi } from "@/hooks/useDashboard";
import CustomerDetail from "@/components/CustomerDetail/CustomerDetail";
import { ScheduleType } from "@/services/cskhScheduleService";

type Props = {
  data: any;
  isLoading: boolean;
  error: any;
  page: number;
  onPageChange: (newPage: number) => void;
  onUpdateClick: (customer: any) => void;
  scheduleType?: ScheduleType;
};

export default function CustomerTable({
  data,
  isLoading,
  error,
  page,
  onPageChange,
  onUpdateClick,
  scheduleType = "all",
}: Props) {
  const [expandedCustomerId, setExpandedCustomerId] = useState<number | null>(
    null,
  );
  const { mutate: updateDaGoi } = useUpdateCustomerDaGoi();

  const handleToggleCalled = (customer: any) => {
    updateDaGoi({
      customerId: customer.id_kh,
      daGoi: !customer.da_goi,
    });
  };

  const handleToggleDetail = (customerId: number) => {
    // Nếu click lại vào chính nó thì đóng, click dòng khác thì mở dòng đó
    setExpandedCustomerId((prev) => (prev === customerId ? null : customerId));
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <span className="material-symbols-outlined">progress_activity</span>
        <p>Đang tải dữ liệu...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <span className="material-symbols-outlined">error</span>
        <p>Có lỗi xảy ra khi tải dữ liệu</p>
      </div>
    );
  }

  if (!data?.data || data.data.length === 0) {
    return (
      <div className="empty-container">
        <span className="material-symbols-outlined">inbox</span>
        <p>Không có khách hàng nào</p>
      </div>
    );
  }

  return (
    <>
      <table className="cskh-table">
        <thead>
          <tr>
            <th>Mã KH</th>
            <th>Tên Khách Hàng</th>
            <th>Số Điện Thoại</th>
            {(scheduleType === "all" ||
              scheduleType === "cham_soc" ||
              scheduleType === "chua_cau_hinh") && <th>Lịch Phản Hồi</th>}
            {(scheduleType === "all" ||
              scheduleType === "ban_hang" ||
              scheduleType === "chua_cau_hinh") && <th>Lịch Bán Hàng</th>}
            <th style={{ textAlign: "center" }}>Thao tác</th>
            <th style={{ textAlign: "center" }}>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((customer: any) => {
            const csTime = customer.thoi_gian_cs_lai;
            const bhTime = customer.ngay_hen_banhang;

            // Lấy status cho từng cái (nếu cần đổi màu icon)
            const csStatus = csTime ? getScheduleStatus(csTime) : "";
            const bhStatus = bhTime ? getScheduleStatus(bhTime) : "";

            // Kiểm tra xem dòng này có đang được mở không
            const isExpanded = expandedCustomerId === customer.id_kh;

            return (
              // Bọc 2 thẻ <tr> bằng Fragment và chuyển key lên đây
              <Fragment key={customer.id_kh}>
                <tr className={`clickable-row ${isExpanded ? "selected" : ""}`}>
                  <td>
                    <div className="customer-code">{customer.ma_kh}</div>
                  </td>
                  <td>{customer.ten_khach_hang}</td>
                  <td>{customer.sdt1}</td>
                  {(scheduleType === "all" ||
                    scheduleType === "cham_soc" ||
                    scheduleType === "chua_cau_hinh") && (
                    <td>
                      {csTime ? (
                        <div className={`schedule-time ${csStatus}`}>
                          <span className="material-symbols-outlined">
                            {csStatus === "overdue"
                              ? "warning"
                              : csStatus === "today"
                                ? "today"
                                : "schedule"}
                          </span>
                          {formatDateTime(csTime)}
                        </div>
                      ) : (
                        <div style={{ textAlign: "center", color: "#9ca3af" }}>
                          -
                        </div>
                      )}
                    </td>
                  )}
                  {(scheduleType === "all" ||
                    scheduleType === "ban_hang" ||
                    scheduleType === "chua_cau_hinh") && (
                    <td>
                      {bhTime ? (
                        <div className={`schedule-time ${bhStatus}`}>
                          <span className="material-symbols-outlined">
                            {bhStatus === "overdue"
                              ? "warning"
                              : bhStatus === "today"
                                ? "today"
                                : "schedule"}
                          </span>
                          {formatDateTime(bhTime)}
                        </div>
                      ) : (
                        <div style={{ textAlign: "center", color: "#9ca3af" }}>
                          -
                        </div>
                      )}
                    </td>
                  )}
                  <td>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        justifyContent: "center",
                      }}
                    >
                      <button
                        onClick={() => onUpdateClick(customer)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          border: "1px solid #d1d5db",
                          background: "#ffffff",
                          cursor: "pointer",
                          color: "#374151",
                        }}
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: "16px" }}
                        >
                          edit_calendar
                        </span>
                        Cập nhật
                      </button>
                      <button
                        onClick={() => handleToggleDetail(customer.id_kh)}
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
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: "16px" }}
                        >
                          {isExpanded ? "visibility_off" : "visibility"}
                        </span>
                        {isExpanded ? "Đóng" : "Chi tiết"}
                      </button>
                    </div>
                  </td>
                  <td style={{ textAlign: "center", verticalAlign: "middle" }}>
                    <input
                      type="checkbox"
                      checked={!!customer.da_goi}
                      onChange={() => handleToggleCalled(customer)}
                      style={{
                        width: "18px",
                        height: "18px",
                        cursor: "pointer",
                      }}
                      title="Đã gọi"
                    />
                  </td>
                </tr>

                {/* Nếu isExpanded = true, render thêm 1 dòng <tr> nằm ngay bên dưới */}
                {isExpanded && (
                  <tr className="detail-row">
                    {/* Dynamic colSpan dựa trên loại lịch được hiện */}
                    <td
                      colSpan={
                        scheduleType === "all" ||
                        scheduleType === "chua_cau_hinh"
                          ? 7
                          : 6
                      }
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
                        {/* Gọi Component CustomerDetail tại đây */}
                        <CustomerDetail
                          customer={customer}
                          // Nếu CustomerDetail có nhận onUpdate để cập nhật lại state bảng thì bạn truyền vào, không thì xóa dòng dưới đi
                          // onUpdate={...}
                        />
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
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
        <span className="pagination-info">
          Trang {page} / {data.total_pages || 1}
        </span>
        <button
          onClick={() =>
            onPageChange(Math.min(data.total_pages || 1, page + 1))
          }
          disabled={page === data.total_pages}
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>
    </>
  );
}
