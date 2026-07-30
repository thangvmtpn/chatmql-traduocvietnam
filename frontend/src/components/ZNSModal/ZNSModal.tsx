import { useState } from "react";
import { toast } from "react-toastify";
import { Customer } from "@/services/dashboardService";
import { sendZNS } from "@/services/znsService";
import "./ZNSModal.css";

interface ZNSModalProps {
  customer: Customer;
  onClose: () => void;
}

const ZNS_TEMPLATES = [
  { id: 500248, label: "Loại tin 1 - Thông báo yêu cầu đặt hàng" },
];

type SendMode = "immediate" | "scheduled";

function ZNSModal({ customer, onClose }: ZNSModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState(
    ZNS_TEMPLATES[0]?.id ?? 500248,
  );
  const [sendMode, setSendMode] = useState<SendMode>("immediate");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [isSending, setIsSending] = useState(false);

  const recipientName = customer.ten_khach_hang || customer.sdt || "Khách hàng";
  const recipientPhone = customer.sdt || "";

  const handleSubmit = async () => {
    if (!recipientPhone) {
      toast.error("Khách hàng không có số điện thoại!", {
        position: "top-right",
        autoClose: 3000,
      });
      return;
    }

    setIsSending(true);
    try {
      // Chuẩn hoá số điện thoại: bỏ số 0 đầu, thêm 84
      const normalizedPhone = recipientPhone.startsWith("0")
        ? "84" + recipientPhone.slice(1)
        : recipientPhone.startsWith("84")
          ? recipientPhone
          : "84" + recipientPhone;

      const result = await sendZNS({
        phone: normalizedPhone,
        ten_kh: recipientName,
        ma_don_hang: "test đơn",
        template_id: selectedTemplate,
      });

      if (result.error) {
        throw new Error(result.error as string);
      }

      toast.success("Đã gửi tin ZNS thành công!", {
        position: "top-right",
        autoClose: 3000,
      });
      onClose();
    } catch (error) {
      console.error("Error sending ZNS:", error);
      toast.error("Có lỗi khi gửi tin ZNS!", {
        position: "top-right",
        autoClose: 3000,
      });
    } finally {
      setIsSending(false);
    }
  };

  const today = new Date();
  const defaultDate = `${String(today.getMonth() + 1).padStart(2, "0")}/${String(today.getDate()).padStart(2, "0")}/${today.getFullYear()}`;

  return (
    <div className="zns-modal-overlay" onClick={onClose}>
      <div className="zns-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="zns-modal-header">
          <div className="mx-auto text-center">
            <h2>GỬI TIN ZNS</h2>
            <p>Gửi tin nhắn ZNS tới khách hàng của bạn</p>
          </div>
          <button className="zns-close-btn" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="zns-modal-body">
          {/* Left - Form */}
          <div className="zns-form-panel">
            {/* Người nhận */}
            <div className="zns-field">
              <label className="zns-label">NGƯỜI NHẬN</label>
              <div className="zns-select-display">
                <span className="material-symbols-outlined">person_search</span>
                <span className="zns-recipient-name">
                  {recipientName}
                  {recipientPhone && (
                    <span className="zns-recipient-phone">
                      {" "}
                      — {recipientPhone}
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Loại tin */}
            <div className="zns-field">
              <label className="zns-label">LOẠI TIN</label>
              <div className="zns-select-wrapper">
                <select
                  className="zns-select"
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(Number(e.target.value))}
                >
                  {ZNS_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined zns-select-icon">
                  expand_more
                </span>
              </div>
            </div>

            {/* Hình thức gửi */}
            <div className="zns-field">
              <label className="zns-label">CHỌN HÌNH THỨC GỬI</label>

              <label
                className={`zns-send-option ${sendMode === "immediate" ? "active" : ""}`}
                onClick={() => setSendMode("immediate")}
              >
                <div className="zns-radio-circle">
                  {sendMode === "immediate" && (
                    <div className="zns-radio-dot" />
                  )}
                </div>
                <span>Gửi ngay</span>
                <span className="material-symbols-outlined zns-option-icon">
                  bolt
                </span>
              </label>

              <label
                className={`zns-send-option ${sendMode === "scheduled" ? "active" : ""}`}
                onClick={() => setSendMode("scheduled")}
              >
                <div className="zns-radio-circle">
                  {sendMode === "scheduled" && (
                    <div className="zns-radio-dot" />
                  )}
                </div>
                <span>Chọn thời gian gửi</span>
                <span className="material-symbols-outlined zns-option-icon">
                  calendar_month
                </span>
              </label>

              {/* Datetime chỉ hiện khi chọn scheduled */}
              {sendMode === "scheduled" && (
                <div className="zns-schedule-row">
                  <div className="zns-schedule-input">
                    <span className="material-symbols-outlined">
                      calendar_today
                    </span>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="zns-date-input"
                    />
                  </div>
                  <div className="zns-schedule-input">
                    <span className="material-symbols-outlined">schedule</span>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="zns-date-input"
                    />
                  </div>
                </div>
              )}

              {sendMode === "immediate" && (
                <div className="zns-schedule-row">
                  <div className="zns-schedule-input disabled">
                    <span className="material-symbols-outlined">
                      calendar_today
                    </span>
                    <span>{defaultDate}</span>
                  </div>
                  <div className="zns-schedule-input disabled">
                    <span className="material-symbols-outlined">schedule</span>
                    <span>
                      {String(today.getHours()).padStart(2, "0")}:
                      {String(today.getMinutes()).padStart(2, "0")}
                      {today.getHours() < 12 ? " AM" : " PM"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right - Preview */}
          <div className="zns-preview-panel">
            <div className="zns-preview-card">
              <div className="zns-preview-brand">
                <span className="zns-brand-dot green" />
                <span className="zns-brand-dot yellow" />
                <span className="zns-brand-name">TRÀ DƯỢC VIỆT NAM</span>
              </div>
              <div className="zns-preview-banner">
                <span className="material-symbols-outlined zns-preview-icon">
                  shopping_basket
                </span>
                <div className="zns-preview-banner-text">
                  <span className="zns-banner-title">THÔNG BÁO</span>
                  <span className="zns-banner-subtitle">YÊU CẦU ĐẶT HÀNG</span>
                  <span className="zns-banner-subtitle2">CỦA QUÝ KHÁCH</span>
                </div>
              </div>
              <div className="zns-preview-content">
                <p className="zns-preview-heading">
                  THÔNG BÁO YÊU CẦU ĐẶT HÀNG
                </p>
                <p>
                  Cảm ơn quý khách đã gửi yêu cầu đặt hàng cho thương hiệu Trà
                  dược Việt Nam
                </p>
                <p>
                  Tư vấn viên sẽ liên hệ quý khách trong thời gian sớm nhất.
                </p>
                <p className="zns-preview-section">Thông tin tư vấn viên</p>
                <p>
                  Tên: <strong>{recipientName}</strong>
                </p>
                <p>Số điện thoại:</p>
                <p>
                  Tổng đài: <strong>1900 0093</strong>
                </p>
                <p>
                  Hotline đặt hàng nhanh: <strong>0345 68 68 62</strong>
                </p>
                <p className="zns-preview-footer">
                  Trà Dược Việt Nam - Hàng chính hãng
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="zns-modal-footer">
          <button
            className="zns-btn-cancel"
            onClick={onClose}
            disabled={isSending}
          >
            Hủy bỏ
          </button>
          <button
            className="zns-btn-submit"
            onClick={handleSubmit}
            disabled={isSending}
          >
            {isSending ? "Đang gửi..." : "Đồng ý gửi"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ZNSModal;
