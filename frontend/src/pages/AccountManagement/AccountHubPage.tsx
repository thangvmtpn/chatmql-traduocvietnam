import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/Sidebar/Sidebar";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import useAuthStore from "@/stores/useAuthStore";
import "./AccountHubPage.css";

const cards = [
  {
    icon: "group",
    title: "Danh sách tài khoản",
    description: "Xem, tìm kiếm và quản lý tất cả tài khoản trong hệ thống",
    path: "/accounts/list",
    gradient: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)",
    badge: "Quản lý",
  },
  {
    icon: "person_add",
    title: "Tạo tài khoản",
    description: "Thêm tài khoản nhân viên mới vào hệ thống CRM",
    path: "/accounts/create",
    gradient: "linear-gradient(135deg, #065f46 0%, #10b981 100%)",
    badge: "Thêm mới",
  },
];

export default function AccountHubPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  if (!user) return <div>Loading...</div>;

  const isAdmin = user.role_id === 1 || user.role_id === 2;

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      <Sidebar user={user} />
      <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f8f9fa" }}>
        <Breadcrumb />

        {!isAdmin ? (
          <div className="account-hub-forbidden">
            <span className="material-symbols-outlined">lock</span>
            <h2>Không có quyền truy cập</h2>
            <p>Chỉ Admin mới có thể quản lý tài khoản.</p>
          </div>
        ) : (
          <div className="account-hub-page">
            <div className="account-hub-header">
              <div className="account-hub-title-row">
                <span className="material-symbols-outlined account-hub-icon">manage_accounts</span>
                <div>
                  <h1 className="account-hub-title">Quản lý Tài khoản</h1>
                  <p className="account-hub-subtitle">Quản lý tài khoản và phân quyền nhân sự</p>
                </div>
              </div>
            </div>

            <div className="account-hub-grid">
              {cards.map((card) => (
                <div
                  key={card.path}
                  className="account-hub-card"
                  onClick={() => navigate(card.path)}
                >
                  <div className="account-hub-card-inner" style={{ background: card.gradient }}>
                    <div className="account-hub-card-badge">{card.badge}</div>
                    <span className="material-symbols-outlined account-hub-card-icon">{card.icon}</span>
                    <h2 className="account-hub-card-title">{card.title}</h2>
                    <p className="account-hub-card-desc">{card.description}</p>
                    <div className="account-hub-card-arrow">
                      <span className="material-symbols-outlined">arrow_forward</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
