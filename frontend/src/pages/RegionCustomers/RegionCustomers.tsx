import { useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { useEmployeeRegionCustomers } from "@/hooks/useDashboard";
import useAuthStore from "@/stores/useAuthStore";
import BaseLayout from "@/layouts/BaseLayout/BaseLayout";
import "./RegionCustomers.css";

interface RegionCustomer {
  stt: number;
  code_customer: string;
  name_customer: string;
  phone_number: string;
  gmv: number;
  so_lan_mua: number;
  mien: string;
}

const ITEMS_PER_PAGE = 20;

function RegionCustomers() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const user = useAuthStore((state) => state.user);
  const mien = searchParams.get("mien") || "";

  const { data: regionCustomers, isLoading } = useEmployeeRegionCustomers(mien);

  // Calculate pagination
  const totalItems = regionCustomers?.length || 0;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedData =
    (regionCustomers as RegionCustomer[])?.slice(startIndex, endIndex) || [];

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  if (!mien) {
    return (
      <BaseLayout user={user!} title="Khách hàng theo vùng miền">
        <div className="region-customers-container">
          <div className="empty-state">
            <span className="material-symbols-outlined">public</span>
            <p>Chưa chọn vùng miền</p>
          </div>
        </div>
      </BaseLayout>
    );
  }

  return (
    <BaseLayout user={user!} title={`Khách hàng miền ${mien}`}>
      <div className="region-customers-container">
        <div className="region-customers-header">
          <button className="back-btn" onClick={() => navigate("/dashboard")}>
            <span className="material-symbols-outlined">arrow_back</span>
            Quay lại
          </button>
          <h1>Khách hàng miền: {mien}</h1>
        </div>

        {isLoading ? (
          <div className="table-loading">
            <span className="material-symbols-outlined spinning">
              progress_activity
            </span>
            <p>Đang tải dữ liệu...</p>
          </div>
        ) : !regionCustomers || regionCustomers.length === 0 ? (
          <div className="empty-state">
            <span className="material-symbols-outlined">people_outline</span>
            <p>Không có khách hàng nào</p>
          </div>
        ) : (
          <div className="customers-table-wrapper">
            <div className="table-info">
              Tổng cộng: <strong>{regionCustomers.length}</strong> khách hàng
            </div>
            <table className="customers-table">
              <thead>
                <tr>
                  <th>TT</th>
                  <th>Mã KH</th>
                  <th>Tên</th>
                  <th>SĐT</th>
                  <th>Số lần mua</th>
                  <th>GMV</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.map((customer) => (
                  <tr key={customer.code_customer}>
                    <td>{customer.stt}</td>
                    <td className="customer-code">
                      {(customer.code_customer || "...").replace(/^KH/, "")}
                    </td>
                    <td className="customer-name">
                      {customer.name_customer || "..."}
                    </td>
                    <td>{customer.phone_number || "..."}</td>
                    <td className="customer-orders">
                      {customer.so_lan_mua || "..."}
                    </td>
                    <td className="customer-gmv">
                      {new Intl.NumberFormat("vi-VN").format(customer.gmv)} đ
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
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
                  Trang {page} / {totalPages} ({regionCustomers.length} khách
                  hàng)
                </div>

                <button
                  className="pagination-btn"
                  disabled={page === totalPages}
                  onClick={() => handlePageChange(page + 1)}
                >
                  <span className="material-symbols-outlined">
                    chevron_right
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </BaseLayout>
  );
}

export default RegionCustomers;
