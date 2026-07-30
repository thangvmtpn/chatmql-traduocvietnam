import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User } from "@/stores/useAuthStore";
import Sidebar from "@/components/Sidebar/Sidebar";
import Header from "@/components/Header/Header";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import DateRangeFilter from "@/components/DateRangeFilter/DateRangeFilter";
import {
  useManagerOverview,
  useManagerPerformance,
  useManagerCustomerManagement,
  useAdminTopProducts,
} from "@/hooks/useDashboard";
import "./ManagerLayout.css";

interface AdminLayoutProps {
  user: User;
}

// Hàm tiện ích kiểm tra quyền hạn (sử dụng mảng số, ví dụ [201, 202, 203])
const hasPermission = (permissions: number[] | undefined, permId: number) => {
  if (!permissions || !Array.isArray(permissions)) return false;
  return permissions.includes(permId);
};

function ManagerLayout({ user }: AdminLayoutProps) {
  const navigate = useNavigate();

  // State cho date range filter
  const today = new Date().toISOString().split("T")[0];
  // State cho overview section
  const [overviewFromDate, setOverviewFromDate] = useState(today);
  const [overviewToDate, setOverviewToDate] = useState(today);
  // State cho performance section
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  // State cho top products
  const [productSortBy, setProductSortBy] = useState<"gmv" | "so_lan_mua">(
    "gmv",
  );
  // State cho date range filter của top products
  const [productFromDate, setProductFromDate] = useState(today);
  const [productToDate, setProductToDate] = useState(today);

  // Handler khi product filter thay đổi
  const handleProductFilterChange = (from: string, to: string) => {
    setProductFromDate(from);
    setProductToDate(to);
  };

  // Lấy dữ liệu overview từ backend với date range
  const { data: overviewData, isLoading: isLoadingOverview } =
    useManagerOverview(overviewFromDate, overviewToDate);

  // Lấy dữ liệu dashboard từ backend với date range
  const { data: performanceData, isLoading } = useManagerPerformance(
    fromDate,
    toDate,
  );

  // Lấy dữ liệu quản lý khách hàng từ backend với role_id = 4
  const { data: customerData, isLoading: isLoadingCustomer } =
    useManagerCustomerManagement(4);

  // Lấy dữ liệu top sản phẩm
  const { data: topProductsData, isLoading: isLoadingProducts } =
    useAdminTopProducts(100, productSortBy, productFromDate, productToDate);

  // Handler khi overview filter thay đổi
  const handleOverviewFilterChange = (from: string, to: string) => {
    setOverviewFromDate(from);
    setOverviewToDate(to);
  };

  // Handler khi performance filter thay đổi
  const handleFilterChange = (from: string, to: string) => {
    setFromDate(from);
    setToDate(to);
  };

  // Tính toán chênh lệch (số nguyên)
  const calculatePercentChange = (start: number, end: number): string => {
    const change = end - start;
    if (change === 0) return "0";

    // Nếu chênh lệch là số thập phân (nhỏ hơn 1), dùng toLocaleString để định dạng
    if (Math.abs(change) < 1) {
      return `${change >= 0 ? "+" : ""}${change.toLocaleString("vi-VN", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
    }

    // Nếu chênh lệch là số nguyên hoặc lớn hơn 1, dùng toLocaleString
    return `${change >= 0 ? "+" : ""}${change.toLocaleString("vi-VN").replace(/,/g, ".")}`;
  };

  // ── GMV display helpers ──────────────────────────────────────────────────
  // Tổng sao tính theo gmv_truoc_2026_cuoi_ky (dữ liệu tích luỹ trước 2026)
  const totalStars =
    !isLoadingOverview &&
    overviewData &&
    overviewData.gmv_truoc_2026_cuoi_ky > 0
      ? overviewData.gmv_truoc_2026_cuoi_ky / 1_000_000
      : null;
  // Tổng lá tính theo don_hang_truoc_2026_cuoi_ky (trước 2026: 1 đơn = 1 lá)
  const totalLeaves =
    !isLoadingOverview &&
    overviewData &&
    overviewData.don_hang_truoc_2026_cuoi_ky > 0
      ? overviewData.don_hang_truoc_2026_cuoi_ky
      : null;
  // ─────────────────────────────────────────────────────────────────────────

  // Chuẩn bị dữ liệu cho bảng tổng quan
  const overviewTableData = [
    {
      key: "01",
      label: "Số khách hàng phụ trách",
      startValue: isLoadingOverview
        ? "..."
        : overviewData?.so_khach_hang_phu_trach_dau_ky.toLocaleString(
            "vi-VN",
          ) || "0",
      endValue: isLoadingOverview
        ? "..."
        : overviewData?.so_khach_hang_phu_trach_cuoi_ky.toLocaleString(
            "vi-VN",
          ) || "0",
      change:
        isLoadingOverview || !overviewData
          ? "..."
          : calculatePercentChange(
              overviewData.so_khach_hang_phu_trach_dau_ky,
              overviewData.so_khach_hang_phu_trach_cuoi_ky,
            ),
    },
    {
      key: "02",
      label: (
        <span>
          Số đơn hàng trong kỳ
          {totalLeaves !== null && totalLeaves > 0 ? (
            <span
              style={{
                color: "#16a34a",
                marginLeft: "4px",
                fontWeight: "bold",
              }}
            >
              ({totalLeaves.toLocaleString("vi-VN")} 🍃)
            </span>
          ) : null}
        </span>
      ),
      startValue: isLoadingOverview
        ? "..."
        : (
            (overviewData?.so_don_hang_dau_ky ?? 0) -
            (overviewData?.don_hang_truoc_2026_dau_ky ?? 0)
          ).toLocaleString("vi-VN"),
      endValue: isLoadingOverview
        ? "..."
        : (
            (overviewData?.so_don_hang_cuoi_ky ?? 0) -
            (overviewData?.don_hang_truoc_2026_cuoi_ky ?? 0)
          ).toLocaleString("vi-VN"),
      change:
        isLoadingOverview || !overviewData
          ? "..."
          : calculatePercentChange(
              overviewData.so_don_hang_dau_ky -
                overviewData.don_hang_truoc_2026_dau_ky,
              overviewData.so_don_hang_cuoi_ky -
                overviewData.don_hang_truoc_2026_cuoi_ky,
            ),
    },
    {
      key: "03",
      label: (
        <span>
          Tổng GMV
          {totalStars !== null && totalStars > 0 ? (
            <span
              style={{
                color: "#fbbf24",
                marginLeft: "4px",
                fontWeight: "bold",
              }}
            >
              (
              {totalStars.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}
              ★)
            </span>
          ) : null}
        </span>
      ),
      startValue: isLoadingOverview
        ? "..."
        : overviewData?.gmv_dau_ky.toLocaleString("vi-VN") || "0",
      endValue: isLoadingOverview
        ? "..."
        : overviewData?.gmv_cuoi_ky.toLocaleString("vi-VN") || "0",
      change:
        isLoadingOverview || !overviewData
          ? "..."
          : calculatePercentChange(
              overviewData.gmv_dau_ky,
              overviewData.gmv_cuoi_ky,
            ),
    },
    {
      key: "04",
      label: "ARPU",
      startValue: isLoadingOverview
        ? "..."
        : overviewData?.arpu_dau_ky.toLocaleString("vi-VN", {
            maximumFractionDigits: 0,
          }) || "0",
      endValue: isLoadingOverview
        ? "..."
        : overviewData?.arpu_cuoi_ky.toLocaleString("vi-VN", {
            maximumFractionDigits: 0,
          }) || "0",
      change:
        isLoadingOverview || !overviewData
          ? "..."
          : calculatePercentChange(
              Math.round(overviewData.arpu_dau_ky),
              Math.round(overviewData.arpu_cuoi_ky),
            ),
    },
    {
      key: "05",
      label: "PF",
      startValue: isLoadingOverview
        ? "..."
        : overviewData?.pf_dau_ky.toLocaleString("vi-VN", {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3,
          }) || "0",
      endValue: isLoadingOverview
        ? "..."
        : overviewData?.pf_cuoi_ky.toLocaleString("vi-VN", {
            minimumFractionDigits: 3,
            maximumFractionDigits: 3,
          }) || "0",
      change:
        isLoadingOverview || !overviewData
          ? "..."
          : calculatePercentChange(
              Math.round(overviewData.pf_dau_ky * 1000) / 1000,
              Math.round(overviewData.pf_cuoi_ky * 1000) / 1000,
            ),
    },
  ];

  // Chuẩn bị dữ liệu cho bảng quản lý khách hàng
  const customerManagementData = [
    {
      key: "01",
      label: "Số khách hàng đang quản lý",
      value: isLoadingCustomer
        ? "..."
        : customerData?.so_khach_hang_dang_quan_ly.toLocaleString("vi-VN") ||
          "0",
      filter: "all" as const,
    },
    {
      key: "02",
      label: "Số khách hàng đã bàn giao",
      value: isLoadingCustomer
        ? "..."
        : customerData?.so_khach_hang_da_ban_giao.toLocaleString("vi-VN") ||
          "0",
      filter: "handed_over" as const,
    },
    {
      key: "03",
      label: "Số khách hàng chưa bàn giao",
      value: isLoadingCustomer
        ? "..."
        : customerData?.so_khach_hang_chua_ban_giao.toLocaleString("vi-VN") ||
          "0",
      filter: "not_handed_over" as const,
    },
    {
      key: "04",
      label: "Số nhân sự đang phụ trách",
      value: isLoadingCustomer
        ? "..."
        : customerData?.so_nhan_su_dang_phu_trach.toLocaleString("vi-VN") ||
          "0",
      filter: null,
    },
  ];

  // Chuẩn bị dữ liệu cho bảng performance
  const performanceTableData = [
    {
      key: "01",
      label: "Số đơn hàng",
      value: isLoading
        ? "..."
        : performanceData?.so_don_hang.toLocaleString("vi-VN") || "0",
      target: "-",
    },
    {
      key: "02",
      label: "Doanh số",
      value: isLoading
        ? "..."
        : performanceData?.doanh_so.toLocaleString("vi-VN") || "0",
      target: "-",
    },
    {
      key: "03",
      label: "AOV",
      value: isLoading
        ? "..."
        : performanceData?.aov.toLocaleString("vi-VN") || "0",
      target: "-",
    },
    {
      key: "04",
      label: "Chi phí bán hàng",
      value: "-",
      target: "-",
    },
  ];

  return (
    <div className="manager-layout">
      <Header
        title="TRANG QUẢN TRỊ - CẤP VỤ MANAGER"
        userName={user?.name || "Manager01"}
      />

      <div className="manager-container">
        {/* Sidebar Component */}
        <Sidebar user={user} />

        {/* Main Content */}
        <main className="main-content">
          <Breadcrumb />
          {/* Tổng quan quản trị theo chỉ số quan trọng & TOP SẢN PHẨM BÁN CHẠY */}
          <div className="content-grid">
            {/* Tổng quan quản trị theo chỉ số quan trọng */}
            <div className="content-card">
              <div className="content-card-header">
                <span className="material-symbols-outlined">leaderboard</span>
                <h3>TỔNG QUAN QUẢN TRỊ THEO CHỈ SỐ QUAN TRỌNG</h3>
              </div>
              <div className="content-card-body">
                {/* Date Range Filter */}
                <div
                  style={{ padding: "16px", borderBottom: "1px solid #e5e7eb" }}
                >
                  <DateRangeFilter
                    onFilterChange={handleOverviewFilterChange}
                    defaultFilterType="today"
                  />
                </div>

                <table className="data-table">
                  <thead>
                    <tr>
                      <th>TT</th>
                      <th>Chỉ số vận hành</th>
                      <th>Đầu Kỳ</th>
                      <th>Cuối kỳ</th>
                      <th>Chênh lệch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overviewTableData.map((item) => (
                      <tr key={item.key}>
                        <td>{item.key}</td>
                        <td>{item.label}</td>
                        <td>{item.startValue}</td>
                        <td className="value-highlight">{item.endValue}</td>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {/* Tổng quan quản trị khách hàng & nhân sự */}
            <div className="content-card">
              <div className="content-card-header">
                <span className="material-symbols-outlined">groups</span>
                <h3>TỔNG QUAN QUẢN TRỊ KHÁCH HÀNG & NHÂN SỰ</h3>
              </div>
              <div className="content-card-body">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>TT</th>
                      <th>Tổng quan quản trị khách hàng & nhân sự</th>
                      <th>Số liệu</th>
                      <th>Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerManagementData.map((item) => (
                      <tr key={item.key}>
                        <td>{item.key}</td>
                        <td>{item.label}</td>
                        <td className="value-highlight">{item.value}</td>
                        <td>
                          {item.filter ? (
                            <button
                              className="invoice-view-btn"
                              onClick={(e) => {
                                e.preventDefault();
                                navigate(`/customers?filter=${item.filter}`);
                              }}
                            >
                              <span className="material-symbols-outlined">
                                visibility
                              </span>
                              Chi tiết
                            </button>
                          ) : (
                            <span></span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Tổng quan kết quả kinh doanh theo kỳ và Quản trị khách hàng & nhân sự */}
          <div className="content-grid">
            {/* Tổng quan kết quả kinh doanh theo kỳ */}
            <div className="content-card">
              <div className="content-card-header">
                <span className="material-symbols-outlined">insights</span>
                <h3>TỔNG QUAN KẾT QUẢ KINH DOANH THEO KỲ</h3>
              </div>
              <div className="content-card-body">
                {/* Date Range Filter */}
                <div
                  style={{ padding: "16px", borderBottom: "1px solid #e5e7eb" }}
                >
                  <DateRangeFilter
                    onFilterChange={handleFilterChange}
                    defaultFilterType="today"
                  />
                </div>

                <table className="data-table">
                  <thead>
                    <tr>
                      <th>TT</th>
                      <th>Chỉ số</th>
                      <th>Số</th>
                      <th>Tỉ trọng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performanceTableData.map((item) => (
                      <tr key={item.key}>
                        <td>{item.key}</td>
                        <td>{item.label}</td>
                        <td className="value-highlight">{item.value}</td>
                        <td>{item.target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* TOP SẢN PHẨM BÁN CHẠY */}
            <div className="content-card">
              <div className="content-card-header">
                <span className="material-symbols-outlined">analytics</span>
                <h3>TOP SẢN PHẨM BÁN CHẠY</h3>
                <select
                  value={productSortBy}
                  onChange={(e) =>
                    setProductSortBy(e.target.value as "gmv" | "so_lan_mua")
                  }
                  style={{
                    marginLeft: "auto",
                    padding: "6px 10px",
                    borderRadius: "4px",
                    border: "1px solid #e5e7eb",
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                  className="sort-select"
                >
                  <option value="gmv">Theo giá trị (GMV)</option>
                  <option value="so_lan_mua">Theo số lần bán</option>
                </select>
              </div>
              <div className="content-card-body">
                {/* Date Range Filter */}
                <div
                  style={{ padding: "16px", borderBottom: "1px solid #e5e7eb" }}
                >
                  <DateRangeFilter
                    onFilterChange={handleProductFilterChange}
                    defaultFilterType="today"
                  />
                </div>

                {isLoadingProducts ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "40px",
                      gap: "12px",
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: "48px",
                        color: "#9ca3af",
                        animation: "spin 1s linear infinite",
                      }}
                    >
                      progress_activity
                    </span>
                    <p style={{ color: "#6b7280" }}>Đang tải dữ liệu...</p>
                  </div>
                ) : !topProductsData || topProductsData.data.length === 0 ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "40px",
                      gap: "12px",
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "48px", color: "#9ca3af" }}
                    >
                      inventory_2
                    </span>
                    <p style={{ color: "#6b7280" }}>Chưa có dữ liệu sản phẩm</p>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto", maxHeight: "350px" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: "50px" }}>STT</th>
                          <th>Mã SKU</th>
                          <th style={{ minWidth: "140px", textAlign: "left" }}>
                            Tên sản phẩm
                          </th>
                          <th style={{ width: "120px" }}>Số lần bán</th>
                          <th style={{ width: "120px" }}>GMV</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProductsData.data.slice(0, 10).map((product) => (
                          <tr key={product.code_product}>
                            <td>{product.stt}</td>
                            <td>{product.code_product}</td>
                            <td style={{ textAlign: "left" }}>
                              {product.name_product}
                            </td>
                            <td>
                              {product.so_lan_ban.toLocaleString("vi-VN")}
                            </td>
                            <td className="value-highlight">
                              {product.gmv.toLocaleString("vi-VN")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default ManagerLayout;
