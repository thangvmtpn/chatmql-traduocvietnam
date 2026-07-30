import {
  CSKHOverviewStats,
  ScheduleType,
} from "@/services/cskhScheduleService";

type Props = {
  stats?: CSKHOverviewStats;
  onViewDetail: (type: ScheduleType) => void;
  onViewSalesResult: () => void;
  salesResultActive?: boolean;
};

export default function OverviewStats({
  stats,
  onViewDetail,
  onViewSalesResult,
  salesResultActive,
}: Props) {
  const fmt = (n?: number) => (n ?? 0).toLocaleString("vi-VN");

  return (
    <div className="schedule-overview-table">
      <table>
        <thead>
          <tr>
            <th className="overview-col-total" colSpan={2}>KHÁCH HÀNG PHỤ TRÁCH</th>
            <th className="overview-col-config" colSpan={4}>
              THÔNG TIN CẤU HÌNH LỊCH BÁN HÀNG
            </th>
            <th className="overview-col-ket-qua" rowSpan={2}>
              KẾT QUẢ BÁN HÀNG
              <br />
              THEO LỊCH BÁN HÀNG
            </th>
          </tr>
          <tr className="overview-sub-header">
            <th>Tổng</th>
            <th>Khách trong kỳ</th>
            <th>Chốt</th>
            <th>Phản hồi</th>
            <th>Chưa cấu hình</th>
            <th>Đã cấu hình</th>
          </tr>
        </thead>
        <tbody>
          <tr className="overview-count-row">
            <td className="overview-count total">{fmt(stats?.total)}</td>
            <td className="overview-count don-trong-ky" style={{ color: "#0f766e" }}>
              {fmt(stats?.don_trong_ky)}
            </td>
            <td className="overview-count ban-hang">
              {fmt(stats?.lich_ban_hang)}
            </td>
            <td className="overview-count cham-soc">
              {fmt(stats?.lich_cham_soc)}
            </td>
            <td className="overview-count chua-cau-hinh">
              {fmt(stats?.chua_cau_hinh)}
            </td>
            <td className="overview-count da-cau-hinh">
              {fmt(stats?.da_cau_hinh)}
            </td>
            <td className="overview-count ket-qua">Kết quả</td>
          </tr>
          <tr className="overview-action-row">
            <td>
              <button
                className="invoice-view-btn btn-total mx-auto"
                onClick={() => onViewDetail("all")}
              >
                <span className="material-symbols-outlined">visibility</span>
                Chi tiết
              </button>
            </td>
            <td>
              <button
                className="invoice-view-btn btn-don-trong-ky mx-auto"
                onClick={() => onViewDetail("don_trong_ky")}
                style={{ color: "#0f766e", borderColor: "#0f766e" }}
              >
                <span className="material-symbols-outlined">visibility</span>
                Chi tiết
              </button>
            </td>
            <td>
              <button
                className="invoice-view-btn btn-ban-hang mx-auto"
                onClick={() => onViewDetail("ban_hang")}
              >
                <span className="material-symbols-outlined">visibility</span>
                Chi tiết
              </button>
            </td>
            <td>
              <button
                className="invoice-view-btn btn-cham-soc mx-auto"
                onClick={() => onViewDetail("cham_soc")}
              >
                <span className="material-symbols-outlined">visibility</span>
                Chi tiết
              </button>
            </td>
            <td>
              <button
                className="invoice-view-btn btn-chua mx-auto"
                onClick={() => onViewDetail("chua_cau_hinh")}
              >
                <span className="material-symbols-outlined">visibility</span>
                Chi tiết
              </button>
            </td>
            <td>
              <button
                className="invoice-view-btn btn-da-cau-hinh mx-auto"
                onClick={() => onViewDetail("da_cau_hinh")}
              >
                <span className="material-symbols-outlined">visibility</span>
                Chi tiết
              </button>
            </td>
            <td>
              <button
                className={`invoice-view-btn btn-ket-qua mx-auto${salesResultActive ? " active" : ""}`}
                onClick={onViewSalesResult}
              >
                <span className="material-symbols-outlined">visibility</span>
                {salesResultActive ? "Thu gọn" : "Chi tiết"}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
