import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { useCSKHSchedule } from "@/hooks/useCSKHSchedule";
import {
  useUpdateCustomerNextContactTime,
  useUpdateCustomerNextSalesTime,
} from "@/hooks/useDashboard";
import useAuthStore from "@/stores/useAuthStore";
import BaseLayout from "@/layouts/BaseLayout/BaseLayout";
import CustomerTable from "./components/CustomerTable";
import UpdateModal from "./components/UpdateModal";
import { ScheduleType } from "@/services/cskhScheduleService";
import { useQueryClient } from "@tanstack/react-query";
import "./CSKHSchedule.css";
import "material-symbols";

type SearchFilters = {
  ma_kh: string;
  ten_kh: string;
  sdt: string;
};

const TYPE_LABELS: Record<string, string> = {
  ban_hang: "Lịch Bán Hàng",
  cham_soc: "Lịch Chăm Sóc",
  chua_cau_hinh: "Chưa Cấu Hình",
  all: "Tất Cả",
};

const MODAL_TYPE: Record<string, "ban_hang" | "cham_soc" | "all"> = {
  ban_hang: "ban_hang",
  cham_soc: "cham_soc",
  chua_cau_hinh: "all",
  all: "all",
};

function CSKHScheduleDetail() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const type = (searchParams.get("type") || "all") as ScheduleType;
  const fromDate = searchParams.get("from") || undefined;
  const toDate = searchParams.get("to") || undefined;

  const [page, setPage] = useState(1);
  const pageSize = 30;

  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    ma_kh: "",
    ten_kh: "",
    sdt: "",
  });
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>({
    ma_kh: "",
    ten_kh: "",
    sdt: "",
  });
  const [customerToUpdate, setCustomerToUpdate] = useState<any>(null);

  const {
    data: scheduleData,
    isLoading,
    error,
  } = useCSKHSchedule(type, page, pageSize, fromDate, toDate, appliedFilters);

  const updateContactMutation = useUpdateCustomerNextContactTime();
  const updateSalesMutation = useUpdateCustomerNextSalesTime();

  const handleApplySearch = () => {
    setAppliedFilters({ ...searchFilters });
    setPage(1);
  };

  const handleClearSearch = () => {
    const empty: SearchFilters = { ma_kh: "", ten_kh: "", sdt: "" };
    setSearchFilters(empty);
    setAppliedFilters(empty);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleApplySearch();
  };

  const handleSubmitUpdate = async (
    date: Date,
    updateType: "cham_soc" | "ban_hang",
  ) => {
    if (!customerToUpdate?.id_kh) return;
    try {
      const isoDateTime = date.toISOString();
      if (updateType === "cham_soc") {
        await updateContactMutation.mutateAsync({
          customerId: customerToUpdate.id_kh,
          thoiGianCsLai: isoDateTime,
        });
      } else {
        await updateSalesMutation.mutateAsync({
          customerId: customerToUpdate.id_kh,
          ngayHenBanhang: isoDateTime,
        });
      }
      toast.success("Cập nhật lịch thành công!", {
        position: "top-right",
        autoClose: 3000,
      });
      setCustomerToUpdate(null);
      queryClient.invalidateQueries({ queryKey: ["cskh-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["cskh-overview-stats"] });
    } catch {
      toast.error("Có lỗi khi cập nhật lịch!", {
        position: "top-right",
        autoClose: 3000,
      });
    }
  };

  const typeLabel = TYPE_LABELS[type] || "Chi Tiết";
  const dateLabel =
    fromDate === toDate
      ? `ngày ${fromDate?.split("-").reverse().join("/") ?? ""}`
      : `từ ${fromDate?.split("-").reverse().join("/")} đến ${toDate?.split("-").reverse().join("/")}`;

  if (!user) return null;

  return (
    <BaseLayout
      user={user}
      title={typeLabel}
      subtitle={`Danh sách khách hàng • ${dateLabel}`}
    >
      <div className="cskh-schedule">
        {/* Breadcrumb / back */}
        <div className="detail-page-header">
          <button
            className="back-button"
            onClick={() => navigate("/cskh-schedule")}
          >
            <span className="material-symbols-outlined">arrow_back</span>
            Quay lại
          </button>
          <h2 className="detail-page-title">
            <span className="material-symbols-outlined">calendar_month</span>
            {typeLabel} — {dateLabel}
          </h2>
        </div>

        {/* Search bar */}
        <div className="detail-search-bar">
          <input
            type="text"
            placeholder="Mã KH..."
            value={searchFilters.ma_kh}
            onChange={(e) =>
              setSearchFilters((p) => ({ ...p, ma_kh: e.target.value }))
            }
            onKeyDown={handleKeyDown}
          />
          <input
            type="text"
            placeholder="Tên khách hàng..."
            value={searchFilters.ten_kh}
            onChange={(e) =>
              setSearchFilters((p) => ({ ...p, ten_kh: e.target.value }))
            }
            onKeyDown={handleKeyDown}
          />
          <input
            type="text"
            placeholder="Số điện thoại..."
            value={searchFilters.sdt}
            onChange={(e) =>
              setSearchFilters((p) => ({ ...p, sdt: e.target.value }))
            }
            onKeyDown={handleKeyDown}
          />
          <button className="btn-search" onClick={handleApplySearch}>
            <span className="material-symbols-outlined">search</span>
            Tra cứu
          </button>
          <button className="btn-clear" onClick={handleClearSearch}>
            <span className="material-symbols-outlined">restart_alt</span>
            Xóa
          </button>
        </div>

        <div className="cskh-content">
          <CustomerTable
            data={scheduleData}
            isLoading={isLoading}
            error={error}
            page={page}
            onPageChange={setPage}
            onUpdateClick={setCustomerToUpdate}
            scheduleType={type}
          />
        </div>
      </div>

      {customerToUpdate && (
        <UpdateModal
          customer={customerToUpdate}
          onClose={() => setCustomerToUpdate(null)}
          onSubmit={handleSubmitUpdate}
          isPending={
            updateContactMutation.isPending || updateSalesMutation.isPending
          }
          scheduleType={MODAL_TYPE[type] ?? "all"}
        />
      )}
    </BaseLayout>
  );
}

export default CSKHScheduleDetail;
