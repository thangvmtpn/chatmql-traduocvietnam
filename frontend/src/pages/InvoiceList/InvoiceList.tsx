import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import useAuthStore from "@/stores/useAuthStore";
import Sidebar from "@/components/Sidebar/Sidebar";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import DateRangeFilter from "@/components/DateRangeFilter/DateRangeFilter";
import { useAllInvoices } from "@/hooks/useInvoices";
import { getSaleChannels } from "@/services/invoiceService";
import type { SaleChannel } from "@/services/invoiceService";
import type { InvoiceOrder, InvoiceDetailResponse } from "@/types/api";
import api from "@/services/api";
import { API_ENDPOINTS } from "@/config/api";
import {
  buildInvoicePrintT,
  buildInvoicePrintSHOP,
} from "@/components/InvoicePrint/InvoicePrint";
import { toast } from "react-toastify";
import MultiSelectDropdown from "@/components/MultiSelectDropdown/MultiSelectDropdown";
import "material-symbols";
import "./InvoiceList.css";
import { ALL_STATUSES, getStatusColor } from "@/config/constants";



const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return "...";
  return new Intl.NumberFormat("vi-VN").format(value) + " đ";
};

const formatDateTime = (dateStr: string | null | undefined) => {
  if (!dateStr) return "...";
  return new Date(dateStr).toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatFeeDelivery = (order: InvoiceOrder) => {
  const type = order.type_fee_delivery;
  const fee = order.fee_delivery;

  if (type === "PP_CASH") {
    return { label: "-", className: "fee-pp-cash" };
  }
  if (type === "CC_CASH") {
    return {
      label: `${formatCurrency(30000)}`,
      className: "fee-cc-cash",
    };
  }
  if (fee != null && fee > 0) {
    return { label: formatCurrency(fee), className: "" };
  }
  return { label: "...", className: "" };
};



// ─── Helpers for invoice print form type ────────────────────────────────────
const getInvoiceFormType = (order: InvoiceOrder): "A" | "B" => {
  const channel = (order.name_salechannel || "").toLowerCase();
  const sub = (order.subchannel || "").toLowerCase();
  if (
    channel.includes("shopee mall") ||
    channel.includes("tiktok") ||
    sub.includes("shopee mall") ||
    sub.includes("tiktok")
  ) {
    return "A";
  }
  return "B";
};

/** Fetch invoice detail (có products) qua API */
async function fetchInvoiceDetail(
  code_invoice: string,
): Promise<InvoiceDetailResponse> {
  const res = await api.get<InvoiceDetailResponse>(
    API_ENDPOINTS.INVOICE_DETAIL(code_invoice),
  );
  return res.data;
}

function InvoiceList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);

  const todayStr = new Date().toISOString().split("T")[0] ?? "";

  const [fromDate, setFromDate] = useState<string>(
    searchParams.get("from_date") || todayStr,
  );
  const [toDate, setToDate] = useState<string>(
    searchParams.get("to_date") || todayStr,
  );
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    searchParams.get("status_value")
      ? searchParams.get("status_value")!.split(",")
      : [],
  );
  const [selectedChannels, setSelectedChannels] = useState<string[]>(
    searchParams.get("id_salechannel")
      ? searchParams.get("id_salechannel")!.split(",")
      : [],
  );
  const [searchCode, setSearchCode] = useState<string>(
    searchParams.get("code_invoice") || "",
  );
  const [debouncedCode, setDebouncedCode] = useState<string>(
    searchParams.get("code_invoice") || "",
  );
  const [page, setPage] = useState(1);
  const [saleChannels, setSaleChannels] = useState<SaleChannel[]>([]);
  const [dateResetTrigger, setDateResetTrigger] = useState(false);

  // ── Checkbox / print state ───────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isPrinting, setIsPrinting] = useState(false);
  const [isPrintingShopee, setIsPrintingShopee] = useState(false);
  const [isPrintingTiktok, setIsPrintingTiktok] = useState(false);

  // ── Note edit state ──────────────────────────────────────────────────────────
  const [editingNoteModal, setEditingNoteModal] = useState<{
    isOpen: boolean;
    code_invoice: string;
    currentNote: string;
  }>({
    isOpen: false,
    code_invoice: "",
    currentNote: "",
  });
  const [isUpdatingNote, setIsUpdatingNote] = useState(false);

  const handleSaveNote = async () => {
    if (!editingNoteModal.code_invoice) return;
    setIsUpdatingNote(true);
    try {
      await api.put(API_ENDPOINTS.UPDATE_INVOICE(editingNoteModal.code_invoice), {
        description: editingNoteModal.currentNote,
      });
      toast.success("Cập nhật ghi chú thành công");
      setEditingNoteModal({ isOpen: false, code_invoice: "", currentNote: "" });
      queryClient.invalidateQueries({ queryKey: ["allInvoices"] });
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Lỗi cập nhật ghi chú");
    } finally {
      setIsUpdatingNote(false);
    }
  };

  // Fetch sale channels once
  useEffect(() => {
    getSaleChannels()
      .then(setSaleChannels)
      .catch(() => setSaleChannels([]));
  }, []);

  // Clear selection when page / filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, fromDate, toDate, selectedStatuses, selectedChannels, debouncedCode]);

  // Debounce search code
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedCode(searchCode.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchCode]);

  // Sync filters to URL
  useEffect(() => {
    const params: Record<string, string> = {};
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    if (selectedStatuses.length > 0)
      params.status_value = selectedStatuses.join(",");
    if (selectedChannels.length > 0)
      params.id_salechannel = selectedChannels.join(",");
    if (debouncedCode) params.code_invoice = debouncedCode;
    if (page > 1) params.page = String(page);
    setSearchParams(params, { replace: true });
  }, [
    fromDate,
    toDate,
    selectedStatuses,
    selectedChannels,
    debouncedCode,
    page,
    setSearchParams,
  ]);

  const { data, isLoading } = useAllInvoices({
    from_date: fromDate || undefined,
    to_date: toDate || undefined,
    status_value:
      selectedStatuses.length > 0 ? selectedStatuses.join(",") : undefined,
    id_salechannel_list:
      selectedChannels.length > 0 ? selectedChannels.join(",") : undefined,
    code_invoice: debouncedCode || undefined,
    page,
    limit: 20,
  });

  // ── Selection helpers ───────────────────────────────────────────────────────
  const currentPageOrders = data?.data ?? [];
  const currentPageIds = currentPageOrders.map((o) => o.id_invoice);
  const allCurrentSelected =
    currentPageIds.length > 0 &&
    currentPageIds.every((id) => selectedIds.has(id));
  const someCurrentSelected =
    !allCurrentSelected && currentPageIds.some((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allCurrentSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        currentPageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        currentPageIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const toggleSelectRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Print selected invoices (fetch detail → build HTML → iframe print) ──────
  const printSelectedInvoices = async () => {
    const selected = currentPageOrders.filter((o) =>
      selectedIds.has(o.id_invoice),
    );

    if (selected.length === 0) {
      toast.warning("Chưa chọn hóa đơn nào");
      return;
    }

    const firstType = getInvoiceFormType(selected[0]!);
    const invalid = selected.find((inv) => getInvoiceFormType(inv) !== firstType);
    if (invalid) {
      toast.error(
        "Các hóa đơn bạn chọn đang thuộc NHIỀU KÊNH KHÁC NHAU.\n" +
          "Vui lòng in riêng:\n" +
          "• Shopee Mall / TikTok\n" +
          "• Kênh thường",
      );
      return;
    }

    setIsPrinting(true);
    try {
      // Fetch detail (kèm products) song song cho tất cả đơn được chọn
      const details = await Promise.all(
        selected.map((o) => fetchInvoiceDetail(o.code_invoice)),
      );

      const pagesHtml = details
        .map((res, idx) => {
          const order = selected[idx]!; // luôn tồn tại vì Promise.all map 1-1 với selected
          const html =
            getInvoiceFormType(order) === "A"
              ? buildInvoicePrintSHOP(res.data)
              : buildInvoicePrintT(res.data);
          return `<div class="print-page">${html}</div>`;
        })
        .join("");

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
            <script src="https://cdn.tailwindcss.com"><\/script>
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
      console.error("Lỗi khi tải dữ liệu in:", err);
      toast.error("Có lỗi khi tải dữ liệu đơn hàng. Vui lòng thử lại.");
      setIsPrinting(false);
    }
  };

  const printShopeeWaybill = async () => {
    const selected = currentPageOrders.filter((o) =>
      selectedIds.has(o.id_invoice),
    );

    if (selected.length === 0) {
      toast.warning("Chưa chọn hóa đơn nào");
      return;
    }

    // Check if any selected is NOT shopee
    const invalid = selected.find((inv) => {
      const channel = (inv.name_salechannel || "").toLowerCase();
      const sub = (inv.subchannel || "").toLowerCase();
      return !channel.includes("shopee") && !sub.includes("shopee");
    });

    if (invalid) {
      toast.error("Chức năng này chỉ hỗ trợ các đơn hàng thuộc kênh Shopee (Shopee Mall). Vui lòng bỏ chọn các đơn không phải Shopee để tiếp tục.");
      return;
    }

    setIsPrintingShopee(true);
    try {
      const order_sn_list = selected.map(o => {
        // Lấy phần thực chất của mã Shopee (bỏ HDSPE_ hoặc các tiền tố)
        const parts = o.code_invoice.split('_');
        return parts[parts.length - 1];
      });
      const res = await api.post("/api/invoice/shopee/print", {
        order_sn_list
      }, {
        responseType: 'blob' 
      });

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      
      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
      iframe.src = url;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          if (iframe.contentWindow) {
            iframe.contentWindow.onafterprint = () => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
              URL.revokeObjectURL(url);
            };
          }
        } catch (e) {
          console.error("Print error:", e);
        }
      };

    } catch (err: any) {
      console.error("Lỗi khi tải phiếu in Shopee:", err);
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          const jsonError = JSON.parse(text);
          toast.error(`Lỗi: ${jsonError.detail || jsonError.error || "Không thể tải phiếu in từ hệ thống Shopee"}`);
        } catch {
          toast.error("Không thể tải phiếu in từ hệ thống Shopee");
        }
      } else {
        toast.error("Có lỗi xảy ra khi kết nối API Shopee.");
      }
    } finally {
      setIsPrintingShopee(false);
    }
  };

  const printTiktokWaybill = async () => {
    const selected = currentPageOrders.filter((o) =>
      selectedIds.has(o.id_invoice),
    );

    if (selected.length === 0) {
      toast.warning("Chưa chọn hóa đơn nào");
      return;
    }

    // Check if any selected is NOT tiktok
    const invalid = selected.find((inv) => {
      const channel = (inv.name_salechannel || "").toLowerCase();
      const sub = (inv.subchannel || "").toLowerCase();
      return !channel.includes("tiktok") && !sub.includes("tiktok");
    });

    if (invalid) {
      toast.error("Chức năng này chỉ hỗ trợ các đơn hàng thuộc kênh TikTok. Vui lòng bỏ chọn các đơn không phải TikTok để tiếp tục.");
      return;
    }

    setIsPrintingTiktok(true);
    try {
      // Vì API hiện tại hỗ trợ 1 đơn hoặc ta chỉ lấy đơn đầu tiên
      // Ở đây truyền một list các order_id
      const order_id_list = selected.map(o => {
        // Mã TikTok thường lưu trực tiếp hoặc có tiền tố, ta ưu tiên lấy mã trực tiếp
        // Trong hệ thống, nếu có tiền tố thì cần bóc tách. Giả sử giống Shopee:
        const parts = o.code_invoice.split('_');
        return parts[parts.length - 1];
      });

      const res = await api.post("/api/invoice/tiktok/print", {
        order_id_list
      }, {
        responseType: 'blob' 
      });

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      
      const iframe = document.createElement("iframe");
      iframe.style.cssText =
        "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
      iframe.src = url;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          if (iframe.contentWindow) {
            iframe.contentWindow.onafterprint = () => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
              URL.revokeObjectURL(url);
            };
          }
        } catch (e) {
          console.error("Print error:", e);
        }
      };

    } catch (err: any) {
      console.error("Lỗi khi tải phiếu in TikTok:", err);
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          const jsonError = JSON.parse(text);
          toast.error(`Lỗi: ${jsonError.detail || jsonError.error || "Không thể tải phiếu in từ hệ thống TikTok"}`);
        } catch {
          toast.error("Không thể tải phiếu in từ hệ thống TikTok");
        }
      } else {
        toast.error("Có lỗi xảy ra khi kết nối API TikTok.");
      }
    } finally {
      setIsPrintingTiktok(false);
    }
  };

  const handleDateChange = (from: string, to: string) => {
    setFromDate(from);
    setToDate(to);
    setPage(1);
  };

  const handleReset = () => {
    setSelectedStatuses([]);
    setSelectedChannels([]);
    setSearchCode("");
    setDebouncedCode("");
    setFromDate(todayStr);
    setToDate(todayStr);
    setPage(1);
    setSelectedIds(new Set());
    setDateResetTrigger((v) => !v);
  };

  const statusOptions = ALL_STATUSES.map((s) => ({ value: s, label: s }));
  const channelOptions = saleChannels.map((ch) => ({
    value: String(ch.id_salechannel),
    label: ch.name_salechannel,
  }));

  if (!user) return null;

  return (
    <div className="invoice-list-layout">
      <Sidebar user={user} />
      <main className="invoice-list-main">
        <Breadcrumb />

        {/* Header */}
        <div className="invoice-list-header">
          <h1>
            <span className="material-symbols-outlined">receipt_long</span>
            Danh sách đơn hàng
          </h1>
          {selectedIds.size > 0 && (
            <div className="invoice-bulk-actions">
              <span className="invoice-bulk-count">
                Đã chọn <strong>{selectedIds.size}</strong> đơn
              </span>
              <button
                className="invoice-print-btn"
                onClick={printShopeeWaybill}
                disabled={isPrinting || isPrintingShopee}
                style={{ backgroundColor: "#ff5722", marginRight: "8px" }}
                title="In phiếu giao hàng chuẩn từ API Shopee"
              >
                <span className={`material-symbols-outlined${isPrintingShopee ? " spinning" : ""}`}>
                  {isPrintingShopee ? "progress_activity" : "receipt"}
                </span>
                {isPrintingShopee ? "Đang tải phiếu..." : "Phiếu GH Shopee"}
              </button>
              <button
                className="invoice-print-btn"
                onClick={printTiktokWaybill}
                disabled={isPrinting || isPrintingShopee || isPrintingTiktok}
                style={{ backgroundColor: "#000000", marginRight: "8px" }}
                title="In phiếu giao hàng chuẩn từ API TikTok"
              >
                <span className={`material-symbols-outlined${isPrintingTiktok ? " spinning" : ""}`}>
                  {isPrintingTiktok ? "progress_activity" : "receipt"}
                </span>
                {isPrintingTiktok ? "Đang tải phiếu..." : "Phiếu GH TikTok"}
              </button>
              <button
                className="invoice-print-btn"
                onClick={printSelectedInvoices}
                disabled={isPrinting || isPrintingShopee || isPrintingTiktok}
              >
                <span className={`material-symbols-outlined${isPrinting ? " spinning" : ""}`}>
                  {isPrinting ? "progress_activity" : "print"}
                </span>
                {isPrinting ? "Đang tải..." : "In đơn hàng"}
              </button>
              <button
                className="invoice-deselect-btn"
                onClick={() => setSelectedIds(new Set())}
                title="Bỏ chọn tất cả"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="invoice-list-filters">
          <div className="filter-row">
            <div className="filter-group">
              <label className="filter-label">Thời gian</label>
              <DateRangeFilter
                onFilterChange={handleDateChange}
                resetTrigger={dateResetTrigger}
                defaultFilterType="today"
              />
            </div>
          </div>

          <div className="filter-row filter-row-selects">
            <div className="filter-group">
              <label className="filter-label">Tra cứu</label>
              <div className="search-code-wrapper">
                <input
                  type="text"
                  className="search-code-input"
                  placeholder="Tìm kiếm mã hoá đơn hoặc SĐT..."
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value)}
                />
                {searchCode && (
                  <button
                    className="search-code-clear"
                    onClick={() => {
                      setSearchCode("");
                      setDebouncedCode("");
                    }}
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                )}
              </div>
            </div>

            <div className="filter-group">
              <label className="filter-label">Trạng thái</label>
              <MultiSelectDropdown
                label="trạng thái"
                options={statusOptions}
                selected={selectedStatuses}
                onChange={(v) => {
                  setSelectedStatuses(v);
                  setPage(1);
                }}
                placeholder="Tất cả trạng thái"
              />
            </div>

            <div className="filter-group">
              <label className="filter-label">Kênh bán</label>
              <MultiSelectDropdown
                label="kênh"
                options={channelOptions}
                selected={selectedChannels}
                onChange={(v) => {
                  setSelectedChannels(v);
                  setPage(1);
                }}
                placeholder="Tất cả kênh bán"
              />
            </div>

            <button className="reset-filter-btn" onClick={handleReset}>
              <span className="material-symbols-outlined">restart_alt</span>
              Đặt lại
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="invoice-list-results">
          {isLoading ? (
            <div className="invoice-list-loading">
              <span className="material-symbols-outlined spinning">
                progress_activity
              </span>
              <p>Đang tải dữ liệu...</p>
            </div>
          ) : !data?.data || data.data.length === 0 ? (
            <div className="invoice-list-empty">
              <span className="material-symbols-outlined">inbox</span>
              <p>Không có hoá đơn nào trong khoảng thời gian này</p>
            </div>
          ) : (
            <>
              <div className="invoice-list-count">
                Tìm thấy <strong>{data.pagination.total}</strong> hoá đơn
              </div>

              <div className="invoice-list-table-wrapper">
                <table className="invoice-list-table">
                  <thead>
                    <tr>
                      <th className="invoice-th-check">
                        <input
                          type="checkbox"
                          className="invoice-row-checkbox"
                          checked={allCurrentSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someCurrentSelected;
                          }}
                          onChange={toggleSelectAll}
                          title={allCurrentSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                        />
                      </th>
                      <th>Kênh bán</th>
                      <th>Thời gian</th>
                      <th>Trạng thái</th>
                      <th>Mã hoá đơn</th>
                      <th>Mã vận đơn</th>
                      <th>GMV</th>
                      <th>Phí giao hàng</th>
                      <th>Ghi chú</th>
                      <th>Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.data.map((order: InvoiceOrder) => {
                      const fee = formatFeeDelivery(order);
                      const isChecked = selectedIds.has(order.id_invoice);
                      return (
                        <tr
                          key={order.id_invoice}
                          className={isChecked ? "invoice-row-selected" : ""}
                        >
                          <td className="invoice-td-check">
                            <input
                              type="checkbox"
                              className="invoice-row-checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectRow(order.id_invoice)}
                            />
                          </td>
                          <td>
                            {order.name_salechannel === "B2C-Fn"
                              ? "UPSELL"
                              : order.name_salechannel || "..."}
                          </td>
                          <td>{formatDateTime(order.time_create)}</td>
                          <td>
                            <span
                              className="invoice-status-badge"
                              style={{
                                backgroundColor: getStatusColor(
                                  order.status_value,
                                ),
                              }}
                            >
                              {order.status_value}
                            </span>
                          </td>
                          <td className="invoice-code-cell">
                            {order.code_invoice}
                          </td>
                          <td className="invoice-code-cell">
                            {order.code_delivery || "..."}
                          </td>
                          <td className="amount-cell">
                            {formatCurrency(order.total_amount)}
                          </td>
                          <td className={`fee-cell ${fee.className}`}>
                            {fee.label}
                          </td>
                          <td className="note-cell" style={{ maxWidth: '200px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={order.description || ""}>
                                {order.description || ""}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingNoteModal({
                                    isOpen: true,
                                    code_invoice: order.code_invoice,
                                    currentNote: order.description || "",
                                  });
                                }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: '2px', display: 'flex' }}
                                title="Cập nhật ghi chú"
                              >
                                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
                              </button>
                            </div>
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
                              Xem
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data.pagination.total_pages > 1 && (
                <div className="invoice-list-pagination">
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
      </main>

      {/* Modal cập nhật ghi chú */}
      {editingNoteModal.isOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditingNoteModal({ isOpen: false, code_invoice: "", currentNote: "" })}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', maxWidth: '400px', width: '100%', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600, color: '#111827' }}>Cập nhật ghi chú đơn hàng</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '14px', color: '#4b5563', marginBottom: '8px' }}>Mã đơn: <strong>{editingNoteModal.code_invoice}</strong></label>
              <textarea
                autoFocus
                rows={4}
                value={editingNoteModal.currentNote}
                onChange={(e) => setEditingNoteModal(prev => ({ ...prev, currentNote: e.target.value }))}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', outline: 'none', fontSize: '14px', resize: 'none' }}
                placeholder="Nhập ghi chú mới..."
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setEditingNoteModal({ isOpen: false, code_invoice: "", currentNote: "" })}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: 'white', color: '#374151', cursor: 'pointer', fontWeight: 500 }}
              >
                Hủy
              </button>
              <button
                onClick={handleSaveNote}
                disabled={isUpdatingNote}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#3b82f6', color: 'white', cursor: isUpdatingNote ? 'not-allowed' : 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {isUpdatingNote ? (
                  <>
                    <span className="material-symbols-outlined spinning" style={{ fontSize: '18px' }}>progress_activity</span>
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>save</span>
                    Lưu ghi chú
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InvoiceList;
