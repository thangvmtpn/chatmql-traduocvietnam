/**
 * InvoicePrint helpers
 * Render invoice data as raw HTML strings for iframe printing.
 * Two layouts:
 *   - buildInvoicePrintT  → kênh thường (có đơn giá, tổng tiền, SĐT ẩn, mã KH, ghi chú…)
 *   - buildInvoicePrintSHOP → Shopee Mall / TikTok (ẩn giá, chỉ hiện số lượng)
 */

import type { InvoiceDetailData } from "@/types/api";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
const LOGO_URL = `${BASE_URL}images/Logo_black.png`;
const ZALO_QR_URL = `/images/zalo_miniapp_muahang.JPG`;

/** Mask phone: hiện 4 số cuối, che phần còn lại */
function maskPhone(phone: string): string {
  if (!phone) return "";
  const tail = phone.slice(-4);
  const stars = "*".repeat(Math.max(0, phone.length - 4));
  return stars + tail;
}

function fmtVND(v: number | null | undefined): string {
  if (v == null) return "0";
  return v.toLocaleString("vi-VN");
}

// ─── KÊNH THƯỜNG ──────────────────────────────────────────────────────────────
export function buildInvoicePrintT(data: InvoiceDetailData): string {
  const { invoice, products } = data;
  const date = new Date(invoice.time_create);

  const sortedProducts = [
    ...products.filter((p) => p.type_product !== "gift"),
    ...products.filter((p) => p.type_product === "gift"),
  ];

  const productRows = sortedProducts
    .map(
      (item, i) => `
      <tr>
        <td class="border border-black text-center py-1">${i + 1}</td>
        <td class="border border-black py-1 px-1">${item.name_product}</td>
        <td class="border border-black text-center py-1">${item.quantity}</td>
        <td class="border border-black text-center py-1">${fmtVND(item.price)}</td>
        <td class="border border-black text-center py-1">${fmtVND(item.total)}</td>
      </tr>`,
    )
    .join("");

  const shippingFee =
    invoice.type_fee_delivery === "CC_CASH"
      ? invoice.cod_need_payment - invoice.subtotal + invoice.discount
      : 0;

  const descriptionRow =
    invoice.description && invoice.description.trim() !== ""
      ? `<p class="m-0"><strong>Ghi chú: ${invoice.description}</strong></p>`
      : "";

  return `
    <div class="printBox max-w-[720px] mx-auto bg-white shadow-md p-2 mt-4">
      <!-- Header -->
      <div class="text-center mb-4">
        <div class="flex items-center justify-center">
          <img src="${LOGO_URL}" alt="Logo" style="zoom:11%" />
          <div class="text-left ml-4">
            <p class="m-0 p-0 text-[14px] font-bold">TRÀ DƯỢC VIỆT NAM</p>
            <p class="m-0 mt-1 p-0 text-[16px] font-bold">HÀNG CHÍNH HÃNG</p>
          </div>
        </div>
        <div class="mt-3 text-left text-[12px]">
          <p class="m-0">Trụ sở: Số 15, Ngõ 19, Đường Hoàng Ngân,</p>
          <p class="m-0">Phường Phan Đình Phùng, Tỉnh Thái Nguyên.</p>
          <p class="m-0">Website: traduocvietnam.vn</p>
          <p class="m-0 font-bold">Nhận phản hồi chất lượng dịch vụ:<br/>0344 6868 62</p>
        </div>
      </div>

      <!-- Tiêu đề -->
      <div class="text-center font-bold text-[14px] py-2 mb-3">
        PHIẾU GIAO &amp; HÓA ĐƠN BÁN HÀNG
      </div>

      <!-- Thông tin đơn hàng -->
      <div class="mb-3 text-[12px]">
        <p class="m-0"><strong>Mã đơn hàng: ${invoice.code_invoice}</strong></p>
        <p class="m-0">Ngày: ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}</p>
        <p class="m-0">Nhân viên bán hàng: ${invoice.name_seller}</p>
      </div>

      <!-- Thông tin khách hàng -->
      <div class="mb-3 text-[12px]">
        <p class="m-0"><strong>Khách hàng: ${invoice.name_customer}</strong></p>
        <p class="m-0"><strong>Mã Khách hàng: ${invoice.code_customer ?? "..."}</strong></p>
        <p class="m-0"><strong>SĐT: ${maskPhone(invoice.phone_number)}</strong></p>
        ${
          invoice.name_salechannel === "B2C-Fn" && data.delivery_info?.address
            ? `<p class="m-0"><strong>Địa chỉ: ${data.delivery_info.address}</strong></p>`
            : ""
        }
        ${descriptionRow}
      </div>

      <!-- Bảng sản phẩm -->
      <table class="w-full border border-black text-[11px]">
        <thead>
          <tr class="bg-gray-100">
            <td class="border border-black text-center w-[8%] font-bold py-1 text-[9.5px]">TT</td>
            <td class="border border-black text-center font-bold py-1 text-[9.5px]">Tên sản phẩm</td>
            <td class="border border-black text-center w-[19%] font-bold py-1 text-[9.5px]">Số lượng</td>
            <td class="border border-black text-center w-[18.5%] font-bold py-1 text-[9.5px]">Đơn giá</td>
            <td class="border border-black text-center w-[21.5%] font-bold py-1 text-[9.5px]">Thành tiền</td>
          </tr>
        </thead>
        <tbody>
          ${productRows}
        </tbody>
      </table>

      <table class="w-[98%] mt-1">
        <tfoot>
          <tr>
            <td class="text-right font-bold text-[12px] py-1 whitespace-nowrap" colspan="2">Tổng tiền:</td>
            <td class="text-right font-bold text-[12px] py-1" colspan="2">${fmtVND(invoice.subtotal)}</td>
          </tr>
          <tr>
            <td class="text-right font-bold text-[12px] py-1 whitespace-nowrap" colspan="2">Phí vận chuyển:</td>
            <td class="text-right font-bold text-[12px] py-1" colspan="2">${fmtVND(shippingFee)}</td>
          </tr>
          <tr>
            <td class="text-right font-bold text-[12px] py-1 whitespace-nowrap" colspan="2">Chiết khấu - Giảm giá (nếu có):</td>
            <td class="text-right font-bold text-[12px] py-1" colspan="2">${fmtVND(invoice.discount)}</td>
          </tr>
          <tr>
            <td class="text-right font-bold text-[12px] py-1 whitespace-nowrap" colspan="2">Tổng thanh toán:</td>
            <td class="text-right font-bold text-[12px] py-1" colspan="2">${fmtVND(invoice.cod_need_payment)}</td>
          </tr>
        </tfoot>
      </table>

      <p class="mt-2 text-[12px] italic m-0">
        Quý khách truy cập: hoadon.traduocvietnam.vn và nhập <strong>"Mã đơn hàng"</strong>
        để lấy hóa đơn GTGT Hoặc liên hệ nhân viên phụ trách trong vòng 24h, kể từ khi giao hàng thành công.
      </p>

      <div class="mt-4">
        <p class="text-center text-[14px] font-bold m-0">QUÉT MÃ - TRUY CẬP ZALO MINI APP TÍCH ĐIỂM ĐỔI QUÀ</p>
        <p class="text-[13px] m-0">- Nhận quà đăng ký lần đầu</p>
        <p class="text-[13px] m-0">- Tích điểm thành viên nhận vô vàn ưu đãi từ 20K - 4500K</p>
        <p class="text-[13px] m-0">- Nâng hạng thành viên - nhận quà khủng</p>
        <div class="flex justify-center mt-2">
          <img alt="QUÉT MÃ TÍCH ĐIỂM" src="${ZALO_QR_URL}"
            style="width:150px;height:150px;object-fit:contain;" />
        </div>
        <p class="text-center text-[14px] font-bold m-0 mt-4">QUÉT MÃ MUA HÀNG QUA ZALO MINI APP</p>
        <div class="flex justify-center mt-2">
          <img alt="QUÉT MÃ MUA HÀNG" src="${ZALO_QR_URL}"
            style="width:150px;height:150px;object-fit:contain;" />
        </div>
      </div>

      <div class="mt-4 text-left text-[14px]">
        <p class="m-0">
          Quý khách phản hồi về chất lượng &amp; dịch vụ vui lòng liên hệ tổng đài 24/7
          <strong>1900 0093</strong> hoặc <strong>0344 6868 62</strong>.
        </p>
      </div>
    </div>`;
}

