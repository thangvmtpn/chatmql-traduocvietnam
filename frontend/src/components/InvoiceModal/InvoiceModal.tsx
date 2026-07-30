import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { Customer, Product } from "@/services/dashboardService";
import { useSearchProducts } from "@/hooks/useDashboard";
import { useCreateInvoice } from "@/hooks/useInvoices";
import type { CreateInvoicePayload } from "@/services/invoiceService";
import { useProvinces, useWards } from "@/hooks/useAddresses";
import { useDebounce } from "@/hooks/useDebounce";
import { useAllUsers } from "@/hooks/useUsers";
import "./InvoiceModal.css";

// Interface cho User
interface User {
  id_acc: number;
  user_id: string;
  name: string;
  role_id: number;
  username?: string;
}

// Danh sách sản phẩm quà tặng FTET đặc biệt
const FTET_GIFT_PRODUCTS = [
  "Chè lam mật - 250G",
  "Chè lam matcha - 250G",
  "Kẹo lạc đỏ - 200G",
  "Kẹo vừng ta - 200G",
  "Nụ hoa trà - 02 gói",
];

interface InvoiceModalProps {
  customer: Customer;
  onClose: () => void;
}

interface ProductItem {
  id_product: number;
  code_product: string;
  name_product: string;
  quantity: number;
  price: number;
  unit: string;
  weight: number;
}

