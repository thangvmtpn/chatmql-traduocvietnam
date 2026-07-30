import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import useAuthStore from "@/stores/useAuthStore";
import { API_URL } from "@/config/api";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import Sidebar from "@/components/Sidebar/Sidebar";
import "material-symbols";
import styles from "./WithdrawLeadManagement.module.css";

interface WithdrawLead {
  id_de_xuat: number;
  id_kh: number;
  ma_kh: string;
  ten_khach_hang: string;
  sdt: string;
  reason: string;
  trang_thai: string;
  id_acc: number;
  user_id_de_xuat: string;
  ten_nguoi_de_xuat: string;
  thoi_gian_de_xuat: string;
  thoi_gian_duyet?: string;
  id_acc_duyet?: number;
}

export default function WithdrawLeadManagement() {
  const { token, user } = useAuthStore();
  const [leads, setLeads] = useState<WithdrawLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"cho_duyet" | "da_duyet" | "tu_choi">(
    "cho_duyet",
  );
  const [selectedLead, setSelectedLead] = useState<WithdrawLead | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalItems, setTotalItems] = useState(0);
  const [totalCounts, setTotalCounts] = useState({
    cho_duyet: 0,
    da_duyet: 0,
    tu_choi: 0,
  });

  useEffect(() => {
    // Lấy counts của tất cả statuses khi component mount
    fetchAllCounts();
    setCurrentPage(1);
    fetchLeads();
  }, [filter]);

  useEffect(() => {
    if (currentPage > 1) {
      fetchLeads();
    }
  }, [currentPage]);

  const fetchAllCounts = async () => {
    try {
      const statuses = ["cho_duyet", "da_duyet", "tu_choi"] as const;
      const counts = {
        cho_duyet: 0,
        da_duyet: 0,
        tu_choi: 0,
      };

      // Lấy count cho mỗi status - pageSize=1 đủ để lấy totalItems từ DB
      for (const status of statuses) {
        try {
          const response = await fetch(
            `${API_URL}/api/lead/de_xuat_withdraw/danh_sach?trang_thai=${status}&page=1&pageSize=1`,
            {
              headers: {
                Authorization: `Bearer ${token || ""}`,
              },
            },
          );

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          if (result.success && result.totalItems !== undefined) {
            counts[status] = result.totalItems;
          } else {
            console.warn(`Invalid response for status ${status}:`, result);
          }
        } catch (error) {
          console.error(`❌ Lỗi khi lấy count cho status ${status}:`, error);
          toast.error(`Lỗi khi lấy dữ liệu cho trạng thái ${status}`);
        }
      }

      setTotalCounts(counts);
    } catch (error) {
      console.error("❌ Lỗi khi fetch all counts:", error);
      toast.error("Lỗi khi lấy danh sách đề xuất");
    }
  };

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const url = filter
        ? `${API_URL}/api/lead/de_xuat_withdraw/danh_sach?trang_thai=${filter}&page=${currentPage}&pageSize=${pageSize}`
        : `${API_URL}/api/lead/de_xuat_withdraw/danh_sach?page=${currentPage}&pageSize=${pageSize}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token || ""}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        setLeads(result.data || []);
        setTotalItems(result.totalItems || 0);
        // Update count cho filter hiện tại
        if (filter && result.totalItems !== undefined) {
          setTotalCounts((prev) => ({
            ...prev,
            [filter]: result.totalItems,
          }));
        }
      } else {
        toast.error("Lỗi khi tải danh sách đề xuất");
      }
    } catch (error) {
      console.error("Error fetching withdraw leads:", error);
      toast.error("Lỗi khi tải danh sách đề xuất");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id_de_xuat: number) => {
    if (!confirm("Xác nhận phê duyệt đề xuất thu hồi lead này?")) return;

    try {
      const response = await fetch(
        `${API_URL}/api/lead/de_xuat_withdraw/xac_nhan`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || ""}`,
          },
          body: JSON.stringify({
            id_de_xuat,
            trang_thai: "da_duyet",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        toast.success(result.message || "Đã phê duyệt đề xuất!");
        // Refresh dữ liệu hiện tại + tất cả counts
        fetchLeads();
        fetchAllCounts();
      } else {
        toast.error(result.error || "Lỗi khi phê duyệt");
      }
    } catch (error) {
      console.error("❌ Lỗi khi phê duyệt:", error);
      toast.error("Lỗi khi phê duyệt đề xuất");
    }
  };

  const handleReject = async (id_de_xuat: number) => {
    if (!confirm("Xác nhận từ chối đề xuất thu hồi lead này?")) return;

    try {
      const response = await fetch(
        `${API_URL}/api/lead/de_xuat_withdraw/xac_nhan`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || ""}`,
          },
          body: JSON.stringify({
            id_de_xuat,
            trang_thai: "tu_choi",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        toast.success(result.message || "Đã từ chối đề xuất!");
        // Refresh dữ liệu hiện tại + tất cả counts
        fetchLeads();
        fetchAllCounts();
      } else {
        toast.error(result.error || "Lỗi khi từ chối");
      }
    } catch (error) {
      console.error("❌ Lỗi khi từ chối:", error);
      toast.error("Lỗi khi từ chối đề xuất");
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("vi-VN");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "cho_duyet":
        return (
          <span className={`${styles.badge} ${styles.badgePending}`}>
            Chờ duyệt
          </span>
        );
      case "da_duyet":
        return (
          <span className={`${styles.badge} ${styles.badgeApproved}`}>
            Đã duyệt
          </span>
        );
      case "tu_choi":
        return (
          <span className={`${styles.badge} ${styles.badgeRejected}`}>
            Từ chối
          </span>
        );
      default:
        return <span className={styles.badge}>{status}</span>;
    }
  };

  const openDetailModal = (lead: WithdrawLead) => {
    setSelectedLead(lead);
    setShowDetailModal(true);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo(0, 0);
  };

  const totalPages = Math.ceil(totalItems / pageSize);

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      {user && <Sidebar user={user} />}
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          backgroundColor: "#f8f9fa",
          width: "100%",
        }}
      >
        <div className={styles.withdrawLeadManagement}>
          <Breadcrumb />
      <div className={styles.pageHeader}>
        <h1>
          <span className="material-symbols-outlined">person_remove</span>
          Quản lý Đề xuất Thu hồi Lead
        </h1>
        <p className={styles.pageSubtitle}>
          Phê duyệt hoặc từ chối các đề xuất thu hồi lead từ nhân viên
        </p>
      </div>

      <div className={styles.filterTabs}>
        <button
          className={`${styles.filterTab} ${filter === "cho_duyet" ? styles.active : ""}`}
          onClick={() => setFilter("cho_duyet")}
        >
          <span className="material-symbols-outlined">schedule</span>
          Chờ duyệt
          <span className={styles.count}>{totalCounts.cho_duyet}</span>
        </button>
        <button
          className={`${styles.filterTab} ${filter === "da_duyet" ? styles.active : ""}`}
          onClick={() => setFilter("da_duyet")}
        >
          <span className="material-symbols-outlined">check_circle</span>
          Đã duyệt
          <span className={styles.count}>{totalCounts.da_duyet}</span>
        </button>
        <button
          className={`${styles.filterTab} ${filter === "tu_choi" ? styles.active : ""}`}
          onClick={() => setFilter("tu_choi")}
        >
          <span className="material-symbols-outlined">cancel</span>
          Từ chối
          <span className={styles.count}>{totalCounts.tu_choi}</span>
        </button>
      </div>

      {loading ? (
        <div className={styles.loadingState}>
          <span className={`material-symbols-outlined ${styles.rotating}`}>
            progress_activity
          </span>
          <p>Đang tải...</p>
        </div>
      ) : leads.length === 0 ? (
        <div className={styles.emptyState}>
          <span className="material-symbols-outlined">inbox</span>
          <p>Không có đề xuất nào</p>
        </div>
      ) : (
        <div className={styles.leadsTableContainer}>
          <table className={styles.leadsTable}>
            <thead>
              <tr>
                <th>Mã KH</th>
                <th>Tên khách hàng</th>
                <th>SĐT</th>
                <th>Người đề xuất</th>
                <th>Lý do</th>
                <th>Thời gian</th>
                <th>Trạng thái</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id_de_xuat}>
                  <td>
                    <strong>{lead.ma_kh}</strong>
                  </td>
                  <td>
                    <div className={styles.customerInfo}>
                      <div className={styles.customerName}>
                        {lead.ten_khach_hang}
                      </div>
                    </div>
                  </td>
                  <td>{lead.sdt}</td>
                  <td>
                    <div className={styles.proposerInfo}>
                      <div className={styles.proposerId}>
                        {lead.user_id_de_xuat}
                      </div>
                      <div className={styles.proposerName}>
                        {lead.ten_nguoi_de_xuat}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className={styles.reasonCell} title={lead.reason}>
                      {lead.reason.substring(0, 50)}
                      {lead.reason.length > 50 ? "..." : ""}
                    </div>
                  </td>
                  <td>{formatDate(lead.thoi_gian_de_xuat)}</td>
                  <td>{getStatusBadge(lead.trang_thai)}</td>
                  <td>
                    <div className={styles.actionButtons}>
                      <button
                        className={styles.btnView}
                        onClick={() => openDetailModal(lead)}
                        title="Xem chi tiết"
                      >
                        <span className="material-symbols-outlined">
                          visibility
                        </span>
                      </button>
                      {lead.trang_thai === "cho_duyet" && (
                        <>
                          <button
                            className={styles.btnApprove}
                            onClick={() => handleApprove(lead.id_de_xuat)}
                            title="Phê duyệt"
                          >
                            <span className="material-symbols-outlined">
                              check_circle
                            </span>
                          </button>
                          <button
                            className={styles.btnReject}
                            onClick={() => handleReject(lead.id_de_xuat)}
                            title="Từ chối"
                          >
                            <span className="material-symbols-outlined">
                              cancel
                            </span>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className={styles.paginationContainer}>
            <div className={styles.paginationInfo}>
              Hiển thị {totalPages === 0 ? 0 : (currentPage - 1) * pageSize + 1}{" "}
              đến {Math.min(currentPage * pageSize, totalItems)} trong{" "}
              {totalItems} kết quả
            </div>
            {totalPages > 0 && (
              <div className={styles.paginationControls}>
                <button
                  className={styles.paginationBtn}
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  title="Trang trước"
                >
                  <span className="material-symbols-outlined">
                    chevron_left
                  </span>
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((page) => {
                    const delta = 2;
                    return (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - delta &&
                        page <= currentPage + delta)
                    );
                  })
                  .map((page, index, arr) => (
                    <div key={`page-${page}`}>
                      {index > 0 && arr[index - 1] !== page - 1 && (
                        <span className={styles.paginationEllipsis}>...</span>
                      )}
                      <button
                        className={`${styles.paginationBtn} ${
                          currentPage === page ? styles.active : ""
                        }`}
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </button>
                    </div>
                  ))}

                <button
                  className={styles.paginationBtn}
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  title="Trang sau"
                >
                  <span className="material-symbols-outlined">
                    chevron_right
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedLead && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowDetailModal(false)}
        >
          <div
            className={styles.modalContainer}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2>
                <span className="material-symbols-outlined">info</span>
                Chi tiết đề xuất thu hồi Lead
              </h2>
              <button
                className={styles.closeButton}
                onClick={() => setShowDetailModal(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.detailSection}>
                <h3>Thông tin khách hàng</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Mã KH:</label>
                    <span>{selectedLead.ma_kh}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Tên khách hàng:</label>
                    <span>{selectedLead.ten_khach_hang}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Số điện thoại:</label>
                    <span>{selectedLead.sdt}</span>
                  </div>
                </div>
              </div>

              <div className={styles.detailSection}>
                <h3>Lý do thu hồi</h3>
                <div className={styles.reasonBox}>
                  <p>{selectedLead.reason}</p>
                </div>
              </div>

              <div className={styles.detailSection}>
                <h3>Thông tin đề xuất</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <label>Người đề xuất:</label>
                    <span>
                      {selectedLead.user_id_de_xuat} -{" "}
                      {selectedLead.ten_nguoi_de_xuat}
                    </span>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Thời gian đề xuất:</label>
                    <span>{formatDate(selectedLead.thoi_gian_de_xuat)}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Trạng thái:</label>
                    {getStatusBadge(selectedLead.trang_thai)}
                  </div>
                  {selectedLead.thoi_gian_duyet && (
                    <div className={styles.detailItem}>
                      <label>Thời gian duyệt:</label>
                      <span>{formatDate(selectedLead.thoi_gian_duyet)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              {selectedLead.trang_thai === "cho_duyet" && (
                <>
                  <button
                    className={styles.btnApproveLarge}
                    onClick={() => {
                      handleApprove(selectedLead.id_de_xuat);
                      setShowDetailModal(false);
                    }}
                  >
                    <span className="material-symbols-outlined">
                      check_circle
                    </span>
                    Phê duyệt
                  </button>
                  <button
                    className={styles.btnRejectLarge}
                    onClick={() => {
                      handleReject(selectedLead.id_de_xuat);
                      setShowDetailModal(false);
                    }}
                  >
                    <span className="material-symbols-outlined">cancel</span>
                    Từ chối
                  </button>
                </>
              )}
              <button
                className={styles.btnClose}
                onClick={() => setShowDetailModal(false)}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </main>
    </div>
  );
}
