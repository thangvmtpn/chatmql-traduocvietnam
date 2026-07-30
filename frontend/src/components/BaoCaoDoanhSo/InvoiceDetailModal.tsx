import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getChiTietHoaDon,
  assignKenhF0,
} from "@/services/baoCaoDoanhSoService";
import "material-symbols";
import { useNavigate } from "react-router-dom";

// Phải khớp với GROUPS_F0 ở backend
const GROUPS_F0: Record<string, string[]> = {
  TIKTOK: [
    "TIKTOK DATA",
    "TIKTOK SHOP SPARK",
    "TIKTOK LIVE (PHƯƠNG ANH)",
    "TIKTOK LIVE (HẢI HÀ)",
    "SanShop",
  ],
  FACEBOOK: ["FACEBOOK DATA", "FACEBOOK LIVE"],
  ZALO: ["ZALO ADS", "ZALO LIVE", "ZALO MINI APP"],
  "THƯƠNG HIỆU": ["Google/Website", "Tổng đài", "Bán trực tiếp", "B2B (SỈ)"],
};

function getGroupSiblings(kenh: string): string[] {
  for (const members of Object.values(GROUPS_F0)) {
    if (members.includes(kenh)) {
      return members.filter((m) => m !== kenh);
    }
  }
  return [];
}

interface PhanLoaiModalProps {
  codeInvoice: string;
  sourceKenh: string;
  siblings: string[];
  fromDate: string;
  toDate: string;
  onClose: () => void;
}

