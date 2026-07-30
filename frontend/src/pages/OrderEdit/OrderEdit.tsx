import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useInvoiceDetail } from "@/hooks/useInvoices";
import { useAllUsers } from "@/hooks/useUsers";
import { useProvinces, useWards } from "@/hooks/useAddresses";
import api from "@/services/api";
import { API_ENDPOINTS } from "@/config/api";
import { getSaleChannels } from "@/services/invoiceService";
import useAuthStore, { type User } from "@/stores/useAuthStore";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import Sidebar from "@/components/Sidebar/Sidebar";
import "./OrderEdit.css";

const STATUS_LIST = [
  "Chờ xử lý",
  "Đang lấy hàng",
  "Chờ lấy lại",
  "Đã lấy hàng",
  "Đang giao hàng",
  "Chờ giao lại",
  "Giao thành công",
  "Chờ chuyển hoàn",
  "Đang chuyển hoàn",
  "Chờ chuyển hoàn lại",
  "Đã chuyển hoàn",
  "Đã hủy",
];

function OrderEdit() {
  const { code_invoice } = useParams<{ code_invoice: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data: invoiceData, isLoading: isLoadingInvoice } = useInvoiceDetail(code_invoice);
  const { data: usersResponse, isLoading: isLoadingUsers } = useAllUsers();
  const users = Array.isArray(usersResponse?.data?.data) 
    ? usersResponse.data.data 
    : Array.isArray(usersResponse?.data) 
      ? usersResponse.data 
      : Array.isArray(usersResponse?.users)
        ? usersResponse.users
        : Array.isArray(usersResponse) 
          ? usersResponse 
          : [];
  const { data: saleChannels, isLoading: isLoadingChannels } = useQuery({
    queryKey: ["saleChannels"],
    queryFn: getSaleChannels,
  });

  const { data: provinces } = useProvinces();

  // State
  const [formData, setFormData] = useState({
    id_seller: "",
    name_seller: "",
    code_seller: "",
    id_creator: "",
    name_creator: "",
    code_creator: "",
    id_salechannel: "",
    name_salechannel: "",
    receiver: "",
    contact_number: "",
    prov: "",
    area: "",
    address: "",
    description: "",
    status_value: "",
  });

  const [selectedProvId, setSelectedProvId] = useState<number | null>(null);
  const { data: wards } = useWards(selectedProvId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search dropdown states
  const [showProvinceDropdown, setShowProvinceDropdown] = useState(false);
  const [provinceSearchQuery, setProvinceSearchQuery] = useState("");
  const [showWardDropdown, setShowWardDropdown] = useState(false);
  const [wardSearchQuery, setWardSearchQuery] = useState("");

  useEffect(() => {
    if (invoiceData?.data) {
      const invoice = invoiceData.data.invoice;
      const deliveryInfo = (invoiceData.data as any).delivery_info;

      setFormData({
        id_seller: invoice.id_seller?.toString() || "",
        name_seller: invoice.name_seller || "",
        code_seller: invoice.code_seller || "",
        id_creator: invoice.id_creator?.toString() || "",
        name_creator: invoice.name_creator || "",
        code_creator: invoice.code_creator || "",
        id_salechannel: invoice.id_salechannel?.toString() || "",
        name_salechannel: invoice.name_salechannel || "",
        receiver: invoice.name_customer || deliveryInfo?.receiver || "",
        contact_number: invoice.phone_number || deliveryInfo?.contact_number || "",
        prov: deliveryInfo?.prov || "",
        area: deliveryInfo?.area || "",
        address: deliveryInfo?.address || "",
        description: invoice.description || "",
        status_value: invoice.status_value || "",
      });

      // Match selected province id for wards
      if (provinces && deliveryInfo?.prov) {
        const matchedProv = Array.isArray(provinces) ? provinces.find((p: any) => p.prov === deliveryInfo.prov) : undefined;
        if (matchedProv) {
          setSelectedProvId(matchedProv.id_prov);
        }
      }
    }
  }, [invoiceData, provinces]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSellerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedUserId = e.target.value;
    const selectedUser = users?.find((u: User) => u.user_id?.toString() === selectedUserId);
    if (selectedUser) {
      setFormData((prev) => ({
        ...prev,
        id_seller: selectedUser.id_acc?.toString() || "",
        name_seller: selectedUser.name || selectedUser.username,
        code_seller: selectedUser.user_id?.toString() || "",
        id_creator: selectedUser.id_acc?.toString() || "",
        name_creator: selectedUser.name || selectedUser.username,
        code_creator: selectedUser.user_id?.toString() || "",
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        id_seller: "",
        name_seller: "",
        code_seller: "",
        id_creator: "",
        name_creator: "",
        code_creator: "",
      }));
    }
  };

  const handleChannelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const salesChannel = e.target.value;
    if (salesChannel) {
      const id_salechannel =
        salesChannel === "TIKTOK SHOP"
          ? 4
          : salesChannel === "FACEBOOK"
            ? 8
            : salesChannel === "SHOPEE MALL"
              ? 19
              : salesChannel === "THƯƠNG HIỆU"
                ? 16
                : 1; // B2C-Fn

      setFormData((prev) => ({
        ...prev,
        id_salechannel: id_salechannel.toString(),
        name_salechannel: salesChannel,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        id_salechannel: "",
        name_salechannel: "",
      }));
    }
  };

  // Computed filtered lists for dropdowns
  const filteredProvinces = Array.isArray(provinces)
    ? provinces.filter((p: any) =>
        p.prov.toLowerCase().includes(provinceSearchQuery.toLowerCase())
      )
    : [];

  const filteredWards = Array.isArray(wards)
    ? wards.filter((w: any) =>
        w.ward.toLowerCase().includes(wardSearchQuery.toLowerCase())
      )
    : [];

  const handleProvChange = (provName: string, provId: number) => {
    setFormData((prev) => ({
      ...prev,
      prov: provName,
      area: "", // Reset ward when province changes
    }));
    setSelectedProvId(provId);
    setProvinceSearchQuery("");
    setShowProvinceDropdown(false);
  };

  const handleWardChange = (wardName: string) => {
    setFormData((prev) => ({
      ...prev,
      area: wardName,
    }));
    setWardSearchQuery("");
    setShowWardDropdown(false);
  };

  const handleSubmit = async () => {
    if (!code_invoice) return;
    setIsSubmitting(true);
    try {
      const payload = {
        id_seller: formData.id_seller ? parseInt(formData.id_seller) : undefined,
        code_seller: formData.code_seller,
        name_seller: formData.name_seller,
        id_creator: formData.id_creator ? parseInt(formData.id_creator) : undefined,
        code_creator: formData.code_creator,
        name_creator: formData.name_creator,
        id_salechannel: formData.id_salechannel ? parseInt(formData.id_salechannel) : undefined,
        name_salechannel: formData.name_salechannel,
        receiver: formData.receiver,
        contact_number: formData.contact_number,
        prov: formData.prov,
        area: formData.area,
        address: formData.address,
        description: formData.description,
        status_value: formData.status_value,
      };

      await api.put(API_ENDPOINTS.UPDATE_INVOICE(code_invoice), payload);
      queryClient.invalidateQueries({ queryKey: ["invoiceDetail", code_invoice] });
      toast.success("Cập nhật đơn hàng thành công");
      navigate(`/order-detail/${code_invoice}`);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "Lỗi khi cập nhật đơn hàng");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("vi-VN").format(value);
  };

  if (isLoadingInvoice || isLoadingUsers || isLoadingChannels) {
    return (
      <div style={{ display: "flex", height: "100vh", width: "100%" }}>
        {user && <Sidebar user={user} />}
        <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f8f9fa", width: "100%" }}>
          <div className="order-edit-page">
            <p>Đang tải dữ liệu...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!invoiceData?.data) {
    return (
      <div style={{ display: "flex", height: "100vh", width: "100%" }}>
        {user && <Sidebar user={user} />}
        <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f8f9fa", width: "100%" }}>
          <div className="order-edit-page">
            <p>Không tìm thấy đơn hàng</p>
            <button onClick={() => navigate(-1)}>Quay lại</button>
          </div>
        </main>
      </div>
    );
  }



  const { invoice } = invoiceData.data;
  const invoiceDetails: any[] = (invoiceData.data as any).products || [];
  const saleProducts = invoiceDetails.filter((p) => p.type_product !== "gift");
  const giftProducts = invoiceDetails.filter((p) => p.type_product === "gift");

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      {user && <Sidebar user={user} />}
      <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f8f9fa", width: "100%" }}>
        <div className="order-edit-page">
      <Breadcrumb />
      <div className="order-edit-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <span className="material-symbols-outlined">arrow_back</span>
          Quay lại
        </button>
        <h1>Cập nhật đơn hàng: {code_invoice}</h1>
        <button 
          className="save-btn" 
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          <span className={`material-symbols-outlined${isSubmitting ? " spinning" : ""}`}>
            {isSubmitting ? "progress_activity" : "save"}
          </span>
          {isSubmitting ? "Đang lưu..." : "Lưu thay đổi"}
        </button>
      </div>

      <div className="order-edit-grid">
        {/* Chi tiết chung */}
        <div className="edit-block">
          <h2>Chi tiết chung</h2>
          <div className="form-group-row">
            <span className="form-label">Nhân sự bán</span>
            <select
              className="form-select"
              value={formData.code_seller}
              onChange={handleSellerChange}
            >
              <option value="">-- Chọn nhân sự --</option>
              {users?.map((u: User) => (
                <option key={u.id_acc} value={u.user_id}>
                  {u.user_id ? `${u.user_id} - ` : ""}{u.name || u.username}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group-row">
            <span className="form-label">Nguồn tạo</span>
            <input
              type="text"
              className="form-input"
              value={invoice.name_creator || ""}
              disabled
            />
          </div>
          <div className="form-group-row">
            <span className="form-label">Kênh bán</span>
            <select
              className="form-select"
              value={formData.name_salechannel}
              onChange={handleChannelChange}
            >
              <option value="">-- Chọn kênh bán --</option>
              <option value="B2C-Fn">B2C-Fn</option>
              <option value="TIKTOK SHOP">TIKTOK SHOP</option>
              <option value="FACEBOOK">FACEBOOK</option>
              <option value="SHOPEE MALL">SHOPEE MALL</option>
              <option value="THƯƠNG HIỆU">THƯƠNG HIỆU</option>
            </select>
          </div>
          <div className="form-group-row">
            <span className="form-label">Tổng tiền</span>
            <span className="total-money">
              {formatCurrency(invoice.total_amount || 0)} đ
            </span>
          </div>
        </div>

        {/* Thông tin khách hàng */}
        <div className="edit-block">
          <h2>Thông tin khách hàng</h2>
          <div className="form-group-row">
            <span className="form-label">Tên khách hàng</span>
            <input
              type="text"
              className="form-input"
              value={formData.receiver}
              onChange={(e) => handleChange("receiver", e.target.value)}
            />
          </div>
          <div className="form-group-row">
            <span className="form-label">Điện thoại</span>
            <input
              type="text"
              className="form-input"
              value={formData.contact_number}
              onChange={(e) => handleChange("contact_number", e.target.value)}
            />
          </div>
          <div className="form-group-row">
            <span className="form-label">Tỉnh/thành phố</span>
            <div className="searchable-dropdown" style={{ flex: 1, position: "relative" }}>
              <input
                type="text"
                placeholder="Tìm kiếm tỉnh/thành phố..."
                value={
                  showProvinceDropdown
                    ? provinceSearchQuery
                    : formData.prov
                }
                onChange={(e) => {
                  setProvinceSearchQuery(e.target.value);
                  setShowProvinceDropdown(true);
                }}
                onFocus={() => setShowProvinceDropdown(true)}
                onBlur={() => setTimeout(() => setShowProvinceDropdown(false), 200)}
                className="form-input searchable-input"
              />
              {showProvinceDropdown && (
                <div className="dropdown-list" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: "white", border: "1px solid #e5e7eb", borderRadius: "8px", maxHeight: "200px", overflowY: "auto", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}>
                  {filteredProvinces.length > 0 ? (
                    filteredProvinces.map((p: any) => (
                      <div
                        key={p.id_prov}
                        className="dropdown-item"
                        style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
                        onMouseDown={(e) => { e.preventDefault(); handleProvChange(p.prov, p.id_prov); }}
                      >
                        {p.prov}
                      </div>
                    ))
                  ) : (
                    <div className="dropdown-item disabled" style={{ padding: "8px 12px", color: "#9ca3af" }}>
                      Không tìm thấy tỉnh/thành phố
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="form-group-row">
            <span className="form-label">Phường/xã</span>
            <div className="searchable-dropdown" style={{ flex: 1, position: "relative" }}>
              <input
                type="text"
                placeholder="Tìm kiếm phường/xã..."
                value={
                  showWardDropdown ? wardSearchQuery : formData.area
                }
                onChange={(e) => {
                  setWardSearchQuery(e.target.value);
                  setShowWardDropdown(true);
                }}
                onFocus={() => selectedProvId && setShowWardDropdown(true)}
                onBlur={() => setTimeout(() => setShowWardDropdown(false), 200)}
                disabled={!selectedProvId}
                className="form-input searchable-input"
              />
              {showWardDropdown && selectedProvId && (
                <div className="dropdown-list" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10, background: "white", border: "1px solid #e5e7eb", borderRadius: "8px", maxHeight: "200px", overflowY: "auto", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}>
                  {filteredWards.length > 0 ? (
                    filteredWards.map((w: any) => (
                      <div
                        key={w.id_ward}
                        className="dropdown-item"
                        style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
                        onMouseDown={(e) => { e.preventDefault(); handleWardChange(w.ward); }}
                      >
                        {w.ward}
                      </div>
                    ))
                  ) : (
                    <div className="dropdown-item disabled" style={{ padding: "8px 12px", color: "#9ca3af" }}>
                      Không tìm thấy phường/xã
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="form-group-row">
            <span className="form-label">Địa chỉ chi tiết</span>
            <textarea
              className="form-textarea"
              value={formData.address}
              onChange={(e) => handleChange("address", e.target.value)}
              placeholder="Số nhà, tòa nhà, ngõ, đường..."
              rows={2}
              style={{ flex: 1 }}
            />
          </div>
        </div>

        {/* Ghi chú đơn hàng */}
        <div className="edit-block">
          <h2>Ghi chú đơn hàng</h2>
          <div className="form-group">
            <textarea
              className="form-textarea"
              placeholder="Nhập ghi chú đơn hàng..."
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
            />
          </div>
        </div>

        {/* Thông tin vận chuyển */}
        <div className="edit-block">
          <h2>Thông tin vận chuyển</h2>
          <div className="form-group-row" style={{ maxWidth: "400px" }}>
            <span className="form-label">Trạng thái</span>
            <select
              className="form-select"
              value={formData.status_value}
              onChange={(e) => handleChange("status_value", e.target.value)}
            >
              <option value="">-- Chọn trạng thái --</option>
              {STATUS_LIST.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
          {(invoice.fee_delivery > 0 ||
            invoice.type_fee_delivery === "PP_CASH" ||
            invoice.type_fee_delivery === "CC_CASH") && (
            <div className="form-group-row" style={{ maxWidth: "400px", marginTop: "16px" }}>
              <span className="form-label">Phí vận chuyển</span>
              <div style={{ flex: 1, padding: "8px 12px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: "6px", color: "#1f2937", fontWeight: 600 }}>
                {invoice.type_fee_delivery === "CC_CASH" ? (
                  formatCurrency(30000)
                ) : invoice.type_fee_delivery === "PP_CASH" ? (
                  <span style={{ textDecoration: "line-through", color: "#9ca3af" }}>
                    {formatCurrency(30000)}
                  </span>
                ) : (
                  formatCurrency(invoice.fee_delivery)
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Products (Read-only) */}
      <div className="order-edit-grid" style={{ marginTop: "24px", display: "block" }}>
        <div className="edit-block" style={{ width: "100%" }}>
          <h2>
            <span className="material-symbols-outlined" style={{ verticalAlign: "middle", marginRight: "8px" }}>shopping_bag</span>
            Sản phẩm ({saleProducts.length})
          </h2>
          {saleProducts.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="products-table">
                <thead>
                  <tr>
                    <th>MÃ HÀNG</th>
                    <th>TÊN HÀNG</th>
                    <th style={{ textAlign: "center" }}>SỐ LƯỢNG</th>
                    <th>ĐƠN GIÁ</th>
                    <th>GIẢM GIÁ</th>
                    <th>GIÁ BÁN</th>
                    <th>THÀNH TIỀN</th>
                  </tr>
                </thead>
                <tbody>
                  {saleProducts.map((product: any, index: number) => {
                    const priceSale = product.price - (product.discount || 0);
                    return (
                      <tr key={product.id_invoice_detail}>
                        <td className="product-code">{product.code_product}</td>
                        <td className="product-name">{product.name_product}</td>
                        <td className="product-qty">{product.quantity}</td>
                        <td>{formatCurrency(product.price)}</td>
                        <td>{product.discount || 0}</td>
                        <td>{formatCurrency(priceSale)}</td>
                        <td className="product-total">{formatCurrency(product.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          
          {giftProducts.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: "24px" }}>
              <h3 style={{ fontSize: "16px", marginBottom: "12px", color: "#4b5563" }}>
                <span className="material-symbols-outlined" style={{ verticalAlign: "middle", marginRight: "8px" }}>redeem</span>
                Quà tặng ({giftProducts.length})
              </h3>
              <table className="products-table">
                <thead>
                  <tr>
                    <th>MÃ HÀNG</th>
                    <th>TÊN HÀNG</th>
                    <th style={{ textAlign: "center" }}>SỐ LƯỢNG</th>
                    <th>ĐƠN GIÁ</th>
                    <th>GIẢM GIÁ</th>
                    <th>GIÁ BÁN</th>
                    <th>THÀNH TIỀN</th>
                  </tr>
                </thead>
                <tbody>
                  {giftProducts.map((product: any, index: number) => {
                    const priceSale = product.price - (product.discount || 0);
                    return (
                      <tr key={product.id_invoice_detail} className="gift-row">
                        <td className="product-code">{product.code_product}</td>
                        <td className="product-name">(Quà tặng) {product.name_product}</td>
                        <td className="product-qty">{product.quantity}</td>
                        <td>{formatCurrency(product.price)}</td>
                        <td>{product.discount || 0}</td>
                        <td>{formatCurrency(priceSale)}</td>
                        <td className="product-total">{formatCurrency(product.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      </div>
      </main>
    </div>
  );
}

export default OrderEdit;
