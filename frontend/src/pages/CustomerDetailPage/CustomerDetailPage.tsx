import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCustomerDetail } from "@/hooks/useDashboard";
import useAuthStore from "@/stores/useAuthStore";
import BaseLayout from "@/layouts/BaseLayout/BaseLayout";
import CustomerUpdateModal from "@/components/CustomerDetail/CustomerUpdateModal";
import { CustomerDetail } from "@/types/api";
import "./CustomerDetailPage.css";
import "material-symbols";

function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [updatedCustomer, setUpdatedCustomer] = useState<CustomerDetail | null>(
    null,
  );

  const id = customerId ? parseInt(customerId) : 0;
  const { data: customerDetail, isLoading, error } = useCustomerDetail(id);

  if (!user) return null;

  const displayCustomer = updatedCustomer || customerDetail;

  const formatCurrency = (amount?: number) => {
    if (!amount) return "0 đ";
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount);
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

  return (
    <BaseLayout user={user} title="Chi Tiết Khách Hàng">
      <div className="customer-detail-page">
        {isLoading ? (
          <div className="loading-container">
            <span className="material-symbols-outlined">progress_activity</span>
            <p>Đang tải dữ liệu...</p>
          </div>
        ) : error ? (
          <div className="error-container">
            <span className="material-symbols-outlined">error</span>
            <p>Có lỗi xảy ra khi tải dữ liệu khách hàng</p>
            <button
              className="btn-back"
              onClick={() => navigate("/cskh-schedule")}
            >
              Quay lại
            </button>
          </div>
        ) : displayCustomer ? (
          <>
            <div className="detail-header">
              <button
                className="btn-back"
                onClick={() => navigate("/cskh-schedule")}
              >
                <span className="material-symbols-outlined">arrow_back</span>
                Quay lại
              </button>
              <div className="header-title">
                <h1>
                  <span className="material-symbols-outlined">person</span>
                  Chi Tiết Khách Hàng
                </h1>
              </div>
              <button
                className="btn-edit"
                onClick={() => setIsEditModalOpen(true)}
              >
                <span className="material-symbols-outlined">edit</span>
                Chỉnh sửa
              </button>
            </div>

            <div className="detail-content">
              {/* Thông tin cơ bản */}
              <div className="detail-section">
                <h3 className="section-title">
                  <span className="material-symbols-outlined">badge</span>
                  Thông tin cơ bản
                </h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Mã khách hàng</label>
                    <p>{displayCustomer.ma_kh}</p>
                  </div>
                  <div className="detail-item">
                    <label>Tên khách hàng</label>
                    <p>{displayCustomer.ten_khach_hang}</p>
                  </div>
                  <div className="detail-item">
                    <label>Nhóm khách hàng</label>
                    <p>{displayCustomer.nhom_kh}</p>
                  </div>
                  <div className="detail-item">
                    <label>Giới tính</label>
                    <p>{displayCustomer.gioi_tinh || "-"}</p>
                  </div>
                  <div className="detail-item">
                    <label>Ngày sinh</label>
                    <p>{displayCustomer.ngay_sinh || "-"}</p>
                  </div>
                  <div className="detail-item">
                    <label>Nghề nghiệp</label>
                    <p>{displayCustomer.nghe_nghiep || "-"}</p>
                  </div>
                </div>
              </div>

              {/* Thông tin liên hệ */}
              <div className="detail-section">
                <h3 className="section-title">
                  <span className="material-symbols-outlined">
                    contact_phone
                  </span>
                  Thông tin liên hệ
                </h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Điện thoại 1</label>
                    <p>{displayCustomer.sdt1}</p>
                  </div>
                  <div className="detail-item">
                    <label>Điện thoại 2</label>
                    <p>{displayCustomer.sdt2 || "-"}</p>
                  </div>
                  <div className="detail-item full-width">
                    <label>Địa chỉ</label>
                    <p>{displayCustomer.dia_chi || "-"}</p>
                  </div>
                </div>
              </div>

              {/* Đặc thù & nhu cầu */}
              <div className="detail-section">
                <h3 className="section-title">
                  <span className="material-symbols-outlined">category</span>
                  Đặc thù & nhu cầu
                </h3>
                <div className="detail-grid">
                  <div className="detail-item full-width">
                    <label>Đặc thù sản phẩm</label>
                    <p>{displayCustomer.dac_thu_sp || "-"}</p>
                  </div>
                  <div className="detail-item full-width">
                    <label>Nhu cầu sử dụng</label>
                    <p>{displayCustomer.nhu_cau_sd || "-"}</p>
                  </div>
                </div>
              </div>

              {/* Lịch chăm sóc */}
              <div className="detail-section">
                <h3 className="section-title">
                  <span className="material-symbols-outlined">schedule</span>
                  Lịch chăm sóc
                </h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Thời gian chăm sóc lại</label>
                    <p>{formatDateTime(displayCustomer.thoi_gian_cs_lai)}</p>
                  </div>
                </div>
              </div>

              {/* Thống kê kinh doanh */}
              <div className="detail-section">
                <h3 className="section-title">
                  <span className="material-symbols-outlined">trending_up</span>
                  Thống kê kinh doanh
                </h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Tổng GMV</label>
                    <p className="value-highlight">
                      {formatCurrency(displayCustomer.gmv)}
                    </p>
                  </div>
                  <div className="detail-item">
                    <label>Số lần mua</label>
                    <p>{displayCustomer.so_lan_mua || 0}</p>
                  </div>
                  <div className="detail-item">
                    <label>AOV</label>
                    <p>{formatCurrency(displayCustomer.aov)}</p>
                  </div>
                  <div className="detail-item">
                    <label>Tần suất mua (PF)</label>
                    <p>{displayCustomer.tan_suat_mua || "-"}</p>
                  </div>
                </div>
              </div>

              {/* Thông tin quản lý */}
              <div className="detail-section">
                <h3 className="section-title">
                  <span className="material-symbols-outlined">
                    manage_accounts
                  </span>
                  Thông tin quản lý
                </h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Nhân viên phụ trách</label>
                    <p>{displayCustomer.nhan_vien_pt || "-"}</p>
                  </div>
                  <div className="detail-item">
                    <label>Tên nhân viên</label>
                    <p>{displayCustomer.name_pt || "-"}</p>
                  </div>
                  <div className="detail-item">
                    <label>Nguồn dữ liệu</label>
                    <p>{displayCustomer.nguon_data || "-"}</p>
                  </div>
                  <div className="detail-item">
                    <label>Thời gian tạo</label>
                    <p>{formatDateTime(displayCustomer.thoi_gian_tao)}</p>
                  </div>
                </div>
              </div>
            </div>

            {isEditModalOpen && (
              <CustomerUpdateModal
                customer={displayCustomer as any}
                customerDetail={displayCustomer}
                onClose={() => setIsEditModalOpen(false)}
                onSave={(updatedData) => {
                  setUpdatedCustomer(updatedData);
                  setIsEditModalOpen(false);
                }}
              />
            )}
          </>
        ) : (
          <div className="error-container">
            <span className="material-symbols-outlined">inbox</span>
            <p>Không tìm thấy khách hàng</p>
            <button
              className="btn-back"
              onClick={() => navigate("/cskh-schedule")}
            >
              Quay lại
            </button>
          </div>
        )}
      </div>
    </BaseLayout>
  );
}

export default CustomerDetailPage;
