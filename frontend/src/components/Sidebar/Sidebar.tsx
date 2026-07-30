import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { User } from "@/stores/useAuthStore";
import { toast } from "react-toastify";
import AddCustomerModal from "../AddCustomerModal/AddCustomerModal";
import "material-symbols";
import "./Sidebar.css";

interface SidebarProps {
  user: User;
  onSearch?: (customerId: string, phoneNumber: string) => void;
}

function Sidebar({ user, onSearch }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [urlSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    accountInfo: true,
    search: true,
    target: true,
    sales: true,
    orders: true,
    admin: true,
    accounts: true,
    invoiceManagement: true,
    guides: true,
  });

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const [searchCustomerId, setSearchCustomerId] = useState("");
  const [searchPhoneNumber, setSearchPhoneNumber] = useState("");
  const [searchInvoiceCode, setSearchInvoiceCode] = useState("");

  // Cập nhật input search từ URL params
  useEffect(() => {
    const customerId = urlSearchParams.get("customer_id") || "";
    const phoneNumber = urlSearchParams.get("phone_number") || "";

    if (customerId || phoneNumber) {
      setSearchCustomerId(customerId);
      setSearchPhoneNumber(phoneNumber);
    }
  }, [urlSearchParams]);

  const handleSearch = () => {
    const invoiceCode = searchInvoiceCode.trim();
    const customerId = searchCustomerId.trim();
    let phoneNumber = searchPhoneNumber.trim();

    // Ưu tiên tìm hoá đơn nếu có dữ liệu
    if (invoiceCode) {
      navigate(
        `/invoice-search?code_invoice=${encodeURIComponent(invoiceCode)}`,
      );
      return;
    }

    // Nếu không có hoá đơn, tìm khách hàng
    if (!customerId && !phoneNumber) {
      toast.warning(
        "Vui lòng nhập mã khách hàng, số điện thoại hoặc mã hoá đơn để tìm kiếm",
      );
      return;
    }

    // Chuẩn hóa số điện thoại: bỏ các ký tự không phải số
    if (phoneNumber) {
      const digitsOnly = phoneNumber.replace(/\D/g, "");
      // Nếu bắt đầu với 0, thay thế bằng 84
      if (digitsOnly.startsWith("0")) {
        phoneNumber = "84" + digitsOnly.substring(1);
      } else if (!digitsOnly.startsWith("84")) {
        // Nếu không bắt đầu với 84 hoặc 0, giữ nguyên
        phoneNumber = digitsOnly;
      } else {
        phoneNumber = digitsOnly;
      }
    }

    // Nếu có callback onSearch (khi đang ở trang CustomerList), gọi nó
    if (onSearch) {
      onSearch(customerId, phoneNumber);
    }

    // Luôn điều hướng tới trang CustomerList với params tìm kiếm
    const params = new URLSearchParams();
    if (customerId) params.append("customer_id", customerId);
    if (phoneNumber) params.append("phone_number", phoneNumber);
    navigate(`/customers?${params.toString()}`);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const isDashboard =
    location.pathname === "/dashboard" || location.pathname === "/";

  return (
    <>
      <aside className="sidebar">
        {/* Tổng quan */}
        {isDashboard && (
          <div
            className="sidebar-overview-item"
            onClick={() => navigate("/dashboard")}
          >
            <span className="material-symbols-outlined">dashboard</span>
            <span>Tổng quan</span>
          </div>
        )}

        {/* User Avatar */}

        {/* Account Info */}
        <div className="sidebar-section">
          <div
            className="section-header section-header-toggle"
            onClick={() => toggleSection("accountInfo")}
          >
            <span className="material-symbols-outlined">person</span>
            <h4>THÔNG TIN TÀI KHOẢN</h4>
            <span
              className={`material-symbols-outlined section-arrow ${
                openSections.accountInfo ? "section-arrow-open" : ""
              }`}
            >
              expand_more
            </span>
          </div>
          {openSections.accountInfo && (
            <>
              <div className="info-row">
                <span className="info-label">Mã nhân viên</span>
                <span className="info-value">
                  {user.user_id || user.id || "N/A"}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Chức danh</span>
                <span className="info-value">
                  {user.chuc_vu || user.role || "Nhân viên"}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Phòng ban</span>
                <span className="info-value">
                  {user.department_name || "Chưa phân phòng"}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Hạng người dùng</span>
                <span className="info-badge">
                  Cấp {user.role_id == 4 ? "3" : user.role_id}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Quick Search */}
        <div className="sidebar-section">
          <div
            className="section-header section-header-toggle"
            onClick={() => toggleSection("search")}
          >
            <span className="material-symbols-outlined">search</span>
            <h4>TÌM KIẾM NHANH</h4>
            <span
              className={`material-symbols-outlined section-arrow ${
                openSections.search ? "section-arrow-open" : ""
              }`}
            >
              expand_more
            </span>
          </div>
          {openSections.search && (
            <div className="search-inputs">
              <div className="search-input-group">
                <label className="sidebar-label">Mã khách hàng</label>
                <input
                  type="text"
                  placeholder="Mã khách hàng"
                  value={searchCustomerId}
                  onChange={(e) => setSearchCustomerId(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="sidebar-input"
                />
              </div>
              <div className="search-input-group  my-1">
                <label className="sidebar-label">Số điện thoại</label>
                <input
                  type="text"
                  placeholder="Số điện thoại"
                  value={searchPhoneNumber}
                  onChange={(e) => setSearchPhoneNumber(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="sidebar-input"
                />
              </div>
              <div className="search-input-group">
                <label className="sidebar-label">Mã hoá đơn</label>
                <input
                  type="text"
                  placeholder="VD: HD_2025..."
                  value={searchInvoiceCode}
                  onChange={(e) => setSearchInvoiceCode(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="sidebar-input"
                />
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="search-btn"
                  onClick={handleSearch}
                  style={{ flex: 1 }}
                >
                  Tìm kiếm
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sales Actions */}
        {Number(user?.id_acc) === 29 && (
          <div className="sidebar-section">
            <div
              className="section-header section-header-toggle"
              onClick={() => toggleSection("sales")}
            >
              <span className="material-symbols-outlined">leaderboard</span>
              <h4>BÁO CÁO</h4>
              <span
                className={`material-symbols-outlined section-arrow ${
                  openSections.sales ? "section-arrow-open" : ""
                }`}
              >
                expand_more
              </span>
            </div>
            {openSections.sales && (
              <div className="guide-list">
                <a
                  onClick={() => navigate("/sales-report")}
                  className="guide-link"
                  style={{ cursor: "pointer" }}
                >
                  <span className="material-symbols-outlined">
                    insert_chart
                  </span>
                  Tổng quan doanh số
                </a>
              </div>
            )}
          </div>
        )}

        {/* Order Overview - id_acc 34 */}
        {Number(user?.id_acc) === 34 && (
          <div className="sidebar-section">
            <div
              className="section-header section-header-toggle"
              onClick={() => toggleSection("orders")}
            >
              <span className="material-symbols-outlined">shopping_bag</span>
              <h4>ĐƠN HÀNG</h4>
              <span
                className={`material-symbols-outlined section-arrow ${
                  openSections.orders ? "section-arrow-open" : ""
                }`}
              >
                expand_more
              </span>
            </div>
            {openSections.orders && (
              <div className="guide-list">
                <a
                  onClick={() => navigate("/invoices")}
                  className="guide-link"
                  style={{ cursor: "pointer" }}
                >
                  <span className="material-symbols-outlined">inventory_2</span>
                  Danh sách đơn hàng
                </a>
              </div>
            )}
          </div>
        )}

        {/* Admin Actions */}
        {user && (user.role_id === 1 || user.role_id === 2) && (
          <div className="sidebar-section">
            <div
              className="section-header section-header-toggle"
              onClick={() => toggleSection("admin")}
            >
              <span className="material-symbols-outlined">
                admin_panel_settings
              </span>
              <h4>QUẢN TRỊ</h4>
              <span
                className={`material-symbols-outlined section-arrow ${
                  openSections.admin ? "section-arrow-open" : ""
                }`}
              >
                expand_more
              </span>
            </div>
            {openSections.admin && (
              <div className="guide-list">
                <a
                  onClick={() => navigate("/input-overview")}
                  className="guide-link"
                  style={{ cursor: "pointer" }}
                >
                  <span className="material-symbols-outlined">
                    dashboard_customize
                  </span>
                  Tổng quan đầu vào
                </a>
                <a
                  onClick={() => setShowAddCustomerModal(true)}
                  className="guide-link"
                  style={{ cursor: "pointer" }}
                  id="sidebar-add-customer"
                >
                  <span className="material-symbols-outlined">person_add</span>
                  Thêm khách hàng
                </a>
                <a
                  onClick={() => navigate("/lead-proposals")}
                  className="guide-link"
                  style={{ cursor: "pointer" }}
                >
                  <span className="material-symbols-outlined">
                    assignment_ind
                  </span>
                  Đề xuất Lead
                </a>

                <a
                  onClick={() => navigate("/manager/activities")}
                  className="guide-link"
                  style={{ cursor: "pointer" }}
                >
                  <span className="material-symbols-outlined">history</span>
                  Nhật ký hoạt động
                </a>
              </div>
            )}
          </div>
        )}

        {/* TÀI KHOẢN - chỉ admin */}
        {user.role_id === 1 && (
          <div className="sidebar-section">
            <div
              className="section-header section-header-toggle"
              onClick={() => toggleSection("accounts")}
            >
              <span className="material-symbols-outlined">manage_accounts</span>
              <h4>TÀI KHOẢN</h4>
              <span
                className={`material-symbols-outlined section-arrow ${
                  openSections.accounts ? "section-arrow-open" : ""
                }`}
              >
                expand_more
              </span>
            </div>
            {openSections.accounts && (
              <div className="guide-list">
                <a
                  onClick={() => navigate("/accounts")}
                  className="guide-link"
                  style={{ cursor: "pointer" }}
                >
                  <span className="material-symbols-outlined">group</span>
                  Quản lý tài khoản
                </a>
              </div>
            )}
          </div>
        )}

        {/* Guides */}
        <div className="sidebar-section">
          <div
            className="section-header section-header-toggle"
            onClick={() => toggleSection("guides")}
          >
            <span className="material-symbols-outlined">description</span>
            <h4>HƯỚNG DẪN & TÀI LIỆU</h4>
            <span
              className={`material-symbols-outlined section-arrow ${
                openSections.guides ? "section-arrow-open" : ""
              }`}
            >
              expand_more
            </span>
          </div>
          {openSections.guides && (
            <div className="guide-list">
              <a href="#" className="guide-link">
                <span className="material-symbols-outlined">chevron_right</span>
                Hướng dẫn
              </a>
              <a href="#" className="guide-link">
                <span className="material-symbols-outlined">chevron_right</span>
                Tài liệu
              </a>
              <a
                onClick={() => navigate("/thuat-ngu")}
                className="guide-link"
                style={{ cursor: "pointer" }}
              >
                <span className="material-symbols-outlined">chevron_right</span>
                Thuật ngữ
              </a>
            </div>
          )}
        </div>

        {/* AI Assistant */}
        <button
          className="ai-btn"
          onClick={() => navigate("/ai-assistant")}
          style={{ cursor: "pointer" }}
        >
          <span className="material-symbols-outlined">smart_toy</span>
          Trợ lý AI - Hỏi đáp nhanh
        </button>
      </aside>

      {/* Add Customer Modal từ Sidebar */}
      {showAddCustomerModal && (
        <AddCustomerModal
          onClose={() => setShowAddCustomerModal(false)}
          onSuccess={() => {
            setShowAddCustomerModal(false);
            queryClient.invalidateQueries({ queryKey: ["customers"] });
          }}
        />
      )}
    </>
  );
}

export default Sidebar;
