import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { customerService, SearchTemplate } from "@/services/customerService";
import { toast } from "react-toastify";
import useAuthStore from "@/stores/useAuthStore";
import { CombinedVipBadge } from "@/components/CustomerBadges/CustomerBadges";
import { useSearchProducts } from "@/hooks/useDashboard";
import MultiSelectDropdown from "@/components/MultiSelectDropdown/MultiSelectDropdown";
import "./CustomerManagement.css";

interface SearchFormData {
  customer_code: string;
  customer_name: string;
  phone: string;
  vip_from: string;
  vip_to: string;
  age_from: string;
  age_to: string;
  thang_sinh: string;
  con_giap: string;
  gmv_from: string;
  gmv_to: string;
  order_count_from: string;
  order_count_to: string;
  mien: string;
  gioi_tinh: string;
  product_codes: string[];
  purchase_date_from: string;
  purchase_date_to: string;
}

interface SearchResult {
  id_kh: number;
  ma_kh: string;
  ten_khach_hang: string;
  sdt: string;
  dia_chi: string;
  gmv: number;
  gmv_truoc_2026?: number;
  so_lan_mua: number;
  aov: number;
  ten_tinh: string;
  ten_xa: string;
  nhom_kh: string;
  mien: string;
  gioi_tinh: string;
  ngay_sinh?: string;
}

interface SearchTabProps {
  filterType?: "all" | "handed_over" | "not_handed_over";
}

