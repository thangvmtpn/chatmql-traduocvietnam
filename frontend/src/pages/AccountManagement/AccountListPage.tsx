import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import Sidebar from "@/components/Sidebar/Sidebar";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import useAuthStore from "@/stores/useAuthStore";
import {
  getAccountList, updateAccount,
  AccountFull, AccountUpdateData, ROLE_LABELS,
} from "@/services/accountService";
import "./AccountListPage.css";

const STATUS_COLORS: Record<string, string> = {
  "Đang làm": "#059669",
  "Nghỉ việc": "#dc2626",
  "Tạm nghỉ": "#d97706",
};

export default function AccountListPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role_id === 1 || user?.role_id === 2;

  const [accounts, setAccounts] = useState<AccountFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<AccountUpdateData>({});
  const [saving, setSaving] = useState(false);
  const [showPassEdit, setShowPassEdit] = useState(false);

  if (!user) return <div>Loading...</div>;

  useEffect(() => {
    if (!isAdmin) return;
    fetchAccounts();
  }, [isAdmin]);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const data = await getAccountList();
      setAccounts(data);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Không thể tải danh sách tài khoản");
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        a.name?.toLowerCase().includes(q) ||
        a.user_id?.toLowerCase().includes(q) ||
        a.username?.toLowerCase().includes(q) ||
        a.chuc_vu?.toLowerCase().includes(q);
      const matchRole = !filterRole || String(a.role_id) === filterRole;
      const matchStatus = !filterStatus || a.trang_thai === filterStatus;
      return matchSearch && matchRole && matchStatus;
    });
  }, [accounts, search, filterRole, filterStatus]);

  const startEdit = (acc: AccountFull) => {
    setEditingId(acc.id_acc);
    setShowPassEdit(false);
    setEditData({ name: acc.name, chuc_vu: acc.chuc_vu, trang_thai: acc.trang_thai, role_id: acc.role_id, password: "" });
  };
  const cancelEdit = () => { setEditingId(null); setEditData({}); setShowPassEdit(false); };

  const saveEdit = async (id_acc: number) => {
    setSaving(true);
    try {
      // Chỉ gửi password nếu người dùng đã nhập mới
      const payload: AccountUpdateData = { ...editData };
      if (!payload.password?.trim()) delete payload.password;
      await updateAccount(id_acc, payload);
      toast.success("Cập nhật tài khoản thành công");
      setEditingId(null);
      setShowPassEdit(false);
      fetchAccounts();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || "Lỗi khi cập nhật");
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = () => {
    setSearch("");
    setFilterRole("");
    setFilterStatus("");
    fetchAccounts();
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      <Sidebar user={user} />
      <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f8f9fa" }}>
        <Breadcrumb />

        {!isAdmin ? (
          <div className="acc-list-forbidden">
            <span className="material-symbols-outlined">lock</span>
            <h2>Không có quyền truy cập</h2>
          </div>
        ) : (
          <div className="acc-list-page">
            {/* Header */}
            <div className="acc-list-header">
              <div className="acc-list-header-left">
                <button className="acc-back-btn" onClick={() => navigate("/accounts")}>
                  <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <div>
                  <h1 className="acc-list-title">
                    <span className="material-symbols-outlined">group</span>
                    Danh sách tài khoản
                  </h1>
                  <p className="acc-list-sub">{filtered.length} / {accounts.length} tài khoản</p>
                </div>
              </div>
              <button className="acc-create-btn" onClick={() => navigate("/accounts/create")}>
                <span className="material-symbols-outlined">person_add</span>
                Tạo tài khoản
              </button>
            </div>

            {/* Filters */}
            <div className="acc-list-filters">
              <div className="acc-search-wrap">
                <span className="material-symbols-outlined">search</span>
                <input
                  className="acc-search-input"
                  placeholder="Tìm theo tên, mã NV, username, chức vụ..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <select className="acc-filter-select" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
                <option value="">Tất cả cấp bậc</option>
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <select className="acc-filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">Tất cả trạng thái</option>
                <option value="Đang làm">Đang làm</option>
                <option value="Nghỉ việc">Nghỉ việc</option>
                <option value="Tạm nghỉ">Tạm nghỉ</option>
              </select>
              <button className="acc-refresh-btn" onClick={handleRefresh} title="Làm mới">
                <span className="material-symbols-outlined">refresh</span>
              </button>
            </div>

            {/* Table */}
            <div className="acc-list-table-wrap">
              {loading ? (
                <div className="acc-list-loading">
                  <span className="material-symbols-outlined spinning">progress_activity</span>
                  <p>Đang tải...</p>
                </div>
              ) : (
                <table className="acc-list-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Mã NV</th>
                      <th>Họ tên</th>
                      <th>Chức vụ</th>
                      <th>Username</th>
                      <th>Mật khẩu</th>
                      <th>Cấp bậc</th>
                      <th>Phòng ban</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ textAlign: "center", padding: "40px", color: "#9ca3af" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 40 }}>inbox</span>
                          <p>Không tìm thấy tài khoản nào</p>
                        </td>
                      </tr>
                    ) : filtered.map((acc, idx) => {
                      const isEditing = editingId === acc.id_acc;
                      return (
                        <tr key={acc.id_acc} className={isEditing ? "acc-row-editing" : ""}>
                          <td className="acc-td-num">{idx + 1}</td>
                          <td className="acc-td-code">{acc.user_id || "—"}</td>
                          <td className="acc-td-name">
                            {isEditing ? (
                              <input className="acc-inline-input" value={editData.name || ""} onChange={(e) => setEditData(p => ({ ...p, name: e.target.value }))} />
                            ) : <span>{acc.name}</span>}
                          </td>
                          <td>
                            {isEditing ? (
                              <input className="acc-inline-input" value={editData.chuc_vu || ""} onChange={(e) => setEditData(p => ({ ...p, chuc_vu: e.target.value }))} />
                            ) : <span>{acc.chuc_vu || "—"}</span>}
                          </td>
                          <td className="acc-td-username">{acc.username}</td>
                          <td className="acc-td-password">
                            {isEditing ? (
                              <div className="acc-pass-edit-wrap">
                                <input
                                  className="acc-inline-input"
                                  type={showPassEdit ? "text" : "password"}
                                  placeholder="Để trống = giữ nguyên"
                                  value={editData.password || ""}
                                  onChange={(e) => setEditData(p => ({ ...p, password: e.target.value }))}
                                  style={{ minWidth: 140 }}
                                />
                                <button
                                  type="button"
                                  className="acc-pass-eye"
                                  onClick={() => setShowPassEdit(s => !s)}
                                  title={showPassEdit ? "Ẩn" : "Hiện"}
                                >
                                  <span className="material-symbols-outlined">
                                    {showPassEdit ? "visibility_off" : "visibility"}
                                  </span>
                                </button>
                              </div>
                            ) : (
                              <span className="acc-password-mask">{acc.password}</span>
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <select className="acc-inline-select" value={editData.role_id ?? acc.role_id} onChange={(e) => setEditData(p => ({ ...p, role_id: Number(e.target.value) }))}>
                                {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                              </select>
                            ) : (
                              <span className="acc-role-badge" data-role={acc.role_id}>
                                {ROLE_LABELS[acc.role_id] || `Role ${acc.role_id}`}
                              </span>
                            )}
                          </td>
                          <td className="acc-td-center">{acc.department_id ?? "—"}</td>
                          <td>
                            {isEditing ? (
                              <select className="acc-inline-select" value={editData.trang_thai || acc.trang_thai} onChange={(e) => setEditData(p => ({ ...p, trang_thai: e.target.value }))}>
                                <option value="Đang làm">Đang làm</option>
                                <option value="Tạm nghỉ">Tạm nghỉ</option>
                                <option value="Nghỉ việc">Nghỉ việc</option>
                              </select>
                            ) : (
                              <span className="acc-status-badge" style={{ color: STATUS_COLORS[acc.trang_thai] || "#6b7280" }}>
                                <span className="acc-status-dot" style={{ background: STATUS_COLORS[acc.trang_thai] || "#6b7280" }} />
                                {acc.trang_thai || "—"}
                              </span>
                            )}
                          </td>
                          <td className="acc-td-actions">
                            {isEditing ? (
                              <div className="acc-action-row">
                                <button className="acc-btn-save" onClick={() => saveEdit(acc.id_acc)} disabled={saving}>
                                  <span className="material-symbols-outlined">save</span>
                                </button>
                                <button className="acc-btn-cancel" onClick={cancelEdit}>
                                  <span className="material-symbols-outlined">close</span>
                                </button>
                              </div>
                            ) : (
                              <button className="acc-btn-edit" onClick={() => startEdit(acc)}>
                                <span className="material-symbols-outlined">edit</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
