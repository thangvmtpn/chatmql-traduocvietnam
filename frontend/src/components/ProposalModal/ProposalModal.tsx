import { useState } from "react";
import { toast } from "react-toastify";
import useAuthStore from "@/stores/useAuthStore";
import { API_URL } from "@/config/api";
import "material-symbols";
import "./ProposalModal.css";

interface ProposalModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface Customer {
  id_kh: number;
  ma_kh: string;
  ten_khach_hang: string;
  sdt1: string;
  sdt2: string;
  nhan_vien_pt: string;
  id_acc: number;
}

type TabType = "create" | "withdraw" | "share";

export default function ProposalModal({
  onClose,
  onSuccess,
}: ProposalModalProps) {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const [activeTab, setActiveTab] = useState<TabType>("create");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tab "Tạo Lead mới"
  const [formData, setFormData] = useState({
    ten_kh: "",
    sdt: "",
    gioi_tinh: "Nam",
    dia_chi: "",
    nguon_data: "CRM",
    dac_thu: "",
    nhu_cau: "",
  });

  // Tab "Thu hồi" & "Chia Lead"
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [isSearching, setIsSearching] = useState(false);

  // Tab "Thu hồi" - Lý do
  const [reasonType, setReasonType] = useState("khac"); // "kkn", "kt", "khac"
  const [reason, setReason] = useState("");

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError(null);
  };

  // Reset form khi chuyển tab
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setError(null);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedCustomer(null);
    setReasonType("khac");
    setReason("");
  };

  // Cập nhật query input
  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    setSelectedCustomer(null);
  };

  // Tìm kiếm khách hàng theo mã khách hàng hoặc SDT
  const performSearch = async (query: string) => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      toast.warning("Vui lòng nhập ít nhất 2 ký tự để tìm kiếm!");
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `${API_URL}/api/customers/search?query=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Bearer ${token || ""}`,
          },
        },
      );

      const result = await response.json();
      if (result.success && result.data) {
        setSearchResults(result.data);
        if (result.data.length === 0) {
          toast.info("Không tìm thấy khách hàng nào phù hợp");
        }
      }
    } catch (err) {
      console.error("Search error:", err);
      setSearchResults([]);
      toast.error("Lỗi khi tìm kiếm. Vui lòng thử lại!");
    } finally {
      setIsSearching(false);
    }
  };

  // Handle Enter key
  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      performSearch(searchQuery);
    }
  };

  // Handle search button click
  const handleSearchClick = () => {
    performSearch(searchQuery);
  };

  // Submit tạo lead mới
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.ten_kh.trim()) {
      setError("Vui lòng nhập tên khách hàng!");
      toast.error("Vui lòng nhập tên khách hàng!");
      return;
    }

    if (!formData.sdt.trim()) {
      setError("Vui lòng nhập số điện thoại!");
      toast.error("Vui lòng nhập số điện thoại!");
      return;
    }

    // Validate phone number format (basic)
    const phoneRegex = /^[0-9]{10,11}$/;
    if (!phoneRegex.test(formData.sdt.trim())) {
      setError("Số điện thoại không hợp lệ (10-11 chữ số)!");
      toast.error("Số điện thoại không hợp lệ!");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        data: formData,
        nguoi_gui: {
          user_id: user?.user_id || "",
          name: user?.name || "",
        },
      };

      const response = await fetch(`${API_URL}/api/lead/de_xuat_them_lead`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Lỗi khi gửi đề xuất");
      }

      if (result.error) {
        if (result.existing) {
          toast.error(
            `${result.error}\nKhách hàng: ${result.existing.ten_khach_hang}\nNhân viên phụ trách: ${result.existing.nhan_vien_pt}\n\nBạn vẫn có thể gửi đề xuất reassign để chuyển khách hàng này cho mình`,
            {
              position: "top-right",
              autoClose: 5000,
            },
          );
        } else {
          toast.error(result.error, {
            position: "top-right",
            autoClose: 3000,
          });
        }
        setError(result.error);
        return;
      }

      toast.success(
        result.message ||
          "Đã gửi đề xuất tạo lead thành công! Chờ admin phê duyệt.",
        {
          position: "top-right",
          autoClose: 3000,
        },
      );
      onSuccess();
      onClose();
    } catch (error: any) {
      const errorMsg =
        error.message || "Có lỗi xảy ra khi gửi đề xuất. Vui lòng thử lại!";
      toast.error(errorMsg, {
        position: "top-right",
        autoClose: 3000,
      });
      setError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit thu hồi lead
  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedCustomer) {
      setError("Vui lòng chọn khách hàng để thu hồi lead!");
      toast.error("Vui lòng chọn khách hàng!");
      return;
    }

    // Xác định lý do dựa trên reasonType
    let finalReason = "";
    if (reasonType === "kkn") {
      finalReason = "KKN";
    } else if (reasonType === "kt") {
      finalReason = "KT";
    } else {
      finalReason = reason.trim();
      if (!finalReason) {
        setError("Vui lòng nhập lý do thu hồi lead!");
        toast.error("Vui lòng nhập lý do!");
        return;
      }

      if (finalReason.length < 10) {
        setError("Lý do phải có ít nhất 10 ký tự!");
        toast.error("Lý do quá ngắn!");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const payload = {
        id_kh: selectedCustomer.id_kh,
        ma_kh: selectedCustomer.ma_kh,
        ten_khach_hang: selectedCustomer.ten_khach_hang,
        sdt: selectedCustomer.sdt1 || selectedCustomer.sdt2,
        reason: finalReason,
        user_id_de_xuat: user?.user_id || "",
        ten_nguoi_de_xuat: user?.name || "",
      };

      const response = await fetch(`${API_URL}/api/lead/de_xuat_withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Lỗi khi gửi đề xuất");
      }

      if (result.error) {
        toast.error(result.error, {
          position: "top-right",
          autoClose: 3000,
        });
        setError(result.error);
        return;
      }

      toast.success(
        result.message ||
          "Đã gửi đề xuất thu hồi lead thành công! Chờ admin phê duyệt.",
        {
          position: "top-right",
          autoClose: 3000,
        },
      );
      onSuccess();
      onClose();
    } catch (error: any) {
      const errorMsg =
        error.message || "Có lỗi xảy ra khi gửi đề xuất. Vui lòng thử lại!";
      toast.error(errorMsg, {
        position: "top-right",
        autoClose: 3000,
      });
      setError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit chia lead
  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedCustomer) {
      setError("Vui lòng chọn khách hàng để chia lead!");
      toast.error("Vui lòng chọn khách hàng!");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        data: {
          sdt: selectedCustomer.sdt1 || selectedCustomer.sdt2,
          ten_kh: selectedCustomer.ten_khach_hang,
          gioi_tinh: "Nam",
        },
        nguoi_gui: {
          user_id: user?.user_id || "",
          name: user?.name || "",
        },
      };

      const response = await fetch(`${API_URL}/api/lead/de_xuat_them_lead`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Lỗi khi gửi đề xuất");
      }

      if (result.error) {
        toast.error(result.error, {
          position: "top-right",
          autoClose: 3000,
        });
        setError(result.error);
        return;
      }

      toast.success(
        result.message ||
          "Đã gửi đề xuất chia lead thành công! Chờ admin phê duyệt.",
        {
          position: "top-right",
          autoClose: 3000,
        },
      );
      onSuccess();
      onClose();
    } catch (error: any) {
      const errorMsg =
        error.message || "Có lỗi xảy ra khi gửi đề xuất. Vui lòng thử lại!";
      toast.error(errorMsg, {
        position: "top-right",
        autoClose: 3000,
      });
      setError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="proposal-modal-overlay" onClick={onClose}>
      <div
        className="proposal-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="proposal-modal-header">
          <h2>
            <span className="material-symbols-outlined">person_add</span>
            Đề xuất
          </h2>
          <button className="proposal-close-button" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="proposal-modal-tabs">
          <button
            className={`proposal-tab-button ${activeTab === "create" ? "active" : ""}`}
            onClick={() => handleTabChange("create")}
          >
            <span className="material-symbols-outlined">person_add</span>
            Tạo mới
          </button>
          <button
            className={`proposal-tab-button ${activeTab === "share" ? "active" : ""}`}
            onClick={() => handleTabChange("share")}
          >
            <span className="material-symbols-outlined">group</span>
            Chia lead
          </button>
          <button
            className={`proposal-tab-button ${activeTab === "withdraw" ? "active" : ""}`}
            onClick={() => handleTabChange("withdraw")}
          >
            <span className="material-symbols-outlined">person_remove</span>
            Thu hồi
          </button>
        </div>

        {/* Tab: Tạo Lead mới */}
        {activeTab === "create" && (
          <form onSubmit={handleCreateSubmit} className="proposal-modal-form">
            <div className="proposal-form-section">
              <h3>Thông tin cơ bản</h3>

              <div className="proposal-form-row">
                <div className="proposal-form-group">
                  <label>
                    Tên khách hàng <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    name="ten_kh"
                    value={formData.ten_kh}
                    onChange={handleChange}
                    placeholder="Nhập tên khách hàng"
                    required
                  />
                </div>

                <div className="proposal-form-group">
                  <label>
                    Giới tính <span className="required">*</span>
                  </label>
                  <select
                    name="gioi_tinh"
                    value={formData.gioi_tinh}
                    onChange={handleChange}
                    required
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>
              </div>

              <div className="proposal-form-row">
                <div className="proposal-form-group">
                  <label>
                    Số điện thoại <span className="required">*</span>
                  </label>
                  <input
                    type="tel"
                    name="sdt"
                    value={formData.sdt}
                    onChange={handleChange}
                    placeholder="Nhập số điện thoại"
                    required
                  />
                </div>

                <div className="proposal-form-group">
                  <label>
                    Nguồn Data <span className="required">*</span>
                  </label>
                  <select
                    name="nguon_data"
                    value={formData.nguon_data}
                    onChange={handleChange}
                    required
                  >
                    <option value="CRM">CRM</option>
                    <option value="Facebook">Facebook</option>
                    <option value="Zalo">Zalo</option>
                    <option value="Website">Website</option>
                    <option value="Giới thiệu">Giới thiệu</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>
              </div>

              <div className="proposal-form-group full-width">
                <label>Địa chỉ</label>
                <textarea
                  name="dia_chi"
                  value={formData.dia_chi}
                  onChange={handleChange}
                  placeholder="Nhập địa chỉ"
                  rows={2}
                />
              </div>
            </div>

            <div className="proposal-form-section">
              <h3>Thông tin nhu cầu</h3>

              <div className="proposal-form-group full-width">
                <label>Đặc thù sản phẩm</label>
                <textarea
                  name="dac_thu"
                  value={formData.dac_thu}
                  onChange={handleChange}
                  placeholder="Nhập đặc thù sản phẩm"
                  rows={3}
                />
              </div>

              <div className="proposal-form-group full-width">
                <label>Nhu cầu sử dụng</label>
                <textarea
                  name="nhu_cau"
                  value={formData.nhu_cau}
                  onChange={handleChange}
                  placeholder="Nhập nhu cầu sử dụng"
                  rows={3}
                />
              </div>
            </div>

            {error && <div className="proposal-error-message">{error}</div>}

            <div className="proposal-modal-footer">
              <button
                type="button"
                className="proposal-btn-cancel"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="proposal-btn-submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <span className="material-symbols-outlined proposal-rotating">
                      progress_activity
                    </span>
                    Đang gửi...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">send</span>
                    Gửi đề xuất
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Tab: Chia Lead */}
        {activeTab === "share" && (
          <form onSubmit={handleShareSubmit} className="proposal-modal-form">
            <div className="proposal-form-section">
              <h3>Tìm kiếm khách hàng để chia Lead</h3>

              <div className="proposal-form-group full-width">
                <label>Tìm kiếm theo mã khách hàng hoặc số điện thoại</label>
                <div className="proposal-search-input-wrapper">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={handleSearchInputChange}
                    onKeyPress={handleSearchKeyPress}
                    placeholder="Nhập mã khách hàng (KH...) hoặc số điện thoại"
                    disabled={isSubmitting || isSearching}
                  />
                  {isSearching ? (
                    <span className="material-symbols-outlined proposal-search-loading">
                      progress_activity
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="proposal-search-button"
                      onClick={handleSearchClick}
                      disabled={
                        isSubmitting ||
                        isSearching ||
                        searchQuery.trim().length < 2
                      }
                      title="Tìm kiếm (Enter)"
                    >
                      <span className="material-symbols-outlined">search</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="proposal-search-results">
                  <h4>Kết quả tìm kiếm ({searchResults.length}):</h4>
                  <div className="proposal-results-list">
                    {searchResults.map((customer) => (
                      <div
                        key={customer.id_kh}
                        className={`proposal-result-item ${selectedCustomer?.id_kh === customer.id_kh ? "selected" : ""}`}
                        onClick={() => setSelectedCustomer(customer)}
                      >
                        <div className="proposal-result-main">
                          <div className="proposal-result-header">
                            <span className="ma-kh">{customer.ma_kh}</span>
                            <span className="ten-kh">
                              {customer.ten_khach_hang}
                            </span>
                          </div>
                          <div className="proposal-result-details">
                            <span className="sdt">
                              ☎️ {customer.sdt1 || customer.sdt2}
                            </span>
                            <span className="nhan-vien">
                              👤 Nhân viên: {customer.nhan_vien_pt}
                            </span>
                          </div>
                        </div>
                        {selectedCustomer?.id_kh === customer.id_kh && (
                          <span className="material-symbols-outlined proposal-check-icon">
                            check_circle
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected Customer Info */}
              {selectedCustomer && (
                <div className="proposal-selected-customer-info">
                  <h4>Khách hàng đã chọn:</h4>
                  <div className="proposal-info-card">
                    <div className="info-row">
                      <span className="proposal-info-label">
                        Mã khách hàng:
                      </span>
                      <span className="proposal-info-value">
                        {selectedCustomer.ma_kh}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="proposal-info-label">
                        Tên khách hàng:
                      </span>
                      <span className="proposal-info-value">
                        {selectedCustomer.ten_khach_hang}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="proposal-info-label">
                        Số điện thoại:
                      </span>
                      <span className="proposal-info-value">
                        {selectedCustomer.sdt1 || selectedCustomer.sdt2}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="proposal-info-label">
                        Nhân viên hiện tại:
                      </span>
                      <span className="proposal-info-value info-warning">
                        {selectedCustomer.nhan_vien_pt}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {error && <div className="proposal-error-message">{error}</div>}

            <div className="proposal-modal-footer">
              <button
                type="button"
                className="proposal-btn-cancel"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="proposal-btn-submit"
                disabled={isSubmitting || !selectedCustomer}
              >
                {isSubmitting ? (
                  <>
                    <span className="material-symbols-outlined proposal-rotating">
                      progress_activity
                    </span>
                    Đang gửi...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">send</span>
                    Gửi đề xuất
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Tab: Thu hồi Lead */}
        {activeTab === "withdraw" && (
          <form onSubmit={handleWithdrawSubmit} className="proposal-modal-form">
            <div className="proposal-form-section">
              <h3>Tìm kiếm khách hàng để thu hồi Lead</h3>

              <div className="proposal-form-group full-width">
                <label>Tìm kiếm theo mã khách hàng hoặc số điện thoại</label>
                <div className="proposal-search-input-wrapper">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={handleSearchInputChange}
                    onKeyPress={handleSearchKeyPress}
                    placeholder="Nhập mã khách hàng (KH...) hoặc số điện thoại"
                    disabled={isSubmitting || isSearching}
                  />
                  {isSearching ? (
                    <span className="material-symbols-outlined proposal-search-loading">
                      progress_activity
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="proposal-search-button"
                      onClick={handleSearchClick}
                      disabled={
                        isSubmitting ||
                        isSearching ||
                        searchQuery.trim().length < 2
                      }
                      title="Tìm kiếm (Enter)"
                    >
                      <span className="material-symbols-outlined">search</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="proposal-search-results">
                  <h4>Kết quả tìm kiếm ({searchResults.length}):</h4>
                  <div className="proposal-results-list">
                    {searchResults.map((customer) => (
                      <div
                        key={customer.id_kh}
                        className={`proposal-result-item ${selectedCustomer?.id_kh === customer.id_kh ? "selected" : ""}`}
                        onClick={() => setSelectedCustomer(customer)}
                      >
                        <div className="proposal-result-main">
                          <div className="proposal-result-header">
                            <span className="ma-kh">{customer.ma_kh}</span>
                            <span className="ten-kh">
                              {customer.ten_khach_hang}
                            </span>
                          </div>
                          <div className="proposal-result-details">
                            <span className="sdt">
                              ☎️ {customer.sdt1 || customer.sdt2}
                            </span>
                            <span className="nhan-vien">
                              👤 Nhân viên: {customer.nhan_vien_pt}
                            </span>
                          </div>
                        </div>
                        {selectedCustomer?.id_kh === customer.id_kh && (
                          <span className="material-symbols-outlined proposal-check-icon">
                            check_circle
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected Customer Info */}
              {selectedCustomer && (
                <div className="proposal-selected-customer-info">
                  <h4>Khách hàng đã chọn:</h4>
                  <div className="proposal-info-card">
                    <div className="info-row">
                      <span className="proposal-info-label">
                        Mã khách hàng:
                      </span>
                      <span className="proposal-info-value">
                        {selectedCustomer.ma_kh}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="proposal-info-label">
                        Tên khách hàng:
                      </span>
                      <span className="proposal-info-value">
                        {selectedCustomer.ten_khach_hang}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="proposal-info-label">
                        Số điện thoại:
                      </span>
                      <span className="proposal-info-value">
                        {selectedCustomer.sdt1 || selectedCustomer.sdt2}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="proposal-info-label">
                        Nhân viên hiện tại:
                      </span>
                      <span className="proposal-info-value info-warning">
                        {selectedCustomer.nhan_vien_pt}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="proposal-form-section">
              <h3>Lý do thu hồi Lead</h3>

              <div className="proposal-form-group full-width">
                <label>
                  Chọn lý do <span className="required">*</span>
                </label>
                <select
                  value={reasonType}
                  onChange={(e) => {
                    setReasonType(e.target.value);
                    setError(null);
                  }}
                  disabled={isSubmitting}
                >
                  <option value="khac">Khác</option>
                  <option value="kkn">KKN</option>
                  <option value="kt">KT</option>
                </select>
              </div>

              {reasonType === "khac" && (
                <div className="proposal-form-group full-width">
                  <label>
                    Nhập lý do chi tiết <span className="required">*</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      setError(null);
                    }}
                    placeholder="Nhập lý do thu hồi lead (ít nhất 10 ký tự)..."
                    rows={4}
                    disabled={isSubmitting}
                  />
                  <div className="proposal-char-count">
                    {reason.length}/100 ký tự (tối thiểu 10)
                  </div>
                </div>
              )}

              {reasonType !== "khac" && (
                <div className="proposal-form-group full-width proposal-reason-info">
                  <p>
                    <strong>Lý do đã chọn:</strong>{" "}
                    {reasonType === "kkn" ? "KKN" : "KT"}
                  </p>
                </div>
              )}
            </div>

            {error && <div className="proposal-error-message">{error}</div>}

            <div className="proposal-modal-footer">
              <button
                type="button"
                className="proposal-btn-cancel"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="proposal-btn-submit"
                disabled={
                  isSubmitting ||
                  !selectedCustomer ||
                  (reasonType === "khac" && reason.trim().length < 10)
                }
              >
                {isSubmitting ? (
                  <>
                    <span className="material-symbols-outlined proposal-rotating">
                      progress_activity
                    </span>
                    Đang gửi...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">send</span>
                    Gửi đề xuất
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
