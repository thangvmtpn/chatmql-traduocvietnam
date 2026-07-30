export const ALL_STATUSES = [
  "Đã giao hàng",
  "Giao thành công",
  "Đang xử lý",
  "Chờ xử lý",
  "Đang lấy hàng",
  "Chờ lấy lại",
  "Đã lấy hàng",
  "Đang giao hàng",
  "Chờ giao lại",
  "Chờ chuyển hoàn",
  "Đang chuyển hoàn",
  "Chờ chuyển hoàn lại",
  "Đã chuyển hoàn",
  "Đã hủy",
  "Hủy đơn",
];

export const getStatusColor = (status: string) => {
  switch (status) {
    case "Đã giao hàng":
    case "Giao thành công":
      return "#22c55e"; // green
    case "Đang xử lý":
    case "Chờ xử lý":
      return "#6b7280"; // orange (but used #6b7280 which is gray, we'll keep the same value)
    case "Đang lấy hàng":
    case "Chờ lấy lại":
    case "Đã lấy hàng":
      return "#06b6d4"; // cyan
    case "Đang giao hàng":
      return "#3b82f6"; // blue
    case "Chờ giao lại":
      return "#818cf8"; // indigo
    case "Chờ chuyển hoàn":
    case "Đang chuyển hoàn":
    case "Chờ chuyển hoàn lại":
      return "#fbbf24"; // yellow
    case "Đã chuyển hoàn":
      return "#a3a3a3"; // gray
    case "Đã hủy":
    case "Hủy đơn":
      return "#ef4444"; // red
    default:
      return "#6b7280"; // neutral gray
  }
};
