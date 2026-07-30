import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  useCustomersList,
  useStaffList,
  useCustomerGroups,
} from "@/hooks/useDashboard";
import { CustomerDetail as CustomerDetailType } from "@/types/api";
import useAuthStore from "@/stores/useAuthStore";
import Sidebar from "@/components/Sidebar/Sidebar";
import Header from "@/components/Header/Header";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import CustomerDetail from "@/components/CustomerDetail/CustomerDetail";
import { SearchTab } from "@/pages/CustomerManagement/SearchTab";
import { VipBadge, AOVBadge, CombinedVipBadge } from "@/components/CustomerBadges/CustomerBadges";
import "./CustomerList.css";

function CustomerList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const filterType =
    (searchParams.get("filter") as "all" | "handed_over" | "not_handed_over") ||
    "all";
  const staffIdFromUrl = searchParams.get("staff_id") || "";
  const groupFromUrl = searchParams.get("group") || "";
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const [searchCustomerId, setSearchCustomerId] = useState(
    searchParams.get("customer_id") || "",
  );
  const [searchPhoneNumber, setSearchPhoneNumber] = useState(
    searchParams.get("phone_number") || "",
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [updatedCustomers, setUpdatedCustomers] = useState<
    Map<number, CustomerDetailType>
  >(new Map());

  // State cho advanced search tab
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

  // Xác định filterType cho staff list
  const staffFilterType = filterType === "all" ? "all" : "handed_over";

  // Check permission: role_id 4 can only view if there's a search param (customer_id or phone_number)
  const hasSearchParam =
    !!searchParams.get("customer_id") || !!searchParams.get("phone_number");
  const isRole4WithoutSearch = user?.role_id === 4 && !hasSearchParam;

  // Lấy danh sách tài khoản nếu filter là 'all' hoặc 'handed_over' và chưa chọn staff và không có search
  // và không phải role_id = 4
  const hasSearchParams = searchCustomerId || searchPhoneNumber;
  const shouldShowStaffList =
    (filterType === "all" || filterType === "handed_over") &&
    !staffIdFromUrl &&
    !hasSearchParams &&
    user?.role_id !== 4;
  const { data: staffList } = useStaffList(
    staffFilterType,
    shouldShowStaffList,
  );

  // Lấy danh sách nhóm khách hàng nếu filter là 'not_handed_over' và chưa chọn group
  const shouldShowGroupList =
    filterType === "not_handed_over" &&
    !groupFromUrl &&
    !hasSearchParams &&
    user?.role_id !== 4;
  const { data: customerGroups } = useCustomerGroups(shouldShowGroupList);

  // Theo dõi URL params thay đổi
  useEffect(() => {
    const customerId = searchParams.get("customer_id") || "";
    const phoneNumber = searchParams.get("phone_number") || "";

    if (customerId || phoneNumber) {
      setSearchCustomerId(customerId);
      setSearchPhoneNumber(phoneNumber);
      setCurrentPage(1);
    }
  }, [searchParams]);

  const { data, isLoading, error } = useCustomersList(
    filterType,
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
    groupFromUrl || undefined, // nhomKh
    staffIdFromUrl || undefined, // staffId
    sortColumn || undefined, // sortBy
    sortDirection, // sortOrder
  );

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleFilterChange = (
    newFilter: "all" | "handed_over" | "not_handed_over",
  ) => {
    setShowAdvancedSearch(false);
    setSearchParams({ filter: newFilter });
    setCurrentPage(1);
  };

  const handleStaffClick = (staffId: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("staff_id", staffId.toString());
    setSearchParams(params);
    setCurrentPage(1);
  };

  const handleBackToStaffList = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("staff_id");
    setSearchParams(params);
    setCurrentPage(1);
  };

  const handleGroupClick = (groupName: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("group", groupName);
    setSearchParams(params);
    setCurrentPage(1);
  };

  const handleBackToGroupList = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("group");
    setSearchParams(params);
    setCurrentPage(1);
  };

  const handleSearch = (customerId: string, phoneNumber: string) => {
    setSearchCustomerId(customerId);
    setSearchPhoneNumber(phoneNumber);
    setCurrentPage(1);
    // Cập nhật URL params để Sidebar cũng được cập nhật
    const params = new URLSearchParams();
    if (customerId) params.append("customer_id", customerId);
    if (phoneNumber) params.append("phone_number", phoneNumber);
    setSearchParams(params);
  };

  const handleClearSearch = () => {
    setSearchCustomerId("");
    setSearchPhoneNumber("");
    setCurrentPage(1);
    setSearchParams({});
    navigate("/dashboard");
  };

  const handleRowClick = (customerId: string) => {
    setSelectedCustomerId(
      selectedCustomerId === customerId ? null : customerId,
    );
  };

  const handleCustomerUpdate = (updatedCustomer: CustomerDetailType) => {
    // Lưu thông tin khách hàng đã cập nhật
    setUpdatedCustomers((prev) =>
      new Map(prev).set(updatedCustomer.id_kh, updatedCustomer),
    );
    console.log("Customer updated:", updatedCustomer);
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

  // Hàm tính tuổi từ ngày sinh
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

  const getTitle = () => {
    switch (filterType) {
      case "handed_over":
        return "DANH SÁCH KHÁCH HÀNG ĐÃ BÀN GIAO";
      case "not_handed_over":
        return "DANH SÁCH KHÁCH HÀNG CHƯA BÀN GIAO";
      default:
        return "DANH SÁCH KHÁCH HÀNG ĐANG QUẢN LÝ";
    }
  };

  return (
    <div className="customer-list-layout">
      <Header title={getTitle()} userName={user?.name || "User"} />

      <div className="customer-list-wrapper">
        {user && <Sidebar user={user} onSearch={handleSearch} />}

        <main className="customer-list-main">
          <Breadcrumb />
          {/* Hiển thị thông báo không có quyền cho role_id = 4 khi không có customer_id */}
          {isRole4WithoutSearch && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100vh",
                padding: "20px",
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  padding: "40px",
                  borderRadius: "8px",
                  backgroundColor: "#fef2f2",
                  border: "2px solid #fecaca",
                  maxWidth: "600px",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: "64px",
                    color: "#dc2626",
                    display: "block",
                    marginBottom: "16px",
                  }}
                >
                  lock
                </span>
                <h2 style={{ color: "#dc2626", marginBottom: "8px" }}>
                  Không có quyền truy cập
                </h2>
                <p
                  style={{
                    color: "#991b1b",
                    fontSize: "16px",
                    lineHeight: "1.6",
                  }}
                >
                  Bạn không có quyền xem danh sách khách hàng. Vui lòng sử dụng
                  tính năng tìm kiếm để tìm kiếm khách hàng cụ thể.
                </p>
              </div>
            </div>
          )}

          {/* Hiển thị nội dung chính khi có quyền */}
          {!isRole4WithoutSearch && user && user.role_id !== 4 && (
            <div className="customer-list-header">
              <div className="filter-buttons">
                <button
                  className={filterType === "all" ? "active" : ""}
                  onClick={() => handleFilterChange("all")}
                >
                  Tất cả
                </button>
                <button
                  className={filterType === "handed_over" ? "active" : ""}
                  onClick={() => handleFilterChange("handed_over")}
                >
                  Đã bàn giao
                </button>
                <button
                  className={filterType === "not_handed_over" ? "active" : ""}
                  onClick={() => handleFilterChange("not_handed_over")}
                >
                  Chưa bàn giao
                </button>
                <button
                  className={showAdvancedSearch ? "active" : ""}
                  onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
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
                  Tìm kiếm chuyên sâu {showAdvancedSearch && `(${filterType === "all" ? "Tất cả" : filterType === "handed_over" ? "Đã bàn giao" : "Chưa bàn giao"})`}
                </button>
              </div>
              <div
                style={{ display: "flex", gap: "12px", alignItems: "center" }}
              >
                {staffIdFromUrl && (
                  <button
                    onClick={handleBackToStaffList}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "1px solid #e5e7eb",
                      background: "var(--color-primary)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "18px" }}
                    >
                      arrow_back
                    </span>
                    Quay lại danh sách tài khoản
                  </button>
                )}
                {groupFromUrl && (
                  <button onClick={handleBackToGroupList}>
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "18px" }}
                    >
                      arrow_back
                    </span>
                    Quay lại danh sách nhóm
                  </button>
                )}
                {filterType === "not_handed_over" && groupFromUrl && (
                  <button
                    className="btn-assign-page"
                    onClick={() =>
                      navigate(`/customers/assignment?group=${groupFromUrl}`)
                    }
                  >
                    <span className="material-symbols-outlined">
                      assignment_ind
                    </span>
                    Bàn giao
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tìm kiếm chuyên sâu */}
          {showAdvancedSearch && <SearchTab filterType={filterType} />}

          {/* Hiển thị danh sách tài khoản nếu chưa chọn staff */}
          {!showAdvancedSearch && shouldShowStaffList && staffList && (
            <div className="staff-list-container">
              <h3
                style={{ padding: "20px", fontSize: "18px", fontWeight: "600" }}
              >
                Chọn tài khoản để xem danh sách khách hàng
              </h3>
              <div className="table-container">
                <table className="customer-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "center" }}>STT</th>
                      <th style={{ textAlign: "center" }}>Tên tài khoản</th>
                      <th style={{ textAlign: "center" }}>
                        Số lượng khách hàng
                      </th>
                      <th style={{ textAlign: "center" }}>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...staffList]
                      .sort((a, b) => {
                        // SUBADMIN - HEAD (id_acc === null) luôn đẩy về cuối
                        if (a.id_acc === null && b.id_acc !== null) return 1;
                        if (a.id_acc !== null && b.id_acc === null) return -1;
                        // Nếu cả hai cùng loại, sắp xếp theo customer_count giảm dần
                        return b.customer_count - a.customer_count;
                      })
                      .map((staff, index) => (
                        <tr key={staff.id_acc || "subadmin-head"}>
                          <td style={{ textAlign: "center" }}>{index + 1}</td>
                          <td style={{ textAlign: "center" }}>{staff.name}</td>
                          <td style={{ textAlign: "center" }}>
                            {staff.customer_count.toLocaleString("vi-VN")}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {staff.id_acc ? (
                              <button
                                className="invoice-view-btn"
                                onClick={() => handleStaffClick(staff.id_acc)}
                              >
                                <span className="material-symbols-outlined">
                                  visibility
                                </span>
                                Chi tiết
                              </button>
                            ) : (
                              <button
                                className="invoice-view-btn"
                                onClick={() =>
                                  navigate("/customers?filter=handed_over")
                                }
                              >
                                <span className="material-symbols-outlined">
                                  visibility
                                </span>
                                Chi tiết
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Hiển thị danh sách nhóm Cấp VIP nếu filter = not_handed_over và chưa chọn nhóm */}
          {!showAdvancedSearch && shouldShowGroupList && customerGroups && (
            <div className="staff-list-container">
              <h3
                style={{ padding: "20px", fontSize: "18px", fontWeight: "600" }}
              >
                Chọn nhóm Cấp VIP để xem khách hàng chưa bàn giao
              </h3>
              <div className="table-container">
                <table className="customer-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "center" }}>STT</th>
                      <th style={{ textAlign: "center" }}>Cấp VIP</th>
                      <th style={{ textAlign: "center" }}>Số lượng khách hàng</th>
                      <th style={{ textAlign: "center" }}>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerGroups.map((group, index) => {
                      const tier = group.nhom_kh;
                      let color = "#6b7280";
                      let bgColor = "#f9fafb";
                      if (tier === "VIP 0-9") { color = "#059669"; bgColor = "#f0fdf4"; }
                      else if (tier === "VIP 10-19") { color = "#2563eb"; bgColor = "#eff6ff"; }
                      else if (tier === "VIP 20-29") { color = "#7c3aed"; bgColor = "#faf5ff"; }
                      else if (tier === "VIP 30+") { color = "#be123c"; bgColor = "#fff1f2"; }
                      return (
                        <tr key={tier} style={{ backgroundColor: bgColor }}>
                          <td style={{ textAlign: "center" }}>{index + 1}</td>
                          <td style={{ textAlign: "center" }}>
                            <span style={{
                              display: "inline-block",
                              padding: "3px 12px",
                              borderRadius: "12px",
                              fontSize: "13px",
                              fontWeight: "700",
                              color: color,
                              backgroundColor: bgColor,
                              border: `1.5px solid ${color}`,
                            }}>
                              {tier}
                            </span>
                          </td>
                          <td style={{ textAlign: "center", fontWeight: "600" }}>
                            {group.so_luong_kh.toLocaleString("vi-VN")}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            <button
                              className="invoice-view-btn"
                              onClick={() => handleGroupClick(tier)}
                            >
                              <span className="material-symbols-outlined">visibility</span>
                              Chi tiết
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}



          {!showAdvancedSearch && isLoading && (
            <div className="loading-state">
              <p>Đang tải dữ liệu...</p>
            </div>
          )}

          {!showAdvancedSearch && error && (
            <div className="error-state">
              <p>Có lỗi xảy ra khi tải dữ liệu</p>
            </div>
          )}

          {/* Hiển thị danh sách khách hàng nếu đã chọn staff hoặc đã chọn group hoặc có search */}
          {!showAdvancedSearch &&
            (staffIdFromUrl ||
              groupFromUrl ||
              hasSearchParams ||
              (user?.role_id === 4 && hasSearchParam)) &&
            data && (
              <>
                <div
                  className="customer-list-stats"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  <div style={{ display: "flex", gap: "16px" }}>
                    <p>
                      Hiển thị:{" "}
                      <strong>
                        {Math.min((currentPage - 1) * pageSize + 1, data.total)}
                        -{Math.min(currentPage * pageSize, data.total)}
                      </strong>{" "}
                      / <strong>{data.total.toLocaleString("vi-VN")}</strong>{" "}
                      khách hàng
                    </p>
                    <p>
                      Trang {currentPage} / {data.total_pages}
                    </p>
                  </div>
                  {hasSearchParams && (
                    <button
                      onClick={handleClearSearch}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "1px solid #ef4444",
                        background: "#fff",
                        color: "#ef4444",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        fontSize: "13px",
                        fontWeight: "500",
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: "18px" }}
                      >
                        close
                      </span>
                      Xóa tìm kiếm
                    </button>
                  )}
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
                          {sortOrder === "asc"
                            ? "arrow_upward"
                            : "arrow_downward"}
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
                                  sortDirection === "asc"
                                    ? "#22c55e"
                                    : "#ef4444",
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
                                  sortDirection === "asc"
                                    ? "#22c55e"
                                    : "#ef4444",
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
                                  sortDirection === "asc"
                                    ? "#22c55e"
                                    : "#ef4444",
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
                                  sortDirection === "asc"
                                    ? "#22c55e"
                                    : "#ef4444",
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
                      {data.data && data.data.length > 0 ? (
                        data.data.map((customer, index) => (
                          <>
                            <tr
                              key={customer.ma_kh}
                              onClick={() => handleRowClick(customer.ma_kh)}
                              className={`customer-row ${selectedCustomerId === customer.ma_kh ? "selected" : ""}`}
                            >
                              <td>
                                {(currentPage - 1) * pageSize + index + 1}
                              </td>
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
                                {updatedCustomers.get(customer.id_kh || 0)
                                  ?.sdt1 || customer.sdt}
                              </td>
                              <td className="address-cell">
                                {updatedCustomers.get(customer.id_kh || 0)
                                  ?.dia_chi || customer.dia_chi}
                              </td>
                              <td className="number-cell">
                                {new Intl.NumberFormat("vi-VN").format(user?.role_id !== 1 ? (customer.gmv || 0) : ((customer.gmv || 0) + (customer.gmv_truoc_2026 || 0)))}
                              </td>
                              <td className="number-cell">
                                {customer.so_lan_mua}
                              </td>
                              <td className="number-cell" style={{ textAlign: "center" }}>
                                {customer.chu_ky && customer.chu_ky > 0 ? customer.chu_ky + " ngày" : "-"}
                              </td>
                              <td className="number-cell" style={{ textAlign: "center" }}>
                                {customer.recency && customer.recency > 0 ? customer.recency + " ngày" : "-"}
                              </td>
                              <td>
                                {updatedCustomers.get(customer.id_kh || 0)
                                  ?.gioi_tinh || customer.gioi_tinh}
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
                                  updatedCustomers.get(customer.id_kh || 0)
                                    ?.ngay_sinh || customer.ngay_sinh
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
                          </>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={12}
                            style={{ textAlign: "center", padding: "20px" }}
                          >
                            <p style={{ color: "#999", fontSize: "14px" }}>
                              Không tìm thấy khách hàng nào phù hợp với tiêu chí
                              tìm kiếm
                            </p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="pagination">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="pagination-btn"
                  >
                    <span className="material-symbols-outlined">
                      chevron_left
                    </span>
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
                        (page) =>
                          page >= currentPage - 2 && page <= currentPage + 2,
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
                    <span className="material-symbols-outlined">
                      chevron_right
                    </span>
                  </button>
                </div>
              </>
            )}
        </main>
      </div>
    </div>
  );
}

export default CustomerList;
