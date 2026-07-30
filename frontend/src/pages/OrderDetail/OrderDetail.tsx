import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useInvoiceDetail } from "@/hooks/useInvoices";
import useAuthStore from "@/stores/useAuthStore";
import type { InvoiceProduct } from "@/types/api";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import Sidebar from "@/components/Sidebar/Sidebar";
import DeliveryHistoryModal from "@/components/DeliveryHistoryModal/DeliveryHistoryModal";
import {
  buildInvoicePrintT,
  buildInvoicePrintSHOP,
} from "@/components/InvoicePrint/InvoicePrint";
import { getStatusColor } from "@/config/constants";
import "./OrderDetail.css";

function OrderDetail() {
  const { code_invoice } = useParams<{ code_invoice: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data, isLoading, error } = useInvoiceDetail(code_invoice);
  const [showDeliveryHistory, setShowDeliveryHistory] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

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



  if (isLoading) {
    return (
      <div style={{ display: "flex", height: "100vh", width: "100%" }}>
        {user && <Sidebar user={user} />}
        <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f8f9fa", width: "100%" }}>
          <div className="order-detail-page">
            <div className="order-detail-loading">
              <span className="material-symbols-outlined spinning">
                progress_activity
              </span>
              <p>Đang tải chi tiết đơn hàng...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !data?.data) {
    return (
      <div style={{ display: "flex", height: "100vh", width: "100%" }}>
        {user && <Sidebar user={user} />}
        <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f8f9fa", width: "100%" }}>
          <div className="order-detail-page">
            <div className="order-detail-error">
              <span className="material-symbols-outlined">error</span>
              <p>Không thể tải chi tiết đơn hàng</p>
              <button className="back-btn" onClick={() => navigate(-1)}>
                <span className="material-symbols-outlined">arrow_back</span>
                Quay lại
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const { invoice, products } = data.data;
  const deliveryInfo = (
    data.data as {
      invoice: typeof invoice;
      products: typeof products;
      delivery_info?: { 
        code_delivery?: string; 
        id_partner_delivery?: number; 
        address?: string; 
        postman_name?: string; 
        postman_phone?: string; 
        post_office_name?: string;
        post_office_phone?: string;
      };
    }
  ).delivery_info;
  // Tách sản phẩm theo loại, nếu không có type_product thì coi là sale
  const saleProducts = products.filter((p) => p.type_product !== "gift");
  const giftProducts = products.filter((p) => p.type_product === "gift");

  const channelName = (invoice.name_salechannel || "").toLowerCase();
  const subName = (invoice.subchannel || "").toLowerCase();
  const isShopeeOrTiktok =
    channelName.includes("shopee mall") ||
    channelName.includes("tiktok") ||
    subName.includes("shopee mall") ||
    subName.includes("tiktok");

  const handlePrint = () => {
    setIsPrinting(true);
    try {

      const html = isShopeeOrTiktok
        ? buildInvoicePrintSHOP(data.data as any)
        : buildInvoicePrintT(data.data as any);

      const pagesHtml = `<div class="print-page">${html}</div>`;

      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow!.document;
      doc.open();
      doc.write(`
        <html>
          <head>
            <title>In hóa đơn</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              @page { size: A4; margin: 10mm; }
              body { font-family: Arial, sans-serif; margin: 0; }
              .print-page { page-break-after: always; }
              .print-page:last-child { page-break-after: auto; }
            </style>
          </head>
          <body>${pagesHtml}</body>
        </html>
      `);
      doc.close();

      iframe.onload = () => {
        iframe.contentWindow!.focus();
        iframe.contentWindow!.print();
        iframe.contentWindow!.onafterprint = () => {
          document.body.removeChild(iframe);
        };
        setIsPrinting(false);
      };
    } catch (err) {
      console.error("Lỗi khi in đơn hàng:", err);
      alert("❌ Có lỗi xảy ra khi in đơn hàng.");
      setIsPrinting(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      {user && <Sidebar user={user} />}
      <main style={{ flex: 1, overflowY: "auto", backgroundColor: "#f8f9fa", width: "100%" }}>
        <div className="order-detail-page">
      <Breadcrumb />
      {/* Header */}
      <div className="order-detail-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <span className="material-symbols-outlined">arrow_back</span>
          Quay lại
        </button>
        <h1>Chi tiết đơn hàng: {invoice.code_invoice}</h1>
        <span
          className="order-status-badge"
          style={{ backgroundColor: getStatusColor(invoice.status_value) }}
        >
          {invoice.status_value}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          {user?.role_id === 1 && (
            <button
              className="edit-order-btn"
              onClick={() => navigate(`/order-edit/${invoice.code_invoice}`)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 16px",
                backgroundColor: "#f59e0b",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              <span className="material-symbols-outlined">edit</span>
              Cập nhật
            </button>
          )}
          {deliveryInfo?.code_delivery && (
            <button
              className="delivery-history-btn"
              onClick={() => setShowDeliveryHistory(true)}
            >
              <span className="material-symbols-outlined">local_shipping</span>
              Lịch sử giao hàng
            </button>
          )}
          <button
            className="invoice-print-btn"
            onClick={handlePrint}
            disabled={isPrinting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 16px",
              backgroundColor: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            <span className={`material-symbols-outlined${isPrinting ? " spinning" : ""}`}>
              {isPrinting ? "progress_activity" : "print"}
            </span>
            {isPrinting ? "Đang tải..." : "In đơn hàng"}
          </button>
        </div>
      </div>

      {/* Invoice Info */}
      <div className="order-detail-content">
        <div className="order-detail-grid">
          <div className="info-section">
          <h2>
            <span className="material-symbols-outlined">receipt_long</span>
            Thông tin đơn hàng
          </h2>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Mã đơn hàng:</span>
              <span className="info-value">{invoice.code_invoice}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Thời gian tạo:</span>
              <span className="info-value">
                {formatDateTime(invoice.time_create)}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Kênh bán:</span>
              <span className="info-value">{invoice.name_salechannel}</span>
            </div>
            {invoice.subchannel && (
              <div className="info-item">
                <span className="info-label">Kênh con:</span>
                <span className="info-value">{invoice.subchannel}</span>
              </div>
            )}
          </div>
        </div>

        {/* Customer Info */}
        <div className="info-section">
          <h2>
            <span className="material-symbols-outlined">person</span>
            Thông tin khách hàng
          </h2>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Tên khách hàng:</span>
              <span className="info-value">{invoice.name_customer}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Số điện thoại:</span>
              <span className="info-value">{invoice.phone_number}</span>
            </div>
            {invoice.code_customer && (
              <div className="info-item">
                <span className="info-label">Mã khách hàng:</span>
                <span className="info-value">{invoice.code_customer}</span>
              </div>
            )}
            {deliveryInfo?.address && (
              <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                <span className="info-label">Địa chỉ:</span>
                <span className="info-value">{deliveryInfo.address}</span>
              </div>
            )}
          </div>
        </div>

        {/* Seller Info */}
        <div className="info-section">
          <h2>
            <span className="material-symbols-outlined">badge</span>
            Người bán hàng
          </h2>
          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">Mã NV:</span>
              <span className="info-value">{invoice.code_seller}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Tên NV:</span>
              <span className="info-value">{invoice.name_seller}</span>
            </div>
          </div>
        </div>

        {/* Postman Info */}
        {deliveryInfo?.postman_name && (
          <div className="info-section">
            <h2>
              <span className="material-symbols-outlined">directions_bike</span>
              Thông tin giao hàng
            </h2>
            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">Tên bưu tá:</span>
                <span className="info-value">{deliveryInfo.postman_name}</span>
              </div>
              <div className="info-item">
                <span className="info-label">SĐT bưu tá:</span>
                <span className="info-value">{deliveryInfo.postman_phone || "Không có dữ liệu..."}</span>
              </div>
              {deliveryInfo.post_office_name && (
                <div className="info-item">
                  <span className="info-label">Bưu cục:</span>
                  <span className="info-value">{deliveryInfo.post_office_name}</span>
                </div>
              )}
              {deliveryInfo.post_office_phone && (
                <div className="info-item">
                  <span className="info-label">SĐT Bưu cục:</span>
                  <span className="info-value">{deliveryInfo.post_office_phone}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Description */}
        {invoice.description && (
            <div className="info-section">
              <h2>
                <span className="material-symbols-outlined">description</span>
                Ghi chú
              </h2>
              <p className="description-text">{invoice.description}</p>
            </div>
          )}
        </div>

        {/* Products */}
        <div className="products-section">
          <h2>
            <span className="material-symbols-outlined">shopping_bag</span>
            Sản phẩm ({saleProducts.length})
          </h2>
          <table className="products-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Mã SP</th>
                <th>Tên sản phẩm</th>
                <th>Số lượng</th>
                <th>Đơn giá</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {saleProducts.map((product: InvoiceProduct, index: number) => (
                <tr key={product.id_invoice_detail}>
                  <td>{index + 1}</td>
                  <td className="product-code">{product.code_product}</td>
                  <td className="product-name">{product.name_product}</td>
                  <td className="product-qty">{product.quantity}</td>
                  <td>{formatCurrency(product.price)}</td>
                  <td className="product-total">
                    {formatCurrency(product.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Gift Products */}
        {giftProducts.length > 0 && (
          <div className="products-section">
            <h2>
              <span className="material-symbols-outlined">redeem</span>
              Quà tặng ({giftProducts.length})
            </h2>
            <table className="products-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Mã SP</th>
                  <th>Tên sản phẩm</th>
                  <th>Số lượng</th>
                  <th>Đơn giá</th>
                  <th>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {giftProducts.map((product: InvoiceProduct, index: number) => (
                  <tr key={product.id_invoice_detail} className="gift-row">
                    <td>{index + 1}</td>
                    <td className="product-code">{product.code_product}</td>
                    <td className="product-name">{product.name_product}</td>
                    <td className="product-qty">{product.quantity}</td>
                    <td>{formatCurrency(product.price)}</td>
                    <td className="product-total">
                      {formatCurrency(product.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Payment Summary */}
        <div className="payment-section">
          <h2>
            <span className="material-symbols-outlined">payments</span>
            Thanh toán
          </h2>
          <div className="payment-details">
            <div className="payment-row">
              <span>Tạm tính:</span>
              <span>{formatCurrency(invoice.subtotal)}</span>
            </div>
            {invoice.gift_amount > 0 && (
              <div className="payment-row">
                <span>Giá trị quà tặng:</span>
                <span className="gift-amount">
                  {formatCurrency(invoice.gift_amount)}
                </span>
              </div>
            )}
            {invoice.discount > 0 && !isShopeeOrTiktok && (
              <div className="payment-row">
                <span>Giảm giá:</span>
                <span className="discount-amount">
                  -{formatCurrency(invoice.discount)}
                </span>
              </div>
            )}
            {(invoice.fee_delivery > 0 ||
              invoice.type_fee_delivery === "PP_CASH" ||
              invoice.type_fee_delivery === "CC_CASH") && (
              <div className="payment-row">
                <span>Phí vận chuyển:</span>
                <span>
                  {invoice.type_fee_delivery === "CC_CASH" ? (
                    formatCurrency(30000)
                  ) : invoice.type_fee_delivery === "PP_CASH" ? (
                    <span style={{ textDecoration: "line-through", color: "#9ca3af" }}>
                      {formatCurrency(30000)}
                    </span>
                  ) : (
                    formatCurrency(invoice.fee_delivery)
                  )}
                </span>
              </div>
            )}
            {invoice.fee_platform > 0 && !isShopeeOrTiktok && (
              <div className="payment-row">
                <span>Phí nền tảng:</span>
                <span>{formatCurrency(invoice.fee_platform)}</span>
              </div>
            )}
            <div className="payment-row total-row">
              <span>Tổng cộng:</span>
              <span className="total-amount">
                {formatCurrency(invoice.total_amount)}
              </span>
            </div>
            {invoice.discount > 0 && isShopeeOrTiktok && (
              <div className="payment-row">
                <span>Giảm giá:</span>
                <span className="discount-amount">
                  -{formatCurrency(invoice.discount)}
                </span>
              </div>
            )}
            {invoice.type_fee_delivery === "PP_CASH" && (
              <div className="payment-row">
                <span>Giảm giá/khuyến mại (nếu có):</span>
                <span className="discount-amount">
                  {formatCurrency(30000)}
                </span>
              </div>
            )}
            <div className="payment-row cod-row">
              <span>Khách cần trả (COD):</span>
              <span className="cod-amount">
                {formatCurrency(invoice.cod_need_payment)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery History Modal */}
      {showDeliveryHistory && deliveryInfo?.code_delivery && (
        <DeliveryHistoryModal
          codeDelivery={deliveryInfo.code_delivery}
          partnerId={deliveryInfo.id_partner_delivery}
          onClose={() => setShowDeliveryHistory(false)}
        />
      )}
        </div>
      </main>
    </div>
  );
}

export default OrderDetail;
