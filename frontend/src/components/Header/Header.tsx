import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import useAuthStore from "@/stores/useAuthStore";
import AddCustomerModal from "../AddCustomerModal/AddCustomerModal";
import "material-symbols";
import "./Header.css";
import AccessManagementModal from "../AccessManagementModal";

interface HeaderProps {
  title: string;
  subtitle?: string;
  userName: string;
  showNotification?: boolean;
}

export default function Header({
  title,
  subtitle,
  userName,
  showNotification = true,
}: HeaderProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const [showMenu, setShowMenu] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);

  const [showAccessModal, setShowAccessModal] = useState(false);

  const today = new Date().toLocaleDateString("vi-VN");
  // Check if user has role_id 1 or 2 (Admin or Manager)
  const canAddCustomer = user?.role_id === 1 || user?.role_id === 2;

  const handleLogout = () => {
    // Xóa toàn bộ React Query cache để tránh hiển thị dữ liệu cũ
    queryClient.clear();
    // Xóa auth state
    logout();
    // Chuyển hướng về trang login
    navigate("/login");
  };

  const handleAddCustomer = () => {
    setShowAddCustomerModal(true);
    setShowMenu(false);
  };

  const handleAddCustomerSuccess = () => {
    setShowAddCustomerModal(false);
    // Invalidate queries to refresh customer list
    queryClient.invalidateQueries({ queryKey: ["customers"] });
  };

  const handleAccessManagement = () => {
    setShowAccessModal(true);
    setShowMenu(false);
  };

  return (
    <>
      <header className="admin-header">
        <div className="header-content">
          <div className="header-left">
            <h1 className="logo cursor-pointer" onClick={() => navigate("/")}>
              <img
                src="/logo-tdvn.jpg"
                alt="CRM TDVN Logo"
                className="logo-img"
              />
            </h1>
            <div>
              <h2 className="title">{title}</h2>
              {subtitle && <h3 className="subtitle">{subtitle}</h3>}
            </div>
          </div>
          <div className="header-right">
            <div className="date-display">
              <span className="material-symbols-outlined">calendar_today</span>
              <span>{today}</span>
            </div>
            <div className="user-info">
              <span className="user-name">{userName}</span>
              <span className="user-status">● TRỰC TUYẾN</span>
            </div>
            {canAddCustomer && (
              <div className="header-menu-container">
                <button
                  className="hamburger-btn"
                  onClick={() => setShowMenu(!showMenu)}
                  title="Menu"
                >
                  <span className="material-symbols-outlined">menu</span>
                </button>
                {showMenu && (
                  <div className="header-menu-dropdown">
                    <button className="menu-item" onClick={handleAddCustomer}>
                      <span className="material-symbols-outlined">
                        person_add
                      </span>
                      Thêm khách hàng
                    </button>
                    <button className="menu-item" onClick={handleAccessManagement}>
                      <span className="material-symbols-outlined">
                        manage_accounts
                      </span>
                      Quản lý truy cập
                    </button>
                  </div>
                )}
              </div>
            )}
            {showNotification && (
              <button
                className="notification-btn"
                onClick={handleLogout}
                title="Đăng xuất"
              >
                <span className="material-symbols-outlined">logout</span>
              </button>
            )}
            {showAccessModal && (
        <AccessManagementModal
          onClose={() => setShowAccessModal(false)}
          // Có thể truyền thêm onSuccess nếu bạn cần invalidate queries giống như AddCustomer
        />
      )}
          </div>
        </div>
      </header>

      {/* Add Customer Modal */}
      {showAddCustomerModal && (
        <AddCustomerModal
          onClose={() => setShowAddCustomerModal(false)}
          onSuccess={handleAddCustomerSuccess}
        />
      )}
    </>
  );
}