// ─── SHOPEE MALL / TIKTOK ────────────────────────────────────────────────────
export function buildInvoicePrintSHOP(data: InvoiceDetailData): string {
  const { invoice, products } = data;
  const date = new Date(invoice.time_create);

  const sortedProducts = [
    ...products.filter((p) => p.type_product !== "gift"),
    ...products.filter((p) => p.type_product === "gift"),
  ];

  const productRows = sortedProducts
    .map(
      (item, i) => `
      <tr>
        <td class="border border-black text-center py-1">${i + 1}</td>
        <td class="border border-black py-1 px-1">${item.name_product}</td>
        <td class="border border-black text-center py-1">${item.quantity}</td>
      </tr>`,
    )
    .join("");

  return `
    <div class="printBox max-w-[720px] mx-auto bg-white shadow-md p-2 mt-4">
      <!-- Header -->
      <div class="text-center mb-4">
        <div class="flex items-center justify-center">
          <img src="${LOGO_URL}" alt="Logo" style="zoom:11%" />
          <div class="text-left ml-4">
            <p class="m-0 p-0 text-[14px] font-bold">TRÀ DƯỢC VIỆT NAM</p>
            <p class="m-0 mt-1 p-0 text-[16px] font-bold">HÀNG CHÍNH HÃNG</p>
          </div>
        </div>
        <div class="mt-3 text-left text-[12px]">
          <p class="m-0">Trụ sở: Số 15, Ngõ 19, Đường Hoàng Ngân,</p>
          <p class="m-0">Phường Phan Đình Phùng, Tỉnh Thái Nguyên.</p>
          <p class="m-0">Website: traduocvietnam.vn</p>
          <p class="m-0 font-bold">Tổng đài CSKH: 1900 0093</p>
        </div>
      </div>

      <!-- Tiêu đề -->
      <div class="text-center font-bold text-[14px] py-2 mb-3">
        PHIẾU GIAO &amp; HÓA ĐƠN BÁN HÀNG
      </div>

      <!-- Thông tin đơn hàng -->
      <div class="mb-3 text-[12px]">
        <p class="m-0"><strong>Mã đơn hàng: ${invoice.code_invoice}</strong></p>
        <p class="m-0">Ngày: ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}</p>
        <p class="m-0">Người mua: ${invoice.name_customer}</p>
      </div>

      <!-- Bảng sản phẩm (ẩn giá) -->
      <table class="w-full border border-black text-[11px]">
        <thead>
          <tr class="bg-gray-100">
            <td class="border border-black text-center w-[8%] font-bold py-1 text-[9.5px]">TT</td>
            <td class="border border-black text-center font-bold py-1 text-[9.5px]">Tên sản phẩm</td>
            <td class="border border-black text-center w-[19%] font-bold py-1 text-[9.5px]">Số lượng</td>
          </tr>
        </thead>
        <tbody>
          ${productRows}
        </tbody>
      </table>

      <table class="w-[98%] mt-1">
        <tfoot>
          <tr>
            <td class="text-right font-bold text-[12px] py-1 whitespace-nowrap" colspan="2">Tổng thanh toán:</td>
            <td class="text-right font-bold text-[12px] py-1" colspan="2">${fmtVND(invoice.cod_need_payment)}</td>
          </tr>
        </tfoot>
      </table>

      <p class="mt-2 text-[12px] italic m-0">
        Quý khách truy cập: hoadon.traduocvietnam.vn và nhập <strong>"Mã đơn hàng"</strong>
        để lấy hóa đơn GTGT Hoặc liên hệ <strong>0398 932 329</strong> để được hỗ trợ.
      </p>

      <div class="mt-4">
        <p class="text-center text-[14px] font-bold m-0">QUÉT MÃ - TRUY CẬP ZALO MINI APP TÍCH ĐIỂM ĐỔI QUÀ</p>
        <p class="text-[13px] m-0">- Nhận quà đăng ký lần đầu</p>
        <p class="text-[13px] m-0">- Tích điểm thành viên nhận vô vàn ưu đãi từ 20K - 4500K</p>
        <p class="text-[13px] m-0">- Nâng hạng thành viên - nhận quà khủng</p>
        <div class="flex justify-center mt-2">
          <img alt="QUÉT MÃ TÍCH ĐIỂM" src="${ZALO_QR_URL}"
            style="width:150px;height:150px;object-fit:contain;" />
        </div>
      </div>

      <div class="mt-4 text-left text-[14px]">
        <p class="m-0">
          Quý khách phản hồi về chất lượng &amp; dịch vụ vui lòng liên hệ tổng đài 24/7
          <strong>1900 0093</strong> hoặc <strong>0979 369 256</strong>.
        </p>
      </div>
    </div>`;
}
