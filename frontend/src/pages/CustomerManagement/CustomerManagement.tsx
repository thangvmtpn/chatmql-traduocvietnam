import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTopCustomers } from "@/hooks/useCustomers";
import {
  useEmployeeOverview,
  useEmployeeRegionStats,
  useSearchProducts,
  useProductCustomers,
  useMyFNTargetData,
} from "@/hooks/useDashboard";
import { SortByType } from "@/services/customerService";
import { Product } from "@/services/dashboardService";
import DateRangeFilter from "@/components/DateRangeFilter/DateRangeFilter";
import RightSidebar from "@/components/RightSidebar/RightSidebar";
import CustomerListTab from "./CustomerListTab";
import OrdersTab from "./OrdersTab";
import "./CustomerManagement.css";
import "./OrdersTab.css";
import useAuthStore from "@/stores/useAuthStore";
import { VipBadge } from "@/components/CustomerBadges/CustomerBadges";

type TabType = "overview" | "list" | "process" | "docs" | "orders";

interface CustomerManagementProps {
  userId?: string | number;
  searchCustomerId?: string;
  searchPhoneNumber?: string;
}

function CustomerManagement({
  searchCustomerId = "",
  searchPhoneNumber = "",
}: CustomerManagementProps) {
  // Khởi tạo activeTab từ localStorage, nếu không có thì mặc định "overview"
  const [activeTab, setActiveTabState] = useState<TabType>(() => {
    const saved = localStorage.getItem("customerManagementActiveTab");
    return (saved as TabType) || "overview";
  });
  const [showAllCustomers, setShowAllCustomers] = useState(false);

  // Khi activeTab thay đổi, lưu vào localStorage
  const setActiveTab = (tab: TabType) => {
    setActiveTabState(tab);
    localStorage.setItem("customerManagementActiveTab", tab);
  };

  const tabs = [
    { id: "overview", label: "TỔNG QUAN", icon: "dashboard" },
    { id: "list", label: "DANH SÁCH\nKHÁCH HÀNG", icon: "groups" },
    { id: "process", label: "QUY TRÌNH\nBÁN HÀNG", icon: "person_outline" },
    { id: "docs", label: "TÀI LIỆU\nBÁN HÀNG", icon: "folder_open" },
    { id: "orders", label: "ĐƠN HÀNG\nCỦA TÔI", icon: "shopping_cart" },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <OverviewTab
            onOpportunityClick={() => {
              setActiveTab("list");
              setShowAllCustomers(true);
            }}
          />
        );
      case "list":
        return (
          <CustomerListTab
            searchCustomerId={searchCustomerId}
            searchPhoneNumber={searchPhoneNumber}
            showAllCustomers={showAllCustomers}
            onShowAllCustomersChange={setShowAllCustomers}
          />
        );
      case "process":
        return (
          <div className="tab-content-placeholder">
            <span className="material-symbols-outlined">flow_chart</span>
            <p>Quy trình bán hàng đang được xây dựng</p>
          </div>
        );
      case "docs":
        return (
          <div className="tab-content-placeholder">
            <span className="material-symbols-outlined">folder_open</span>
            <p>Tài liệu bán hàng đang được xây dựng</p>
          </div>
        );
      case "orders":
        return <OrdersTab />;
      default:
        return null;
    }
  };

  return (
    <div className="customer-management">
      <div className="cm-wrapper">
        <div className="cm-main">
          <div className="cm-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`cm-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id as TabType)}
              >
                <span className="material-symbols-outlined">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="cm-content">{renderContent()}</div>
        </div>
        {activeTab === "overview" && <RightSidebar />}
      </div>
    </div>
  );
}

