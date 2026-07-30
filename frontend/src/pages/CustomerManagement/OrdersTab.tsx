import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMyOrders, useMyOrdersStats } from "@/hooks/useInvoices";
import type { InvoiceOrder } from "@/types/api";
import DateRangeFilter from "@/components/DateRangeFilter/DateRangeFilter";
import UpdateInvoiceModal from "@/components/UpdateInvoiceModal/UpdateInvoiceModal";
import MultiSelectDropdown from "@/components/MultiSelectDropdown/MultiSelectDropdown";
import { ALL_STATUSES, getStatusColor } from "@/config/constants";

const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const FILTER_STORAGE_KEY = "ordersTab_filters";

const saveFiltersToStorage = (filters: {
  status: string[];
  searchCode: string;
  inputValue: string;
  fromDate: string;
  toDate: string;
  page: number;
  filterType: "today" | "week" | "month" | "custom" | null;
}) => {
  localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
};

const getFiltersFromStorage = () => {
  const stored = localStorage.getItem(FILTER_STORAGE_KEY);
  return stored ? JSON.parse(stored) : null;
};

function OrdersTab() {
  const navigate = useNavigate();
  const today = getTodayDate();
  const storedFilters = getFiltersFromStorage();

  const [page, setPage] = useState(storedFilters?.page ?? 1);
  const [limit] = useState(20);
  const [status, setStatus] = useState<string[]>(
    storedFilters?.status 
      ? (Array.isArray(storedFilters.status) ? storedFilters.status : storedFilters.status.split(",")) 
      : []
  );
  const [searchCode, setSearchCode] = useState<string>(
    storedFilters?.searchCode ?? "",
  );
  const [inputValue, setInputValue] = useState<string>(
    storedFilters?.inputValue ?? "",
  );
  const [fromDate, setFromDate] = useState<string>(
    storedFilters?.fromDate ?? today,
  );
  const [toDate, setToDate] = useState<string>(storedFilters?.toDate ?? today);
  const [filterType, setFilterType] = useState<
    "today" | "week" | "month" | "custom" | null
  >(storedFilters?.filterType ?? null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceOrder | null>(
    null,
  );
  const [dateResetTrigger, setDateResetTrigger] = useState(false);

  const handleDateFilterChange = (
    from: string,
    to: string,
    type?: "today" | "week" | "month" | "custom",
  ) => {
    if (from === fromDate && to === toDate) {
      if (type && type !== filterType) {
        setFilterType(type);
      }
      return;
    }
    
    setFromDate(from);
    setToDate(to);
    if (type) {
      setFilterType(type);
    }
    setPage(1);
  };

  // Lưu filter vào localStorage mỗi khi có thay đổi
  useEffect(() => {
    saveFiltersToStorage({
      status,
      searchCode,
      inputValue,
      fromDate,
      toDate,
      page,
      filterType,
    });
  }, [status, searchCode, inputValue, fromDate, toDate, page, filterType]);

  const { data: ordersData, isLoading: ordersLoading } = useMyOrders({
    page,
    limit,
    status: status.length > 0 ? status.join(",") : undefined,
    code_invoice: searchCode || undefined,
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
  });

  const { data: statsData, isLoading: statsLoading } = useMyOrdersStats({
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
    status: status.length > 0 ? status.join(",") : undefined,
  });

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleOpenUpdateModal = (order: InvoiceOrder) => {
    setSelectedInvoice(order);
    setIsUpdateModalOpen(true);
  };

  const handleCloseUpdateModal = () => {
    setIsUpdateModalOpen(false);
    setSelectedInvoice(null);
  };

  const handleSearch = (code: string) => {
    setSearchCode(code);
    setPage(1);
  };

  const handleResetFilters = () => {
    const today = getTodayDate();
    setFromDate(today);
    setToDate(today);
    setStatus([]);
    setSearchCode("");
    setInputValue("");
    setFilterType(null);
    setPage(1);
    setDateResetTrigger((v) => !v);
    // Xóa filter khỏi localStorage
    localStorage.removeItem(FILTER_STORAGE_KEY);
  };

  const hasActiveFilters =
    status.length > 0 ||
    searchCode ||
    fromDate !== getTodayDate() ||
    toDate !== getTodayDate();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("vi-VN").format(value) + " đ";
  };

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "...";
    const date = new Date(dateStr);
    return date.toLocaleString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };



  return (
    <div className="orders-tab">
      {/* Statistics Section */}
      <div className="orders-stats">
        {statsLoading ? (
          <div className="stats-loading">
            <span className="material-symbols-outlined spinning">
              progress_activity
            </span>
            <p>Đang tải thống kê...</p>
          </div>
        ) : statsData?.data ? (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: "#3b82f6" }}>
                <span className="material-symbols-outlined">shopping_cart</span>
              </div>
              <div className="stat-content">
                <div className="stat-label">Tổng đơn hàng</div>
                <div className="stat-value">
                  {statsData.data.total_orders.toLocaleString("vi-VN")}
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: "#22c55e" }}>
                <span className="material-symbols-outlined">paid</span>
              </div>
              <div className="stat-content">
                <div className="stat-label">Tổng doanh thu</div>
                <div className="stat-value">
                  {formatCurrency(statsData.data.total_revenue)}
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon" style={{ backgroundColor: "#f59e0b" }}>
                <span className="material-symbols-outlined">redeem</span>
              </div>
              <div className="stat-content">
                <div className="stat-label">UDKM</div>
                <div className="stat-value">
                  {formatCurrency(statsData.data.total_gift_amount)}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Filters Section */}
      <div className="orders-filters">
        <div className="filters-row">
          <div className="search-order-wrapper">
            <span
              className="material-symbols-outlined search-icon"
              onClick={() => {
                if (inputValue.trim()) {
                  handleSearch(inputValue);
                }
              }}
              style={{ cursor: inputValue.trim() ? "pointer" : "default" }}
            >
              search
            </span>
            <input
              type="text"
              className="order-search-input"
              placeholder="Tìm kiếm mã hoá đơn hoặc SĐT..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && inputValue.trim()) {
                  handleSearch(inputValue);
                }
              }}
            />
            {inputValue && (
              <button
                className="clear-search-btn"
                onClick={() => {
                  setInputValue("");
                  setSearchCode("");
                  setPage(1);
                }}
                title="Xóa tìm kiếm"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            )}
          </div>

          <DateRangeFilter
            onFilterChange={handleDateFilterChange}
            resetTrigger={dateResetTrigger}
            defaultFilterType={storedFilters?.filterType ?? "today"}
            defaultFromDate={storedFilters?.fromDate ?? today}
            defaultToDate={storedFilters?.toDate ?? today}
          />

          <div style={{ zIndex: 10 }}>
            <MultiSelectDropdown
              label="trạng thái"
              options={ALL_STATUSES.map((s) => ({ value: s, label: s }))}
              selected={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              placeholder="Tất cả trạng thái"
            />
          </div>

          {hasActiveFilters && (
            <button className="reset-filters-btn" onClick={handleResetFilters}>
              <span className="material-symbols-outlined">close</span>
              Xóa lọc
            </button>
          )}
        </div>
      </div>

      {/* Orders Table */}
      <div className="orders-table-container">
        {ordersLoading ? (
          <div className="table-loading">
            <span className="material-symbols-outlined spinning">
              progress_activity
            </span>
            <p>Đang tải danh sách đơn hàng...</p>
          </div>
        ) : !ordersData?.data || ordersData.data.length === 0 ? (
          <div className="empty-state">
            <span className="material-symbols-outlined">inbox</span>
            <p>Không có đơn hàng nào</p>
          </div>
        ) : (
          <>
            <table className="orders-table w-full table-fixed">
              <thead>
                <tr>
                  <th>Mã đơn hàng</th>
                  <th>Thời gian tạo</th>
                  <th>Khách hàng</th>
                  <th>SĐT</th>
                  <th>Địa chỉ</th>
                  <th>Giá trị</th>
                  <th>Quà tặng</th>
                  <th>CC_CASH / PP_CASH</th>
                  <th>Chi phí vận chuyển</th>
                  <th>Trạng thái</th>
                  <th>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {ordersData.data.map((order: InvoiceOrder) => (
                  <tr key={order.id_invoice}>
                    <td className="order-code">{order.code_invoice}</td>
                    <td>{formatDateTime(order.time_create)}</td>
                    <td className="customer-name">
                      {order.name_customer || "..."}
                    </td>
                    <td>{order.phone_number || "..."}</td>
                    <td className="order-address" title={order.address || ""}>
                      {order.address ? (order.address.length > 30 ? order.address.substring(0, 30) + '...' : order.address) : "..."}
                    </td>
                    <td className="order-amount">
                      {formatCurrency(order.subtotal)}
                    </td>
                    <td className="order-gift">
                      {formatCurrency(order.gift_amount || 0)}
                    </td>
                    <td className="order-type-fee-delivery">
                      {order.type_fee_delivery || "..."}
                    </td>
                    <td className="order-fee-delivery">
                      {order.type_fee_delivery === "CC_CASH"
                        ? formatCurrency(30000)
                        : order.type_fee_delivery === "PP_CASH"
                        ? "-"
                        : formatCurrency(order.fee_delivery || 0)}
                    </td>
                    <td>
                      <span
                        className="status-badge"
                        style={{
                          backgroundColor: getStatusColor(order.status_value),
                        }}
                      >
                        {order.status_value}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          className="view-detail-btn"
                          onClick={() =>
                            navigate(`/order-detail/${order.code_invoice}`)
                          }
                        >
                          <span className="material-symbols-outlined">
                            visibility
                          </span>
                        </button>
                        <button
                          className="update-order-btn"
                          onClick={() => handleOpenUpdateModal(order)}
                          title="Cập nhật đơn hàng"
                        >
                          <span className="material-symbols-outlined">
                            edit
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {ordersData.pagination && ordersData.pagination.total_pages > 1 && (
              <div className="pagination">
                <button
                  className="pagination-btn"
                  disabled={page === 1}
                  onClick={() => handlePageChange(page - 1)}
                >
                  <span className="material-symbols-outlined">
                    chevron_left
                  </span>
                </button>

                <div className="pagination-info">
                  Trang {page} / {ordersData.pagination.total_pages} (
                  {ordersData.pagination.total} đơn hàng)
                </div>

                <button
                  className="pagination-btn"
                  disabled={page === ordersData.pagination.total_pages}
                  onClick={() => handlePageChange(page + 1)}
                >
                  <span className="material-symbols-outlined">
                    chevron_right
                  </span>
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <UpdateInvoiceModal
        isOpen={isUpdateModalOpen}
        onClose={handleCloseUpdateModal}
        invoice={selectedInvoice}
      />
    </div>
  );
}

export default OrdersTab;
