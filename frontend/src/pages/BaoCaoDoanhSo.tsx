import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/Sidebar/Sidebar";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import BaoCaoDoanhSoTable from "@/components/BaoCaoDoanhSo/BaoCaoDoanhSoTable";
import { getBaoCaoF0 } from "@/services/baoCaoDoanhSoService";
import { User } from "@/stores/useAuthStore";
import "material-symbols";

interface BaoCaoDoanhSoProps {
  user: User | null;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const vnd = (num: number) =>
  num
    ? Math.round(num)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
    : "0";

function BaoCaoDoanhSo({ user }: BaoCaoDoanhSoProps) {
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());
  const [appliedFrom, setAppliedFrom] = useState(todayStr());
  const [appliedTo, setAppliedTo] = useState(todayStr());

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["bao-cao-f0", appliedFrom, appliedTo],
    queryFn: () => getBaoCaoF0(appliedFrom, appliedTo),
  });

  const channels = data?.channels || [];
  const totalDoanh = channels.reduce((s, c) => s + Number(c.doanh_thu), 0);
  const totalMucTieu = channels
    .filter((c) => !c.is_upsell)
    .reduce((s, c) => s + Number(c.muc_tieu), 0);
  const totalDoanhF0 = channels
    .filter((c) => !c.is_upsell)
    .reduce((s, c) => s + Number(c.doanh_thu), 0);
  const tyLeHT =
    totalMucTieu > 0
      ? ((totalDoanhF0 / totalMucTieu) * 100).toFixed(2)
      : "0.00";

  const handleApply = () => {
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
  };

  const reportTitle =
    appliedFrom === appliedTo
      ? `Báo cáo doanh số ngày ${appliedFrom.split("-").reverse().join("/")}`
      : `Báo cáo doanh số từ ${appliedFrom.split("-").reverse().join("/")} đến ${appliedTo.split("-").reverse().join("/")}`;

  if (!user) return <div>Loading...</div>;

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      <Sidebar user={user} />
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          backgroundColor: "#f8f9fa",
          width: "100%",
        }}
      >
        <Breadcrumb />

        <div className="p-6">
          {/* Title */}
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-linear-to-r from-indigo-600 to-purple-600 mb-6">
            {reportTitle}
          </h1>

          {/* Filter */}
          <div className="bg-white rounded-xl shadow p-4 mb-6 flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">
                Từ ngày
              </label>
              <input
                type="date"
                value={fromDate}
                max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">
                Đến ngày
              </label>
              <input
                type="date"
                value={toDate}
                min={fromDate}
                onChange={(e) => setToDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleApply}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-base">
                  search
                </span>
                Xem báo cáo
              </button>
              <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition flex items-center gap-1"
                title="Làm mới"
              >
                <span className="material-symbols-outlined text-base">
                  refresh
                </span>
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl p-4 mb-4">
              Lỗi tải dữ liệu. Vui lòng thử lại.
            </div>
          )}

          {/* F0 Table */}
          <BaoCaoDoanhSoTable
            channels={channels}
            isLoading={isLoading}
            fromDate={appliedFrom}
            toDate={appliedTo}
          />

          <div className="text-center text-xs text-gray-400 mt-4">
            Báo cáo tự động · Cập nhật: {new Date().toLocaleString("vi-VN")}
          </div>
        </div>
      </main>
    </div>
  );
}

export default BaoCaoDoanhSo;
