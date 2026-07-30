import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User } from "@/stores/useAuthStore";
import Sidebar from "@/components/Sidebar/Sidebar";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import Header from "@/components/Header/Header";
import SuggestionBox from "@/components/Floating/SuggestionBox";
import "material-symbols";
import "./EmployeeClassificationLayout.css";

interface EmployeeClassificationLayoutProps {
  user: User;
}

function EmployeeClassificationLayout({
  user,
}: EmployeeClassificationLayoutProps) {
  const navigate = useNavigate();
  const [selectedMenu, setSelectedMenu] = useState<string>("overview");

  const menuItems = [
    {
      id: "overview",
      label: "Tổng quan",
      icon: "dashboard",
      description: "Xem tổng quan công việc",
    },
    {
      id: "menu-item-1",
      label: "Danh sách phân loại",
      icon: "list_alt",
      description: "Quản lý danh sách khách hàng cần phân loại",
      route: "/classification/menu-item-1",
    },
    {
      id: "menu-item-2",
      label: "Quản lý đề xuất Leads",
      icon: "analytics",
      description: "Phê duyệt hoặc từ chối đề xuất leads từ nhân viên",
      route: "/proposal-leads",
    },
  ];

  const handleMenuClick = (menuId: string, route?: string) => {
    setSelectedMenu(menuId);
    if (route) {
      navigate(route);
    }
  };

  return (
    <div className="employee-classification-layout">
      {/* Header */}
      <Header
        title="Nhân viên phân loại - Bảng quản trị"
        subtitle="Quản lý và phân loại khách hàng hiệu quả"
        userName={user.name || "Nhân viên"}
      />

      <div className="employee-container">
        {/* Sidebar Component */}
        <Sidebar user={user} />

        {/* Main Content */}
        <main className="main-content">
          <Breadcrumb />

          <div className="classification-content">
            <div className="welcome-section">
              <h2>Chào mừng, {user.name}!</h2>
              <p>Chức vụ: {user.chuc_vu || "Nhân viên phân loại"}</p>
            </div>

            <div className="menu-grid">
              {menuItems.map((item) => (
                <div
                  key={item.id}
                  className={`menu-card ${selectedMenu === item.id ? "active" : ""}`}
                  onClick={() => handleMenuClick(item.id, item.route)}
                >
                  <div className="menu-icon">
                    <span className="material-symbols-outlined">
                      {item.icon}
                    </span>
                  </div>
                  <div className="menu-content">
                    <h3>{item.label}</h3>
                    <p>{item.description}</p>
                  </div>
                  <div className="menu-arrow">
                    <span className="material-symbols-outlined">
                      arrow_forward
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Stats */}
            <div className="quick-stats">
              <h3>Thống kê nhanh hôm nay</h3>
              <div className="stats-row">
                <div className="stat-item">
                  <div className="stat-value">0</div>
                  <div className="stat-label">Khách hàng đã phân loại</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">0</div>
                  <div className="stat-label">Đang chờ xử lý</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">0</div>
                  <div className="stat-label">Cần xem xét</div>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="instructions-section">
              <h3>Hướng dẫn sử dụng</h3>
              <ul>
                <li>
                  <span className="material-symbols-outlined">
                    check_circle
                  </span>
                  Chọn menu bên trên để truy cập các chức năng cụ thể
                </li>
                <li>
                  <span className="material-symbols-outlined">
                    check_circle
                  </span>
                  Sử dụng tìm kiếm nhanh ở sidebar để tra cứu khách hàng
                </li>
                <li>
                  <span className="material-symbols-outlined">
                    check_circle
                  </span>
                  Kiểm tra thống kê và báo cáo để theo dõi hiệu suất
                </li>
              </ul>
            </div>
          </div>
        </main>
      </div>
      <SuggestionBox />
    </div>
  );
}

export default EmployeeClassificationLayout;