// Component Tab Tổng Quan
function OverviewTab({
  onOpportunityClick,
}: {
  onOpportunityClick: () => void;
}) {
  const [sortBy, setSortBy] = useState<SortByType>("gmv");
  const [productSortBy, setProductSortBy] = useState<"gmv" | "so_lan_mua">(
    "gmv",
  );

  // State cho date range filter của bảng thống kê 4
  const today = new Date().toISOString().split("T")[0];
  const [statsFromDate, setStatsFromDate] = useState(today);
  const [statsToDate, setStatsToDate] = useState(today);

  // Handler khi stats filter thay đổi
  const handleStatsFilterChange = (from: string, to: string) => {
    setStatsFromDate(from);
    setStatsToDate(to);
  };

  return (
    <div className="overview-tab">
      <div className="overview-grid">
        {/* Bảng mục tiêu FN - Đặt đầu tiên */}
        <div className="overview-card" style={{ display: "none" }}>
          <div className="overview-card-header">
            <span className="material-symbols-outlined">target</span>
            <h3>MỤC TIÊU BÁN HÀNG CỦA TÔI</h3>
          </div>
          <div className="overview-card-body">
            <MyFNTargetTable onOpportunityClick={onOpportunityClick} />
          </div>
        </div>

        {/* Top 100 Khách Hàng */}
        <div className="overview-card">
          <div className="overview-card-header">
            <span className="material-symbols-outlined">leaderboard</span>
            <h3>TOP 100 KHÁCH HÀNG</h3>
            <select
              className="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortByType)}
            >
              <option value="gmv">Theo giá trị (GMV)</option>
              <option value="so_lan_mua">Theo số lần mua</option>
            </select>
          </div>
          <div className="overview-card-body">
            <TopCustomersTable sortBy={sortBy} />
          </div>
        </div>

        {/* Bảng thứ 2 - Thống kê theo vùng miền */}
        <div className="overview-card">
          <div className="overview-card-header">
            <span className="material-symbols-outlined">public</span>
            <h3>TOP THEO VÙNG MIỀN</h3>
          </div>
          <div className="overview-card-body">
            <RegionStatsTable />
          </div>
        </div>

        {/* Bảng thứ 3 - Top Sản Phẩm */}
        <div className="overview-card">
          <div className="overview-card-header">
            <span className="material-symbols-outlined">analytics</span>
            <h3>TOP SẢN PHẨM BÁN CHẠY</h3>
            <select
              className="sort-select"
              value={productSortBy}
              onChange={(e) =>
                setProductSortBy(e.target.value as "gmv" | "so_lan_mua")
              }
            >
              <option value="gmv">Theo giá trị (GMV)</option>
              <option value="so_lan_mua">Theo số lần mua</option>
            </select>
          </div>
          <div className="overview-card-body">
            <TopProductsTable sortBy={productSortBy} />
          </div>
        </div>

        {/* Bảng thứ 4 - Thống kê chi tiết */}
        <div className="overview-card">
          <div className="overview-card-header">
            <span className="material-symbols-outlined">assessment</span>
            <h3>THỐNG KÊ CHI TIẾT</h3>
          </div>
          <div className="overview-card-body">
            <EmployeeStatsTable
              fromDate={statsFromDate}
              toDate={statsToDate}
              onFilterChange={handleStatsFilterChange}
              defaultFilterType="today"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Component Bảng mục tiêu FN của nhân viên
function MyFNTargetTable({
  onOpportunityClick,
}: {
  onOpportunityClick: () => void;
}) {
  const { data, isLoading, error } = useMyFNTargetData();

  if (isLoading) {
    return (
      <div className="table-loading">
        <span className="material-symbols-outlined spinning">
          progress_activity
        </span>
        <p>Đang tải dữ liệu...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <span className="material-symbols-outlined">error</span>
        <p>Không thể tải dữ liệu mục tiêu</p>
      </div>
    );
  }

  if (!data || !data.data) {
    return (
      <div className="empty-state">
        <span className="material-symbols-outlined">inbox</span>
        <p>Không có dữ liệu</p>
      </div>
    );
  }

  const targetData = data.data;

  return (
    <div className="my-fn-target-container">
      <table className="stats-table">
        <thead>
          <tr>
            {/* <th>Kết quả hôm qua</th>
            <th>Số đơn hôm qua</th>
            <th>AOV hôm qua</th> */}
            <th>Cơ hội hôm nay</th>
            <th>Tỉ lệ chuyển đổi</th>
            <th>Số đơn dự kiến</th>
            <th>AOV dự kiến</th>
            <th>Doanh số dự kiến</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {/* <td className="value-highlight">
              {targetData.doanh_so_yesterday.toLocaleString("vi-VN")}đ
            </td>
            <td>{targetData.so_don_yesterday}</td>
            <td>{targetData.aov_yesterday.toLocaleString("vi-VN")}đ</td> */}
            <td
              className="value-highlight"
              onClick={onOpportunityClick}
              style={{ cursor: "pointer" }}
              title="Bấm để xem danh sách khách hàng"
            >
              {targetData.co_hoi}
            </td>
            <td>{targetData.ti_le_chuyen_doi.toFixed(2)}%</td>
            <td>{targetData.so_don_du_kien.toFixed(2)}</td>
            <td>{targetData.aov_du_kien.toLocaleString("vi-VN")}đ</td>
            <td className="value-highlight success">
              {targetData.doanh_so_du_kien.toLocaleString("vi-VN")}đ
            </td>
          </tr>
        </tbody>
      </table>

      {/* Thông tin chi tiết phân cấp khách hàng */}
      <div style={{ marginTop: "16px", fontSize: "12px", color: "#6b7280" }}>
        <p>
          <strong>Chi tiết phân cấp khách hàng:</strong>
        </p>
        <p style={{ marginTop: "6px", lineHeight: "1.6" }}>
          • Cấp 1 (mua 1 lần): <strong>{targetData.cap1}</strong> khách - Tỉ lệ{" "}
          <strong>5%</strong>
        </p>
        <p style={{ marginTop: "4px", lineHeight: "1.6" }}>
          • Cấp 2 (mua 2-4 lần): <strong>{targetData.cap2}</strong> khách - Tỉ
          lệ <strong>6.5%</strong>
        </p>
        <p style={{ marginTop: "4px", lineHeight: "1.6" }}>
          • Cấp 3 (mua 5-9 lần): <strong>{targetData.cap3}</strong> khách - Tỉ
          lệ <strong>9%</strong>
        </p>
        <p style={{ marginTop: "4px", lineHeight: "1.6" }}>
          • Cấp 4 (mua 10-19 lần): <strong>{targetData.cap4}</strong> khách - Tỉ
          lệ <strong>10%</strong>
        </p>
        <p style={{ marginTop: "4px", lineHeight: "1.6" }}>
          • Cấp 5 (mua ≥20 lần): <strong>{targetData.cap5}</strong> khách - Tỉ
          lệ <strong>30%</strong>
        </p>
      </div>
    </div>
  );
}

// Component Top Sản Phẩm
function TopProductsTable({ sortBy }: { sortBy: "gmv" | "so_lan_mua" }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Hook tìm kiếm sản phẩm
  const { data: searchResults } = useSearchProducts(searchQuery);

  // Hook lấy khách hàng mua sản phẩm
  const {
    data: customers,
    isLoading,
    error,
  } = useProductCustomers(
    selectedProduct?.code_product || "",
    sortBy,
    !!selectedProduct,
  );

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product);
    setSearchQuery(product.name_product);
    setShowSuggestions(false);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowSuggestions(value.length >= 2);

    // Reset selected product nếu xóa search
    if (value.length === 0) {
      setSelectedProduct(null);
    }
  };

  // Nếu chưa chọn sản phẩm, hiển thị form tìm kiếm
  if (!selectedProduct) {
    return (
      <div className="product-search-container">
        <div className="search-input-wrapper">
          <span className="material-symbols-outlined search-icon">search</span>
          <input
            type="text"
            className="product-search-input"
            placeholder="Nhập tên sản phẩm để tìm kiếm..."
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => searchQuery.length >= 2 && setShowSuggestions(true)}
          />
          {searchQuery && (
            <button
              className="clear-search-btn"
              onClick={() => {
                setSearchQuery("");
                setSelectedProduct(null);
                setShowSuggestions(false);
              }}
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
        </div>

        {showSuggestions && searchResults && searchResults.length > 0 && (
          <div className="product-suggestions">
            {searchResults.map((product) => (
              <div
                key={product.id_product}
                className="suggestion-item"
                onClick={() => handleProductSelect(product)}
              >
                <div className="suggestion-code">{product.code_product}</div>
                <div className="suggestion-name">{product.name_product}</div>
                <div className="suggestion-price">
                  {new Intl.NumberFormat("vi-VN").format(product.price)} đ
                </div>
              </div>
            ))}
          </div>
        )}

        {showSuggestions &&
          searchQuery.length >= 2 &&
          searchResults &&
          searchResults.length === 0 && (
            <div className="no-suggestions">
              <span className="material-symbols-outlined">inventory_2</span>
              <p>Không tìm thấy sản phẩm nào</p>
            </div>
          )}

        {!searchQuery && (
          <div className="search-placeholder">
            <span className="material-symbols-outlined">inventory_2</span>
            <p>Tìm kiếm sản phẩm để xem danh sách khách hàng đã mua</p>
          </div>
        )}
      </div>
    );
  }

  // Đã chọn sản phẩm, hiển thị danh sách khách hàng
  if (isLoading) {
    return (
      <div className="product-info-header">
        <div className="selected-product-info">
          <div className="product-code-badge">
            {selectedProduct.code_product}
          </div>
          <div className="product-name-text">
            {selectedProduct.name_product}
          </div>
          <button
            className="change-product-btn"
            onClick={() => {
              setSelectedProduct(null);
              setSearchQuery("");
            }}
          >
            <span className="material-symbols-outlined">edit</span>
            Đổi sản phẩm
          </button>
        </div>
        <div className="table-loading">
          <span className="material-symbols-outlined spinning">
            progress_activity
          </span>
          <p>Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="product-info-header">
        <div className="selected-product-info">
          <div className="product-code-badge">
            {selectedProduct.code_product}
          </div>
          <div className="product-name-text">
            {selectedProduct.name_product}
          </div>
          <button
            className="change-product-btn"
            onClick={() => {
              setSelectedProduct(null);
              setSearchQuery("");
            }}
          >
            <span className="material-symbols-outlined">edit</span>
            Đổi sản phẩm
          </button>
        </div>
        <div className="error-state">
          <span className="material-symbols-outlined">error</span>
          <p>Không thể tải dữ liệu khách hàng</p>
        </div>
      </div>
    );
  }

  if (!customers || customers.length === 0) {
    return (
      <div className="product-info-header">
        <div className="selected-product-info">
          <div className="product-code-badge">
            {selectedProduct.code_product}
          </div>
          <div className="product-name-text">
            {selectedProduct.name_product}
          </div>
          <button
            className="change-product-btn"
            onClick={() => {
              setSelectedProduct(null);
              setSearchQuery("");
            }}
          >
            <span className="material-symbols-outlined">edit</span>
            Đổi sản phẩm
          </button>
        </div>
        <div className="empty-state">
          <span className="material-symbols-outlined">people_outline</span>
          <p>Chưa có khách hàng nào mua sản phẩm này</p>
        </div>
      </div>
    );
  }

  return (
    <div className="product-customers-container">
      <div className="selected-product-info">
        {/* <div className="product-code-badge">{selectedProduct.code_product}</div> */}
        <div className="product-name-text">{selectedProduct.name_product}</div>
        <button
          className="change-product-btn"
          onClick={() => {
            setSelectedProduct(null);
            setSearchQuery("");
          }}
        >
          <span className="material-symbols-outlined">edit</span>
          Đổi sản phẩm
        </button>
      </div>

      <div className="customers-table-wrapper">
        <table className="customers-table">
          <thead>
            <tr>
              <th>TT</th>
              <th>Mã KH</th>
              <th>Tên</th>
              <th>Số lần mua</th>
              <th>Số lượng</th>
              <th>GMV</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.code_customer}>
                <td>{customer.stt}</td>
                <td className="customer-code">
                  {(customer.code_customer || "...").replace(/^KH/, "")}
                </td>
                <td className="customer-name">
                  {customer.name_customer || "..."}
                </td>
                <td className="customer-orders">{customer.so_lan_mua}</td>
                <td className="customer-quantity">{customer.so_luong}</td>
                <td className="customer-gmv">
                  {new Intl.NumberFormat("vi-VN").format(customer.gmv)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Component Thống kê theo vùng miền
function RegionStatsTable() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useEmployeeRegionStats();

  // Hàm format tên vùng miền
  const formatRegionName = (mien: string): string => {
    switch (mien) {
      case "BẮC":
        return "Miền Bắc";
      case "TRUNG":
        return "Miền Trung";
      case "NAM":
        return "Miền Nam";
      case "NƯỚC NGOÀI":
        return "Nước ngoài";
      case "Chưa xác định":
        return "Chưa xác định";
      default:
        return mien;
    }
  };

  if (isLoading) {
    return (
      <div className="table-loading">
        <span className="material-symbols-outlined spinning">
          progress_activity
        </span>
        <p>Đang tải dữ liệu...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-state">
        <span className="material-symbols-outlined">error</span>
        <p>Không thể tải dữ liệu vùng miền</p>
      </div>
    );
  }

  if (!data || !data.data || data.data.length === 0) {
    return (
      <div className="empty-state">
        <span className="material-symbols-outlined">public</span>
        <p>Không có dữ liệu vùng miền</p>
      </div>
    );
  }

  const handleViewDetail = (phan_loai: string) => {
    navigate(`/region-customers?mien=${encodeURIComponent(phan_loai)}`);
  };

  return (
    <div className="customers-table-wrapper">
      <table className="customers-table">
        <thead>
          <tr>
            <th>Phân loại</th>
            <th>Số khách hàng</th>
            <th>Tỷ trọng</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((region) => (
            <tr key={region.phan_loai}>
              <td style={{ textAlign: "left" }}>
                {formatRegionName(region.phan_loai)}
              </td>
              <td style={{ textAlign: "left" }}>{region.so_khach_hang}</td>
              <td style={{ textAlign: "left" }}>{region.ty_trong}%</td>
              <td>
                <button
                  className="view-detail-btn"
                  onClick={() => handleViewDetail(region.phan_loai)}
                >
                  <span className="material-symbols-outlined">visibility</span>
                  Chi tiết
                </button>
              </td>
            </tr>
          ))}
          {data.tong_khach_hang > 0 && (
            <tr>
              <td style={{ textAlign: "left" }}>
                <strong>Tổng</strong>
              </td>
              <td style={{ textAlign: "left" }}>
                <strong>{data.tong_khach_hang}</strong>
              </td>
              <td style={{ textAlign: "left" }}>
                <strong>100%</strong>
              </td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Component hiển thị Top Khách Hàng
function TopCustomersTable({ sortBy }: { sortBy: SortByType }) {
  const { data, isLoading, isError, error } = useTopCustomers(100, sortBy);
  const user = useAuthStore((state) => state.user);

  if (isLoading) {
    return (
      <div className="table-loading">
        <span className="material-symbols-outlined spinning">
          progress_activity
        </span>
        <p>Đang tải dữ liệu...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="table-error">
        <span className="material-symbols-outlined">error</span>
        <p>
          Lỗi khi tải dữ liệu:{" "}
          {error instanceof Error ? error.message : "Lỗi không xác định"}
        </p>
      </div>
    );
  }

  if (!data?.data || data.data.length === 0) {
    return (
      <div className="table-empty">
        <span className="material-symbols-outlined">folder_off</span>
        <p>Chưa có dữ liệu khách hàng</p>
      </div>
    );
  }

  return (
    <div className="customers-table-wrapper">
      <table className="customers-table">
        <thead>
          <tr>
            <th>TT</th>
            <th>Mã KH</th>
            <th>Tên</th>
            {/* <th>SĐT</th> */}
            <th>GMV</th>
            <th>Số lần mua</th>
          </tr>
        </thead>
        <tbody>
          {data.data.map((customer) => (
            <tr key={customer.id_kh}>
              <td>{customer.stt.toString().padStart(2, "0")}</td>
              <td className="customer-code">
                {(customer.ma_kh || "...").replace(/^KH/, "")}
              </td>
              <td className="customer-name">
                {customer.ten_khach_hang || "..."}
              </td>
              {/* <td>{customer.sdt || "..."}</td> */}
              <td className="customer-gmv">
                {(() => {
                  const totalGmv = customer.gmv || 0;
                  return totalGmv !== undefined && totalGmv !== null ? `${new Intl.NumberFormat("vi-VN").format(totalGmv)}` : "0";
                })()}
              </td>
              <td className="customer-orders">
                {customer.so_lan_mua || "..."}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Component Thống kê chi tiết cho nhân viên
interface EmployeeStatsTableProps {
  fromDate?: string;
  toDate?: string;
  onFilterChange: (from: string, to: string) => void;
  defaultFilterType?: "today" | "week" | "month" | "custom" | null;
}

function EmployeeStatsTable({
  fromDate,
  toDate,
  onFilterChange,
  defaultFilterType = "today",
}: EmployeeStatsTableProps) {
  const { data: statsData, isLoading } = useEmployeeOverview(fromDate, toDate);
  const user = useAuthStore((state) => state.user);

  if (isLoading) {
    return (
      <div className="stats-table-container">
        {/* Date Range Filter */}
        <div className="stats-filter">
          <DateRangeFilter
            onFilterChange={onFilterChange}
            defaultFilterType={defaultFilterType}
          />
        </div>

        {/* Loading State */}
        <div className="table-loading">
          <span className="material-symbols-outlined spinning">
            progress_activity
          </span>
          <p>Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  // Tính toán chênh lệch tuyệt đối với format phù hợp
  const calculateAbsoluteChange = (
    start: number,
    end: number,
    type: "integer" | "decimal" | "float3" = "integer",
  ): string => {
    const change = end - start;
    let formattedChange: string;

    if (type === "integer") {
      formattedChange = Math.round(change).toLocaleString("vi-VN");
    } else if (type === "decimal") {
      formattedChange = Math.round(change).toLocaleString("vi-VN");
    } else if (type === "float3") {
      formattedChange = change.toFixed(3);
    } else {
      formattedChange = change.toLocaleString("vi-VN");
    }

    return `${change >= 0 ? "+" : ""}${formattedChange}`;
  };

  // Tính toán tỉ lệ chuyển đổi = chênh lệch / đầu kỳ
  const calculateConversionRate = (start: number, end: number): string => {
    if (start === 0) return "0%";
    const change = end - start;
    const rate = (change / start) * 100;
    return `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}%`;
  };

  // Tính toán các chỉ số phái sinh dựa trên role_id
  const getDerivedStats = () => {
    if (!statsData) return null;

    const isAdmin = user?.role_id === 1;

    // Số đơn hàng
    const donHangStart = isAdmin 
      ? statsData.so_don_hang_dau_ky 
      : Math.max(0, statsData.so_don_hang_dau_ky - (statsData.don_hang_truoc_2026_dau_ky || 0));
    const donHangEnd = isAdmin 
      ? statsData.so_don_hang_cuoi_ky 
      : Math.max(0, statsData.so_don_hang_cuoi_ky - (statsData.don_hang_truoc_2026_cuoi_ky || 0));

    // Tổng GMV
    const gmvStart = isAdmin
      ? statsData.gmv_dau_ky + (statsData.gmv_truoc_2026 || 0)
      : statsData.gmv_dau_ky;
    const gmvEnd = isAdmin
      ? statsData.gmv_cuoi_ky + (statsData.gmv_truoc_2026 || 0)
      : statsData.gmv_cuoi_ky;

    // ARPU
    const arpuStart = donHangStart > 0 ? gmvStart / donHangStart : 0;
    const arpuEnd = donHangEnd > 0 ? gmvEnd / donHangEnd : 0;

    // PF
    const pfStart = statsData.tong_khach_hang_dau_ky > 0 ? donHangStart / statsData.tong_khach_hang_dau_ky : 0;
    const pfEnd = statsData.tong_khach_hang_cuoi_ky > 0 ? donHangEnd / statsData.tong_khach_hang_cuoi_ky : 0;

    return {
      donHangStart, donHangEnd,
      gmvStart, gmvEnd,
      arpuStart, arpuEnd,
      pfStart, pfEnd
    };
  };

  const derivedStats = getDerivedStats();

  const statsTableData = [
    {
      key: "01",
      label: "Tổng Khách Hàng",
      startValue: isLoading
        ? "..."
        : statsData?.tong_khach_hang_dau_ky.toLocaleString("vi-VN") || "0",
      endValue: isLoading
        ? "..."
        : statsData?.tong_khach_hang_cuoi_ky.toLocaleString("vi-VN") || "0",
      change:
        isLoading || !statsData
          ? "..."
          : calculateAbsoluteChange(
              statsData.tong_khach_hang_dau_ky,
              statsData.tong_khach_hang_cuoi_ky,
            ),
      conversionRate:
        isLoading || !statsData
          ? "..."
          : calculateConversionRate(
              statsData.tong_khach_hang_dau_ky,
              statsData.tong_khach_hang_cuoi_ky,
            ),
    },
    {
      key: "02",
      label: "Số Đơn Hàng",
      startValue: !derivedStats
        ? "..."
        : derivedStats.donHangStart.toLocaleString("vi-VN"),
      endValue: !derivedStats
        ? "..."
        : derivedStats.donHangEnd.toLocaleString("vi-VN"),
      change:
        !derivedStats
          ? "..."
          : calculateAbsoluteChange(
              derivedStats.donHangStart,
              derivedStats.donHangEnd,
            ),
      conversionRate:
        !derivedStats
          ? "..."
          : calculateConversionRate(
              derivedStats.donHangStart,
              derivedStats.donHangEnd,
            ),
    },
    {
      key: "03",
      label: "Tổng GMV",
      startValue: !derivedStats
        ? "..."
        : derivedStats.gmvStart.toLocaleString("vi-VN"),
      endValue: !derivedStats
        ? "..."
        : derivedStats.gmvEnd.toLocaleString("vi-VN"),
      change:
        !derivedStats
          ? "..."
          : calculateAbsoluteChange(
              derivedStats.gmvStart,
              derivedStats.gmvEnd,
            ),
      conversionRate:
        !derivedStats
          ? "..."
          : calculateConversionRate(
              derivedStats.gmvStart,
              derivedStats.gmvEnd,
            ),
    },
    {
      key: "04",
      label: "ARPU",
      startValue: !derivedStats
        ? "..."
        : derivedStats.arpuStart.toLocaleString("vi-VN", {
            maximumFractionDigits: 0,
          }),
      endValue: !derivedStats
        ? "..."
        : derivedStats.arpuEnd.toLocaleString("vi-VN", {
            maximumFractionDigits: 0,
          }),
      change:
        !derivedStats
          ? "..."
          : calculateAbsoluteChange(
              derivedStats.arpuStart,
              derivedStats.arpuEnd,
              "integer",
            ),
      conversionRate:
        !derivedStats
          ? "..."
          : calculateConversionRate(
              derivedStats.arpuStart,
              derivedStats.arpuEnd,
            ),
    },
    {
      key: "05",
      label: "PF",
      startValue: !derivedStats ? "..." : derivedStats.pfStart.toFixed(3),
      endValue: !derivedStats ? "..." : derivedStats.pfEnd.toFixed(3),
      change:
        !derivedStats
          ? "..."
          : calculateAbsoluteChange(
              derivedStats.pfStart,
              derivedStats.pfEnd,
              "float3",
            ),
      conversionRate:
        !derivedStats
          ? "..."
          : calculateConversionRate(derivedStats.pfStart, derivedStats.pfEnd),
    },
  ];

  return (
    <div className="stats-table-container">
      {/* Date Range Filter */}
      <div className="stats-filter">
        <DateRangeFilter
          onFilterChange={onFilterChange}
          defaultFilterType={defaultFilterType}
        />
      </div>

      {/* Stats Table */}
      <table className="stats-table">
        <thead>
          <tr>
            <th>TT</th>
            <th>Chỉ số</th>
            <th>Đầu kỳ</th>
            <th>Cuối kỳ</th>
            <th>Chênh lệch</th>
            {/* <th>Tỉ lệ chuyển đổi</th> */}
          </tr>
        </thead>
        <tbody>
          {statsTableData.map((item) => (
            <tr key={item.key}>
              <td>{item.key}</td>
              <td className="stats-label">{item.label}</td>
              <td>{item.startValue}</td>
              <td>{item.endValue}</td>
              <td
                className={
                  item.change.startsWith("+")
                    ? "positive"
                    : item.change.startsWith("-")
                      ? "negative"
                      : ""
                }
              >
                {item.change}
              </td>
              {/* <td
                className={
                  item.conversionRate.startsWith("+")
                    ? "positive"
                    : item.conversionRate.startsWith("-")
                      ? "negative"
                      : ""
                }
              >
                {item.conversionRate}
              </td> */}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default CustomerManagement;