export function SearchTab({ filterType = "all" }: SearchTabProps) {
  const [searchParams] = useSearchParams();
  const staffIdFromUrl = searchParams.get("staff_id");
  const user = useAuthStore((state) => state.user);
  const [searchForm, setSearchForm] = useState<SearchFormData>({
    customer_code: "",
    customer_name: "",
    phone: "",
    vip_from: "",
    vip_to: "",
    age_from: "",
    age_to: "",
    thang_sinh: "",
    con_giap: "",
    gmv_from: "",
    gmv_to: "",
    order_count_from: "",
    order_count_to: "",
    mien: "",
    gioi_tinh: "",
    product_codes: [],
    purchase_date_from: "",
    purchase_date_to: "",
  });

  const { data: productOptions } = useSearchProducts("", 1000, false);

  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalRecords, setTotalRecords] = useState(0);
  const [sortColumn, setSortColumn] = useState<"cap_vip" | "gmv" | "so_lan_mua" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] = useState(50);

  // State cho mẫu tìm kiếm (Search Templates)
  const [templates, setTemplates] = useState<SearchTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | "">("");
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);

  // State cho checkbox và Broadcast
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);

  // Clear selected on search result change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchResults]);

  const currentPageIds = searchResults.map((c) => c.id_kh);
  const allCurrentSelected = currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.has(id));
  const someCurrentSelected = !allCurrentSelected && currentPageIds.some(id => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allCurrentSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        currentPageIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        currentPageIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const toggleSelectRow = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (user?.role_id === 1) {
      loadTemplates();
    }
  }, [user]);

  const loadTemplates = async () => {
    try {
      const res = await customerService.getSearchTemplates();
      if (res.success) {
        setTemplates(res.data);
      }
    } catch (error) {
      console.error("Lỗi khi tải mẫu tìm kiếm:", error);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error("Vui lòng nhập tên mẫu tìm kiếm");
      return;
    }
    try {
      if (editingTemplateId) {
        await customerService.updateSearchTemplate(editingTemplateId, templateName, searchForm);
        toast.success("Cập nhật mẫu tìm kiếm thành công");
      } else {
        await customerService.saveSearchTemplate(templateName, searchForm);
        toast.success("Lưu mẫu tìm kiếm thành công");
      }
      setIsSaveModalOpen(false);
      setTemplateName("");
      setEditingTemplateId(null);
      loadTemplates();
    } catch (error) {
      toast.error("Lỗi khi lưu mẫu tìm kiếm");
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa mẫu tìm kiếm này?")) {
      try {
        await customerService.deleteSearchTemplate(id);
        toast.success("Xóa mẫu tìm kiếm thành công");
        if (selectedTemplateId === id) {
          setSelectedTemplateId("");
          handleReset();
        }
        loadTemplates();
      } catch (error) {
        toast.error("Lỗi khi xóa mẫu tìm kiếm");
      }
    }
  };

  const handleSelectTemplate = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedTemplateId(val === "" ? "" : Number(val));
    if (val === "") {
      handleReset();
      return;
    }
    const tpl = templates.find((t) => t.id === Number(val));
    if (tpl && tpl.filter_data) {
      setSearchForm({
        ...searchForm,
        ...tpl.filter_data,
      });
    }
  };

  const handleEditTemplateClick = (tpl: SearchTemplate) => {
    setTemplateName(tpl.name);
    setEditingTemplateId(tpl.id);
    setSearchForm({
      ...searchForm,
      ...tpl.filter_data,
    });
    setSelectedTemplateId(tpl.id);
    setIsSaveModalOpen(true);
  };


  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setSearchForm({
      ...searchForm,
      [name]: value,
    });
  };

  const fetchSearchResults = async (
    page: number,
    sortBy?: string | null,
    sortDir?: "asc" | "desc",
    currentSize?: number
  ) => {
    setIsSearching(true);
    setHasSearched(true);
    setCurrentPage(page);

    try {
      const response = await customerService.searchCustomers({
        ...searchForm,
        staff_id: staffIdFromUrl || undefined,
        filter_type: filterType,
        page: page,
        page_size: currentSize || pageSize,
        sort_by: sortBy || undefined,
        sort_order: sortBy ? sortDir : undefined,
      });
      setSearchResults(response.data);
      setTotalRecords(response.total);
      setTotalPages(response.total_pages);

      if (page === 1) {
        if (response.data.length === 0) {
          toast.info("Không tìm thấy khách hàng nào phù hợp");
        } else {
          toast.success(`Tìm thấy tổng cộng ${response.total} khách hàng`);
        }
      } else {
        window.scrollTo(0, 0);
      }
    } catch (error) {
      console.error("Lỗi khi tải dữ liệu:", error);
      toast.error("Có lỗi xảy ra khi tải dữ liệu");
      if (page === 1) {
        setSearchResults([]);
        setTotalRecords(0);
        setTotalPages(0);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = () => {
    fetchSearchResults(1, sortColumn, sortDirection, pageSize);
  };

  const handlePageChange = (newPage: number) => {
    fetchSearchResults(newPage, sortColumn, sortDirection, pageSize);
  };

  const handleSortClick = (column: "cap_vip" | "gmv" | "so_lan_mua") => {
    const isSameColumn = sortColumn === column;
    const newDir = isSameColumn ? (sortDirection === "asc" ? "desc" : "asc") : "desc";
    
    setSortColumn(column);
    setSortDirection(newDir);
    
    if (hasSearched) {
      fetchSearchResults(1, column, newDir, pageSize);
    }
  };

  const handleReset = () => {
    setSearchForm({
      customer_code: "",
      customer_name: "",
      phone: "",
      vip_from: "",
      vip_to: "",
      age_from: "",
      age_to: "",
      thang_sinh: "",
      con_giap: "",
      gmv_from: "",
      gmv_to: "",
      order_count_from: "",
      order_count_to: "",
      mien: "",
      gioi_tinh: "",
      product_codes: [],
      purchase_date_from: "",
      purchase_date_to: "",
    });
    setSearchResults([]);
    setHasSearched(false);
    setCurrentPage(1);
    setTotalPages(0);
    setTotalRecords(0);
    setSortColumn(null);
    setSortDirection("desc");
  };

  return (
    <div className="search-tab">
      {/* Form tìm kiếm */}
      <div className="search-form-container">
        <div className="search-form-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-symbols-outlined">manage_search</span>
            <h3>Tìm kiếm chuyên sâu khách hàng</h3>
          </div>
          {user?.role_id === 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#6b7280' }}>bookmark</span>
                <select 
                  value={selectedTemplateId} 
                  onChange={handleSelectTemplate}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                >
                  <option value="">-- Chọn mẫu tìm kiếm --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              {selectedTemplateId !== "" && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button 
                    onClick={() => {
                      const tpl = templates.find(t => t.id === selectedTemplateId);
                      if (tpl) handleEditTemplateClick(tpl);
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', display: 'flex', padding: '4px' }}
                    title="Chỉnh sửa mẫu"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>edit</span>
                  </button>
                  <button 
                    onClick={() => handleDeleteTemplate(selectedTemplateId as number)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', padding: '4px' }}
                    title="Xóa mẫu"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>delete</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="search-form-grid">
          {/* Thông tin cơ bản */}
          <div className="form-section">
            <h4 className="section-title">
              <span className="material-symbols-outlined">person</span>
              Thông tin cơ bản
            </h4>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="customer_code">Mã khách hàng</label>
                <input
                  type="text"
                  id="customer_code"
                  name="customer_code"
                  value={searchForm.customer_code}
                  onChange={handleInputChange}
                  placeholder="Nhập mã khách hàng"
                />
              </div>
              <div className="form-field">
                <label htmlFor="customer_name">Tên khách hàng</label>
                <input
                  type="text"
                  id="customer_name"
                  name="customer_name"
                  value={searchForm.customer_name}
                  onChange={handleInputChange}
                  placeholder="Nhập tên khách hàng"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="phone">Số điện thoại</label>
                <input
                  type="text"
                  id="phone"
                  name="phone"
                  value={searchForm.phone}
                  onChange={handleInputChange}
                  placeholder="Nhập số điện thoại"
                />
              </div>
              <div className="form-field">
                <label>Độ tuổi </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="number"
                    name="age_from"
                    value={searchForm.age_from}
                    onChange={handleInputChange}
                    placeholder="Từ"
                    style={{ flex: 1 }}
                  />
                  <span style={{ display: "flex", alignItems: "center", color: "#6b7280" }}>-</span>
                  <input
                    type="number"
                    name="age_to"
                    value={searchForm.age_to}
                    onChange={handleInputChange}
                    placeholder="Đến"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="mien">Vùng miền</label>
                <select
                  id="mien"
                  name="mien"
                  value={searchForm.mien}
                  onChange={handleInputChange}
                >
                  <option value="">Tất cả</option>
                  <option value="BẮC">Bắc</option>
                  <option value="TRUNG">Trung</option>
                  <option value="NAM">Nam</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="gioi_tinh">Giới tính</label>
                <select
                  id="gioi_tinh"
                  name="gioi_tinh"
                  value={searchForm.gioi_tinh}
                  onChange={handleInputChange}
                >
                  <option value="">Tất cả</option>
                  <option value="Nam">Nam</option>
                  <option value="Nữ">Nữ</option>
                </select>
              </div>
            </div>
          </div>

          {/* Lịch sử & Phân hạng */}
          <div className="form-section">
            <h4 className="section-title">
              <span className="material-symbols-outlined">workspace_premium</span>
              Lịch sử & Phân hạng
            </h4>
            <div className="form-row">
              <div className="form-field" style={{ width: '100%' }}>
                <label>Cấp VIP </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="number"
                    name="vip_from"
                    value={searchForm.vip_from}
                    onChange={handleInputChange}
                    placeholder="Từ"
                    style={{ flex: 1 }}
                  />
                  <span style={{ display: "flex", alignItems: "center", color: "#6b7280" }}>-</span>
                  <input
                    type="number"
                    name="vip_to"
                    value={searchForm.vip_to}
                    onChange={handleInputChange}
                    placeholder="Đến"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field" style={{ width: '100%' }}>
                <label>GMV </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="number"
                    name="gmv_from"
                    value={searchForm.gmv_from}
                    onChange={handleInputChange}
                    placeholder="0"
                    min="0"
                    style={{ flex: 1 }}
                  />
                  <span style={{ display: "flex", alignItems: "center", color: "#6b7280" }}>-</span>
                  <input
                    type="number"
                    name="gmv_to"
                    value={searchForm.gmv_to}
                    onChange={handleInputChange}
                    placeholder="100,000,000"
                    min="0"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field" style={{ width: '100%' }}>
                <label>Số lần mua hàng </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="number"
                    name="order_count_from"
                    value={searchForm.order_count_from}
                    onChange={handleInputChange}
                    placeholder="0"
                    min="0"
                    style={{ flex: 1 }}
                  />
                  <span style={{ display: "flex", alignItems: "center", color: "#6b7280" }}>-</span>
                  <input
                    type="number"
                    name="order_count_to"
                    value={searchForm.order_count_to}
                    onChange={handleInputChange}
                    placeholder="100"
                    min="0"
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Phân loại & Đặc điểm */}
          <div className="form-section">
            <h4 className="section-title">
              <span className="material-symbols-outlined">category</span>
              Phân loại & Đặc điểm
            </h4>
            <div className="form-row">
              <div className="form-field" style={{ width: '100%' }}>
                <label>Sản phẩm</label>
                <div style={{ position: "relative", zIndex: 100 }}>
                  <MultiSelectDropdown
                    label="sản phẩm"
                    options={productOptions?.map((p: any) => ({
                      value: p.code_product,
                      label: p.name_product,
                    })) || []}
                    selected={searchForm.product_codes}
                    onChange={(v) => {
                      setSearchForm({
                        ...searchForm,
                        product_codes: v,
                      });
                    }}
                    placeholder="Tất cả sản phẩm"
                    searchPlaceholder="Tìm kiếm sản phẩm..."
                  />
                </div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field" style={{ width: '100%' }}>
                <label>Ngày mua hàng </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="date"
                    name="purchase_date_from"
                    value={searchForm.purchase_date_from}
                    onChange={handleInputChange}
                    style={{ flex: 1 }}
                  />
                  <span style={{ display: "flex", alignItems: "center", color: "#6b7280" }}>-</span>
                  <input
                    type="date"
                    name="purchase_date_to"
                    value={searchForm.purchase_date_to}
                    onChange={handleInputChange}
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-field">
                <label htmlFor="thang_sinh">Tháng sinh</label>
                <select
                  id="thang_sinh"
                  name="thang_sinh"
                  value={searchForm.thang_sinh}
                  onChange={handleInputChange}
                >
                  <option value="">Tất cả</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <option key={month} value={month.toString().padStart(2, "0")}>
                      Tháng {month}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="con_giap">Con giáp</label>
                <select
                  id="con_giap"
                  name="con_giap"
                  value={searchForm.con_giap}
                  onChange={handleInputChange}
                >
                  <option value="">Tất cả</option>
                  {["Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi"].map((zodiac) => (
                    <option key={zodiac} value={zodiac}>
                      {zodiac}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="search-form-actions">
          {user?.role_id === 1 && (
            <button 
              className="btn-search" 
              onClick={() => {
                setTemplateName("");
                setEditingTemplateId(null);
                setIsSaveModalOpen(true);
              }}
              style={{ backgroundColor: '#10b981', marginRight: 'auto' }}
            >
              <span className="material-symbols-outlined">save</span>
              Lưu mẫu tìm kiếm
            </button>
          )}
          <button className="btn-reset" onClick={handleReset}>
            <span className="material-symbols-outlined">restart_alt</span>
            Làm mới
          </button>
          <button
            className="btn-search"
            onClick={handleSearch}
            disabled={isSearching}
          >
            <span className="material-symbols-outlined">
              {isSearching ? "progress_activity" : "search"}
            </span>
            {isSearching ? "Đang tìm kiếm..." : "Tìm kiếm"}
          </button>
        </div>
      </div>

      {/* Kết quả tìm kiếm */}
      {hasSearched && (
        <div className="search-results-container">
          <div className="search-results-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', margin: 0 }}>
              <span className="material-symbols-outlined">
                format_list_bulleted
              </span>
              Kết quả tìm kiếm
              {totalRecords > 0 && (
                <span className="results-count" style={{ marginLeft: '8px' }}>
                  ({totalRecords} khách hàng)
                </span>
              )}
            </h3>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '14px', color: '#4b5563', whiteSpace: 'nowrap' }}>Hiển thị:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    const newSize = Number(e.target.value);
                    setPageSize(newSize);
                    if (hasSearched) {
                      fetchSearchResults(1, sortColumn, sortDirection, newSize);
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  <option value={50}>50 / trang</option>
                  <option value={100}>100 / trang</option>
                  <option value={200}>200 / trang</option>
                  <option value={500}>500 / trang</option>
                </select>
              </div>
            {user?.role_id === 1 && selectedIds.size > 0 && (
              <button
                onClick={() => setIsBroadcastModalOpen(true)}
                style={{
                  padding: "6px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "14px",
                  fontWeight: "500",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>campaign</span>
                Broadcast ({selectedIds.size})
              </button>
            )}
            </div>
          </div>

          {isSearching ? (
            <div className="table-loading">
              <span className="material-symbols-outlined spinning">
                progress_activity
              </span>
              <p>Đang tìm kiếm...</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="empty-state">
              <span className="material-symbols-outlined">search_off</span>
              <p>Không tìm thấy khách hàng nào phù hợp với tiêu chí tìm kiếm</p>
            </div>
          ) : (
            <div className="search-results-table-wrapper">
              <table className="customers-table">
                <thead>
                  <tr>
                    {user?.role_id === 1 && (
                      <th style={{ width: "40px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={allCurrentSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someCurrentSelected;
                          }}
                          onChange={toggleSelectAll}
                          style={{ cursor: "pointer", margin: 0, padding: 0 }}
                        />
                      </th>
                    )}
                    <th>STT</th>
                    <th>Mã KH</th>
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
                            color: sortDirection === "asc" ? "#22c55e" : "#ef4444",
                          }}
                        >
                          {sortDirection === "asc" ? "arrow_upward" : "arrow_downward"}
                        </span>
                      )}
                    </th>
                    <th>Tên khách hàng</th>
                    <th>SĐT</th>
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
                            color: sortDirection === "asc" ? "#22c55e" : "#ef4444",
                          }}
                        >
                          {sortDirection === "asc" ? "arrow_upward" : "arrow_downward"}
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
                            color: sortDirection === "asc" ? "#22c55e" : "#ef4444",
                          }}
                        >
                          {sortDirection === "asc" ? "arrow_upward" : "arrow_downward"}
                        </span>
                      )}
                    </th>
                    <th>Địa chỉ</th>
                    <th>Ngày sinh</th>
                    <th>Giới tính</th>
                    <th>Miền</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((customer, index) => (
                    <tr key={customer.id_kh} className={selectedIds.has(customer.id_kh) ? "selected-row" : ""} onClick={() => { if(user?.role_id === 1) toggleSelectRow(customer.id_kh) }} style={{ cursor: user?.role_id === 1 ? "pointer" : "default" }}>
                      {user?.role_id === 1 && (
                        <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(customer.id_kh)}
                            onChange={() => toggleSelectRow(customer.id_kh)}
                            style={{ cursor: "pointer", margin: 0, padding: 0 }}
                          />
                        </td>
                      )}
                      <td>{(currentPage - 1) * pageSize + index + 1}</td>
                      <td className="customer-code">
                        {customer.ma_kh.replace(/^KH/, "")}
                      </td>
                      <td>
                        <CombinedVipBadge
                          gmv={(customer.gmv || 0) + (customer.gmv_truoc_2026 || 0)}
                          aov={customer.aov || 0}
                        />
                      </td>
                      <td className="customer-name">
                        {customer.ten_khach_hang}
                      </td>
                      <td>{customer.sdt}</td>
                      <td className="customer-gmv">
                        {new Intl.NumberFormat("vi-VN").format(user?.role_id !== 1 ? (customer.gmv || 0) : ((customer.gmv || 0) + (customer.gmv_truoc_2026 || 0)))} đ
                      </td>
                      <td className="customer-orders">{customer.so_lan_mua}</td>
                      <td className="customer-address">{customer.dia_chi}</td>
                      <td>
                        {customer.ngay_sinh
                          ? customer.ngay_sinh.includes("-")
                            ? customer.ngay_sinh.split("-").reverse().join("/")
                            : customer.ngay_sinh
                          : ""}
                      </td>
                      <td>{customer.gioi_tinh}</td>
                      <td>{customer.mien}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalRecords > 0 && (
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

                {Array.from({ length: totalPages }, (_, i) => i + 1)
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

                {currentPage < totalPages - 2 && (
                  <>
                    {currentPage < totalPages - 3 && <span>...</span>}
                    <button
                      onClick={() => handlePageChange(totalPages)}
                      className="pagination-btn"
                    >
                      {totalPages}
                    </button>
                  </>
                )}
              </div>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="pagination-btn"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal Lưu/Sửa Mẫu Tìm Kiếm */}
      {isSaveModalOpen && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: '#fff', padding: '24px', borderRadius: '8px',
            width: '400px', maxWidth: '90%'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                {editingTemplateId ? 'Chỉnh sửa mẫu tìm kiếm' : 'Lưu mẫu tìm kiếm hiện tại'}
              </h3>
              <button 
                onClick={() => setIsSaveModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>
                Tên mẫu tìm kiếm
              </label>
              <input 
                type="text" 
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Ví dụ: Khách VIP HCM mua nhiều..."
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '6px',
                  border: '1px solid #d1d5db', fontSize: '14px', outline: 'none'
                }}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setIsSaveModalOpen(false)}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: '1px solid #d1d5db',
                  backgroundColor: '#fff', cursor: 'pointer', fontWeight: 500
                }}
              >
                Hủy
              </button>
              <button 
                onClick={handleSaveTemplate}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: 'none',
                  backgroundColor: 'var(--color-primary)', color: '#fff', cursor: 'pointer', fontWeight: 500
                }}
              >
                Lưu lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Broadcast */}
      {isBroadcastModalOpen && (
        <div className="modal-overlay" onClick={() => setIsBroadcastModalOpen(false)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{
            backgroundColor: '#fff', padding: '24px', borderRadius: '12px',
            width: '500px', maxWidth: '90%', boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ color: '#3b82f6' }}>campaign</span>
              Gửi ZNS hàng loạt (Broadcast)
            </h3>
            <div style={{ marginBottom: '24px' }}>
              <p style={{ color: '#4b5563', fontSize: '15px' }}>Bạn đã chọn <strong>{selectedIds.size}</strong> khách hàng để gửi tin nhắn ZNS.</p>
              <div style={{ marginTop: '20px', padding: '24px 16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px dashed #d1d5db', textAlign: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '40px', color: '#9ca3af', marginBottom: '12px' }}>construction</span>
                <p style={{ color: '#4b5563', margin: 0, fontWeight: 500 }}>Tính năng chọn Template và Gửi đang được phát triển...</p>
                <p style={{ color: '#6b7280', margin: '8px 0 0 0', fontSize: '13px' }}>Vui lòng quay lại sau nhé!</p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsBroadcastModalOpen(false)}
                style={{ padding: '8px 24px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#374151', cursor: 'pointer', fontWeight: 500, fontSize: '14px' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