function InvoiceModal({ customer, onClose }: InvoiceModalProps) {
  console.log("Customer in InvoiceModal:", customer); // Debug log
  const { mutate: createInvoice, isPending: createLoading } =
    useCreateInvoice();
  const [loading, setLoading] = useState(false);

  // Lấy thông tin user hiện tại
  const authStorage = localStorage.getItem("auth-storage");
  let currentUser = { id: 0, name: "", user_id: "", role_id: 0, username: "" };
  if (authStorage) {
    const { state } = JSON.parse(authStorage);
    currentUser = {
      id: state?.user?.id || 0,
      name: state?.user?.name || "",
      user_id: state?.user?.user_id || "",
      role_id: state?.user?.role_id || 0,
      username: state?.user?.username || "",
    };
  }

  // Cho phép tất cả tài khoản chọn nhân sự bán hàng
  const canSelectStaff = true;

  // Fetch all users nếu có quyền
  const { data: allUsersData } = useAllUsers();
  const allUsers: User[] = allUsersData?.data || [];

  // State cho việc chọn nhân sự
  const [selectedStaff, setSelectedStaff] = useState<User | null>(null);
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [showStaffDropdown, setShowStaffDropdown] = useState(false);

  // Set nhân sự mặc định là user hiện tại
  useEffect(() => {
    if (!selectedStaff) {
      setSelectedStaff({
        id_acc: currentUser.id,
        user_id: currentUser.user_id,
        name: currentUser.name,
        role_id: currentUser.role_id,
      });
    }
  }, []);

  // Filter users based on search query
  const filteredUsers = allUsers.filter(
    (user) =>
      user.name.toLowerCase().includes(staffSearchQuery.toLowerCase()) ||
      user.user_id.toLowerCase().includes(staffSearchQuery.toLowerCase()),
  );

  // Product search state
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Debounce search query - chỉ search khi user dừng gõ 300ms
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Sử dụng debounced query để gọi API - không lọc sản phẩm deal sốc
  const { data: searchResults } = useSearchProducts(
    debouncedSearchQuery,
    10,
    false,
  );

  // Selected products
  const [products, setProducts] = useState<ProductItem[]>([]);

  // Gift search state
  const [giftSearchQuery, setGiftSearchQuery] = useState("");
  const [showGiftSuggestions, setShowGiftSuggestions] = useState(false);

  // Debounce gift search query
  const debouncedGiftSearchQuery = useDebounce(giftSearchQuery, 300);

  // Sử dụng debounced query để gọi API cho gifts - lọc sản phẩm deal sốc
  const { data: giftSearchResults } = useSearchProducts(
    debouncedGiftSearchQuery,
    10,
    true,
  );

  // Selected gifts
  const [gifts, setGifts] = useState<ProductItem[]>([]);

  // Basic info
  const [salesChannel, setSalesChannel] = useState("B2C-Fn");
  const [isDoiHang, setIsDoiHang] = useState(false);

  const DOI_HANG_NOTE = "Thu hàng cũ đổi đơn mới & thu cod chênh lệch";

  // Append/remove doi hang text vào note khi toggle checkbox
  useEffect(() => {
    if (isDoiHang) {
      setNote((prev) =>
        prev.trim() ? `${prev.trim()}\n${DOI_HANG_NOTE}` : DOI_HANG_NOTE,
      );
    } else {
      setNote((prev) =>
        prev
          .split("\n")
          .filter((line) => line.trim() !== DOI_HANG_NOTE)
          .join("\n")
          .trim(),
      );
    }
  }, [isDoiHang]);

  const [orderDate, setOrderDate] = useState(
    new Date()
      .toLocaleString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" })
      .slice(0, 16),
  );

  // Delivery info from customer
  const [receiverName, setReceiverName] = useState(
    customer.ten_khach_hang || "",
  );
  const [phone, setPhone] = useState(customer.sdt || "");
  const [address, setAddress] = useState(customer.dia_chi || "");

  // Province and Ward state
  const [selectedProvinceId, setSelectedProvinceId] = useState<number | null>(
    null,
  );
  const [selectedProvinceName, setSelectedProvinceName] = useState("");
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);
  const [selectedWardName, setSelectedWardName] = useState("");

  // Province and Ward search state
  const [provinceSearchQuery, setProvinceSearchQuery] = useState("");
  const [showProvinceDropdown, setShowProvinceDropdown] = useState(false);
  const [wardSearchQuery, setWardSearchQuery] = useState("");
  const [showWardDropdown, setShowWardDropdown] = useState(false);

  // Fetch provinces and wards
  const { data: provinces } = useProvinces();
  const { data: wards } = useWards(selectedProvinceId);

  // Filter provinces based on search query
  const filteredProvinces = provinces?.filter((province) =>
    province.prov.toLowerCase().includes(provinceSearchQuery.toLowerCase()),
  );

  // Filter wards based on search query
  const filteredWards = wards?.filter((ward) =>
    ward.ward.toLowerCase().includes(wardSearchQuery.toLowerCase()),
  );

  // Fees
  const [shippingType, setShippingType] = useState<"CC_CASH" | "PP_CASH">(
    "CC_CASH",
  );
  const [selfShippingFee, setSelfShippingFee] = useState(20000);
  const [note, setNote] = useState("");

  // Discount state
  const [discountType, setDiscountType] = useState<"percent" | "amount">(
    "amount",
  );
  const [discountValue, setDiscountValue] = useState(0);
  const [packageSize, setPackageSize] = useState({
    length: 10,
    width: 10,
    height: 10,
  });

  // Unit state for weight and size
  const [weightUnit, setWeightUnit] = useState<"g" | "kg">("g");
  const [sizeUnit, setSizeUnit] = useState<"cm" | "dm" | "m">("cm");

  // Shipping method state
  const [activeShippingTab, setActiveShippingTab] = useState<
    "self" | "provider"
  >("provider");
  const [selectedProvider, setSelectedProvider] = useState<
    "vnpost" | "viettel" | "wait" | "office" | "warehouse" | "tdvn"
  >("vnpost");

  // Self shipping option
  const [selfShippingOption, setSelfShippingOption] = useState("wait"); // CHỜ VẬN ĐƠN

  // Update selectedProvider based on selfShippingOption when activeShippingTab is "self"
  useEffect(() => {
    if (activeShippingTab === "self") {
      setSelectedProvider(
        selfShippingOption as "wait" | "office" | "warehouse" | "tdvn",
      );
    }
  }, [selfShippingOption, activeShippingTab]);

  // Calculate shipping fee based on selected method
  const shippingFee =
    activeShippingTab === "self"
      ? selfShippingFee
      : selectedProvider === "viettel"
        ? 30000
        : 30000;

  // Handle province change
  const handleProvinceChange = (provinceId: number) => {
    setSelectedProvinceId(provinceId);
    const province = provinces?.find((p) => p.id_prov === provinceId);
    setSelectedProvinceName(province?.prov || "");
    setProvinceSearchQuery("");
    setShowProvinceDropdown(false);
    // Reset ward when province changes
    setSelectedWardId(null);
    setSelectedWardName("");
    setWardSearchQuery("");
  };

  // Handle ward change
  const handleWardChange = (wardId: number) => {
    setSelectedWardId(wardId);
    const ward = wards?.find((w) => w.id_ward === wardId);
    setSelectedWardName(ward?.ward || "");
    setWardSearchQuery("");
    setShowWardDropdown(false);
  };

  // Handle product search
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    // Hiển thị dropdown khi có text và debounce sẽ xử lý request
    setShowSuggestions(value.length >= 2);
  };

  const handleProductSelect = (product: Product) => {
    const existingIndex = products.findIndex(
      (p) => p.id_product === product.id_product,
    );

    if (existingIndex >= 0) {
      // Tăng số lượng nếu đã có
      const newProducts = [...products];
      const existingProduct = newProducts[existingIndex];
      if (existingProduct) {
        existingProduct.quantity += 1;
      }
      setProducts(newProducts);
    } else {
      // Thêm sản phẩm mới
      setProducts([
        ...products,
        {
          id_product: product.id_product,
          code_product: product.code_product,
          name_product: product.name_product,
          quantity: 1,
          price: product.price,
          unit: product.unit,
          weight: product.weight || 0,
        },
      ]);
    }

    setSearchQuery("");
    setShowSuggestions(false);
  };

  // Handle gift search
  const handleGiftSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setGiftSearchQuery(value);
    setShowGiftSuggestions(value.length >= 2);
  };

  const handleGiftSelect = (
    product: Product,
    giftType: "normal" | "ftet" = "normal",
  ) => {
    const giftPrefix = giftType === "ftet" ? "(Quà tặng FTET)" : "(Quà tặng)";
    const giftName = `${giftPrefix} ${product.name_product}`;

    const existingIndex = gifts.findIndex(
      (p) => p.id_product === product.id_product && p.name_product === giftName,
    );

    if (existingIndex >= 0) {
      // Tăng số lượng nếu đã có
      const newGifts = [...gifts];
      const existingGift = newGifts[existingIndex];
      if (existingGift) {
        existingGift.quantity += 1;
      }
      setGifts(newGifts);
    } else {
      // Thêm quà tặng mới với prefix QT/ và (Quà tặng) hoặc (Quà tặng FTET)
      setGifts([
        ...gifts,
        {
          id_product: product.id_product,
          code_product: `QT/${product.code_product}`,
          name_product: giftName,
          quantity: 1,
          price: product.price,
          unit: product.unit,
          weight: product.weight || 0,
        },
      ]);
    }

    setGiftSearchQuery("");
    setShowGiftSuggestions(false);
  };

  // Update product quantity
  const updateQuantity = (index: number, quantity: number) => {
    if (quantity < 1) return;
    const newProducts = [...products];
    const product = newProducts[index];
    if (product) {
      product.quantity = quantity;
    }
    setProducts(newProducts);
  };

  // Remove product
  const removeProduct = (index: number) => {
    setProducts(products.filter((_, i) => i !== index));
  };

  // Update gift quantity
  const updateGiftQuantity = (index: number, quantity: number) => {
    if (quantity < 1) return;
    const newGifts = [...gifts];
    const gift = newGifts[index];
    if (gift) {
      gift.quantity = quantity;
    }
    setGifts(newGifts);
  };

  // Remove gift
  const removeGift = (index: number) => {
    setGifts(gifts.filter((_, i) => i !== index));
  };

  // Calculate totals
  const subtotal = products.reduce((sum, p) => sum + p.price * p.quantity, 0);

  // Calculate gift amount (T2)
  const giftAmount = gifts.reduce((sum, g) => sum + g.price * g.quantity, 0);

  // Calculate total weight from products and gifts
  const totalWeight =
    products.reduce((sum, p) => sum + (p.weight || 0) * p.quantity, 0) +
    gifts.reduce((sum, g) => sum + (g.weight || 0) * g.quantity, 0);

  const discountAmount =
    discountType === "percent"
      ? Math.round((subtotal * discountValue) / 100)
      : discountValue;

  // totalAmount = subtotal + fee_delivery
  const totalAmount = subtotal + shippingFee;

  // codAmount = tiền khách phải trả (trừ discount, không bao gồm quà tặng)
  const codAmount =
    shippingType === "CC_CASH"
      ? totalAmount - discountAmount
      : subtotal - discountAmount;

  // Xử lý tạo đơn hàng
  const handleCreateInvoice = async () => {
    try {
      // Validate
      if (!receiverName.trim()) {
        toast.error("Vui lòng nhập tên người nhận!");
        return;
      }

      if (!phone.trim()) {
        toast.error("Vui lòng nhập số điện thoại!");
        return;
      }

      if (!selectedProvinceId) {
        toast.error("Vui lòng chọn Tỉnh/Thành phố!");
        return;
      }

      if (!selectedWardId) {
        toast.error("Vui lòng chọn Phường/Xã!");
        return;
      }

      if (!address.trim()) {
        toast.error("Vui lòng nhập địa chỉ!");
        return;
      }

      if (products.length === 0) {
        toast.error("Vui lòng thêm ít nhất một sản phẩm!");
        return;
      }

      setLoading(true);

      // Sử dụng nhân sự được chọn (hoặc user hiện tại nếu không có quyền chọn)
      const staffData = selectedStaff || {
        id_acc: currentUser.id,
        user_id: currentUser.user_id || "ADMIN",
        name: currentUser.name,
      };

      const staffCode = staffData.user_id || "ADMIN";

      // Build payload theo schema backend mới
      const currentTime = new Date(orderDate).toISOString();
      const payload: CreateInvoicePayload = {
        invoice: {
          time_create: currentTime,
          time_update: currentTime,
          id_creator: staffData.id_acc,
          code_creator: staffCode,
          name_creator: staffData.name,
          id_seller: staffData.id_acc,
          code_seller: staffCode,
          name_seller: staffData.name,
          id_customer: customer.id_kh || 0,
          code_customer: customer.ma_kh || "",
          name_customer: receiverName,
          phone_number: phone,
          id_salechannel:
            salesChannel === "TIKTOK SHOP"
              ? 4
              : salesChannel === "FACEBOOK"
                ? 8
                : salesChannel === "SHOPEE MALL"
                  ? 19
                  : salesChannel === "THƯƠNG HIỆU"
                    ? 16
                    : 1, // B2C-Fn
          name_salechannel: salesChannel,
          subtotal: subtotal,
          gift_amount: giftAmount,
          discount: discountAmount,
          total_amount: totalAmount,
          fee_delivery: shippingFee,
          type_fee_delivery: shippingType,
          shipping_method: activeShippingTab,
          cod_need_payment: codAmount,
          description: note,
          send_zns: false,
          id_status: 1,
          status_value: "Chờ xử lý",
          id_subchannel: null,
          subchannel: null,
          type_channel: null,
          fee_platform: 0,
          is_doi_hang: isDoiHang,
        },
        invoice_details: [
          // Products
          ...products.map((p) => ({
            id_product: p.id_product,
            code_product: p.code_product,
            name_product: p.name_product,
            sub_code_product: null,
            sub_name_code_product: null,
            quantity: p.quantity,
            sub_price: p.price, // Giá gốc
            discount_price: 0, // Không có chiết khấu
            price: p.price, // Giá sau chiết khấu (bằng giá gốc)
            total: p.quantity * p.price,
            type_product: "sale",
          })),
          // Gifts
          ...gifts.map((g) => ({
            id_product: g.id_product,
            code_product: g.code_product,
            name_product: g.name_product,
            sub_code_product: null,
            sub_name_code_product: null,
            quantity: g.quantity,
            sub_price: g.price,
            discount_price: 0,
            price: g.price,
            total: g.quantity * g.price,
            type_product: "gift",
          })),
        ],
        delivery_info: {
          time_create: currentTime,
          time_update: currentTime,
          code_delivery: null,
          id_partner_delivery:
            activeShippingTab === "self"
              ? selectedProvider === "wait"
                ? 4
                : selectedProvider === "office"
                  ? 5
                  : selectedProvider === "warehouse"
                    ? 9
                    : 6
              : selectedProvider === "viettel"
                ? 8
                : 7,
          partner_delivery:
            activeShippingTab === "self"
              ? selectedProvider === "wait"
                ? "CHỜ VẬN ĐƠN"
                : selectedProvider === "office"
                  ? "GỬI HÀNG TỪ VĂN PHÒNG"
                  : selectedProvider === "warehouse"
                    ? "Kho TP - Phòng SX"
                    : "TDVN"
              : selectedProvider === "viettel"
                ? "Viettel Post"
                : "VN Post",
          receiver: receiverName,
          contact_number: phone,
          prov: selectedProvinceName,
          city: null,
          area: selectedWardName,
          address: address,
          height: packageSize.height,
          width: packageSize.width,
          length: packageSize.length,
          weight: totalWeight,
          codfee: 0,
          fee_delivery: shippingFee,
          id_status: 1,
          description: note,
        },
      };

      createInvoice(payload, {
        onSuccess: (result: any) => {
          toast.success(
            `Tạo đơn hàng thành công! Mã đơn: ${result.code_invoice}`,
            {
              position: "top-right",
              autoClose: 3000,
            },
          );
          setLoading(false);
          onClose();
        },
        onError: (error: any) => {
          console.error("Error creating invoice:", error);
          toast.error(
            error?.response?.data?.message || "Có lỗi khi tạo đơn hàng!",
            {
              position: "top-right",
              autoClose: 3000,
            },
          );
          setLoading(false);
        },
      });
    } catch (error: any) {
      console.error("Error preparing invoice:", error);
      toast.error("Lỗi chuẩn bị dữ liệu đơn hàng!", {
        position: "top-right",
        autoClose: 3000,
      });
      setLoading(false);
    }
  };

  return (
    <div className="invoice-modal-overlay" onClick={onClose}>
      <div className="invoice-modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="invoice-modal-header">
          <h2>Thêm mới hóa đơn</h2>
          <button className="close-btn" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="invoice-modal-body">
          {/* LEFT SIDE */}
          <div className="invoice-left-panel">
            {/* Thông tin bán hàng */}
            <div className="invoice-section">
              <h3 className="section-title">Thông tin bán hàng</h3>

              <div className="form-group">
                <label>
                  <span className="material-symbols-outlined">person</span>
                  Nhân sự bán hàng
                </label>
                {canSelectStaff ? (
                  <div className="searchable-dropdown">
                    <input
                      type="text"
                      placeholder="Tìm kiếm nhân sự..."
                      value={
                        showStaffDropdown
                          ? staffSearchQuery
                          : selectedStaff?.name || ""
                      }
                      onChange={(e) => {
                        setStaffSearchQuery(e.target.value);
                        setShowStaffDropdown(true);
                      }}
                      onFocus={() => setShowStaffDropdown(true)}
                      onBlur={() =>
                        setTimeout(() => setShowStaffDropdown(false), 200)
                      }
                      className="searchable-input"
                    />
                    {showStaffDropdown && (
                      <div className="dropdown-list">
                        {filteredUsers && filteredUsers.length > 0 ? (
                          filteredUsers.map((user) => (
                            <div
                              key={user.id_acc}
                              className="dropdown-item"
                              onClick={() => {
                                setSelectedStaff(user);
                                setStaffSearchQuery("");
                                setShowStaffDropdown(false);
                              }}
                            >
                              {user.name} ({user.user_id})
                            </div>
                          ))
                        ) : (
                          <div className="dropdown-item disabled">
                            Không tìm thấy nhân sự
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={selectedStaff?.name || ""}
                    disabled
                    className="input-disabled"
                  />
                )}
              </div>

              <div className="form-group">
                <label>
                  <span className="material-symbols-outlined">groups</span>
                  Khách hàng
                </label>
                <input
                  type="text"
                  value={customer.ten_khach_hang || ""}
                  disabled
                  className="input-disabled"
                />
              </div>

              <div className="form-group">
                <label>
                  <span className="material-symbols-outlined">store</span>
                  Kênh bán
                </label>
                <select
                  value={salesChannel}
                  onChange={(e) => setSalesChannel(e.target.value)}
                >
                  <option value="B2C-Fn">B2C-Fn</option>
                  <option value="TIKTOK SHOP">TIKTOK SHOP</option>
                  <option value="FACEBOOK">FACEBOOK</option>
                  <option value="SHOPEE MALL">SHOPEE MALL</option>
                  <option value="THƯƠNG HIỆU">THƯƠNG HIỆU</option>
                </select>
              </div>

              <div className="form-group">
                <label style={{ visibility: "hidden", height: 0, margin: 0 }}>
                  placeholder
                </label>
                <label
                  htmlFor="checkbox-doi-hang"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    cursor: "pointer",
                    userSelect: "none",
                    fontWeight: 500,
                  }}
                >
                  <input
                    id="checkbox-doi-hang"
                    type="checkbox"
                    checked={isDoiHang}
                    onChange={(e) => setIsDoiHang(e.target.checked)}
                    style={{
                      width: "16px",
                      height: "16px",
                      cursor: "pointer",
                      accentColor: "#e53935",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ fontSize: "18px" }}
                    >
                      swap_horiz
                    </span>
                    Đổi hàng
                  </span>
                  {isDoiHang && (
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#e53935",
                        fontWeight: 400,
                        marginLeft: "4px",
                      }}
                    >
                      (Thu hàng cũ đổi đơn mới &amp; thu cod chênh lệch)
                    </span>
                  )}
                </label>
              </div>

              <div className="form-group">
                <label>
                  <span className="material-symbols-outlined">
                    calendar_today
                  </span>
                  Thời Gian
                </label>
                <input
                  type="datetime-local"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </div>
            </div>

            {/* Danh sách sản phẩm */}
            <div className="invoice-section">
              <h3 className="section-title">Danh sách sản phẩm</h3>

              <div className="product-search-box">
                <span className="material-symbols-outlined">search</span>
                <input
                  type="text"
                  placeholder="Tìm kiếm sản phẩm (Tên/Mã)"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() =>
                    searchQuery.length >= 2 && setShowSuggestions(true)
                  }
                  className="product-search-input bg-white"
                />
              </div>

              {showSuggestions && searchResults && searchResults.length > 0 && (
                <div className="product-suggestions-dropdown">
                  {searchResults.map((product) => (
                    <div
                      key={product.id_product}
                      className="suggestion-item"
                      onClick={() => handleProductSelect(product)}
                    >
                      <div className="suggestion-code">
                        {product.code_product}
                      </div>
                      <div className="suggestion-name">
                        {product.name_product}
                      </div>
                      <div className="suggestion-price">
                        {new Intl.NumberFormat("vi-VN").format(product.price)}đ
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {products.length === 0 ? (
                <div className="empty-products">
                  <span className="material-symbols-outlined">inventory_2</span>
                  <p>Chưa có sản phẩm nào được thêm vào đơn hàng.</p>
                </div>
              ) : (
                <div className="products-list-table">
                  {products.map((product, index) => (
                    <div key={index} className="product-row">
                      <div className="product-info">
                        <div className="product-name">
                          {product.name_product}
                        </div>
                        <div className="product-price">
                          {new Intl.NumberFormat("vi-VN").format(product.price)}
                          đ
                        </div>
                      </div>
                      <div className="product-quantity">
                        <button
                          onClick={() =>
                            updateQuantity(index, product.quantity - 1)
                          }
                          className="qty-btn"
                        >
                          <span className="material-symbols-outlined">
                            remove
                          </span>
                        </button>
                        <input
                          type="number"
                          value={product.quantity}
                          onChange={(e) =>
                            updateQuantity(index, Number(e.target.value))
                          }
                          min="1"
                        />
                        <button
                          onClick={() =>
                            updateQuantity(index, product.quantity + 1)
                          }
                          className="qty-btn"
                        >
                          <span className="material-symbols-outlined">add</span>
                        </button>
                      </div>
                      <button
                        onClick={() => removeProduct(index)}
                        className="remove-btn"
                      >
                        <span className="material-symbols-outlined">
                          delete
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Danh sách quà tặng */}
            <div className="invoice-section">
              <h3 className="section-title">Danh sách quà tặng</h3>

              <div className="product-search-box">
                <span className="material-symbols-outlined">card_giftcard</span>
                <input
                  type="text"
                  placeholder="Tìm kiếm quà tặng (Tên/Mã)"
                  value={giftSearchQuery}
                  onChange={handleGiftSearchChange}
                  onFocus={() =>
                    giftSearchQuery.length >= 2 && setShowGiftSuggestions(true)
                  }
                  className="product-search-input bg-white"
                />
              </div>

              {showGiftSuggestions &&
                giftSearchResults &&
                giftSearchResults.length > 0 && (
                  <div className="product-suggestions-dropdown">
                    {giftSearchResults.flatMap((product) => {
                      const isFTETProduct = FTET_GIFT_PRODUCTS.some((name) =>
                        product.name_product.includes(name),
                      );

                      const suggestions = [
                        <div
                          key={`${product.id_product}-normal`}
                          className="suggestion-item"
                          onClick={() => handleGiftSelect(product, "normal")}
                        >
                          <div className="suggestion-code">
                            QT/{product.code_product}
                          </div>
                          <div className="suggestion-name">
                            (Quà tặng) {product.name_product}
                          </div>
                          <div className="suggestion-price">
                            {new Intl.NumberFormat("vi-VN").format(
                              product.price,
                            )}
                            đ
                          </div>
                        </div>,
                      ];

                      if (isFTETProduct) {
                        suggestions.push(
                          <div
                            key={`${product.id_product}-ftet`}
                            className="suggestion-item"
                            onClick={() => handleGiftSelect(product, "ftet")}
                          >
                            <div className="suggestion-code">
                              QT/{product.code_product}
                            </div>
                            <div className="suggestion-name">
                              (Quà tặng FTET) {product.name_product}
                            </div>
                            <div className="suggestion-price">
                              {new Intl.NumberFormat("vi-VN").format(
                                product.price,
                              )}
                              đ
                            </div>
                          </div>,
                        );
                      }

                      return suggestions;
                    })}
                  </div>
                )}

              {gifts.length === 0 ? (
                <div className="empty-products">
                  <span className="material-symbols-outlined">
                    card_giftcard
                  </span>
                  <p>Chưa có quà tặng nào được thêm vào đơn hàng.</p>
                </div>
              ) : (
                <div className="products-list-table">
                  {gifts.map((gift, index) => (
                    <div key={index} className="product-row">
                      <div className="product-info">
                        <div className="product-name">{gift.name_product}</div>
                        <div className="product-price">
                          {new Intl.NumberFormat("vi-VN").format(gift.price)}đ
                        </div>
                      </div>
                      <div className="product-quantity">
                        <button
                          onClick={() =>
                            updateGiftQuantity(index, gift.quantity - 1)
                          }
                          className="qty-btn"
                        >
                          <span className="material-symbols-outlined">
                            remove
                          </span>
                        </button>
                        <input
                          type="number"
                          value={gift.quantity}
                          onChange={(e) =>
                            updateGiftQuantity(index, Number(e.target.value))
                          }
                          min="1"
                        />
                        <button
                          onClick={() =>
                            updateGiftQuantity(index, gift.quantity + 1)
                          }
                          className="qty-btn"
                        >
                          <span className="material-symbols-outlined">add</span>
                        </button>
                      </div>
                      <button
                        onClick={() => removeGift(index)}
                        className="remove-btn"
                      >
                        <span className="material-symbols-outlined">
                          delete
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Chi phí và ghi chú */}
            <div className="invoice-section">
              <h3 className="section-title">Chi phí và ghi chú</h3>

              <div className="fee-row">
                <label>Tiền hàng (T1)</label>
                <input
                  type="text"
                  value={new Intl.NumberFormat("vi-VN").format(subtotal)}
                  disabled
                  className="input-disabled"
                />
              </div>

              <div className="fee-row">
                <label>Quà tặng (T2)</label>
                <input
                  type="text"
                  value={new Intl.NumberFormat("vi-VN").format(giftAmount)}
                  disabled
                  className="input-disabled"
                />
              </div>

              <div className="fee-row">
                <label>Tổng tiền (T3 = T1 + T2)</label>
                <input
                  type="text"
                  value={new Intl.NumberFormat("vi-VN").format(
                    subtotal + giftAmount,
                  )}
                  disabled
                  className="input-disabled total-highlight"
                />
              </div>

              <div className="fee-row">
                <label>Giảm giá (T4)</label>
                <div style={{ display: "flex", gap: 6, flex: 1 }}>
                  <select
                    value={discountType}
                    onChange={(e) => {
                      setDiscountType(e.target.value as "percent" | "amount");
                      setDiscountValue(0);
                    }}
                    style={{ width: 100, flexShrink: 0 }}
                  >
                    <option value="amount">VNĐ</option>
                    <option value="percent">%</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    max={discountType === "percent" ? 100 : undefined}
                    value={discountValue === 0 ? "" : discountValue}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (discountType === "percent") {
                        setDiscountValue(Math.min(100, Math.max(0, val)));
                      } else {
                        setDiscountValue(Math.max(0, val));
                      }
                    }}
                    placeholder={discountType === "percent" ? "0%" : "0"}
                    style={{ flex: 1 }}
                  />
                  {discountType === "percent" && discountValue > 0 && (
                    <span
                      style={{
                        alignSelf: "center",
                        fontSize: 12,
                        color: "#e53e3e",
                        whiteSpace: "nowrap",
                      }}
                    >
                      -{new Intl.NumberFormat("vi-VN").format(discountAmount)}đ
                    </span>
                  )}
                </div>
              </div>

              <div className="fee-row">
                <label>Phí vận chuyển (T5)</label>
                <input
                  type="text"
                  value={new Intl.NumberFormat("vi-VN").format(shippingFee)}
                  disabled
                  className="input-disabled"
                />
              </div>

              <div className="fee-row">
                <label>Loại phí ship</label>
                <select
                  value={shippingType}
                  onChange={(e) =>
                    setShippingType(e.target.value as "CC_CASH" | "PP_CASH")
                  }
                >
                  <option value="CC_CASH">CC_CASH (Thu ship)</option>
                  <option value="PP_CASH">PP_CASH (Hỗ trợ ship)</option>
                </select>
              </div>

              <div className="fee-row">
                <label>
                  Khách phải trả
                  {shippingType === "CC_CASH"
                    ? " (T6 = T1 + T5 - T4)"
                    : " (T6 = T1 - T4)"}
                </label>
                <input
                  type="text"
                  value={new Intl.NumberFormat("vi-VN").format(codAmount)}
                  disabled
                  className="input-disabled total-highlight"
                />
              </div>

              <div className="form-group" style={{ marginTop: 20 }}>
                <label>
                  <span
                    className="material-symbols-outlined"
                    style={{ verticalAlign: "middle", marginRight: 4 }}
                  >
                    edit_note
                  </span>
                  Ghi chú về đơn hàng, yêu cầu đặc biệt...
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ghi chú..."
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* RIGHT SIDE */}
          <div className="invoice-right-panel">
            <div className="invoice-section">
              <h3 className="section-title">Chi tiết Giao hàng</h3>

              <div className="delivery-info-card">
                <div className="form-group">
                  <label>
                    <span className="material-symbols-outlined">
                      location_on
                    </span>
                    Địa chỉ lấy hàng
                  </label>
                  <input
                    type="text"
                    value="Ngã tư Đức Phú, Xã Phúc Thuận, Thành phố Phổ Yên, Thái Nguyên"
                    disabled
                    className="input-disabled"
                  />
                </div>

                <div className="form-group">
                  <label>Tên Người nhận</label>
                  <input
                    type="text"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    placeholder="Tên người nhận"
                  />
                </div>

                <div className="form-group">
                  <label>Số điện thoại</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Số điện thoại"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Tỉnh/Thành phố</label>
                    <div className="searchable-dropdown">
                      <input
                        type="text"
                        placeholder="Tìm kiếm tỉnh/thành phố..."
                        value={
                          showProvinceDropdown
                            ? provinceSearchQuery
                            : selectedProvinceName
                        }
                        onChange={(e) => {
                          setProvinceSearchQuery(e.target.value);
                          setShowProvinceDropdown(true);
                        }}
                        onFocus={() => setShowProvinceDropdown(true)}
                        onBlur={() =>
                          setTimeout(() => setShowProvinceDropdown(false), 200)
                        }
                        className="searchable-input"
                      />
                      {showProvinceDropdown && (
                        <div className="dropdown-list">
                          {filteredProvinces && filteredProvinces.length > 0 ? (
                            filteredProvinces.map((province) => (
                              <div
                                key={province.id_prov}
                                className="dropdown-item"
                                onClick={() =>
                                  handleProvinceChange(province.id_prov)
                                }
                              >
                                {province.prov}
                              </div>
                            ))
                          ) : (
                            <div className="dropdown-item disabled">
                              Không tìm thấy tỉnh/thành phố
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Phường/Xã</label>
                    <div className="searchable-dropdown">
                      <input
                        type="text"
                        placeholder="Tìm kiếm phường/xã..."
                        value={
                          showWardDropdown ? wardSearchQuery : selectedWardName
                        }
                        onChange={(e) => {
                          setWardSearchQuery(e.target.value);
                          setShowWardDropdown(true);
                        }}
                        onFocus={() =>
                          selectedProvinceId && setShowWardDropdown(true)
                        }
                        onBlur={() =>
                          setTimeout(() => setShowWardDropdown(false), 200)
                        }
                        disabled={!selectedProvinceId}
                        className="searchable-input"
                      />
                      {showWardDropdown && selectedProvinceId && (
                        <div className="dropdown-list">
                          {filteredWards && filteredWards.length > 0 ? (
                            filteredWards.map((ward) => (
                              <div
                                key={ward.id_ward}
                                className="dropdown-item"
                                onClick={() => handleWardChange(ward.id_ward)}
                              >
                                {ward.ward}
                              </div>
                            ))
                          ) : (
                            <div className="dropdown-item disabled">
                              Không tìm thấy phường/xã
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>Số nhà, tòa nhà, ngõ, đường</label>
                  <textarea
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Địa chỉ chi tiết..."
                    rows={2}
                  />
                </div>

                <div className="form-group">
                  <label>Khối lượng</label>
                  <div className="form-row">
                    <div className="input-with-unit" style={{ flex: 1 }}>
                      <input
                        type="number"
                        value={totalWeight}
                        disabled
                        className="input-disabled"
                        min="0"
                      />
                      <span className="unit">{weightUnit}</span>
                    </div>
                    <select
                      value={weightUnit}
                      onChange={(e) =>
                        setWeightUnit(e.target.value as "g" | "kg")
                      }
                      style={{ marginLeft: 10 }}
                    >
                      <option value="g">g</option>
                      <option value="kg">kg</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Dài</label>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        value={packageSize.length}
                        onChange={(e) =>
                          setPackageSize({
                            ...packageSize,
                            length: Number(e.target.value),
                          })
                        }
                        min="0"
                      />
                      <span className="unit">×</span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Rộng</label>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        value={packageSize.width}
                        onChange={(e) =>
                          setPackageSize({
                            ...packageSize,
                            width: Number(e.target.value),
                          })
                        }
                        min="0"
                      />
                      <span className="unit">×</span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Cao</label>
                    <div className="input-with-unit">
                      <input
                        type="number"
                        value={packageSize.height}
                        onChange={(e) =>
                          setPackageSize({
                            ...packageSize,
                            height: Number(e.target.value),
                          })
                        }
                        min="0"
                      />
                      <span className="unit">{sizeUnit}</span>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Đơn vị kích thước</label>
                    <select
                      value={sizeUnit}
                      onChange={(e) =>
                        setSizeUnit(e.target.value as "cm" | "dm" | "m")
                      }
                      style={{
                        marginLeft: 10,
                        height: "fit-content",
                        alignSelf: "flex-end",
                      }}
                    >
                      <option value="cm">cm</option>
                      <option value="dm">dm</option>
                      <option value="m">m</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Ghi chú cho bưu tá...</label>
                  <textarea placeholder="Ghi chú cho bưu tá..." rows={2} />
                </div>
              </div>
            </div>

            <div className="invoice-section">
              <h3 className="section-title">Lựa chọn Vận chuyển</h3>

              <div className="shipping-options">
                <div
                  className={`shipping-tab ${activeShippingTab === "self" ? "active" : ""}`}
                  onClick={() => setActiveShippingTab("self")}
                  style={{ cursor: "pointer" }}
                >
                  <span className="material-symbols-outlined">
                    local_shipping
                  </span>
                  Tự Giao hàng
                </div>
                <div
                  className={`shipping-tab ${activeShippingTab === "provider" ? "active" : ""}`}
                  onClick={() => setActiveShippingTab("provider")}
                  style={{ cursor: "pointer" }}
                >
                  <span className="material-symbols-outlined">link</span>
                  Kết nối đơn vị vận chuyển
                </div>
              </div>

              {activeShippingTab === "self" ? (
                <div className="shipping-method-card">
                  <div className="form-group">
                    <label>
                      <span className="material-symbols-outlined">
                        local_shipping
                      </span>
                      Chọn đơn vị vận chuyển
                    </label>
                    <select
                      value={selfShippingOption}
                      onChange={(e) => setSelfShippingOption(e.target.value)}
                    >
                      <option value="wait">CHỜ VẬN ĐƠN</option>
                      <option value="office">GỬI HÀNG TỪ VĂN PHÒNG</option>
                      <option value="warehouse">Kho TP - Phòng SX</option>
                      <option value="tdvn">TDVN</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Chi phí Tự giao</label>
                    <input
                      type="number"
                      value={selfShippingFee}
                      onChange={(e) =>
                        setSelfShippingFee(Number(e.target.value))
                      }
                      min="0"
                      step="1000"
                      placeholder="Nhập chi phí tự giao..."
                    />
                  </div>
                </div>
              ) : (
                <div className="shipping-method-card">
                  <div className="form-group">
                    <label>
                      <span className="material-symbols-outlined">
                        local_shipping
                      </span>
                      Chọn đơn vị vận chuyển
                    </label>
                    <select
                      value={selectedProvider}
                      onChange={(e) =>
                        setSelectedProvider(
                          e.target.value as "vnpost" | "viettel",
                        )
                      }
                    >
                      <option value="vnpost">VN Post - 30.000đ</option>
                      <option value="viettel">Viettel Post - 30.000đ</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Chi phí vận chuyển</label>
                    <input
                      type="text"
                      value={new Intl.NumberFormat("vi-VN").format(
                        selectedProvider === "viettel" ? 30000 : 30000,
                      )}
                      disabled
                      className="input-disabled"
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      <span className="material-symbols-outlined">info</span>
                      Thông tin
                    </label>
                    <div
                      style={{
                        fontSize: "0.9em",
                        color: "#666",
                        textAlign: "left",
                      }}
                    >
                      {selectedProvider === "viettel"
                        ? "Viettel Post - Dịch vụ bưu chính chất lượng cao"
                        : "VN Post - Bưu điện Việt Nam, phủ sóng toàn quốc"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="invoice-modal-footer">
          <button className="btn-print" disabled>
            <span className="material-symbols-outlined">print</span>
            IN
          </button>
          <button
            className="btn-create"
            onClick={handleCreateInvoice}
            disabled={loading || createLoading}
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined spinning">
                  progress_activity
                </span>
                Đang tạo...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined">check_circle</span>
                Tạo đơn
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default InvoiceModal;
