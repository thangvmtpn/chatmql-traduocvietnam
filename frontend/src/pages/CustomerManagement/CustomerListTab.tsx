import { useState, useEffect, Fragment } from "react";
import { useCustomersList } from "@/hooks/useDashboard";
import { CustomerDetail as CustomerDetailType } from "@/types/api";
import CustomerDetail from "@/components/CustomerDetail/CustomerDetail";
import { SearchTab } from "./SearchTab";
import useAuthStore from "@/stores/useAuthStore";
import { VipBadge, AOVBadge, CombinedVipBadge } from "@/components/CustomerBadges/CustomerBadges";

interface CustomerListTabProps {
  searchCustomerId?: string;
  searchPhoneNumber?: string;
  showAllCustomers?: boolean;
  onShowAllCustomersChange?: (show: boolean) => void;
}

function CustomerListTab({
  searchCustomerId = "",
  searchPhoneNumber = "",
  showAllCustomers = false,
  onShowAllCustomersChange,
}: CustomerListTabProps) {
  const user = useAuthStore((state) => state.user);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [updatedCustomers, setUpdatedCustomers] = useState<
    Map<number, CustomerDetailType>
  >(new Map());

  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);

  // State cho sort
  const [sortColumn, setSortColumn] = useState<
    "gmv" | "so_lan_mua" | "tham_nien" | "cap_vip" | "recency" | null
  >("gmv");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // State cho 2 dropdown sort filter
  const [sortType, setSortType] = useState<"none" | "gmv" | "so_lan_mua" | "cap_vip" | "recency">(
    "gmv",
  ); // Loại sort: GMV, Số lần mua, Cấp VIP hoặc Recency
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc"); // Hướng sort: Tăng hay Giảm

  // Reset to page 1 when search params change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchCustomerId, searchPhoneNumber]);

  // Luôn lấy tất cả khách hàng của nhân viên đang quản lý
  const { data, isLoading, error } = useCustomersList(
    "all",
    currentPage,
    pageSize,
    searchCustomerId,
    searchPhoneNumber,
    undefined, // gmvMin
    undefined, // gmvMax
    undefined, // pfMin
    undefined, // pfMax
    undefined, // aovMin
    undefined, // aovMax
    undefined, // mien
    undefined, // nhomKh
    undefined, // staffId
    sortColumn || undefined, // sortBy
    sortDirection, // sortOrder
    showAllCustomers, // csLaiToday - filter khách hàng có thời gian chăm sóc lại = hôm nay
  );

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleRowClick = (customerId: string) => {
    setSelectedCustomerId(
      selectedCustomerId === customerId ? null : customerId,
    );
  };

  const handleCustomerUpdate = (updatedCustomer: CustomerDetailType) => {
    setUpdatedCustomers((prev) =>
      new Map(prev).set(updatedCustomer.id_kh, updatedCustomer),
    );
  };

  // Function handle sort column click
  const handleSortClick = (column: "gmv" | "so_lan_mua" | "tham_nien" | "cap_vip" | "recency") => {
    if (sortColumn === column) {
      // Nếu click cùng cột, đảo hướng sort
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Nếu click cột khác, set cột mới và mặc định sort desc
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  // Handle dropdown sort change
  const handleSortTypeChange = (value: string) => {
    setSortType(value as "none" | "gmv" | "so_lan_mua" | "cap_vip" | "recency");

    if (value === "none") {
      setSortColumn(null);
      setSortDirection("desc");
    } else if (value === "gmv") {
      setSortColumn("gmv");
      setSortDirection(sortOrder);
    } else if (value === "so_lan_mua") {
      setSortColumn("so_lan_mua");
      setSortDirection(sortOrder);
    } else if (value === "cap_vip") {
      setSortColumn("cap_vip");
      setSortDirection(sortOrder);
    } else if (value === "recency") {
      setSortColumn("recency");
      setSortDirection(sortOrder);
    }
  };

  const handleSortOrderChange = (value: string) => {
    setSortOrder(value as "asc" | "desc");

    if (sortType !== "none") {
      setSortDirection(value as "asc" | "desc");
    }
  };

  const calculateAge = (birthDate?: string): number | null => {
    if (!birthDate) return null;
    try {
      const birth = new Date(birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birth.getDate())
      ) {
        age--;
      }
      return age > 0 ? age : null;
    } catch {
      return null;
    }
  };

  return (
    <div className="customer-list-tab">
      <div className="customer-list-header">
        <div className="filter-buttons">
          <button
            className={!showAdvancedSearch ? "active" : ""}
            onClick={() => setShowAdvancedSearch(false)}
          >
            Danh sách
          </button>
          <button
            className={showAdvancedSearch ? "active" : ""}
            onClick={() => setShowAdvancedSearch(true)}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: "16px",
                verticalAlign: "middle",
                marginRight: "4px",
              }}
            >
              manage_search
            </span>
            Tìm kiếm chuyên sâu
          </button>
        </div>
      </div>

      {showAdvancedSearch && <SearchTab />}

      {!showAdvancedSearch && isLoading && (
        <div className="table-loading">
          <span className="material-symbols-outlined spinning">
            progress_activity
          </span>
          <p>Đang tải dữ liệu...</p>
        </div>
      )}

      {!showAdvancedSearch && error && (
        <div className="error-state">
          <span className="material-symbols-outlined">error</span>
          <p>Có lỗi xảy ra khi tải dữ liệu</p>
        </div>
      )}

      {!showAdvancedSearch && data && (
        <>
          {showAllCustomers && (
            <div className="opportunity-filter-banner">
              <div className="opportunity-filter-content">
                <div className="opportunity-filter-icon">
                  <span className="material-symbols-outlined">task_alt</span>
                </div>
                <div className="opportunity-filter-text">
                  <h4>Danh sách cơ hội chăm sóc hôm nay</h4>
                  <p>Hiển thị khách hàng cần chăm sóc lại trong ngày</p>
                </div>
                <button
                  className="opportunity-filter-close"
                  onClick={() => onShowAllCustomersChange?.(false)}
                  title="Thoát chế độ lọc cơ hội"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>
          )}

          <div className="customer-list-stats">
            <p>
              Hiển thị:{" "}
              <strong>
                {Math.min((currentPage - 1) * pageSize + 1, data.total)}-
                {Math.min(currentPage * pageSize, data.total)}
              </strong>{" "}
              / <strong>{data.total.toLocaleString("vi-VN")}</strong> khách hàng
            </p>
            <p>
              Trang {currentPage} / {data.total_pages}
            </p>
          </div>

          {/* Sort Dropdown Filter */}
          <div className="sort-filter-container">
            <div className="sort-filter-group">
              <label htmlFor="sort-type" className="sort-filter-label">
                <span className="material-symbols-outlined sort-icon">
                  sort
                </span>
                Sắp xếp theo:
              </label>
              <select
                id="sort-type"
                className="sort-filter-select"
                value={sortType}
                onChange={(e) => handleSortTypeChange(e.target.value)}
              >
                <option value="none">Chọn cột...</option>
                <option value="cap_vip">Cấp VIP</option>
                <option value="gmv">GMV</option>
                <option value="recency">Lần mua hàng cuối</option>
                <option value="so_lan_mua">Số lần mua</option>
              </select>
            </div>

            {sortType !== "none" && (
              <div className="sort-filter-group">
                <label htmlFor="sort-order" className="sort-filter-label">
                  <span className="material-symbols-outlined sort-icon">
                    {sortOrder === "asc" ? "arrow_upward" : "arrow_downward"}
                  </span>
                  Hướng:
                </label>
                <select
                  id="sort-order"
                  className="sort-filter-select"
                  value={sortOrder}
                  onChange={(e) => handleSortOrderChange(e.target.value)}
                >
                  <option value="asc">Tăng dần</option>
                  <option value="desc">Giảm dần</option>
                </select>
              </div>
            )}

            {sortType !== "none" && (
              <button
                className="sort-filter-reset-btn"
                onClick={() => {
                  setSortType("none");
                  setSortColumn(null);
                  setSortDirection("desc");
                }}
                title="Xóa sắp xếp"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            )}
          </div>

          <div className="table-container">
            <table className="customer-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Mã</th>
                  <th
                    style={{ cursor: "pointer", userSelect: "none" }}
                    onClick={() => handleSortClick("cap_vip")}
                    title="Click để sắp xếp"
                  >
                    Cấp VIP
                    {sortColumn === "cap_vip" && (
                      <span
                        className="material-symbols-outlined"
                        style={{
                          marginLeft: "4px",
                          fontSize: "16px",
                          verticalAlign: "middle",
                          color:
                            sortDirection === "asc" ? "#22c55e" : "#ef4444",
                        }}
                      >
                        {sortDirection === "asc"
                          ? "arrow_upward"
                          : "arrow_downward"}
                      </span>
                    )}
                  </th>
                  <th>Tên</th>
                  <th>SĐT</th>
                  <th>Địa chỉ</th>
                  <th
                    style={{ cursor: "pointer", userSelect: "none" }}
                    onClick={() => handleSortClick("gmv")}
                    title="Click để sắp xếp"
                  >
                    GMV
                    {sortColumn === "gmv" && (
                      <span
                        className="material-symbols-outlined"
                        style={{
                          marginLeft: "4px",
                          fontSize: "16px",
                          verticalAlign: "middle",
                          color:
                            sortDirection === "asc" ? "#22c55e" : "#ef4444",
                        }}
                      >
                        {sortDirection === "asc"
                          ? "arrow_upward"
                          : "arrow_downward"}
                      </span>
                    )}
                  </th>
                  <th
                    style={{ cursor: "pointer", userSelect: "none" }}
                    onClick={() => handleSortClick("so_lan_mua")}
                    title="Click để sắp xếp"
                  >
                    Số lần mua
                    {sortColumn === "so_lan_mua" && (
                      <span
                        className="material-symbols-outlined"
                        style={{
                          marginLeft: "4px",
                          fontSize: "16px",
                          verticalAlign: "middle",
                          color:
                            sortDirection === "asc" ? "#22c55e" : "#ef4444",
                        }}
                      >
                        {sortDirection === "asc"
                          ? "arrow_upward"
                          : "arrow_downward"}
                      </span>
                    )}
                  </th>
                  <th>Chu kỳ mua trung bình</th>
                  <th
                    style={{ cursor: "pointer", userSelect: "none" }}
                    onClick={() => handleSortClick("recency")}
                    title="Click để sắp xếp"
                  >
                    Lần mua hàng cuối
                    {sortColumn === "recency" && (
                      <span
                        className="material-symbols-outlined"
                        style={{
                          marginLeft: "4px",
                          fontSize: "16px",
                          verticalAlign: "middle",
                          color:
                            sortDirection === "asc" ? "#22c55e" : "#ef4444",
                        }}
                      >
                        {sortDirection === "asc"
                          ? "arrow_upward"
                          : "arrow_downward"}
                      </span>
                    )}
                  </th>
                  <th>F/M</th>
                  <th>Ngày sinh</th>
                  <th>Tuổi</th>
                </tr>
              </thead>
              <tbody>
                {data.data?.map((customer, index) => (
                  <Fragment key={customer.ma_kh}>
                    <tr
                      onClick={() => handleRowClick(customer.ma_kh)}
                      className={`customer-row ${selectedCustomerId === customer.ma_kh ? "selected" : ""}`}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{(currentPage - 1) * pageSize + index + 1}</td>
                      <td>{customer.ma_kh.replace(/^KH/, "")}</td>
                      <td>
                        <CombinedVipBadge
                          gmv={(customer.gmv || 0) + (customer.gmv_truoc_2026 || 0)}
                          aov={customer.aov || 0}
                        />
                      </td>
                      <td className="customer-name-cell">
                        {updatedCustomers.get(customer.id_kh || 0)
                          ?.ten_khach_hang || customer.ten_khach_hang}
                      </td>
                      <td>
                        {updatedCustomers.get(customer.id_kh || 0)?.sdt1 ||
                          customer.sdt}
                      </td>
                      <td className="address-cell">
                        {updatedCustomers.get(customer.id_kh || 0)?.dia_chi ||
                          customer.dia_chi}
                      </td>
                      <td className="number-cell">
                        {new Intl.NumberFormat("vi-VN").format(user?.role_id !== 1 ? (customer.gmv || 0) : ((customer.gmv || 0) + (customer.gmv_truoc_2026 || 0)))}
                      </td>
                      <td className="number-cell">{customer.so_lan_mua}</td>
                      <td className="number-cell" style={{ textAlign: "center" }}>
                        {customer.chu_ky && customer.chu_ky > 0 ? customer.chu_ky + " ngày" : "-"}
                      </td>
                      <td className="number-cell" style={{ textAlign: "center" }}>
                        {customer.recency && customer.recency > 0 ? customer.recency + " ngày" : "-"}
                      </td>
                      <td>
                        {updatedCustomers.get(customer.id_kh || 0)?.gioi_tinh ||
                          customer.gioi_tinh}
                      </td>
                      <td>
                        {(() => {
                          const ns = updatedCustomers.get(customer.id_kh || 0)?.ngay_sinh || customer.ngay_sinh;
                          return ns
                            ? ns.includes("-")
                              ? ns.split("-").reverse().join("/")
                              : ns
                            : "";
                        })()}
                      </td>
                      <td>
                        {calculateAge(
                          updatedCustomers.get(customer.id_kh || 0)?.ngay_sinh || customer.ngay_sinh
                        ) ||
                          customer.tuoi ||
                          "-"}
                      </td>
                    </tr>
                    {selectedCustomerId === customer.ma_kh && (
                      <tr className="detail-row">
                        <td colSpan={12}>
                          <CustomerDetail
                            customer={customer}
                            onUpdate={handleCustomerUpdate}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="pagination-btn"
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>

            <div className="pagination-pages">
              {currentPage > 3 && (
                <>
                  <button
                    onClick={() => handlePageChange(1)}
                    className="pagination-btn"
                  >
                    1
                  </button>
                  {currentPage > 4 && <span>...</span>}
                </>
              )}

              {Array.from({ length: data.total_pages }, (_, i) => i + 1)
                .filter(
                  (page) => page >= currentPage - 2 && page <= currentPage + 2,
                )
                .map((page) => (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className={`pagination-btn ${page === currentPage ? "active" : ""}`}
                  >
                    {page}
                  </button>
                ))}

              {currentPage < data.total_pages - 2 && (
                <>
                  {currentPage < data.total_pages - 3 && <span>...</span>}
                  <button
                    onClick={() => handlePageChange(data.total_pages)}
                    className="pagination-btn"
                  >
                    {data.total_pages}
                  </button>
                </>
              )}
            </div>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === data.total_pages}
              className="pagination-btn"
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default CustomerListTab;
