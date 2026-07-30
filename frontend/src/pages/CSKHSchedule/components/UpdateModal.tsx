import { useState, useEffect } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
// Import ngôn ngữ tiếng Việt từ date-fns
import { vi } from "date-fns/locale";
import { formatDateTime } from "../utils";

// Đăng ký ngôn ngữ tiếng Việt cho DatePicker
registerLocale("vi", vi);

type Props = {
  customer: any;
  onClose: () => void;
  onSubmit: (date: Date, type: "cham_soc" | "ban_hang") => void;
  isPending: boolean;
  scheduleType?: "ban_hang" | "cham_soc" | "all";
};

export default function UpdateModal({
  customer,
  onClose,
  onSubmit,
  isPending,
  scheduleType = "all",
}: Props) {
  const [csDate, setCsDate] = useState<Date | null>(null);
  const [bhDate, setBhDate] = useState<Date | null>(null);

  // Set giờ mặc định 09:00 khi người dùng chọn ngày mới
  const withDefaultTime = (date: Date | null): Date | null => {
    if (!date) return null;
    const d = new Date(date);
    // Nếu giờ = 0 (midnight - tức là mới chọn ngày), set 09:00
    if (d.getHours() === 0 && d.getMinutes() === 0) {
      d.setHours(9, 0, 0, 0);
    }
    return d;
  };

  // Khởi tạo dữ liệu khi mở Modal — áp dụng giờ mặc định 09:00
  useEffect(() => {
    setCsDate(
      withDefaultTime(customer.thoi_gian_cs_lai ? new Date(customer.thoi_gian_cs_lai) : null)
    );
    setBhDate(
      withDefaultTime(customer.ngay_hen_banhang ? new Date(customer.ngay_hen_banhang) : null)
    );
  }, [customer]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Cập nhật lịch - {customer.ten_khach_hang}</h3>
          <button className="modal-close" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div
          className="modal-body"
          style={{ display: "flex", flexDirection: "column", gap: "20px" }}
        >
          {/* KHỐI 1: LỊCH CHĂM SÓC */}
          {(scheduleType === "all" || scheduleType === "cham_soc") && (
            <div className="contact-schedule">
              <h4
                style={{
                  color: "#065f46",
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "20px" }}
                >
                  support_agent
                </span>
                Thời gian chăm sóc lại
              </h4>
              <div
                className="schedule-item"
                style={{
                  flexDirection: "column",
                  gap: "8px",
                  alignItems: "stretch",
                  padding: "12px",
                  border: "1px solid #a7f3d0",
                  borderRadius: "8px",
                  backgroundColor: "#ecfdf5",
                }}
              >
                <DatePicker
                  selected={csDate}
                  onChange={(date: Date | null) => setCsDate(withDefaultTime(date))}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={5}
                  dateFormat="dd/MM/yyyy HH:mm"
                  placeholderText="Chọn ngày giờ chăm sóc..."
                  className="datepicker-input"
                  locale="vi"
                />
                <button
                  onClick={() => csDate && onSubmit(csDate, "cham_soc")}
                  disabled={!csDate || isPending}
                  className="btn-submit-note"
                  style={{
                    backgroundColor: "#10b981",
                    color: "white",
                    border: "none",
                  }}
                >
                  <span className="material-symbols-outlined">save</span>
                  {isPending ? "Đang lưu..." : "Cập nhật"}
                </button>
                {customer.thoi_gian_cs_lai && (
                  <div
                    style={{
                      padding: "8px",
                      backgroundColor: "#fff",
                      border: "1px solid #6ee7b7",
                      borderRadius: "4px",
                      fontSize: "13px",
                      color: "#065f46",
                    }}
                  >
                    <strong>✓ Lịch hiện tại:</strong>{" "}
                    {formatDateTime(customer.thoi_gian_cs_lai)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Đường kẻ ngang phân cách */}
          {scheduleType === "all" && (
            <hr
              style={{
                border: "none",
                borderTop: "1px dashed #cbd5e1",
                margin: 0,
              }}
            />
          )}

          {/* KHỐI 2: LỊCH BÁN HÀNG */}
          {(scheduleType === "all" || scheduleType === "ban_hang") && (
            <div className="contact-schedule">
              <h4
                style={{
                  color: "#1e40af",
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "20px" }}
                >
                  point_of_sale
                </span>
                Thời gian bán hàng lại
              </h4>
              <div
                className="schedule-item"
                style={{
                  flexDirection: "column",
                  gap: "8px",
                  alignItems: "stretch",
                  padding: "12px",
                  border: "1px solid #bfdbfe",
                  borderRadius: "8px",
                  backgroundColor: "#eff6ff",
                }}
              >
                <DatePicker
                  selected={bhDate}
                  onChange={(date: Date | null) => setBhDate(withDefaultTime(date))}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={5}
                  dateFormat="dd/MM/yyyy HH:mm"
                  placeholderText="Chọn ngày giờ bán hàng..."
                  className="datepicker-input"
                  locale="vi"
                />
                <button
                  onClick={() => bhDate && onSubmit(bhDate, "ban_hang")}
                  disabled={!bhDate || isPending}
                  className="btn-submit-note"
                  style={{
                    backgroundColor: "#3b82f6",
                    color: "white",
                    border: "none",
                  }}
                >
                  <span className="material-symbols-outlined">save</span>
                  {isPending ? "Đang lưu..." : "Cập nhật"}
                </button>
                {customer.ngay_hen_banhang && (
                  <div
                    style={{
                      padding: "8px",
                      backgroundColor: "#fff",
                      border: "1px solid #93c5fd",
                      borderRadius: "4px",
                      fontSize: "13px",
                      color: "#1e40af",
                    }}
                  >
                    <strong>✓ Lịch hiện tại:</strong>{" "}
                    {formatDateTime(customer.ngay_hen_banhang)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
