import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import useAuthStore from "@/stores/useAuthStore";
import { API_URL } from "@/config/api";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import Sidebar from "@/components/Sidebar/Sidebar";
import "material-symbols";
import styles from "./ProposalLeadManagement.module.css";

interface ProposalLead {
  id_de_xuat: number;
  id_kh: number;
  ma_kh: string;
  ten_khach_hang: string;
  sdt1: string;
  gioi_tinh: string;
  dia_chi: string;
  nguon_data: string;
  dac_thu_sp: string;
  nhu_cau_sd: string;
  trang_thai: string;
  id_acc: number;
  user_id_de_xuat: string;
  ten_nguoi_de_xuat: string;
  thoi_gian_de_xuat: string;
  thoi_gian_duyet?: string;
  id_acc_duyet?: number;
}

export default function ProposalLeadManagement() {
  const { token, user } = useAuthStore();
  const [leads, setLeads] = useState<ProposalLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("cho_duyet"); // cho_duyet, da_duyet, tu_choi
  const [selectedLead, setSelectedLead] = useState<ProposalLead | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    fetchLeads();
  }, [filter]);

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const url = filter
        ? `${API_URL}/api/lead/de_xuat/danh_sach?trang_thai=${filter}`
        : `${API_URL}/api/lead/de_xuat/danh_sach`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token || ""}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        setLeads(result.data || []);
      } else {
        toast.error("Lỗi khi tải danh sách đề xuất");
      }
    } catch (error) {
      console.error("Error fetching proposal leads:", error);
      toast.error("Lỗi khi tải danh sách đề xuất");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id_de_xuat: number) => {
    if (!confirm("Xác nhận phê duyệt đề xuất này?")) return;

    try {
      const response = await fetch(`${API_URL}/api/lead/de_xuat/xac_nhan`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify({
          id_de_xuat,
          trang_thai: "da_duyet",
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message || "Đã phê duyệt đề xuất!");
        fetchLeads(); // Refresh list
      } else {
        toast.error(result.error || "Lỗi khi phê duyệt");
      }
    } catch (error) {
      console.error("Error approving lead:", error);
      toast.error("Lỗi khi phê duyệt đề xuất");
    }
  };

  const handleReject = async (id_de_xuat: number) => {
    if (!confirm("Xác nhận từ chối đề xuất này?")) return;

    try {
      const response = await fetch(`${API_URL}/api/lead/de_xuat/xac_nhan`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify({
          id_de_xuat,
          trang_thai: "tu_choi",
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message || "Đã từ chối đề xuất!");
        fetchLeads(); // Refresh list
      } else {
        toast.error(result.error || "Lỗi khi từ chối");
      }
    } catch (error) {
      console.error("Error rejecting lead:", error);
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

  const openDetailModal = (lead: ProposalLead) => {
    setSelectedLead(lead);
    setShowDetailModal(true);
  };

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
        <div className={styles.proposalLeadManagement}>
          <Breadcrumb />
      <div className={styles.pageHeader}>
        <h1>
          <span className="material-symbols-outlined">assignment_ind</span>
          Quản lý Đề xuất tạo Lead
        </h1>
        <p className={styles.pageSubtitle}>
          Phê duyệt hoặc từ chối các đề xuất tạo lead từ nhân viên
        </p>
      </div>

      <div className={styles.filterTabs}>
        <button
          className={`${styles.filterTab} ${filter === "cho_duyet" ? styles.active : ""}`}
          onClick={() => setFilter("cho_duyet")}
        >
          <span className="material-symbols-outlined">schedule</span>
          Chờ duyệt
          <span className={styles.count}>
            {leads.filter((l) => l.trang_thai === "cho_duyet").length}
          </span>
        </button>
        <button
          className={`${styles.filterTab} ${filter === "da_duyet" ? styles.active : ""}`}
          onClick={() => setFilter("da_duyet")}
        >
          <span className="material-symbols-outlined">check_circle</span>
          Đã duyệt
          <span className={styles.count}>
            {leads.filter((l) => l.trang_thai === "da_duyet").length}
          </span>
        </button>
        <button
          className={`${styles.filterTab} ${filter === "tu_choi" ? styles.active : ""}`}
          onClick={() => setFilter("tu_choi")}
        >
          <span className="material-symbols-outlined">cancel</span>
          Từ chối
          <span className={styles.count}>
            {leads.filter((l) => l.trang_thai === "tu_choi").length}
          </span>
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
                      <div className={styles.customerGender}>
                        {lead.gioi_tinh}
                      </div>
                    </div>
                  </td>
                  <td>{lead.sdt1}</td>
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
                Chi tiết đề xuất Lead
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
                    <label>Giới tính:</label>
                    <span>{selectedLead.gioi_tinh}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Số điện thoại:</label>
                    <span>{selectedLead.sdt1}</span>
                  </div>
                  <div className={`${styles.detailItem} ${styles.fullWidth}`}>
                    <label>Địa chỉ:</label>
                    <span>{selectedLead.dia_chi || "Chưa có"}</span>
                  </div>
                  <div className={styles.detailItem}>
                    <label>Nguồn data:</label>
                    <span>{selectedLead.nguon_data}</span>
                  </div>
                </div>
              </div>

              <div className={styles.detailSection}>
                <h3>Thông tin nhu cầu</h3>
                <div className={styles.detailGrid}>
                  <div className={`${styles.detailItem} ${styles.fullWidth}`}>
                    <label>Đặc thù sản phẩm:</label>
                    <span>{selectedLead.dac_thu_sp || "Chưa có"}</span>
                  </div>
                  <div className={`${styles.detailItem} ${styles.fullWidth}`}>
                    <label>Nhu cầu sử dụng:</label>
                    <span>{selectedLead.nhu_cau_sd || "Chưa có"}</span>
                  </div>
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
