import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
  useCustomersList,
  useAccounts,
  useAssignCustomers,
} from "@/hooks/useDashboard";
import { CustomerDetail as CustomerDetailType } from "@/types/api";
import useAuthStore from "@/stores/useAuthStore";
import Sidebar from "@/components/Sidebar/Sidebar";
import Header from "@/components/Header/Header";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import CustomerDetail from "@/components/CustomerDetail/CustomerDetail";
import { CombinedVipBadge } from "@/components/CustomerBadges/CustomerBadges";
import "./CustomerAssignment.css";

function CustomerAssignment() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  const [searchCustomerId, setSearchCustomerId] = useState("");
  const [searchPhoneNumber, setSearchPhoneNumber] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );

  // State cho filters - input tạm thời
  const [gmvMin, setGmvMin] = useState("");
  const [gmvMax, setGmvMax] = useState("");
  const [pfMin, setPfMin] = useState("");
  const [pfMax, setPfMax] = useState("");
  const [aovMin, setAovMin] = useState("");
  const [aovMax, setAovMax] = useState("");
  const [selectedMien, setSelectedMien] = useState("");
  const [nhomKhachHang, setNhomKhachHang] = useState("");
  const [searchMaKh, setSearchMaKh] = useState("");
  const [searchSdt, setSearchSdt] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // State cho applied filters - giá trị thực tế được sử dụng
  const [appliedGmvMin, setAppliedGmvMin] = useState("");
  const [appliedGmvMax, setAppliedGmvMax] = useState("");
  const [appliedPfMin, setAppliedPfMin] = useState("");
  const [appliedPfMax, setAppliedPfMax] = useState("");
  const [appliedAovMin, setAppliedAovMin] = useState("");
  const [appliedAovMax, setAppliedAovMax] = useState("");
  const [appliedMien, setAppliedMien] = useState("");
  const [appliedNhomKh, setAppliedNhomKh] = useState("");
  const [updatedCustomers, setUpdatedCustomers] = useState<
    Map<number, CustomerDetailType>
  >(new Map());

  // Lấy group từ URL params và tự động áp dụng filter
  useEffect(() => {
    const groupFromUrl = searchParams.get("group");
    if (groupFromUrl) {
      setNhomKhachHang(groupFromUrl);
      setAppliedNhomKh(groupFromUrl);
    }
  }, [searchParams]);

  // State cho assign feature
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<number[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  // Hooks cho API
  const { data: accountsData, isLoading: accountsLoading } = useAccounts();
  const assignMutation = useAssignCustomers();

  const { data, isLoading, error } = useCustomersList(
    "not_handed_over",
    currentPage,
    pageSize,
    searchCustomerId,
    searchPhoneNumber,
    appliedGmvMin,
    appliedGmvMax,
    appliedPfMin,
    appliedPfMax,
    appliedAovMin,
    appliedAovMax,
    appliedMien,
    appliedNhomKh,
  );

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSearch = (customerId: string, phoneNumber: string) => {
    setSearchCustomerId(customerId);
    setSearchPhoneNumber(phoneNumber);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setGmvMin("");
    setGmvMax("");
    setPfMin("");
    setPfMax("");
    setAovMin("");
    setAovMax("");
    setSelectedMien("");
    setNhomKhachHang("");
    setSearchMaKh("");
    setSearchSdt("");
    setAppliedGmvMin("");
    setAppliedGmvMax("");
    setAppliedPfMin("");
    setAppliedPfMax("");
    setAppliedAovMin("");
    setAppliedAovMax("");
    setAppliedMien("");
    setAppliedNhomKh("");
    setSearchCustomerId("");
    setSearchPhoneNumber("");
    setCurrentPage(1);
  };

  const handleApplyFilters = () => {
    // Sao chép giá trị từ input filters sang applied filters
    setAppliedGmvMin(gmvMin);
    setAppliedGmvMax(gmvMax);
    setAppliedPfMin(pfMin);
    setAppliedPfMax(pfMax);
    setAppliedAovMin(aovMin);
    setAppliedAovMax(aovMax);
    setAppliedMien(selectedMien);
    setAppliedNhomKh(nhomKhachHang);
    // Cập nhật search từ filter
    setSearchCustomerId(searchMaKh);
    setSearchPhoneNumber(searchSdt);
    setCurrentPage(1);
    setShowFilters(false);
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

  // Hàm xử lý chọn/bỏ chọn khách hàng
  const handleCheckboxChange = (customerId: number) => {
    setSelectedCustomerIds((prev) => {
      if (prev.includes(customerId)) {
        return prev.filter((id) => id !== customerId);
      } else {
        return [...prev, customerId];
      }
    });
  };

  // Hàm xử lý chọn tất cả khách hàng
  const handleSelectAll = (checked: boolean) => {
    if (checked && data?.data) {
      const allIds = data.data
        .filter((c) => c.id_kh)
        .map((c) => c.id_kh as number);
      setSelectedCustomerIds(allIds);
    } else {
      setSelectedCustomerIds([]);
    }
  };

  // Hàm random chọn nhân viên (loại trừ role 1, 2)
  const handleRandomAssign = () => {
    if (selectedCustomerIds.length === 0) {
      toast.warning("Vui lòng chọn ít nhất 1 khách hàng!");
      return;
    }

    // Lọc danh sách nhân viên loại trừ role 1 và 2
    const eligibleAccounts = accountsData?.filter(
      (account: any) => account.role_id !== 1 && account.role_id !== 2,
    );

    if (!eligibleAccounts || eligibleAccounts.length === 0) {
      toast.warning("Không có nhân viên phù hợp để bàn giao!");
      return;
    }

    // Random chọn 1 nhân viên
    const randomAccount =
      eligibleAccounts[Math.floor(Math.random() * eligibleAccounts.length)];
    if (randomAccount) {
      setSelectedAccountId(randomAccount.id_acc.toString());
      toast.info(`Đã chọn random: ${randomAccount.name}`);
    }
  };

  // Hàm xử lý assign khách hàng
  const handleAssign = async () => {
    if (selectedCustomerIds.length === 0) {
      toast.warning("Vui lòng chọn ít nhất 1 khách hàng!");
      return;
    }
    if (!selectedAccountId) {
      toast.warning("Vui lòng chọn nhân viên phụ trách!");
      return;
    }

    try {
      const result = await assignMutation.mutateAsync({
        customerIds: selectedCustomerIds,
        accountId: parseInt(selectedAccountId),
      });

      toast.success((result as any).message);
      setSelectedCustomerIds([]);
      setSelectedAccountId("");

      // Chuyển về trang danh sách sau khi bàn giao thành công
      setTimeout(() => {
        navigate("/customers?filter=not_handed_over");
      }, 1500);
    } catch (error) {
      console.error("Error assigning customers:", error);
      toast.error("Có lỗi xảy ra khi bàn giao khách hàng!");
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

  return (
    <div className="customer-assignment-layout">
      <Header title="BÀN GIAO KHÁCH HÀNG" userName={user?.name || "User"} />

      <div className="customer-assignment-wrapper">
        {user && <Sidebar user={user} onSearch={handleSearch} />}

        <main className="customer-assignment-main">
          <Breadcrumb />
          {/* Bộ lọc */}
          <div className="filter-section">
            <div className="filter-header">
              <button
                className="btn-toggle-filter"
                onClick={() => setShowFilters(!showFilters)}
              >
                <span className="material-symbols-outlined">filter_alt</span>
                {showFilters ? "Ẩn bộ lọc" : "Hiện bộ lọc"}
              </button>
              {(appliedGmvMin ||
                appliedGmvMax ||
                appliedPfMin ||
                appliedPfMax ||
                appliedAovMin ||
                appliedAovMax ||
                appliedMien ||
                appliedNhomKh) && (
                <button
                  className="btn-reset-filter"
                  onClick={handleResetFilters}
                >
                  <span className="material-symbols-outlined">clear</span>
                  Xóa bộ lọc
                </button>
              )}
            </div>

            {showFilters && (
              <div className="filter-content">
                <div className="filter-row">
                  <div className="filter-group">
                    <label>Mã khách hàng</label>
                    <input
                      type="text"
                      placeholder="Nhập mã khách hàng..."
                      value={searchMaKh}
                      onChange={(e) => setSearchMaKh(e.target.value)}
                    />
                  </div>

                  <div className="filter-group">
                    <label>Số điện thoại</label>
                    <input
                      type="text"
                      placeholder="Nhập số điện thoại..."
                      value={searchSdt}
                      onChange={(e) => setSearchSdt(e.target.value)}
                    />
                  </div>
                </div>

                <div className="filter-row">
                  <div className="filter-group">
                    <label>GMV</label>
                    <div className="filter-range">
                      <input
                        type="number"
                        placeholder="Từ"
                        value={gmvMin}
                        onChange={(e) => setGmvMin(e.target.value)}
                      />
                      <span>-</span>
                      <input
                        type="number"
                        placeholder="Đến"
                        value={gmvMax}
                        onChange={(e) => setGmvMax(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="filter-group">
                    <label>PF</label>
                    <div className="filter-range">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Từ"
                        value={pfMin}
                        onChange={(e) => setPfMin(e.target.value)}
                      />
                      <span>-</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Đến"
                        value={pfMax}
                        onChange={(e) => setPfMax(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="filter-group">
                    <label>AOV</label>
                    <div className="filter-range">
                      <input
                        type="number"
                        placeholder="Từ"
                        value={aovMin}
                        onChange={(e) => setAovMin(e.target.value)}
                      />
                      <span>-</span>
                      <input
                        type="number"
                        placeholder="Đến"
                        value={aovMax}
                        onChange={(e) => setAovMax(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="filter-row">
                  <div className="filter-group">
                    <label>Miền</label>
                    <select
                      value={selectedMien}
                      onChange={(e) => setSelectedMien(e.target.value)}
                    >
                      <option value="">-- Tất cả --</option>
                      <option value="Bắc">Bắc</option>
                      <option value="Trung">Trung</option>
                      <option value="Nam">Nam</option>
                    </select>
                  </div>

                  <div className="filter-group">
                    <label>Nhóm khách hàng</label>
                    <input
                      type="text"
                      placeholder="Nhập nhóm khách hàng..."
                      value={nhomKhachHang}
                      onChange={(e) => setNhomKhachHang(e.target.value)}
                    />
                  </div>

                  <div className="filter-actions">
                    <button
                      className="btn-apply-filter"
                      onClick={handleApplyFilters}
                    >
                      <span className="material-symbols-outlined">check</span>
                      Áp dụng
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Form bàn giao khách hàng */}
          {data && data.data && data.data.length > 0 && (
            <div className="assign-form">
              <div className="assign-form-header">
                <span className="material-symbols-outlined">
                  assignment_ind
                </span>
                <h3>Bàn giao khách hàng</h3>
              </div>
              <div className="assign-form-content">
                <div className="assign-info">
                  <span>
                    Đã chọn: <strong>{selectedCustomerIds.length}</strong> khách
                    hàng
                  </span>
                </div>
                <div className="assign-controls">
                  <select
                    className="account-select"
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    disabled={
                      selectedCustomerIds.length === 0 || accountsLoading
                    }
                  >
                    <option value="">
                      {accountsLoading
                        ? "Đang tải danh sách..."
                        : "-- Chọn nhân viên phụ trách --"}
                    </option>
                    {accountsData?.map((account: any) => (
                      <option key={account.id_acc} value={account.id_acc}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-random-assign"
                    onClick={handleRandomAssign}
                    disabled={
                      selectedCustomerIds.length === 0 || accountsLoading
                    }
                    title="Bàn giao ngẫu nhiên cho nhân viên (không bao gồm Admin/Manager)"
                  >
                    <span className="material-symbols-outlined">shuffle</span>
                    Random
                  </button>
                  <button
                    className="btn-assign"
                    onClick={handleAssign}
                    disabled={
                      selectedCustomerIds.length === 0 ||
                      !selectedAccountId ||
                      assignMutation.isPending
                    }
                  >
                    <span className="material-symbols-outlined">send</span>
                    {assignMutation.isPending ? "Đang xử lý..." : "Bàn giao"}
                  </button>
                  <button
                    className="btn-cancel"
                    onClick={() =>
                      navigate("/customers?filter=not_handed_over")
                    }
                  >
                    <span className="material-symbols-outlined">close</span>
                    Hủy
                  </button>
                </div>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="loading-state">
              <p>Đang tải dữ liệu...</p>
            </div>
          )}

          {error && (
            <div className="error-state">
              <p>Có lỗi xảy ra khi tải dữ liệu</p>
            </div>
          )}

          {data && (
            <>
              <div className="customer-list-stats">
                <p>
                  Hiển thị:{" "}
                  <strong>
                    {Math.min((currentPage - 1) * pageSize + 1, data.total)}-
                    {Math.min(currentPage * pageSize, data.total)}
                  </strong>{" "}
                  / <strong>{data.total.toLocaleString("vi-VN")}</strong> khách
                  hàng chưa bàn giao
                </p>
                <p>
                  Trang {currentPage} / {data.total_pages}
                </p>
              </div>

              <div className="table-container">
                <table className="customer-table">
                  <thead>
                    <tr>
                      <th className="checkbox-column">
                        <input
                          type="checkbox"
                          checked={
                            data.data &&
                            data.data.length > 0 &&
                            selectedCustomerIds.length ===
                              data.data.filter((c) => c.id_kh).length
                          }
                          onChange={(e) => handleSelectAll(e.target.checked)}
                        />
                      </th>
                      <th>STT</th>
                      <th>Mã</th>
                      <th>Cấp VIP</th>
                      <th>Tên</th>
                      <th>SĐT</th>
                      <th>Địa chỉ</th>
                      <th>GMV</th>
                      <th>Số lần mua</th>
                      <th>PF</th>
                      <th>F/M</th>
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
                            {customer.id_kh && (
                              <td
                                className="checkbox-column"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedCustomerIds.includes(
                                    customer.id_kh,
                                  )}
                                  onChange={() =>
                                    handleCheckboxChange(
                                      customer.id_kh as number,
                                    )
                                  }
                                />
                              </td>
                            )}
                            <td>{(currentPage - 1) * pageSize + index + 1}</td>
                            <td>{customer.ma_kh}</td>
                            <td>
                              <CombinedVipBadge
                                gmv={(customer.gmv || 0) + (customer.gmv_truoc_2026 || 0)}
                                aov={customer.aov || 0}
                              />
                            </td>
                            <td>
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
                              {((customer.gmv || 0) + (customer.gmv_truoc_2026 || 0)).toLocaleString("vi-VN")}
                            </td>
                            <td className="number-cell">
                              {customer.so_lan_mua}
                            </td>
                            <td className="number-cell">
                              {customer.pf.toFixed(2)}
                            </td>
                            <td>
                              {updatedCustomers.get(customer.id_kh || 0)
                                ?.gioi_tinh || customer.gioi_tinh}
                            </td>
                            <td>
                              {calculateAge(
                                updatedCustomers.get(customer.id_kh || 0)
                                  ?.ngay_sinh,
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
                            Không có khách hàng nào cần bàn giao
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

export default CustomerAssignment;
