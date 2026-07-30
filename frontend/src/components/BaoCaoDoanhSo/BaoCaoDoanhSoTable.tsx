import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ChannelData,
  getChiTietNhanVien,
  getSalesTargets,
  upsertSalesTarget,
} from "@/services/baoCaoDoanhSoService";
import InvoiceDetailModal from "./InvoiceDetailModal";
import "material-symbols";


const formatDate = (str: string) => {
  if (!str) return "";
  return new Date(str).toLocaleString("vi-VN");
};

function SellerDetailModal({
  codeSeller,
  nameSeller,
  fromDate,
  toDate,
  onClose,
}: {
  codeSeller: string;
  nameSeller: string;
  fromDate: string;
  toDate: string;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["chi-tiet-fn", codeSeller, fromDate, toDate],
    queryFn: () => getChiTietNhanVien(codeSeller, nameSeller, fromDate, toDate),
  });
  const navigate = useNavigate();
  const invoices = data?.invoices || [];

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              Chi tiết đơn hàng — {nameSeller}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {fromDate === toDate
                ? `Ngày ${fromDate}`
                : `${fromDate} → ${toDate}`}
              {" · "}
              <span className="font-semibold text-emerald-600">
                {invoices.length} đơn
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>
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
          {!isLoading && !error && invoices.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              Không có đơn hàng nào trong khoảng thời gian này.
            </div>
          )}
          {!isLoading && invoices.length > 0 && (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-emerald-600 text-white">
                  <th className="px-3 py-2 text-center">STT</th>
                  <th className="px-3 py-2 text-left">Mã HĐ</th>
                  <th className="px-3 py-2 text-left">Kênh bán</th>
                  <th className="px-3 py-2 text-center">Doanh số</th>
                  <th className="px-3 py-2 text-center">Trạng thái</th>
                  <th className="px-3 py-2 text-center">Thời gian</th>
                  <th className="px-3 py-2 text-center">Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((iv, idx) => (
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
                    <td className="px-3 py-2 text-center font-semibold text-green-700">
                      {iv.subtotal
                        ? Math.round(Number(iv.subtotal))
                            .toString()
                            .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
                        : "0"}
                      đ
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
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() =>
                          navigate(
                            `/order-detail/${encodeURIComponent(iv.code_invoice)}`,
                          )
                        }
                        className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-200 transition"
                      >
                        Xem
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

interface BaoCaoDoanhSoTableProps {
  channels: ChannelData[];
  isLoading: boolean;
  fromDate: string;
  toDate: string;
}

// ─── Modal Đặt Mục Tiêu Hàng Loạt ────────────────────────────────
interface TargetItem {
  kenh: string;
  label: string;
  isGroup?: boolean;
  subKeys?: string[];
  currentTarget: number;
}

function UnifiedTargetModal({
  f0Items,
  upsellItems,
  masterTarget,
  onClose,
  onSave,
}: {
  f0Items: TargetItem[];
  upsellItems: TargetItem[];
  masterTarget: number;
  onClose: () => void;
  onSave: (targets: Record<string, number>) => void;
}) {
  const [valMaster, setValMaster] = useState<string>(masterTarget > 0 ? String(masterTarget) : "");
  
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    f0Items.forEach((item) => {
      init[item.kenh] = item.currentTarget > 0 ? String(item.currentTarget) : "";
    });
    upsellItems.forEach((item) => {
      init[item.kenh] = item.currentTarget > 0 ? String(item.currentTarget) : "";
    });
    return init;
  });

  const masterNum = Number(valMaster) || 0;

  const handleChange = (kenh: string, raw: string) => {
    const cleaned = raw.replace(/\./g, "").replace(/,/g, "").replace(/[^0-9]/g, "");
    setValues((prev) => ({ ...prev, [kenh]: cleaned }));
  };

  const handleSave = () => {
    const result: Record<string, number> = {};
    result["TONG_MUC_TIEU"] = masterNum;
    f0Items.concat(upsellItems).forEach((item) => {
      if (item.subKeys && item.subKeys.length > 0) {
        const sum = item.subKeys.reduce((s, k) => s + (Number(values[k]) || 0), 0);
        result[item.kenh] = sum;
      } else {
        const num = Number(values[item.kenh] || "0");
        result[item.kenh] = isNaN(num) ? 0 : num;
      }
    });
    onSave(result);
    onClose();
  };

  const currentDistributed = f0Items.concat(upsellItems).reduce((sum, item) => {
    if (item.subKeys && item.subKeys.length > 0) return sum;
    return sum + (Number(values[item.kenh]) || 0);
  }, 0);
  const remaining = masterNum > 0 ? masterNum - currentDistributed : 0;
  const isOver = currentDistributed > masterNum && masterNum > 0;

  const renderItems = (items: TargetItem[], accentClass: string, textClass: string, ringClass: string) => (
    <div className="space-y-1.5">
      {items.map((item) => {
        let itemVal = Number(values[item.kenh]) || 0;
        let isReadOnly = false;

        if (item.subKeys && item.subKeys.length > 0) {
          itemVal = item.subKeys.reduce((s, k) => s + (Number(values[k]) || 0), 0);
          isReadOnly = true;
        }

        const pct = masterNum > 0 ? ((itemVal / masterNum) * 100).toFixed(2) + "%" : "0.00%";
        return (
          <div
            key={item.kenh}
            className={`grid items-center gap-3 rounded-lg px-3 py-2 ${item.isGroup ? accentClass : "bg-white border border-gray-100"}`}
            style={{ gridTemplateColumns: "1fr auto auto" }}
          >
            <span
              className={`text-sm ${
                item.isGroup
                  ? `font-bold uppercase tracking-wide ${textClass}`
                  : "text-gray-600 pl-3"
              }`}
              style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {item.isGroup ? item.label : `↳ ${item.label}`}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 w-12 text-right">{pct}</span>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={itemVal ? Number(itemVal).toLocaleString("vi-VN") : ""}
                  onChange={(e) => !isReadOnly && handleChange(item.kenh, e.target.value)}
                  placeholder="0"
                  className={`w-32 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 ${ringClass} ${isReadOnly ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}`}
                  readOnly={isReadOnly}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 rounded-t-2xl flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-800">🎯 Cấu hình mục tiêu</h2>
            <p className="text-sm text-gray-500 mt-0.5">Áp dụng chung cho tất cả các kỳ</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        {/* Master Target */}
        <div className="px-6 py-4 bg-white border-b border-gray-100 flex-shrink-0">
          <label className="block text-sm font-bold text-gray-700 mb-2">TỔNG MỤC TIÊU KINH DOANH</label>
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={valMaster ? Number(valMaster).toLocaleString("vi-VN") : ""}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/\./g, "").replace(/,/g, "").replace(/[^0-9]/g, "");
                setValMaster(cleaned);
              }}
              placeholder="Nhập tổng mục tiêu..."
              className="w-full text-xl font-bold text-emerald-700 border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">VNĐ</span>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-6">
          <div>
            <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-2">Kênh bán hàng (F0)</h3>
            {renderItems(f0Items, "bg-indigo-50", "text-indigo-700", "focus:ring-indigo-400")}
          </div>

          {upsellItems.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">Kênh Upsell</h3>
              {renderItems(upsellItems, "bg-emerald-50", "text-emerald-700", "focus:ring-emerald-400")}
            </div>
          )}
        </div>

        {/* Footer Summary & Actions */}
        <div className="bg-white border-t border-gray-200 p-5 rounded-b-2xl flex-shrink-0">
          <div className="flex flex-col gap-1.5 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Tổng đã phân bổ ({masterNum > 0 ? ((currentDistributed / masterNum) * 100).toFixed(1) : 0}%):</span>
              <span className={`font-bold ${isOver ? "text-red-600" : "text-gray-800"}`}>
                {currentDistributed.toLocaleString("vi-VN")} đ
              </span>
            </div>
            {masterNum > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{isOver ? "Vượt quá mục tiêu:" : "Còn lại chưa phân bổ:"}</span>
                <span className={`font-bold ${isOver ? "text-red-600" : "text-emerald-600"}`}>
                  {isOver ? (currentDistributed - masterNum).toLocaleString("vi-VN") : remaining.toLocaleString("vi-VN")} đ
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md transition"
            >
              Lưu tất cả
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const vnd = (num: number) =>
  num
    ? Math.round(num)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    : "0";

const pct = (value: number, target: number) => {
  if (!target) return "0.00%";
  return ((value / target) * 100).toFixed(2) + "%";
};

// CPBH sàn TMĐT: (phí vận chuyển + phí sàn 17% + quảng cáo) / doanh thu
const CP_VAN_CHUYEN = 22_000; // fixed per đơn
const TI_LE_PHI_SAN = 0.17;

const calcCpbhSan = (doanh_thu: number, so_don: number): number | null => {
  if (!doanh_thu) return null;
  const cp = so_don * CP_VAN_CHUYEN + doanh_thu * TI_LE_PHI_SAN; // quảng cáo = 0
  return (cp / doanh_thu) * 100;
};

const calcCpbhCost = (doanh_thu: number, so_don: number): number => {
  if (!doanh_thu) return 0;
  return so_don * CP_VAN_CHUYEN + doanh_thu * TI_LE_PHI_SAN;
};

const KENH_SAN = ["SHOPEE", "TIKTOK"];

function BaoCaoDoanhSoTable({
  channels,
  isLoading,
  fromDate,
  toDate,
}: BaoCaoDoanhSoTableProps) {
  const queryClient = useQueryClient();
  const [modalKenh, setModalKenh] = useState<string | null>(null);
  const [modalSeller, setModalSeller] = useState<{
    codeSeller: string;
    nameSeller: string;
  } | null>(null);
  const [showTargetModal, setShowTargetModal] = useState(false);

  // Fetch targets từ DB
  const { data: targetsData } = useQuery({
    queryKey: ["sales-targets"],
    queryFn: () => getSalesTargets(),
  });

  // Map kenh -> muc_tieu (ưu tiên DB, fallback ch.muc_tieu)
  const targetsMap: Record<string, number> = {};
  (targetsData || []).forEach((t) => {
    targetsMap[t.kenh] = t.muc_tieu;
  });

  // Helper lấy target: ưu tiên DB, fallback data từ server
  const getTarget = (kenh: string, fallback: number) =>
    targetsMap[kenh] !== undefined ? targetsMap[kenh] : fallback;

  const getChannelDisplayTarget = (ch: ChannelData) => {
    let gTarget = getTarget(ch.kenh, Number(ch.muc_tieu));
    if (ch.is_group && ch.sub && ch.sub.length > 0) {
      let subSum = 0;
      ch.sub.forEach((sub) => {
        subSum += getTarget(sub.kenh, sub.muc_tieu);
      });
      if (subSum > 0) return subSum;
    }
    return gTarget;
  };

  // Bulk save nhiều kênh cùng lúc
  const handleSaveBulkTargets = async (targets: Record<string, number>) => {
    await Promise.all(
      Object.entries(targets).map(([kenh, value]) =>
        upsertSalesTarget(kenh, value),
      ),
    );
    queryClient.invalidateQueries({
      queryKey: ["sales-targets"],
    });
  };

  // Danh sách item cho modal F0
  const f0Items: TargetItem[] = channels
    .filter((ch) => !ch.is_upsell)
    .flatMap((ch) => {
      if (ch.is_group && ch.sub && ch.sub.length > 0) {
        const subKeys = ch.sub.map(s => s.kenh);
        return [
          { kenh: ch.kenh, label: ch.kenh, isGroup: true, subKeys, currentTarget: getChannelDisplayTarget(ch) },
          ...ch.sub.map((sub) => ({
            kenh: sub.kenh,
            label: sub.kenh,
            isGroup: false,
            currentTarget: getTarget(sub.kenh, sub.muc_tieu),
          })),
        ];
      }
      return [{ kenh: ch.kenh, label: ch.kenh, isGroup: true, currentTarget: getChannelDisplayTarget(ch) }];
    });

  // Danh sách item cho modal Upsell
  const upsellItems: TargetItem[] = channels
    .filter((ch) => ch.is_upsell)
    .flatMap((ch) => {
      if (ch.is_group && ch.sub && ch.sub.length > 0) {
        const subKeys = ch.sub.map(s => s.kenh);
        return [
          { kenh: ch.kenh, label: ch.kenh, isGroup: true, subKeys, currentTarget: getChannelDisplayTarget(ch) },
          ...ch.sub.map((sub) => ({
            kenh: sub.kenh,
            label: sub.kenh,
            isGroup: false,
            currentTarget: getTarget(sub.kenh, sub.muc_tieu),
          })),
        ];
      }
      return [{ kenh: ch.kenh, label: ch.kenh, isGroup: true, currentTarget: getChannelDisplayTarget(ch) }];
    });

  const totalDoanh = channels.reduce((s, c) => s + Number(c.doanh_thu), 0);

  const sumDetailedTargets = (chList: ChannelData[]) => {
    let sum = 0;
    chList.forEach((ch) => {
      sum += getChannelDisplayTarget(ch);
    });
    return sum;
  };

  // Tính tổng mục tiêu F0 từ targetsMap (hoặc fallback ch.muc_tieu)
  const f0Channels = channels.filter((ch) => !ch.is_upsell);
  const totalF0Doanh = f0Channels.reduce((s, c) => s + Number(c.doanh_thu), 0);
  const totalF0Don = f0Channels.reduce((s, c) => s + Number(c.so_don), 0);
  const totalF0MucTieu = sumDetailedTargets(f0Channels);
  const totalF0Aov = totalF0Don > 0 ? Math.round(totalF0Doanh / totalF0Don) : 0;
  const totalF0HoanThanh = totalF0MucTieu > 0 ? (totalF0Doanh / totalF0MucTieu) * 100 : 0;

  // Tính tổng Upsell
  const upsellChannels = channels.filter((ch) => ch.is_upsell);
  const totalUpsellDoanh = upsellChannels.reduce((s, c) => s + Number(c.doanh_thu), 0);
  const totalUpsellDon = upsellChannels.reduce((s, c) => s + Number(c.so_don), 0);
  const totalUpsellMucTieu = sumDetailedTargets(upsellChannels);
  const totalUpsellAov = totalUpsellDon > 0 ? Math.round(totalUpsellDoanh / totalUpsellDon) : 0;
  const totalUpsellHoanThanh = totalUpsellMucTieu > 0 ? (totalUpsellDoanh / totalUpsellMucTieu) * 100 : 0;

  const masterTarget = getTarget("TONG_MUC_TIEU", 0);

  // Tổng mục tiêu bao gồm cả upsell
  const totalMucTieu = masterTarget > 0 ? masterTarget : channels.reduce(
    (s, c) => s + getTarget(c.kenh, Number(c.muc_tieu)),
    0,
  );
  const totalHoanThanh =
    totalMucTieu > 0 ? (totalDoanh / totalMucTieu) * 100 : 0;

  // Tính tổng chi phí bán hàng (bao gồm F0 + UPSELL)
  const calcTotalCpbh = () => {
    let totalCp = 0;
    channels.forEach((ch) => {
      if (ch.is_group) {
        (ch.sub || []).forEach((sub) => {
          if (KENH_SAN.includes(ch.kenh)) {
            totalCp += calcCpbhCost(Number(sub.doanh_thu), Number(sub.so_don));
          } else if (sub.cpbh != null) {
            totalCp += (sub.cpbh / 100) * Number(sub.doanh_thu);
          }
        });
      } else {
        // Standalone channels
        if (KENH_SAN.includes(ch.kenh)) {
          totalCp += calcCpbhCost(Number(ch.doanh_thu), Number(ch.so_don));
        } else if (ch.cpbh != null) {
          totalCp += (ch.cpbh / 100) * Number(ch.doanh_thu);
        }
      }
    });
    return totalDoanh > 0 ? (totalCp / totalDoanh) * 100 : 0;
  };

  const totalCpbh = calcTotalCpbh();



  return (
    <>
      <div className="bg-white rounded-xl shadow-lg overflow-hidden mt-4">
        {/* Main Title */}
        <table className="w-full bg-green-900 text-white border-collapse">
          <tbody>
            <tr>
              <td
                className="px-4 py-3 text-left w-1/4 align-middle"
              >
                <div className="font-bold text-base mb-2">TỔNG QUAN KẾT QUẢ KINH DOANH</div>
                <button
                  onClick={() => setShowTargetModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-400 hover:bg-yellow-300 text-green-900 text-xs font-bold rounded-lg transition"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    target
                  </span>
                  Cấu hình mục tiêu
                </button>
              </td>
              <td className="px-4 py-3 text-center border-l border-green-700">
                <div className="text-xs text-gray-100 mb-0.5">
                  DOANH SỐ THỰC TẾ
                </div>
                <div className="font-bold text-lg text-yellow-300">
                  {vnd(totalDoanh)} đ
                </div>
              </td>
              <td className="px-4 py-3 text-center border-l border-green-700">
                <div className="text-xs text-gray-100 mb-0.5">
                  TỶ LỆ HOÀN THÀNH
                </div>
                <div className="font-bold text-lg text-yellow-300">
                  {totalHoanThanh.toFixed(2)}%
                </div>
              </td>
              <td className="px-4 py-3 text-center border-l border-green-700">
                <div className="text-xs text-gray-100 mb-0.5">
                  CHI PHÍ BÁN HÀNG TỔNG
                </div>
                <div className="font-bold text-lg text-yellow-300">
                  {totalCpbh.toFixed(2)}%
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* TABLE 1 Header bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-green-800 border-t border-green-700">
          <span className="text-white font-semibold text-sm tracking-wide">
            KÊNH BÁN HÀNG (F0)
          </span>
        </div>

        {/* TABLE 1: Các kênh bình thường (không có UPSELL columns) */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-green-700 text-white text-center text-xs">
              <th rowSpan={2} className="px-2 py-2 align-middle">
                TT
              </th>
              <th rowSpan={2} className="px-2 py-2 align-middle">
                KÊNH BÁN HÀNG
              </th>
              <th colSpan={4} className="px-2 py-2 align-middle">
                CHỈ SỐ KINH DOANH - DOANH SỐ
              </th>
              <th colSpan={2} className="px-2 py-2 align-middle">
                TỈ TRỌNG
              </th>
              <th rowSpan={2} className="px-2 py-2 align-middle">
                CHI TIẾT ĐƠN
              </th>
            </tr>
            <tr className="bg-green-600 text-white text-center text-xs">
              <th className="px-2 py-2">MỤC TIÊU</th>
              <th className="px-2 py-2">THỰC TẾ</th>
              <th className="px-2 py-2">SỐ ĐƠN</th>
              <th className="px-2 py-2">AOV</th>
              <th className="px-2 py-2">HOÀN THÀNH</th>
              <th className="px-2 py-2">CPBH</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="text-center py-10 text-gray-400">
                  Đang tải dữ liệu...
                </td>
              </tr>
            ) : (
              <>
                {channels
                  .filter((ch) => !ch.is_upsell) // Chỉ hiển thị non-UPSELL
                  .map((ch, idx) => {
                    const topNum = idx + 1;
                    const chTarget = getChannelDisplayTarget(ch);
                    const htPct =
                      chTarget > 0
                        ? (Number(ch.doanh_thu) / chTarget) * 100
                        : 0;

                    if (ch.is_group) {
                      const isUpsell = ch.is_upsell;
                      const isSan = !isUpsell && KENH_SAN.includes(ch.kenh);
                      const groupCpbh = isSan
                        ? calcCpbhSan(Number(ch.doanh_thu), Number(ch.so_don))
                        : isUpsell
                          ? (ch.cpbh ?? null)
                          : null;
                      const groupBg = isUpsell
                        ? "bg-emerald-50 border-t-2 border-emerald-200"
                        : "bg-indigo-50 border-t-2 border-indigo-200";
                      const groupTextBold = isUpsell
                        ? "text-emerald-700"
                        : "text-indigo-700";
                      const groupTextName = isUpsell
                        ? "text-emerald-800"
                        : "text-indigo-800";
                      const groupTextSub = isUpsell
                        ? "text-emerald-700"
                        : "text-indigo-700";
                      return (
                        <>
                          {/* Group header row */}
                          <tr key={`group-${ch.kenh}`} className={groupBg}>
                            <td
                              className={`px-2 py-2 text-center font-bold ${groupTextBold}`}
                            >
                              {topNum}
                            </td>
                            <td
                              className={`px-2 py-2 font-bold uppercase tracking-wide ${groupTextName}`}
                            >
                              {ch.kenh}
                            </td>
                            <td
                              className={`px-2 py-2 text-center font-semibold ${groupTextSub}`}
                            >
                              {chTarget > 0 ? vnd(chTarget) : "—"}
                            </td>
                            <td
                              className={`px-2 py-2 text-center font-bold ${groupTextName}`}
                            >
                              {vnd(Number(ch.doanh_thu))}
                            </td>
                            <td
                              className={`px-2 py-2 text-center font-semibold ${groupTextSub}`}
                            >
                              {Number(ch.so_don).toLocaleString("vi-VN")}
                            </td>
                            <td
                              className={`px-2 py-2 text-center font-semibold ${groupTextSub}`}
                            >
                              {vnd(Number(ch.aov))}
                            </td>
                            <td className="px-2 py-2 text-center">
                              {chTarget > 0 ? (
                                <span
                                  className={`font-bold ${htPct >= 100 ? "text-green-600" : htPct >= 50 ? "text-yellow-600" : "text-red-500"}`}
                                >
                                  {pct(Number(ch.doanh_thu), chTarget)}
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center">
                              {groupCpbh != null ? (
                                <span className="font-bold text-orange-600">
                                  {groupCpbh.toFixed(2)}%
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            {isUpsell ? (
                              <>
                                <td className="px-2 py-2 text-center font-semibold text-emerald-700">
                                  {ch.lich_ban_hang ?? 0}
                                </td>
                                <td className="px-2 py-2 text-center font-semibold text-emerald-700">
                                  {ch.so_don_tu_lich ?? 0}
                                </td>
                                <td className="px-2 py-2 text-center">
                                  {ch.lich_ban_hang ? (
                                    <span className="font-bold text-emerald-700">
                                      {(ch.ti_le_chot ?? 0).toFixed(2)}%
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                              </>
                            ) : null}
                            <td className="px-2 py-2 text-center text-gray-400">
                              —
                            </td>
                          </tr>

                          {/* Sub-channel rows */}
                          {(ch.sub || []).map((sub) => {
                            const isFn = sub.is_fn;
                            return (
                              <tr
                                key={`sub-${sub.kenh}`}
                                className={`bg-white border-b border-gray-100 ${
                                  isUpsell
                                    ? "hover:bg-emerald-50"
                                    : "hover:bg-indigo-50"
                                }`}
                              >
                                <td className="px-2 py-2 text-center text-gray-400 text-xs">
                                  {topNum}
                                  {sub.sub_label}
                                </td>
                                <td className="px-2 py-2 pl-7 text-gray-700">
                                  {sub.kenh}
                                </td>
                                <td className="px-2 py-2 text-center text-gray-500">
                                  {getTarget(sub.kenh, sub.muc_tieu) > 0 ? vnd(getTarget(sub.kenh, sub.muc_tieu)) : "—"}
                                </td>
                                <td className="px-2 py-2 text-center font-semibold text-gray-800">
                                  {vnd(Number(sub.doanh_thu))}
                                </td>
                                <td className="px-2 py-2 text-center font-semibold text-gray-700">
                                  {Number(sub.so_don).toLocaleString("vi-VN")}
                                </td>
                                <td className="px-2 py-2 text-center text-gray-700">
                                  {vnd(Number(sub.aov))}
                                </td>
                                <td className="px-2 py-2 text-center">
                                  {(() => {
                                    const st = getTarget(sub.kenh, sub.muc_tieu);
                                    const sHtPct = st > 0 ? (Number(sub.doanh_thu) / st) * 100 : 0;
                                    return st > 0 ? (
                                      <span className={`font-bold ${sHtPct >= 100 ? "text-green-600" : sHtPct >= 50 ? "text-yellow-600" : "text-red-500"}`}>
                                        {pct(Number(sub.doanh_thu), st)}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    );
                                  })()}
                                </td>
                                <td className="px-2 py-2 text-center">
                                  {(() => {
                                    const subCpbh = isFn
                                      ? (sub.cpbh ?? null)
                                      : isSan
                                        ? calcCpbhSan(
                                            Number(sub.doanh_thu),
                                            Number(sub.so_don),
                                          )
                                        : null;
                                    return subCpbh != null ? (
                                      <span className="font-bold text-orange-600">
                                        {subCpbh.toFixed(2)}%
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    );
                                  })()}
                                </td>
                                {isFn ? (
                                  <>
                                    <td className="px-2 py-2 text-center text-emerald-700 font-semibold">
                                      {sub.lich_ban_hang ?? 0}
                                    </td>
                                    <td className="px-2 py-2 text-center text-emerald-700 font-semibold">
                                      {sub.so_don_tu_lich ?? 0}
                                    </td>
                                    <td className="px-2 py-2 text-center">
                                      {(sub.lich_ban_hang ?? 0) > 0 ? (
                                        <span className="font-bold text-emerald-700">
                                          {(sub.ti_le_chot ?? 0).toFixed(2)}%
                                        </span>
                                      ) : (
                                        <span className="text-gray-400">—</span>
                                      )}
                                    </td>
                                  </>
                                ) : null}
                                <td className="px-2 py-2 text-center">
                                  <button
                                    onClick={() =>
                                      isFn
                                        ? setModalSeller({
                                            codeSeller:
                                              sub.code_seller || sub.kenh,
                                            nameSeller: sub.kenh,
                                          })
                                        : setModalKenh(sub.kenh)
                                    }
                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition mx-auto ${
                                      isFn
                                        ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                        : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                                    }`}
                                  >
                                    Xem
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </>
                      );
                    }

                    // Standalone (non-group) row
                    return (
                      <tr
                        key={ch.kenh}
                        className="border-t-2 border-indigo-200 bg-white hover:bg-indigo-50"
                      >
                        <td className="px-2 py-2 text-center text-gray-500 font-semibold">
                          {topNum}
                        </td>
                        <td className="px-2 py-2 font-medium text-gray-800">
                          {ch.kenh}
                        </td>
                         <td className="px-2 py-2 text-center text-gray-500">
                           <div className="flex items-center justify-center gap-1">
                             <span>{chTarget > 0 ? vnd(chTarget) : "—"}</span>
                           </div>
                         </td>
                        <td className="px-2 py-2 text-center font-semibold text-gray-800">
                          {vnd(Number(ch.doanh_thu))}
                        </td>
                        <td className="px-2 py-2 text-center text-gray-700">
                          {Number(ch.so_don).toLocaleString("vi-VN")}
                        </td>
                        <td className="px-2 py-2 text-center text-gray-700">
                          {vnd(Number(ch.aov))}
                        </td>
                         <td className="px-2 py-2 text-center">
                           {chTarget > 0 ? (
                             <span
                               className={`font-bold ${htPct >= 100 ? "text-green-600" : htPct >= 50 ? "text-yellow-600" : "text-red-500"}`}
                             >
                               {pct(Number(ch.doanh_thu), chTarget)}
                             </span>
                           ) : (
                             <span className="text-gray-400">—</span>
                           )}
                         </td>
                        <td className="px-2 py-2 text-center">
                          {KENH_SAN.includes(ch.kenh) ? (
                            <span className="font-bold text-orange-600">
                              {calcCpbhSan(
                                Number(ch.doanh_thu),
                                Number(ch.so_don),
                              )?.toFixed(2)}
                              %
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            onClick={() => setModalKenh(ch.kenh)}
                            className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-200 transition mx-auto"
                          >
                            Xem
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                {/* TỔNG row (Table 1) */}
                <tr className="bg-indigo-600 text-white font-bold text-base">
                  <td
                    colSpan={2}
                    className="px-3 py-3 text-left border-r border-indigo-400"
                  >
                    TỔNG
                  </td>
                  <td className="px-3 py-3 text-center border-r border-indigo-400">
                    {vnd(totalF0MucTieu)}
                  </td>
                  <td className="px-3 py-3 text-center border-r border-indigo-400">
                    {vnd(totalF0Doanh)}
                  </td>
                  <td className="px-3 py-3 text-center border-r border-indigo-400">
                    {totalF0Don.toLocaleString("vi-VN")}
                  </td>
                  <td className="px-3 py-3 text-center border-r border-indigo-400">
                    {vnd(totalF0Aov)}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {totalF0MucTieu > 0 ? (
                      <span className={totalF0HoanThanh >= 100 ? "text-yellow-300" : totalF0HoanThanh >= 50 ? "text-yellow-200" : "text-red-300"}>
                        {totalF0HoanThanh.toFixed(2)}%
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-3 text-center">—</td>
                  <td className="px-3 py-3 text-center">—</td>
                </tr>
              </>
            )}
          </tbody>
        </table>

        {/* TABLE 2: UPSELL */}
        {!isLoading && channels.some((ch) => ch.is_upsell) && (
          <>
            {/* Upsell Header bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-emerald-800 border-t-4 border-emerald-600 mt-4">
              <span className="text-white font-semibold text-sm tracking-wide">
                KÊNH BÁN HÀNG (UPSELL)
              </span>
            </div>
            <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-emerald-800 text-white text-center text-xs">
                <th rowSpan={2} className="px-2 py-2 align-middle">
                  TT
                </th>
                <th rowSpan={2} className="px-2 py-2 align-middle">
                  KÊNH BÁN HÀNG (UPSELL)
                </th>
                <th colSpan={4} className="px-2 py-2 align-middle">
                  CHỈ SỐ KINH DOANH - DOANH SỐ
                </th>
                <th colSpan={2} className="px-2 py-2 align-middle">
                  TỈ TRỌNG
                </th>
                <th colSpan={3} className="px-2 py-2 align-middle hidden">
                  LỊCH BÁN HÀNG
                </th>
                <th rowSpan={2} className="px-2 py-2 align-middle">
                  CHI TIẾT ĐƠN
                </th>
              </tr>
              <tr className="bg-emerald-700 text-white text-center text-xs">
                <th className="px-2 py-2">MỤC TIÊU</th>
                <th className="px-2 py-2">THỰC TẾ</th>
                <th className="px-2 py-2">SỐ ĐƠN</th>
                <th className="px-2 py-2">AOV</th>
                <th className="px-2 py-2">HOÀN THÀNH</th>
                <th className="px-2 py-2">CPBH</th>
                <th className="px-2 py-2 hidden">LỊCH BH</th>
                <th className="px-2 py-2 hidden">ĐƠN TỪ LỊCH</th>
                <th className="px-2 py-2 hidden">TỶ LỆ CHỐT</th>
              </tr>
            </thead>
            <tbody>
              {channels
                .filter((ch) => ch.is_upsell)
                .map((ch, idx) => {
                  const topNum = idx + 1;
                  const chTarget = getChannelDisplayTarget(ch);
                  const htPct =
                    chTarget > 0
                      ? (Number(ch.doanh_thu) / chTarget) * 100
                      : 0;

                  if (ch.is_group) {
                    // UPSELL group row
                    return (
                      <>
                        {/* UPSELL Group header row */}
                        <tr
                          key={`upsell-group`}
                          className="bg-emerald-50 border-t-2 border-emerald-200"
                        >
                          <td className="px-2 py-2 text-center font-bold text-emerald-700">
                            {topNum}
                          </td>
                          <td className="px-2 py-2 font-bold uppercase tracking-wide text-emerald-800">
                            {ch.kenh}
                          </td>
                          <td className="px-2 py-2 text-center font-semibold text-emerald-700">
                            {chTarget > 0 ? vnd(chTarget) : "—"}
                          </td>
                          <td className="px-2 py-2 text-center font-bold text-emerald-800">
                            {vnd(Number(ch.doanh_thu))}
                          </td>
                          <td className="px-2 py-2 text-center font-semibold text-emerald-700">
                            {Number(ch.so_don).toLocaleString("vi-VN")}
                          </td>
                          <td className="px-2 py-2 text-center font-semibold text-emerald-700">
                            {vnd(Number(ch.aov))}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {chTarget > 0 ? (
                              <span
                                className={`font-bold ${htPct >= 100 ? "text-green-600" : htPct >= 50 ? "text-yellow-600" : "text-red-500"}`}
                              >
                                {pct(Number(ch.doanh_thu), chTarget)}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className="font-bold text-orange-600">
                              {(ch.cpbh ?? 0).toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center font-semibold text-emerald-700 hidden">
                            {ch.lich_ban_hang ?? 0}
                          </td>
                          <td className="px-2 py-2 text-center font-semibold text-emerald-700 hidden">
                            {ch.so_don_tu_lich ?? 0}
                          </td>
                          <td className="px-2 py-2 text-center hidden">
                            {(ch.lich_ban_hang ?? 0) > 0 ? (
                              <span className="font-bold text-emerald-700">
                                {(ch.ti_le_chot ?? 0).toFixed(2)}%
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center text-gray-400">
                            —
                          </td>
                        </tr>

                        {/* UPSELL Sub-seller rows */}
                        {(ch.sub || []).map((sub, subIdx) => {
                          return (
                            <tr
                              key={`upsell-sub-${sub.kenh}`}
                              className="bg-white border-b border-gray-100 hover:bg-emerald-50"
                            >
                              <td className="px-2 py-2 text-center text-gray-400 text-xs">
                                {subIdx + 1}
                              </td>
                              <td className="px-2 py-2 pl-7 text-gray-700">
                                {sub.kenh}
                              </td>
                              <td className="px-2 py-2 text-center text-gray-500">
                                {getTarget(sub.kenh, sub.muc_tieu) > 0 ? vnd(getTarget(sub.kenh, sub.muc_tieu)) : "—"}
                              </td>
                              <td className="px-2 py-2 text-center font-semibold text-gray-800">
                                {vnd(Number(sub.doanh_thu))}
                              </td>
                              <td className="px-2 py-2 text-center font-semibold text-gray-700">
                                {Number(sub.so_don).toLocaleString("vi-VN")}
                              </td>
                              <td className="px-2 py-2 text-center text-gray-700">
                                {vnd(Number(sub.aov))}
                              </td>
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  const st = getTarget(sub.kenh, sub.muc_tieu);
                                  const sHtPct = st > 0 ? (Number(sub.doanh_thu) / st) * 100 : 0;
                                  return st > 0 ? (
                                    <span className={`font-bold ${sHtPct >= 100 ? "text-green-600" : sHtPct >= 50 ? "text-yellow-600" : "text-red-500"}`}>
                                      {pct(Number(sub.doanh_thu), st)}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  );
                                })()}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <span className="font-bold text-orange-600">
                                  {(sub.cpbh ?? 0).toFixed(2)}%
                                </span>
                              </td>
                              <td className="px-2 py-2 text-center text-emerald-700 font-semibold hidden">
                                {sub.lich_ban_hang ?? 0}
                              </td>
                              <td className="px-2 py-2 text-center text-emerald-700 font-semibold hidden">
                                {sub.so_don_tu_lich ?? 0}
                              </td>
                              <td className="px-2 py-2 text-center hidden">
                                {(sub.lich_ban_hang ?? 0) > 0 ? (
                                  <span className="font-bold text-emerald-700">
                                    {(sub.ti_le_chot ?? 0).toFixed(2)}%
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <button
                                  onClick={() =>
                                    setModalSeller({
                                      codeSeller: sub.code_seller || sub.kenh,
                                      nameSeller: sub.kenh,
                                    })
                                  }
                                  className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-200 transition mx-auto"
                                >
                                  Xem
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {/* UPSELL TỔNG row */}
                        <tr className="bg-emerald-600 text-white font-bold text-base">
                          <td
                            colSpan={2}
                            className="px-3 py-3 text-left border-r border-emerald-400"
                          >
                            UPSELL TỔNG
                          </td>
                          <td className="px-3 py-3 text-center border-r border-emerald-400">
                            {vnd(totalUpsellMucTieu)}
                          </td>
                          <td className="px-3 py-3 text-center border-r border-emerald-400">
                            {vnd(totalUpsellDoanh)}
                          </td>
                          <td className="px-3 py-3 text-center border-r border-emerald-400">
                            {totalUpsellDon.toLocaleString("vi-VN")}
                          </td>
                          <td className="px-3 py-3 text-center border-r border-emerald-400">
                            {vnd(totalUpsellAov)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {totalUpsellMucTieu > 0 ? (
                              <span className={totalUpsellHoanThanh >= 100 ? "text-yellow-300" : totalUpsellHoanThanh >= 50 ? "text-yellow-200" : "text-red-300"}>
                                {totalUpsellHoanThanh.toFixed(2)}%
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-3 text-center">—</td>
                          <td className="px-3 py-3 text-center hidden">
                            {ch.lich_ban_hang ?? 0}
                          </td>
                          <td className="px-3 py-3 text-center hidden">
                            {ch.so_don_tu_lich ?? 0}
                          </td>
                          <td className="px-3 py-3 text-center hidden">
                            {(ch.lich_ban_hang ?? 0) > 0
                              ? `${(ch.ti_le_chot ?? 0).toFixed(2)}%`
                              : "—"}
                          </td>
                          <td className="px-3 py-3 text-center">—</td>
                        </tr>
                      </>
                    );
                  }

                  return null;
                })}
            </tbody>
          </table>
          </>
        )}
      </div>

      {modalKenh && (
        <InvoiceDetailModal
          kenh={modalKenh}
          fromDate={fromDate}
          toDate={toDate}
          onClose={() => setModalKenh(null)}
        />
      )}

      {modalSeller && (
        <SellerDetailModal
          codeSeller={modalSeller.codeSeller}
          nameSeller={modalSeller.nameSeller}
          fromDate={fromDate}
          toDate={toDate}
          onClose={() => setModalSeller(null)}
        />
      )}

      {showTargetModal && (
        <UnifiedTargetModal
          f0Items={f0Items}
          upsellItems={upsellItems}
          masterTarget={masterTarget}
          onClose={() => setShowTargetModal(false)}
          onSave={handleSaveBulkTargets}
        />
      )}
    </>
  );
}

export default BaoCaoDoanhSoTable;
