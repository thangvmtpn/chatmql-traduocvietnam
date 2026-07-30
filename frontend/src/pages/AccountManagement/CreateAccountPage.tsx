import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import Sidebar from "@/components/Sidebar/Sidebar";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import useAuthStore from "@/stores/useAuthStore";
import { createAccount, AccountCreateData, ROLE_LABELS, CREATABLE_ROLES } from "@/services/accountService";
import "./CreateAccountPage.css";

const INITIAL: AccountCreateData = {
  user_id: "",
  name: "",
  chuc_vu: "",
  username: "",
  password: "",
  role_id: 4,
  department_id: undefined,
  quyen_han: undefined,
  sub_account: undefined,
  trang_thai: "Đang làm",
};

export default function CreateAccountPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role_id === 1 || user?.role_id === 2;

  const [form, setForm] = useState<AccountCreateData>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [showPass, setShowPass] = useState(false);

  if (!user) return <div>Loading...</div>;

  const handleChange = (field: keyof AccountCreateData, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const genPassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$";
    const pw = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    handleChange("password", pw);
    setShowPass(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.user_id.trim() || !form.name.trim() || !form.username.trim() || !form.password.trim()) {
      toast.error("Vui lòng điền đầy đủ thông tin bắt buộc");
      return;
    }
    setSubmitting(true);
    try {
      const res = await createAccount({
        ...form,
        department_id: form.department_id || undefined,
        quyen_han: form.quyen_han || undefined,
        sub_account: form.sub_account || undefined,
      });
      toast.success(`Tạo tài khoản thành công! ID: ${res.id_acc}`);
      navigate("/accounts/list");
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Lỗi khi tạo tài khoản");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      <Sidebar user={user} />
      <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f8f9fa" }}>
        <Breadcrumb />

        {!isAdmin ? (
          <div className="create-acc-forbidden">
            <span className="material-symbols-outlined">lock</span>
            <h2>Không có quyền truy cập</h2>
          </div>
        ) : (
          <div className="create-acc-page">
            {/* Header */}
            <div className="create-acc-header">
              <button className="acc-back-btn2" onClick={() => navigate("/accounts")}>
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <div>
                <h1 className="create-acc-title">
                  <span className="material-symbols-outlined">person_add</span>
                  Tạo tài khoản mới
                </h1>
                <p className="create-acc-sub">Thêm nhân viên mới vào hệ thống CRM</p>
              </div>
            </div>

            <form className="create-acc-form" onSubmit={handleSubmit}>
              <div className="create-acc-card">
                <h3 className="create-acc-section">
                  <span className="material-symbols-outlined">badge</span>
                  Thông tin cơ bản
                </h3>
                <div className="create-acc-grid">
                  <div className="create-acc-field">
                    <label>Mã nhân viên <span className="required">*</span></label>
                    <input
                      type="text"
                      placeholder="VD: AA0001"
                      value={form.user_id}
                      onChange={(e) => handleChange("user_id", e.target.value.toUpperCase())}
                      required
                    />
                  </div>
                  <div className="create-acc-field">
                    <label>Họ tên <span className="required">*</span></label>
                    <input
                      type="text"
                      placeholder="Nguyễn Văn A"
                      value={form.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      required
                    />
                  </div>
                  <div className="create-acc-field">
                    <label>Chức vụ</label>
                    <input
                      type="text"
                      placeholder="Chuyên viên phát triển khách hàng"
                      value={form.chuc_vu}
                      onChange={(e) => handleChange("chuc_vu", e.target.value)}
                    />
                  </div>
                  <div className="create-acc-field">
                    <label>Cấp bậc <span className="required">*</span></label>
                    <select value={form.role_id} onChange={(e) => handleChange("role_id", Number(e.target.value))}>
                      {CREATABLE_ROLES.map(({ role_id, label }) => (
                        <option key={role_id} value={role_id}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="create-acc-field">
                    <label>Phòng ban (ID)</label>
                    <input
                      type="number"
                      placeholder="VD: 3"
                      value={form.department_id ?? ""}
                      onChange={(e) => handleChange("department_id", e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </div>
                  <div className="create-acc-field">
                    <label>Trạng thái</label>
                    <select value={form.trang_thai} onChange={(e) => handleChange("trang_thai", e.target.value)}>
                      <option value="Đang làm">Đang làm</option>
                      <option value="Tạm nghỉ">Tạm nghỉ</option>
                      <option value="Nghỉ việc">Nghỉ việc</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="create-acc-card">
                <h3 className="create-acc-section">
                  <span className="material-symbols-outlined">lock</span>
                  Thông tin đăng nhập
                </h3>
                <div className="create-acc-grid">
                  <div className="create-acc-field">
                    <label>Username <span className="required">*</span></label>
                    <input
                      type="text"
                      placeholder="VD: nguyenvana"
                      value={form.username}
                      onChange={(e) => handleChange("username", e.target.value)}
                      required
                    />
                  </div>
                  <div className="create-acc-field">
                    <label>Mật khẩu <span className="required">*</span></label>
                    <div className="acc-pass-wrap">
                      <input
                        type={showPass ? "text" : "password"}
                        placeholder="Nhập mật khẩu..."
                        value={form.password}
                        onChange={(e) => handleChange("password", e.target.value)}
                        required
                      />
                      <button type="button" className="acc-pass-toggle" onClick={() => setShowPass(!showPass)}>
                        <span className="material-symbols-outlined">{showPass ? "visibility_off" : "visibility"}</span>
                      </button>
                      <button type="button" className="acc-gen-pass" onClick={genPassword} title="Tạo mật khẩu ngẫu nhiên">
                        <span className="material-symbols-outlined">auto_awesome</span>
                      </button>
                    </div>
                  </div>
                  <div className="create-acc-field">
                    <label>Quyền hạn</label>
                    <input
                      type="number"
                      placeholder="VD: 6"
                      value={form.quyen_han ?? ""}
                      onChange={(e) => handleChange("quyen_han", e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </div>
                  <div className="create-acc-field">
                    <label>Sub Account</label>
                    <input
                      type="number"
                      placeholder="VD: 1"
                      value={form.sub_account ?? ""}
                      onChange={(e) => handleChange("sub_account", e.target.value ? Number(e.target.value) : undefined)}
                    />
                  </div>
                </div>
              </div>

              <div className="create-acc-footer">
                <button type="button" className="acc-cancel-btn2" onClick={() => navigate("/accounts")}>
                  Hủy bỏ
                </button>
                <button type="submit" className="acc-submit-btn" disabled={submitting}>
                  <span className="material-symbols-outlined">{submitting ? "progress_activity" : "person_add"}</span>
                  {submitting ? "Đang tạo..." : "Tạo tài khoản"}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
