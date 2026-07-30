import { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toast } from "react-toastify";
import {
  Customer,
  updateCustomer,
  UpdateCustomerData,
  getAccounts,
  Account,
} from "@/services/dashboardService";
import { CustomerDetail } from "@/types/api";
import { useCustomerGroups } from "@/hooks/useCustomerGroups";
import useAuthStore from "@/stores/useAuthStore";
import "./CustomerUpdateModal.css";

// Helper function to safely parse dates
const parseDate = (dateString?: string): Date | null => {
  if (!dateString || typeof dateString !== "string") return null;
  const trimmed = dateString.trim();
  if (!trimmed) return null;

  const date = new Date(trimmed);
  // Check if the date is valid
  if (isNaN(date.getTime())) return null;

  return date;
};

interface CustomerUpdateModalProps {
  customer: Customer;
  customerDetail?: CustomerDetail;
  onClose: () => void;
  onSave: (updatedCustomer: CustomerDetail) => void;
}

function CustomerUpdateModal({
  customer,
  customerDetail,
  onClose,
  onSave,
}: CustomerUpdateModalProps) {
  const { data: customerGroups = [] } = useCustomerGroups();
  const user = useAuthStore((state) => state.user);

  // Check if user is admin (role_id = 1) or subadmin (role_id = 2)
  const isAdminOrSubAdmin = user?.role_id === 1 || user?.role_id === 2;

  const [groupSearch, setGroupSearch] = useState("");
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);

  // State for person in charge
  const [staffList, setStaffList] = useState<Account[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<Account | null>(null);
  const [staffSearch, setStaffSearch] = useState("");
  const [showStaffDropdown, setShowStaffDropdown] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(false);

  const [formData, setFormData] = useState({
    tenKhachHang: customerDetail?.ten_khach_hang || customer.ten_khach_hang,
    sdt1: customerDetail?.sdt1 || customer.sdt,
    sdt2: customerDetail?.sdt2 || "",
    gioiTinh: customerDetail?.gioi_tinh || customer.gioi_tinh,
    diaChi: customerDetail?.dia_chi || customer.dia_chi,
    diaChi2: customerDetail?.dia_chi2 || customer.dia_chi2 || "",
    nhomKh: customerDetail?.nhom_kh || customer.nhom_kh,
    ngheNghiep: customerDetail?.nghe_nghiep || "",
    dacThuSp: customerDetail?.dac_thu_sp || "",
    nhuCauSd: customerDetail?.nhu_cau_sd || "",
    loaiKh: customerDetail?.loai_kh || "",
    ghiChuThem1: customerDetail?.ghi_chu_them1 || "",
  });
  const [namSinh, setNamSinh] = useState<Date | null>(
    parseDate(customerDetail?.ngay_sinh) || null,
  );
  const [thoiGianCsLai, setThoiGianCsLai] = useState<Date | null>(
    parseDate(customerDetail?.thoi_gian_cs_lai) || null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load staff list when modal opens and user is admin/subadmin
  useEffect(() => {
    if (isAdminOrSubAdmin) {
      setLoadingStaff(true);
      getAccounts()
        .then((accounts) => {
          setStaffList(accounts);
          // Set selected staff if customer has name_pt
          if (customerDetail?.id_acc) {
            const found = accounts.find(
              (a) => a.id_acc === customerDetail.id_acc,
            );
            if (found) {
              setSelectedStaff(found);
            }
          }
        })
        .catch((err) => {
          console.error("Error loading staff list:", err);
          toast.error("Không thể tải danh sách nhân viên", {
            position: "top-right",
            autoClose: 3000,
          });
        })
        .finally(() => {
          setLoadingStaff(false);
        });
    }
  }, [isAdminOrSubAdmin, customerDetail?.id_acc]);

  // Cập nhật form data khi customerDetail thay đổi
  useEffect(() => {
    setFormData({
      tenKhachHang: customerDetail?.ten_khach_hang || customer.ten_khach_hang,
      sdt1: customerDetail?.sdt1 || customer.sdt,
      sdt2: customerDetail?.sdt2 || "",
      gioiTinh: customerDetail?.gioi_tinh || customer.gioi_tinh,
      diaChi: customerDetail?.dia_chi || customer.dia_chi,
      diaChi2: customerDetail?.dia_chi2 || customer.dia_chi2 || "",
      nhomKh: customerDetail?.nhom_kh || customer.nhom_kh,
      ngheNghiep: customerDetail?.nghe_nghiep || "",
      dacThuSp: customerDetail?.dac_thu_sp || "",
      nhuCauSd: customerDetail?.nhu_cau_sd || "",
      loaiKh: customerDetail?.loai_kh || "",
      ghiChuThem1: customerDetail?.ghi_chu_them1 || "",
    });
    setNamSinh(parseDate(customerDetail?.ngay_sinh) || null);
    setThoiGianCsLai(parseDate(customerDetail?.thoi_gian_cs_lai) || null);
  }, [customerDetail, customer]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleGroupSelect = (nhom: string) => {
    setFormData((prev) => ({
      ...prev,
      nhomKh: nhom,
    }));
    setGroupSearch("");
    setShowGroupDropdown(false);
  };

  const handleStaffSelect = (staff: Account) => {
    setSelectedStaff(staff);
    setStaffSearch("");
    setShowStaffDropdown(false);
  };

  const filteredGroups = customerGroups.filter((group: { nhom_kh: string }) =>
    group.nhom_kh.toLowerCase().includes(groupSearch.toLowerCase()),
  );

  const filteredStaff = staffList.filter((staff) =>
    staff.name.toLowerCase().includes(staffSearch.toLowerCase()),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const updateData: UpdateCustomerData = {
        id_kh: customer.id_kh || 0,
        ten_khach_hang: formData.tenKhachHang,
        sdt1: formData.sdt1,
        sdt2: formData.sdt2,
        gioi_tinh: formData.gioiTinh,
        ngay_sinh: namSinh ? namSinh.toISOString().split("T")[0] : "",
        dia_chi: formData.diaChi,
        dia_chi2: formData.diaChi2,
        nhom_kh: formData.nhomKh,
        nghe_nghiep: formData.ngheNghiep,
        dac_thu_sp: formData.dacThuSp,
        nhu_cau_sd: formData.nhuCauSd,
        thoi_gian_cs_lai: thoiGianCsLai ? thoiGianCsLai.toISOString() : "",
        loai_kh: formData.loaiKh,
        ghi_chu_them1: formData.ghiChuThem1,
        // Giữ nguyên các trường khác từ customerDetail
        id_acc: selectedStaff ? selectedStaff.id_acc : customerDetail?.id_acc,
        nhan_vien_pt: selectedStaff
          ? selectedStaff.name
          : customerDetail?.nhan_vien_pt,
        ma_kh: customer.ma_kh,
        thoi_gian_capnhat: customerDetail?.thoi_gian_capnhat,
        nguon_data: customerDetail?.nguon_data,
        gmv: customerDetail?.gmv || customer.gmv,
        aov: customerDetail?.aov || customer.aov,
        tan_suat_mua: customerDetail?.tan_suat_mua,
        so_lan_mua: customerDetail?.so_lan_mua || customer.so_lan_mua,
        thoi_gian_tao: customerDetail?.thoi_gian_tao,
        name_pt: selectedStaff ? selectedStaff.name : customerDetail?.name_pt,
        nguoi_ban: customerDetail?.nguoi_ban,
        check_trung: customerDetail?.check_trung,
      };

      console.log("Sending update data:", updateData);
      const response = await updateCustomer(updateData);
      console.log("Update response:", response);

      // Tạo updated customer detail với dữ liệu mới
      const updatedCustomerDetail: CustomerDetail = {
        ...customerDetail,
        id_kh: customer.id_kh || 0,
        ma_kh: customer.ma_kh,
        ten_khach_hang: formData.tenKhachHang,
        sdt1: formData.sdt1,
        sdt2: formData.sdt2,
        gioi_tinh: formData.gioiTinh,
        ngay_sinh: namSinh ? namSinh.toISOString().split("T")[0] : "",
        dia_chi: formData.diaChi,
        dia_chi2: formData.diaChi2,
        nhom_kh: formData.nhomKh,
        nghe_nghiep: formData.ngheNghiep,
        dac_thu_sp: formData.dacThuSp,
        nhu_cau_sd: formData.nhuCauSd,
        thoi_gian_cs_lai: thoiGianCsLai ? thoiGianCsLai.toISOString() : "",
        loai_kh: formData.loaiKh,
        ghi_chu_them1: formData.ghiChuThem1,
        id_acc: selectedStaff ? selectedStaff.id_acc : customerDetail?.id_acc,
        nhan_vien_pt: selectedStaff
          ? selectedStaff.name
          : customerDetail?.nhan_vien_pt,
        name_pt: selectedStaff ? selectedStaff.name : customerDetail?.name_pt,
      } as CustomerDetail;

      toast.success("Cập nhật thông tin khách hàng thành công!", {
        position: "top-right",
        autoClose: 3000,
      });

      // Cập nhật formData để hiển thị dữ liệu mới trong modal
      setFormData({
        tenKhachHang: formData.tenKhachHang,
        sdt1: formData.sdt1,
        sdt2: formData.sdt2,
        gioiTinh: formData.gioiTinh,
        diaChi: formData.diaChi,
        diaChi2: formData.diaChi2,
        nhomKh: formData.nhomKh,
        ngheNghiep: formData.ngheNghiep,
        dacThuSp: formData.dacThuSp,
        nhuCauSd: formData.nhuCauSd,
        loaiKh: formData.loaiKh,
        ghiChuThem1: formData.ghiChuThem1,
      });

      setIsSubmitting(false);
      onSave(updatedCustomerDetail);
    } catch (err: any) {
      console.error("Update error:", err);
      const errorMsg =
        err.response?.data?.detail ||
        err.message ||
        "Có lỗi xảy ra khi cập nhật";
      setError(errorMsg);
      toast.error(`${errorMsg}`, {
        position: "top-right",
        autoClose: 3000,
      });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <span className="material-symbols-outlined">person</span>
            Thông tin cơ bản
          </h2>
          <button className="modal-close" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div className="error-message">
                <span className="material-symbols-outlined">error</span>
                {error}
              </div>
            )}

            {/* Thông tin cơ bản */}
            <div className="form-section">
              <h3 className="form-section-title">
                <span className="material-symbols-outlined">badge</span>
                Thông tin cơ bản
              </h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Tên khách hàng *</label>
                  <input
                    type="text"
                    name="tenKhachHang"
                    value={formData.tenKhachHang}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Nhóm khách hàng</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      placeholder="Tìm kiếm nhóm khách hàng..."
                      value={showGroupDropdown ? groupSearch : formData.nhomKh}
                      onChange={(e) => {
                        setGroupSearch(e.target.value);
                        setShowGroupDropdown(true);
                      }}
                      onFocus={() => setShowGroupDropdown(true)}
                      onBlur={() => {
                        setTimeout(() => setShowGroupDropdown(false), 200);
                      }}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid #d1d5db",
                        borderRadius: "4px",
                        fontSize: "14px",
                      }}
                    />
                    {showGroupDropdown && filteredGroups.length > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          top: "100%",
                          left: 0,
                          right: 0,
                          backgroundColor: "white",
                          border: "1px solid #d1d5db",
                          borderTop: "none",
                          borderRadius: "0 0 4px 4px",
                          maxHeight: "200px",
                          overflowY: "auto",
                          zIndex: 10,
                          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                        }}
                      >
                        {filteredGroups.map((group: { nhom_kh: string }) => (
                          <div
                            key={group.nhom_kh}
                            onClick={() => handleGroupSelect(group.nhom_kh)}
                            style={{
                              padding: "8px 12px",
                              cursor: "pointer",
                              backgroundColor:
                                formData.nhomKh === group.nhom_kh
                                  ? "#f3f4f6"
                                  : "white",
                              borderBottom: "1px solid #f3f4f6",
                              fontSize: "14px",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#f3f4f6";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor =
                                formData.nhomKh === group.nhom_kh
                                  ? "#f3f4f6"
                                  : "white";
                            }}
                          >
                            {group.nhom_kh}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="form-group">
                  <label>Giới tính</label>
                  <div className="radio-group">
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="gioiTinh"
                        value="Nam"
                        checked={formData.gioiTinh === "Nam"}
                        onChange={handleChange}
                      />
                      <span>Nam</span>
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="gioiTinh"
                        value="Nữ"
                        checked={formData.gioiTinh === "Nữ"}
                        onChange={handleChange}
                      />
                      <span>Nữ</span>
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="gioiTinh"
                        value="Khác"
                        checked={formData.gioiTinh === "Khác"}
                        onChange={handleChange}
                      />
                      <span>Khác</span>
                    </label>
                  </div>
                </div>
                <div className="form-group">
                  <label>Năm sinh</label>
                  <DatePicker
                    selected={namSinh}
                    onChange={(date: Date | null) => setNamSinh(date)}
                    dateFormat="dd/MM/yyyy"
                    placeholderText="Chọn ngày sinh"
                    showYearDropdown
                    scrollableYearDropdown
                    yearDropdownItemNumber={100}
                    className="datepicker-input"
                  />
                </div>
                <div className="form-group">
                  <label>Nghề nghiệp</label>
                  <input
                    type="text"
                    name="ngheNghiep"
                    value={formData.ngheNghiep}
                    onChange={handleChange}
                  />
                </div>
                {isAdminOrSubAdmin && (
                  <div className="form-group">
                    <label>Người phụ trách</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type="text"
                        placeholder="Tìm kiếm người phụ trách..."
                        value={
                          showStaffDropdown
                            ? staffSearch
                            : selectedStaff?.name || ""
                        }
                        onChange={(e) => {
                          setStaffSearch(e.target.value);
                          setShowStaffDropdown(true);
                        }}
                        onFocus={() => setShowStaffDropdown(true)}
                        onBlur={() => {
                          setTimeout(() => setShowStaffDropdown(false), 200);
                        }}
                        disabled={loadingStaff}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid #d1d5db",
                          borderRadius: "4px",
                          fontSize: "14px",
                        }}
                      />
                      {showStaffDropdown && filteredStaff.length > 0 && (
                        <div
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            right: 0,
                            backgroundColor: "white",
                            border: "1px solid #d1d5db",
                            borderTop: "none",
                            borderRadius: "0 0 4px 4px",
                            maxHeight: "200px",
                            overflowY: "auto",
                            zIndex: 10,
                            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                          }}
                        >
                          {filteredStaff.map((staff: Account) => (
                            <div
                              key={staff.id_acc}
                              onClick={() => handleStaffSelect(staff)}
                              style={{
                                padding: "8px 12px",
                                cursor: "pointer",
                                backgroundColor:
                                  selectedStaff?.id_acc === staff.id_acc
                                    ? "#f3f4f6"
                                    : "white",
                                borderBottom: "1px solid #f3f4f6",
                                fontSize: "14px",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  "#f3f4f6";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor =
                                  selectedStaff?.id_acc === staff.id_acc
                                    ? "#f3f4f6"
                                    : "white";
                              }}
                            >
                              {staff.name}{" "}
                              {staff.chuc_vu && `(${staff.chuc_vu})`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Thông tin liên hệ */}
            <div className="form-section">
              <h3 className="form-section-title">
                <span className="material-symbols-outlined">contact_phone</span>
                Thông tin liên hệ
              </h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Điện thoại 1 *</label>
                  <input
                    type="tel"
                    name="sdt1"
                    value={formData.sdt1}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Điện thoại 2</label>
                  <input
                    type="tel"
                    name="sdt2"
                    value={formData.sdt2}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group full-width">
                  <label>Địa chỉ</label>
                  <input
                    type="text"
                    name="diaChi"
                    value={formData.diaChi}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group full-width">
                  <label>Địa chỉ 2</label>
                  <input
                    type="text"
                    name="diaChi2"
                    value={formData.diaChi2}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            {/* Đặc thù & nhu cầu */}
            <div className="form-section">
              <h3 className="form-section-title">
                <span className="material-symbols-outlined">category</span>
                Đặc thù & nhu cầu
              </h3>
              <div className="form-group">
                <label>Đặc thù sản phẩm</label>
                <textarea
                  name="dacThuSp"
                  value={formData.dacThuSp}
                  onChange={handleChange}
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>Nhu cầu sử dụng</label>
                <textarea
                  name="nhuCauSd"
                  value={formData.nhuCauSd}
                  onChange={handleChange}
                  rows={3}
                />
              </div>
              {/* <div className="form-group">
                <label>Thời gian chăm sóc lại</label>
                <DatePicker
                  selected={thoiGianCsLai}
                  onChange={(date: Date | null) => setThoiGianCsLai(date)}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={5}
                  dateFormat="dd/MM/yyyy HH:mm"
                  placeholderText="Chọn ngày và giờ"
                  className="datepicker-input"
                />
              </div> */}
            </div>

            {/* Phân loại */}
            <div className="form-section">
              <h3 className="form-section-title">
                <span className="material-symbols-outlined">label</span>
                Phân loại
              </h3>
              <div className="form-grid form-group">
                <div className="form-group">
                  <label>Phân loại khách hàng</label>
                  <select
                    name="loaiKh"
                    value={formData.loaiKh}
                    onChange={handleChange}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      fontSize: "14px",
                    }}
                  >
                    <option value="">Chọn nhóm</option>
                    <option value="L1">L1 (mua dùng)</option>
                    <option value="L2">L2 (Biếu tặng)</option>
                    <option value="L3">L3 (Khác)</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Ghi chú</label>
                <textarea
                  name="ghiChuThem1"
                  value={formData.ghiChuThem1}
                  onChange={handleChange}
                  rows={3}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn-cancel"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Hủy bỏ
            </button>
            <button type="submit" className="btn-save" disabled={isSubmitting}>
              <span className="material-symbols-outlined">save</span>
              {isSubmitting ? "Đang lưu..." : "Lưu thông tin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CustomerUpdateModal;
