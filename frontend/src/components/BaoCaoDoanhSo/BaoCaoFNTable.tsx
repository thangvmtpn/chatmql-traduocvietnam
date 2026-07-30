import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  SellerData,
  getChiTietNhanVien,
} from "@/services/baoCaoDoanhSoService";
import "material-symbols";

interface BaoCaoFNTableProps {
  sellers: SellerData[];
  isLoading: boolean;
  fromDate: string;
  toDate: string;
}

const vnd = (num: number) =>
  num
    ? Math.round(num)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    : "0";

const formatDate = (str: string) => {
  if (!str) return "";
  return new Date(str).toLocaleString("vi-VN");
};

function FNDetailModal({
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
              <span className="font-semibold text-indigo-600">
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
                <tr className="bg-indigo-600 text-white">
                  <th className="px-3 py-2 text-center">STT</th>
                  <th className="px-3 py-2 text-left">Mã HĐ</th>
                  <th className="px-3 py-2 text-left">Kênh bán</th>
                  <th className="px-3 py-2 text-right">Doanh số</th>
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
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() =>
                          navigate(
                            `/order-detail/${encodeURIComponent(iv.code_invoice)}`,
                          )
                        }
                        className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-200 transition"
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

function BaoCaoFNTable({
  sellers,
  isLoading,
  fromDate,
  toDate,
}: BaoCaoFNTableProps) {
  const [modalSeller, setModalSeller] = useState<{
    codeSeller: string;
    nameSeller: string;
  } | null>(null);

  const totalDoanh = sellers.reduce((s, r) => s + Number(r.doanh_thu), 0);
  const totalDon = sellers.reduce((s, r) => s + Number(r.so_don), 0);
  const totalAov = totalDon > 0 ? Math.round(totalDoanh / totalDon) : 0;

  return (
    <>
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-emerald-600 text-white">
              <th className="px-3 py-3 text-center w-12">STT</th>
              <th className="px-3 py-3 text-left">Tên nhân viên</th>
              <th className="px-3 py-3 text-right">Doanh số</th>
              <th className="px-3 py-3 text-center">Đơn</th>
              <th className="px-3 py-3 text-right">AOV</th>
              <th className="px-3 py-3 text-center">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-400">
                  Đang tải dữ liệu...
                </td>
              </tr>
            ) : sellers.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-400">
                  Không có dữ liệu.
                </td>
              </tr>
            ) : (
              <>
                {sellers.map((seller, idx) => (
                  <tr
                    key={seller.id_seller ?? idx}
                    className={
                      idx % 2 === 0
                        ? "bg-white hover:bg-emerald-50"
                        : "bg-gray-50 hover:bg-emerald-50"
                    }
                  >
                    <td className="px-3 py-2 text-center text-gray-400">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {seller.name_seller}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-800">
                      {vnd(Number(seller.doanh_thu))}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-700">
                      {Number(seller.so_don).toLocaleString("vi-VN")}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {vnd(Number(seller.aov))}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() =>
                          setModalSeller({
                            codeSeller:
                              seller.code_seller || seller.name_seller,
                            nameSeller: seller.name_seller,
                          })
                        }
                        className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-200 transition mx-auto"
                      >
                        Xem
                      </button>
                    </td>
                  </tr>
                ))}

                {/* TỔNG row */}
                <tr className="bg-emerald-600 text-white font-bold text-base">
                  <td
                    colSpan={2}
                    className="px-3 py-3 text-left border-r border-emerald-400"
                  >
                    TỔNG
                  </td>
                  <td className="px-3 py-3 text-right border-r border-emerald-400">
                    {vnd(totalDoanh)}
                  </td>
                  <td className="px-3 py-3 text-center border-r border-emerald-400">
                    {totalDon.toLocaleString("vi-VN")}
                  </td>
                  <td className="px-3 py-3 text-right border-r border-emerald-400">
                    {vnd(totalAov)}
                  </td>
                  <td className="px-3 py-3 text-center">—</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {modalSeller && (
        <FNDetailModal
          codeSeller={modalSeller.codeSeller}
          nameSeller={modalSeller.nameSeller}
          fromDate={fromDate}
          toDate={toDate}
          onClose={() => setModalSeller(null)}
        />
      )}
    </>
  );
}

export default BaoCaoFNTable;