function PhanLoaiModal({
  codeInvoice,
  sourceKenh,
  siblings,
  fromDate,
  toDate,
  onClose,
}: PhanLoaiModalProps) {
  const [selectedKenh, setSelectedKenh] = useState(siblings[0] || "");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => assignKenhF0(codeInvoice, sourceKenh, selectedKenh),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["chi-tiet-hoadon", sourceKenh, fromDate, toDate],
      });
      queryClient.invalidateQueries({
        queryKey: ["bao-cao-f0", fromDate, toDate],
      });
      onClose();
    },
  });

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-800">
            Phân loại đơn hàng
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        <p className="text-sm text-gray-500">
          Mã HĐ:{" "}
          <span className="font-semibold text-indigo-600">{codeInvoice}</span>
        </p>

        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
          Chọn kênh để chuyển sang:
        </p>

        <div className="flex flex-col gap-2">
          {siblings.map((sib) => (
            <label
              key={sib}
              className={`flex items-center justify-start gap-2 px-4 py-3 rounded-xl border-2 cursor-pointer transition ${
                selectedKenh === sib
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 hover:border-indigo-300"
              }`}
            >
              <input
                type="radio"
                name="target_kenh"
                value={sib}
                checked={selectedKenh === sib}
                onChange={() => setSelectedKenh(sib)}
                className="accent-indigo-600"
                style={{ width: "auto" }}
              />
              <span className="text-sm font-medium text-gray-800">{sib}</span>
            </label>
          ))}
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-500">Lỗi! Vui lòng thử lại.</p>
        )}

        <div className="flex gap-2 mt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition"
          >
            Hủy
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!selectedKenh || mutation.isPending}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {mutation.isPending ? "Đang lưu..." : "Xác nhận"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface InvoiceDetailModalProps {
  kenh: string;
  fromDate: string;
  toDate: string;
  onClose: () => void;
}

const vnd = (num: number) =>
  num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "0";

const formatDate = (str: string) => {
  if (!str) return "";
  if (str.length >= 19 && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(str)) {
    return str.substring(0, 19).replace("T", " ");
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toLocaleString("vi-VN");
  }
  return str;
};

function InvoiceDetailModal({
  kenh,
  fromDate,
  toDate,
  onClose,
}: InvoiceDetailModalProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["chi-tiet-hoadon", kenh, fromDate, toDate],
    queryFn: () => getChiTietHoaDon(kenh, fromDate, toDate),
  });

  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [phanLoaiInvoice, setPhanLoaiInvoice] = useState<string | null>(null);

  const invoices = data?.invoices || [];
  const siblings = getGroupSiblings(kenh);

  const filteredInvoices = invoices.filter((iv) =>
    iv.code_invoice?.toLowerCase().includes(search.toLowerCase()),
  );

  const handleViewDetails = (invoice: any) => {
    navigate(`/order-detail/${encodeURIComponent(invoice.code_invoice)}`);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 pt-4 pb-3 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-xl font-bold text-gray-800">
                  Chi tiết đơn hàng — {kenh}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {fromDate === toDate
                    ? `Ngày ${fromDate}`
                    : `${fromDate} → ${toDate}`}
                  {" · "}
                  <span className="font-semibold text-indigo-600">
                    {filteredInvoices.length}/{invoices.length} đơn
                  </span>
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition"
              >
                <span className="material-symbols-outlined text-2xl">
                  close
                </span>
              </button>
            </div>

            {/* Search bar */}
            <div className="relative search-box">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
                search
              </span>
              <input
                type="text"
                placeholder="Tìm theo mã hóa đơn..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <span className="material-symbols-outlined text-lg">
                    close
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-6 py-4">
            {isLoading && (
              <div className="text-center py-12 text-gray-500">
                Đang tải dữ liệu...
              </div>
            )}
            {error && (
              <div className="text-center py-12 text-red-500">
                Lỗi tải dữ liệu. Vui lòng thử lại.
              </div>
            )}
            {!isLoading && !error && filteredInvoices.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                {search
                  ? "Không tìm thấy đơn hàng phù hợp."
                  : "Không có đơn hàng nào trong khoảng thời gian này."}
              </div>
            )}
            {!isLoading && filteredInvoices.length > 0 && (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-indigo-600 text-white">
                    <th className="px-3 py-2 text-center">STT</th>
                    <th className="px-3 py-2 text-left">Mã HĐ</th>
                    <th className="px-3 py-2 text-left">Kênh bán</th>
                    <th className="px-3 py-2 text-right">Doanh số</th>
                    <th className="px-3 py-2 text-center">Trạng thái</th>
                    <th className="px-3 py-2 text-center">Thời gian</th>
                    <th className="px-3 py-2 text-center w-36">Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((iv, idx) => (
                    <tr
                      key={iv.code_invoice || idx}
                      className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
                    >
                      <td className="px-3 py-2 text-center text-gray-500">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2 text-blue-600 font-medium">
                        {iv.code_invoice}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {iv.name_salechannel}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-green-700">
                        {vnd(Number(iv.subtotal))}đ
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            iv.status_value?.includes("hủy") ||
                            iv.status_value?.includes("hoàn")
                              ? "bg-red-100 text-red-700"
                              : iv.status_value?.includes("giao")
                                ? "bg-green-100 text-green-700"
                                : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {iv.status_value}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-gray-500 whitespace-nowrap">
                        {formatDate(iv.time_create)}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleViewDetails(iv)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-semibold transition"
                          >
                            <span
                              className="material-symbols-outlined text-sm"
                              style={{ fontSize: 14 }}
                            >
                              open_in_new
                            </span>
                            Xem
                          </button>
                          {siblings.length > 0 && (
                            <button
                              onClick={() =>
                                setPhanLoaiInvoice(iv.code_invoice)
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 text-xs font-semibold whitespace-nowrap transition"
                            >
                              <span
                                className="material-symbols-outlined text-sm"
                                style={{ fontSize: 14 }}
                              >
                                swap_horiz
                              </span>
                              Phân loại
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {phanLoaiInvoice && (
        <PhanLoaiModal
          codeInvoice={phanLoaiInvoice}
          sourceKenh={kenh}
          siblings={siblings}
          fromDate={fromDate}
          toDate={toDate}
          onClose={() => setPhanLoaiInvoice(null)}
        />
      )}
    </>
  );
}

export default InvoiceDetailModal;
