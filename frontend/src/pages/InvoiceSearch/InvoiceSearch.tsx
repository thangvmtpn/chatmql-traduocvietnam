import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSearchInvoices } from "@/hooks/useInvoices";
import type { InvoiceOrder } from "@/types/api";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import { getStatusColor } from "@/config/constants";
import "./InvoiceSearch.css";

function InvoiceSearch() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState<string>("");
  const [searchCode, setSearchCode] = useState<string>("");
  const [page, setPage] = useState(1);

  // Lấy giá trị từ URL khi load trang
  useEffect(() => {
    const codeFromUrl = searchParams.get("code_invoice") || "";
    if (codeFromUrl) {
      setInputValue(codeFromUrl);
      setSearchCode(codeFromUrl);
    }
  }, [searchParams]);

  const { data, isLoading } = useSearchInvoices(
    { code_invoice: searchCode, page, limit: 20 },
    !!searchCode,
  );

  const handleSearch = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setSearchCode(trimmed);
    setPage(1);
    navigate(`/invoice-search?code_invoice=${encodeURIComponent(trimmed)}`, {
      replace: true,
    });
  };

  const handleClear = () => {
    setInputValue("");
    setSearchCode("");
    setPage(1);
    navigate("/invoice-search", { replace: true });
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("vi-VN").format(value) + " đ";

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "...";
    return new Date(dateStr).toLocaleString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };



  return (
    <div className="invoice-search-page">
      <Breadcrumb />

      <div className="invoice-search-header">
        <h1>
          <span className="material-symbols-outlined">receipt_long</span>
          Tìm kiếm hoá đơn
        </h1>
      </div>

      {/* Search bar */}
      <div className="invoice-search-bar">
        <div className="invoice-search-input-wrapper">
          <span
            className="material-symbols-outlined search-icon"
            onClick={handleSearch}
            style={{ cursor: inputValue.trim() ? "pointer" : "default" }}
          >
            search
          </span>
          <input
            type="text"
            className="invoice-search-input"
            placeholder="Nhập mã hoá đơn để tìm kiếm..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            autoFocus
          />
          {inputValue && (
            <button
              className="invoice-clear-btn"
              onClick={handleClear}
              title="Xóa"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
        </div>
        <button
          className="invoice-search-submit-btn"
          onClick={handleSearch}
          disabled={!inputValue.trim()}
        >
          <span className="material-symbols-outlined">search</span>
          Tìm kiếm
        </button>
      </div>

      {/* Results */}
      <div className="invoice-search-results">
        {!searchCode ? (
          <div className="invoice-search-empty-hint">
            <span className="material-symbols-outlined">manage_search</span>
            <p>Nhập mã hoá đơn để bắt đầu tìm kiếm</p>
          </div>
        ) : isLoading ? (
          <div className="invoice-search-loading">
            <span className="material-symbols-outlined spinning">
              progress_activity
            </span>
            <p>Đang tìm kiếm...</p>
          </div>
        ) : !data?.data || data.data.length === 0 ? (
          <div className="invoice-search-no-result">
            <span className="material-symbols-outlined">inbox</span>
            <p>
              Không tìm thấy hoá đơn nào với mã <strong>"{searchCode}"</strong>
            </p>
          </div>
        ) : (
          <>
            <div className="invoice-search-result-count">
              Tìm thấy <strong>{data.pagination.total}</strong> hoá đơn
            </div>
            <table className="invoice-search-table">
              <thead>
                <tr>
                  <th>Mã hoá đơn</th>
                  <th>Thời gian tạo</th>
                  <th>Nhân viên bán</th>
                  <th>Khách hàng</th>
                  <th>SĐT</th>
                  <th>Giá trị</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((order: InvoiceOrder) => (
                  <tr key={order.id_invoice}>
                    <td className="invoice-code-cell">{order.code_invoice}</td>
                    <td>{formatDateTime(order.time_create)}</td>
                    <td>{order.name_seller || "..."}</td>
                    <td>{order.name_customer || "..."}</td>
                    <td>{order.phone_number || "..."}</td>
                    <td className="amount-cell">
                      {formatCurrency(order.subtotal)}
                    </td>
                    <td>
                      <span
                        className="invoice-status-badge"
                        style={{
                          backgroundColor: getStatusColor(order.status_value),
                        }}
                      >
                        {order.status_value}
                      </span>
                    </td>
                    <td>
                      <button
                        className="invoice-view-btn"
                        onClick={() =>
                          navigate(`/order-detail/${order.code_invoice}`)
                        }
                      >
                        <span className="material-symbols-outlined">
                          visibility
                        </span>
                        Chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {data.pagination.total_pages > 1 && (
              <div className="invoice-search-pagination">
                <button
                  className="pagination-btn"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <span className="material-symbols-outlined">
                    chevron_left
                  </span>
                </button>
                <span className="pagination-info">
                  Trang {page} / {data.pagination.total_pages}
                </span>
                <button
                  className="pagination-btn"
                  disabled={page === data.pagination.total_pages}
                  onClick={() => setPage((p) => p + 1)}
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
    </div>
  );
}

export default InvoiceSearch;
