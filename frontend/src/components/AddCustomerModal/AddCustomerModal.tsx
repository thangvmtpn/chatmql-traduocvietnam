import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";
import useAuthStore from "@/stores/useAuthStore";
import { useAllUsers } from "@/hooks/useUsers";
import { API_URL } from "@/config/api";
import "material-symbols";
import "./AddCustomerModal.css";

interface AddCustomerModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddCustomerModal({
  onClose,
  onSuccess,
}: AddCustomerModalProps) {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch danh sách users từ account_users
  const { data: usersData, isLoading: loadingUsers } = useAllUsers();
  const userList = Array.isArray(usersData) ? usersData : usersData?.data || [];

  const [formData, setFormData] = useState({
    tenKhachHang: "",
    sdt: "",
    gioiTinh: "Nam",
    diaChi: "",
    ngaySinh: "",
    ngheNghiep: "",
    nhomKh: "F",
    dacThuSp: "",
    nhuCauSd: "",
    ghiChu: "",
    nhanVienPhuTrach: "",
    nguonData: "CRM",
  });

  const addCustomerMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`${API_URL}/api/lead/add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Lỗi khi thêm khách hàng");
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success("Thêm khách hàng thành công!", {
        position: "top-right",
        autoClose: 3000,
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Có lỗi khi thêm khách hàng", {
        position: "top-right",
        autoClose: 3000,
      });
      setError(error.message || "Có lỗi khi thêm khách hàng");
    },
  });

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
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.tenKhachHang.trim()) {
      setError("Vui lòng nhập tên khách hàng!");
      return;
    }

    if (!formData.sdt.trim()) {
      setError("Vui lòng nhập số điện thoại!");
      return;
    }

    // Validate phone number format
    const phoneRegex = /^[0-9\s\-\+\(\)]{10,}$/;
    if (!phoneRegex.test(formData.sdt.replace(/\s/g, ""))) {
      setError("Số điện thoại không hợp lệ!");
      return;
    }

    setIsSubmitting(true);

    try {
      // Tìm user được chọn từ danh sách để lấy user_id
      let selectedUserData = null;
      if (formData.nhanVienPhuTrach) {
        const selectedId = parseInt(formData.nhanVienPhuTrach);
        selectedUserData = userList.find((u: any) => u.id_acc === selectedId);
      }

      const payload = {
        id_acc: formData.nhanVienPhuTrach
          ? parseInt(formData.nhanVienPhuTrach)
          : user?.id_acc || user?.id || 1,
        nhan_vien_pt: selectedUserData?.user_id || user?.user_id || "ADMIN",
        nhom_kh: formData.nhomKh,
        ten_khach_hang: formData.tenKhachHang,
        sdt: formData.sdt.replace(/\s/g, ""),
        gioi_tinh: formData.gioiTinh,
        dia_chi: formData.diaChi,
        ngay_sinh: formData.ngaySinh || "",
        nghe_nghiep: formData.ngheNghiep,
        diem_khach_hang: 0,
        ghi_chu: formData.ghiChu,
        dac_thu_sp: formData.dacThuSp,
        nhu_cau_sd: formData.nhuCauSd,
        thoi_gian_tao: new Date().toISOString(),
        nguon_data: formData.nguonData || "CRM",
      };

      addCustomerMutation.mutate(payload);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-section">
            <span className="material-symbols-outlined">person_add</span>
            <h2>Thêm khách hàng mới</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
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
                    placeholder="Nhập tên khách hàng"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Nhóm khách hàng</label>
                  <select
                    name="nhomKh"
                    value={formData.nhomKh}
                    onChange={handleChange}
                  >
                    <option value="F">F</option>
                    <option value="FTET">FTET</option>
                    <option value="FT">FT</option>
                    <option value="FKT">FKT</option>
                    <option value="F0">F0</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Quản lý & Nguồn dữ liệu */}
            <div className="form-section">
              <h3 className="form-section-title">
                <span className="material-symbols-outlined">
                  manage_accounts
                </span>
                Quản lý & Nguồn dữ liệu
              </h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Người phụ trách</label>
                  <select
                    name="nhanVienPhuTrach"
                    value={formData.nhanVienPhuTrach}
                    onChange={handleChange}
                    disabled={loadingUsers || userList.length === 0}
                  >
                    {userList.length === 0 ? (
                      <option value="">
                        {loadingUsers
                          ? "Đang tải danh sách..."
                          : "Không có tài khoản"}
                      </option>
                    ) : (
                      <>
                        <option value="">-- Chọn người phụ trách --</option>
                        {userList.map((u: any) => (
                          <option key={u.id_acc} value={u.id_acc.toString()}>
                            {u.name} ({u.user_id})
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
                <div className="form-group">
                  <label>Nguồn data</label>
                  <select
                    name="nguonData"
                    value={formData.nguonData}
                    onChange={handleChange}
                  >
                    <option value="HOTLINE-TIKTOK LANDING">
                      HOTLINE-TIKTOK LANDING
                    </option>
                    <option value="TIKTOK LANDING">TIKTOK LANDING</option>
                    <option value="FACEBOOK">FACEBOOK</option>
                    <option value="WEBSITE">WEBSITE</option>
                    <option value="THƯƠNG HIỆU">THƯƠNG HIỆU</option>
                    <option value="KHÁCH GIỚI THIỆU">KHÁCH GIỚI THIỆU</option>
                    <option value="B2B - Bán sỉ">B2B - Bán sỉ</option>
                    <option value="Bán trực tiếp">Bán trực tiếp</option>
                    <option value="Tiktok Shop - CSKH">
                      Tiktok Shop - CSKH
                    </option>
                    <option value="Shopee Mall TRAF - CSKH">
                      Shopee Mall TRAF - CSKH
                    </option>
                    <option value="CSKH">CSKH</option>
                    <option value="ZALO OA">ZALO OA</option>
                    <option value="YOUTUBE">YOUTUBE</option>
                    <option value="FACEBOOK - PANCAKE">
                      FACEBOOK - PANCAKE
                    </option>
                    <option value="TIKTOK SHOP">TIKTOK SHOP</option>
                  </select>
                </div>
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
                  <label>Số điện thoại *</label>
                  <input
                    type="tel"
                    name="sdt"
                    value={formData.sdt}
                    onChange={handleChange}
                    placeholder="Nhập số điện thoại"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Địa chỉ</label>
                  <input
                    type="text"
                    name="diaChi"
                    value={formData.diaChi}
                    onChange={handleChange}
                    placeholder="Nhập địa chỉ"
                  />
                </div>
              </div>
            </div>

            {/* Thông tin cá nhân */}
            <div className="form-section">
              <h3 className="form-section-title">
                <span className="material-symbols-outlined">person</span>
                Thông tin cá nhân
              </h3>
              <div className="form-grid">
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
                  <label>Ngày sinh</label>
                  <input
                    type="date"
                    name="ngaySinh"
                    value={formData.ngaySinh}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label>Nghề nghiệp</label>
                  <input
                    type="text"
                    name="ngheNghiep"
                    value={formData.ngheNghiep}
                    onChange={handleChange}
                    placeholder="Nhập nghề nghiệp"
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
                  placeholder="Nhập đặc thù sản phẩm"
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>Nhu cầu sử dụng</label>
                <textarea
                  name="nhuCauSd"
                  value={formData.nhuCauSd}
                  onChange={handleChange}
                  placeholder="Nhập nhu cầu sử dụng"
                  rows={3}
                />
              </div>
            </div>

            {/* Ghi chú */}
            <div className="form-section">
              <h3 className="form-section-title">
                <span className="material-symbols-outlined">note</span>
                Ghi chú
              </h3>
              <div className="form-group">
                <label>Ghi chú thêm</label>
                <textarea
                  name="ghiChu"
                  value={formData.ghiChu}
                  onChange={handleChange}
                  placeholder="Nhập ghi chú thêm"
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
              disabled={addCustomerMutation.isPending}
            >
              <span className="material-symbols-outlined">close</span>
              Hủy
            </button>
            <button
              type="submit"
              className="btn-submit"
              disabled={addCustomerMutation.isPending || isSubmitting}
            >
              {addCustomerMutation.isPending || isSubmitting ? (
                <>
                  <span className="material-symbols-outlined">
                    hourglass_empty
                  </span>
                  Đang xử lý...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">
                    check_circle
                  </span>
                  Thêm khách hàng
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
