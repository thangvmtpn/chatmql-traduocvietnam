import { useState } from "react";
import { toast } from "react-toastify";
import DatePicker, { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Customer } from "@/services/dashboardService";
import { CustomerDetail as CustomerDetailType } from "@/types/api";
import {
  useCustomerDetail,
  useCustomerNotes,
  useCreateCustomerNote,
  useUpdateCustomerNextContactTime,
  useUpdateCustomerNextSalesTime,
} from "@/hooks/useDashboard";
import CustomerUpdateModal from "./CustomerUpdateModal";
import InvoiceModal from "../InvoiceModal/InvoiceModal";
import ZNSModal from "../ZNSModal/ZNSModal";
import "./CustomerDetail.css";
import { vi } from "date-fns/locale"; // Import ngôn ngữ tiếng Việt
import { useQueryClient } from "@tanstack/react-query";

// Đăng ký tiếng Việt cho DatePicker (đặt bên ngoài function component)
registerLocale("vi", vi);

import { CombinedVipBadge } from "@/components/CustomerBadges/CustomerBadges";

interface CustomerDetailProps {
  customer: Customer;
  onUpdate?: (updatedCustomer: CustomerDetailType) => void;
}

function CustomerDetail({ customer, onUpdate }: CustomerDetailProps) {
  const queryClient = useQueryClient();

  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showZNSModal, setShowZNSModal] = useState(false);
  const [displayedCustomer, setDisplayedCustomer] =
    useState<CustomerDetailType | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [nextContactTime, setNextContactTime] = useState<Date | null>(null);
  const [nextSalesTime, setNextSalesTime] = useState<Date | null>(null);

  // Set giờ mặc định 09:00 khi người dùng chọn ngày mới
  const withDefaultTime = (date: Date | null): Date | null => {
    if (!date) return null;
    const d = new Date(date);
    if (d.getHours() === 0 && d.getMinutes() === 0) {
      d.setHours(9, 0, 0, 0);
    }
    return d;
  };

  const { data: customerDetail, isLoading } = useCustomerDetail(
    customer.id_kh || 0,
    !!customer.id_kh,
  );

  const { data: notes, isLoading: notesLoading } = useCustomerNotes(
    customer.id_kh || 0,
  );

  const createNoteMutation = useCreateCustomerNote();
  const updateNextContactTimeMutation = useUpdateCustomerNextContactTime();
  const updateNextSalesTimeMutation = useUpdateCustomerNextSalesTime();

  const handleUpdateClick = () => {
    setShowUpdateModal(true);
  };

  const handleCloseModal = () => {
    setShowUpdateModal(false);
  };

  const handleSaveUpdate = (updatedCustomer: CustomerDetailType) => {
    setShowUpdateModal(false);
    // Cập nhật displayed customer để hiển thị thông tin mới
    setDisplayedCustomer(updatedCustomer);
    onUpdate?.(updatedCustomer);
  };

  const handleSubmitNote = async () => {
    if (!noteContent.trim() || !customer.id_kh) return;

    try {
      await createNoteMutation.mutateAsync({
        customerId: customer.id_kh,
        noiDung: noteContent.trim(),
        loaiGhiChu: "ghi_chu",
      });

      // Reset form sau khi submit thành công
      setNoteContent("");
    } catch (error) {
      console.error("Error saving note:", error);
      toast.error("Có lỗi khi lưu ghi chú!", {
        position: "top-right",
        autoClose: 3000,
      });
    }
  };

  const handleUpdateNextContactTime = async () => {
    if (!nextContactTime || !customer.id_kh) return;

    try {
      // Convert Date object thành ISO format
      const isoDateTime = nextContactTime.toISOString();

      await updateNextContactTimeMutation.mutateAsync({
        customerId: customer.id_kh,
        thoiGianCsLai: isoDateTime,
      });

      toast.success("Đã cập nhật thời gian chăm sóc lại!", {
        position: "top-right",
        autoClose: 3000,
      });
      setNextContactTime(null); // Reset input
      queryClient.invalidateQueries({ queryKey: ["cskh-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["cskh-stats"] });
    } catch (error) {
      console.error("Error updating next contact time:", error);
      toast.error("Có lỗi khi cập nhật thời gian!", {
        position: "top-right",
        autoClose: 3000,
      });
    }
  };

  const handleUpdateNextSalesTime = async () => {
    if (!nextSalesTime || !customer.id_kh) return;

    try {
      // Convert Date object thành ISO format
      const isoDateTime = nextSalesTime.toISOString();

      await updateNextSalesTimeMutation.mutateAsync({
        customerId: customer.id_kh,
        ngayHenBanhang: isoDateTime,
      });

      toast.success("Đã cập nhật thời gian bán hàng kế tiếp!", {
        position: "top-right",
        autoClose: 3000,
      });
      setNextSalesTime(null); // Reset input
      queryClient.invalidateQueries({ queryKey: ["cskh-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["cskh-stats"] });
    } catch (error) {
      console.error("Error updating next sales time:", error);
      toast.error("Có lỗi khi cập nhật thời gian!", {
        position: "top-right",
        autoClose: 3000,
      });
    }
  };

  // Hàm tính hạng thành viên từ GMV
  const getMemberTier = (gmv: number = 0) => {
    if (gmv >= 200000000) return "Hạng Kim Cương";
    if (gmv >= 100000000) return "Hạng Bạch Kim";
    if (gmv >= 30000000) return "Hạng Vàng";
    if (gmv >= 5000000) return "Hạng Bạc";
    return "Thành Viên";
  };

  // Hàm format ngày
  const formatDate = (dateString?: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day} - ${month} - ${year}`;
  };

  // Hàm format tiền
  const formatCurrency = (amount: number = 0) => {
    return new Intl.NumberFormat("vi-VN").format(amount);
  };

  // Hàm format thời gian cho notes
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  // Hàm xác định status class dựa trên text
  const getStatusClass = (statusText?: string) => {
    if (!statusText) return "pending";
    const text = statusText.toLowerCase();
    if (text.includes("hoàn thành") || text.includes("completed"))
      return "completed";
    if (text.includes("hủy") || text.includes("cancelled")) return "cancelled";
    return "pending";
  };

  if (isLoading) {
    return (
      <div className="customer-detail">
        <div className="loading-state">
          <span className="material-symbols-outlined spinning">
            progress_activity
          </span>
          <p>Đang tải thông tin chi tiết...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="customer-detail">
        <div className="customer-detail-notice">
          <span className="material-symbols-outlined">info</span>
          THÔNG TIN CHI TIẾT KHÁCH HÀNG - CẬP NHẬT & BỔ SUNG THƯỜNG XUYÊN SẼ LÀ
          TÀI LIỆU QUÝ GIÁ TRONG BÁN HÀNG
        </div>

        <div className="customer-detail-content">
          {/* Cột bên trái */}
          <div className="customer-detail-left">
            {/* Thông tin khách hàng */}
            <div className="detail-section">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <h3 className="section-title" style={{ marginBottom: 0 }}>
                  <span className="material-symbols-outlined">badge</span>
                  Thông tin khách hàng
                </h3>
                <div>
                  {(() => {
                    const gmvValue = customer.gmv !== undefined ? customer.gmv : (displayedCustomer?.gmv || customerDetail?.gmv || 0);
                    const gmvTruocValue = customer.gmv_truoc_2026 !== undefined ? customer.gmv_truoc_2026 : (displayedCustomer?.gmv_truoc_2026 || customerDetail?.gmv_truoc_2026 || 0);
                    const totalGmv = gmvValue + gmvTruocValue;
                    const aov = customer.aov !== undefined ? customer.aov : (displayedCustomer?.aov || customerDetail?.aov || 0);
                    return <CombinedVipBadge gmv={totalGmv} aov={aov} />;
                  })()}
                </div>
              </div>
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Tên khách hàng</label>
                  <div className="detail-value highlight">
                    {displayedCustomer?.ten_khach_hang ||
                      customerDetail?.ten_khach_hang ||
                      customer.ten_khach_hang ||
                      "-"}
                  </div>
                </div>
                <div className="detail-item">
                  <label>Số điện thoại</label>
                  <div className="detail-value">
                    {displayedCustomer?.sdt1 ||
                      customerDetail?.sdt1 ||
                      customer.sdt}
                  </div>
                </div>
                <div className="detail-item">
                  <label>Người phụ trách hiện tại</label>
                  <div className="detail-value highlight">
                    {displayedCustomer?.name_pt ||
                      customerDetail?.name_pt ||
                      "-"}
                  </div>
                </div>
                <div className="detail-item">
                  <label>SDT liên hệ khác</label>
                  <div className="detail-value">
                    {displayedCustomer?.sdt2 || customerDetail?.sdt2 || "-"}
                  </div>
                </div>
                <div className="detail-item full-width">
                  <label>Địa chỉ</label>
                  <div className="detail-value">
                    {displayedCustomer?.dia_chi ||
                      customerDetail?.dia_chi ||
                      customer.dia_chi ||
                      "-"}
                  </div>
                </div>
                <div className="detail-item full-width">
                  <label>Địa chỉ 2</label>
                  <div className="detail-value">
                    {displayedCustomer?.dia_chi2 ||
                      customerDetail?.dia_chi2 ||
                      "-"}
                  </div>
                </div>
                <div className="detail-item full-width">
                  <label>Nghề nghiệp</label>
                  <div className="detail-value">
                    {displayedCustomer?.nghe_nghiep ||
                      customerDetail?.nghe_nghiep ||
                      "-"}
                  </div>
                </div>
              </div>
            </div>

            {/* Đặc thù sản phẩm */}
            <div className="detail-section">
              <h3 className="section-title">
                <span className="material-symbols-outlined">inventory_2</span>
                Đặc thù sản phẩm
              </h3>
              <div className="detail-text">
                {displayedCustomer?.dac_thu_sp ||
                  customerDetail?.dac_thu_sp ||
                  "Chưa có thông tin"}
              </div>
            </div>

            {/* Nhu cầu sử dụng */}
            <div className="detail-section">
              <h3 className="section-title">
                <span className="material-symbols-outlined">psychology</span>
                Nhu cầu sử dụng
              </h3>
              <div className="detail-text">
                {displayedCustomer?.nhu_cau_sd ||
                  customerDetail?.nhu_cau_sd ||
                  "Chưa có thông tin"}
              </div>
            </div>

            {/* Action buttons */}
            <div className="detail-actions">
              <button className="btn-primary" onClick={handleUpdateClick}>
                <span className="material-symbols-outlined">edit</span>
                CẬP NHẬT THÔNG TIN
              </button>
              <button className="btn-secondary">
                <span className="material-symbols-outlined">sms</span>
                GỬI TIN SMS
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowZNSModal(true)}
              >
                <span className="material-symbols-outlined">chat</span>
                GỬI TIN ZNS
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowInvoiceModal(true)}
              >
                <span className="material-symbols-outlined">
                  add_shopping_cart
                </span>
                ĐƠN HÀNG MỚI
              </button>
            </div>
          </div>

          {/* Cột bên phải */}
          <div className="customer-detail-right">
            {/* Nhật ký bán hàng */}
            <div className="detail-section">
              <h3 className="section-title">
                <span className="material-symbols-outlined">list_alt</span>
                Nhật ký bán hàng
              </h3>
              {/* Danh sách nhật ký */}
              <div className="notes-list">
                {notesLoading ? (
                  <div className="loading-state" style={{ padding: "20px" }}>
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "32px" }}
                    >
                      progress_activity
                    </span>
                    <p style={{ fontSize: "12px" }}>Đang tải ghi chú...</p>
                  </div>
                ) : notes && notes.length > 0 ? (
                  notes.map((note) => (
                    <div key={note.id} className="note-item">
                      <div className="note-item-header">
                        <span className="note-item-title">
                          {note.ten_nhan_vien || "Nhân viên"} ngày{" "}
                          {note.thoi_gian
                            ? new Date(note.thoi_gian)
                                .toLocaleString("vi-VN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                })
                                .replace(/\//g, "-")
                                .split(" ")
                                .reverse()
                                .join(" ")
                            : "không xác định"}
                        </span>
                      </div>
                      <div className="note-item-content">{note.noi_dung}</div>
                      {note.loai_ghi_chu && note.loai_ghi_chu !== "ghi_chu" && (
                        <span className="note-item-type">
                          {note.loai_ghi_chu}
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <span className="material-symbols-outlined">inventory</span>
                    <p>Chưa có ghi chú nào. Hãy thêm ghi chú đầu tiên!</p>
                  </div>
                )}
              </div>

              {/* Form thêm ghi chú mới */}
              <div className="note-input-container">
                <textarea
                  id="note-input"
                  name="note-input"
                  className="note-textarea"
                  placeholder="Nhập ghi chú về cuộc gọi, gặp mặt, nhu cầu khách hàng..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  rows={3}
                />
                <button
                  className="btn-submit-note"
                  onClick={handleSubmitNote}
                  disabled={!noteContent.trim() || createNoteMutation.isPending}
                >
                  <span className="material-symbols-outlined">add_circle</span>
                  {createNoteMutation.isPending
                    ? "Đang lưu..."
                    : "Thêm ghi chú"}
                </button>
              </div>
            </div>

            {/* Lịch sử mua hàng */}
            <div className="detail-section">
              <h3 className="section-title">
                <span className="material-symbols-outlined">history</span>
                LỊCH SỬ MUA HÀNG
              </h3>

              {(() => {
                const lichSuMua =
                  displayedCustomer?.lich_su_mua ||
                  customerDetail?.lich_su_mua ||
                  [];
                
                return lichSuMua.length > 0 ? (
                  <div className="purchase-history-scroll">
                    <table className="purchase-history-table">
                      <thead>
                        <tr>
                          <th>Thời gian</th>
                          <th>Mã HĐ</th>
                          <th>Sản phẩm</th>
                          <th>Số tiền</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lichSuMua.map((order, index) => {
                          return (
                            <tr key={order.id_hd || index}>
                              <td className="whitespace-nowrap overflow-hidden text-ellipsis">
                                {formatDate(order.thoi_gian)}
                              </td>
                              <td>{order.ma_hd || "-"}</td>
                              <td>{order.ten_sp || "-"}</td>
                              <td>{formatCurrency(order.so_tien || 0)} ₫</td>
                              <td>
                                <span
                                  className={`status-badge ${getStatusClass(
                                    order.trang_thai,
                                  )}`}
                                >
                                  {order.trang_thai || "Chưa rõ"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    <span className="material-symbols-outlined">
                      shopping_cart
                    </span>
                    <p>Chưa có lịch sử mua hàng</p>
                  </div>
                );
              })()}

              {/* Thời gian tiếp cận kế tiếp */}
              <div className="contact-schedule" style={{ marginTop: "16px" }}>
                <h4>Thời gian tiếp cận bán hàng kế tiếp</h4>
                <div
                  className="schedule-item"
                  style={{
                    flexDirection: "column",
                    gap: "8px",
                    alignItems: "stretch",
                  }}
                >
                  <DatePicker
                    selected={nextSalesTime}
                    onChange={(date: Date | null) => setNextSalesTime(withDefaultTime(date))}
                    showTimeSelect
                    timeFormat="HH:mm"
                    timeIntervals={5}
                    dateFormat="dd/MM/yyyy HH:mm"
                    placeholderText="Chọn ngày và giờ"
                    className="datepicker-input"
                    locale="vi"
                  />
                  <button
                    onClick={handleUpdateNextSalesTime}
                    disabled={
                      !nextSalesTime || updateNextSalesTimeMutation.isPending
                    }
                    className="btn-submit-note"
                    style={{ marginTop: "8px" }}
                  >
                    <span className="material-symbols-outlined">schedule</span>
                    {updateNextSalesTimeMutation.isPending
                      ? "Đang lưu..."
                      : "Cập nhật lịch"}
                  </button>
                  {(displayedCustomer?.ngay_hen_banhang ||
                    customerDetail?.ngay_hen_banhang) && (
                    <div
                      style={{
                        padding: "10px 12px",
                        backgroundColor: "#dbeafe",
                        border: "1px solid #93c5fd",
                        borderRadius: "6px",
                        fontSize: "13px",
                        color: "#1e40af",
                        marginTop: "8px",
                      }}
                    >
                      <strong>✓ Lịch bán hàng kế tiếp:</strong>{" "}
                      {formatDateTime(
                        displayedCustomer?.ngay_hen_banhang ||
                          customerDetail?.ngay_hen_banhang ||
                          "",
                      )}
                    </div>
                  )}
                </div>
                <p className="note">
                  (nhập liệu thời gian hẹn bán hàng lần kế tiếp)
                </p>
              </div>

              {/* Thời gian tiếp cận chăm sóc kế tiếp */}
              <div className="contact-schedule">
                <h4>Thời gian tiếp cận chăm sóc kế tiếp</h4>
                <div
                  className="schedule-item"
                  style={{
                    flexDirection: "column",
                    gap: "8px",
                    alignItems: "stretch",
                  }}
                >
                  <DatePicker
                    selected={nextContactTime}
                    onChange={(date: Date | null) => setNextContactTime(withDefaultTime(date))}
                    showTimeSelect
                    timeFormat="HH:mm"
                    timeIntervals={5}
                    dateFormat="dd/MM/yyyy HH:mm"
                    placeholderText="Chọn ngày và giờ"
                    className="datepicker-input"
                    locale="vi"
                  />
                  <button
                    onClick={handleUpdateNextContactTime}
                    disabled={
                      !nextContactTime ||
                      updateNextContactTimeMutation.isPending
                    }
                    className="btn-submit-note"
                    style={{ marginTop: "8px" }}
                  >
                    <span className="material-symbols-outlined">schedule</span>
                    {updateNextContactTimeMutation.isPending
                      ? "Đang lưu..."
                      : "Cập nhật lịch"}
                  </button>
                  {(displayedCustomer?.thoi_gian_cs_lai ||
                    customerDetail?.thoi_gian_cs_lai) && (
                    <div
                      style={{
                        padding: "10px 12px",
                        backgroundColor: "#d1fae5",
                        border: "1px solid #6ee7b7",
                        borderRadius: "6px",
                        fontSize: "13px",
                        color: "#065f46",
                        marginTop: "8px",
                      }}
                    >
                      <strong>✓ Lịch chăm sóc kế tiếp:</strong>{" "}
                      {formatDateTime(
                        displayedCustomer?.thoi_gian_cs_lai ||
                          customerDetail?.thoi_gian_cs_lai ||
                          "",
                      )}
                    </div>
                  )}
                </div>
                <p className="note">
                  (nhập liệu thông tin hữu ích cho lần chăm sóc lần kế tiếp)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal cập nhật thông tin */}
      {showUpdateModal && (
        <CustomerUpdateModal
          customer={customer}
          customerDetail={displayedCustomer || customerDetail}
          onClose={handleCloseModal}
          onSave={handleSaveUpdate}
        />
      )}

      {/* Modal tạo đơn hàng */}
      {/* {showInvoiceModal && (
        <InvoiceModal
          customer={customer}
          onClose={() => setShowInvoiceModal(false)}
        />
      )} */}
      {/* Modal tạo đơn hàng */}
      {showInvoiceModal &&
        (() => {
          // 1. Tìm số điện thoại từ mọi ngóc ngách có thể có (ưu tiên dữ liệu mới nhất)
          const normalizedPhone =
            displayedCustomer?.sdt ||
            (displayedCustomer as any)?.sdt1 ||
            customerDetail?.sdt ||
            (customerDetail as any)?.sdt1 ||
            customer.sdt ||
            (customer as any).sdt1 ||
            "";

          // 2. Gộp data và ép dính key 'sdt' vào
          const invoiceCustomerData = {
            ...customer,
            ...customerDetail,
            ...displayedCustomer,
            sdt: normalizedPhone, // Gắn cứng key sdt để InvoiceModal luôn đọc được
          } as Customer;

          return (
            <InvoiceModal
              customer={invoiceCustomerData}
              onClose={() => setShowInvoiceModal(false)}
            />
          );
        })()}
      {/* Modal gửi tin ZNS */}
      {showZNSModal && (
        <ZNSModal
          customer={
            {
              ...customer,
              ...customerDetail,
              ...displayedCustomer,
              sdt:
                displayedCustomer?.sdt ||
                (displayedCustomer as any)?.sdt1 ||
                customerDetail?.sdt ||
                (customerDetail as any)?.sdt1 ||
                customer.sdt ||
                "",
            } as typeof customer
          }
          onClose={() => setShowZNSModal(false)}
        />
      )}
    </>
  );
}

export default CustomerDetail;
