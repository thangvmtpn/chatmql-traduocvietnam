# Tính năng: Cố định và Chính xác hoá Tỷ lệ chuyển đổi Sales (Conversion Rate)

## Vấn đề 
Khi nhân viên thao tác dời lại lịch bán hàng sang một ngày khác, giá trị `ngay_hen_banhang` của khách hàng đó bị cập nhật lại. Điều này dẫn đến sự cố: Khách hàng biến mất khỏi "Danh sách tập mục tiêu đã được giao lúc đầu ngày" ở Dashboard Báo Cáo. Hệ quả là làm "phình to" tỷ lệ chốt ngụy tạo do Mẫu số giảm xuống (Số khách bị giảm, trong khi số đơn chốt được vẫn thế).

## Giải pháp triển khai
Hệ thống sử dụng cơ chế **Ghi log lịch sử dời lịch (Schedule History Logging)** kết hợp **Truy vấn Mẫu số gốc (UNION Aggregation)** để lấy lại tập mục tiêu nguyên bản.

1. **Database:** 
   - Khởi tạo bảng `khach_hang_schedule_log` làm trung tâm lưu vết. (Cột: `id_kh`, `old_ngay_hen_banhang`, `new_ngay_hen_banhang`, `updated_at`).

2. **Backend Engine (Trình lưu tự động):**
   - Tại mọi API Endpoint có đụng chạm đến cập nhật `ngay_hen_banhang` (như `update_ngay_hen_banhang` hay `/customers/.../next-sales-time`), backend đọc giá trị cũ.
   - Nếu `old_date` và `new_date` chênh lệch, gọi SQL `INSERT` vào `khach_hang_schedule_log` đi kèm User ID thao tác để truy xuất về sau.

3. **Backend SQL Engine (Trình trích xuất Data Mẫu số):**
   - Thay vì truy vấn thô (chỉ lôi những người ĐANG có lịch cho ngày nay), API thống kê (ví dụ: `/sales-schedule-overview/ket-qua-ban-hang/nhan-vien`) sẽ sử dụng phép `UNION`:
     - **Tập Bắt Đầu:** `SELECT ... FROM khach_hang WHERE ngay_hen_banhang = [Hôm Nay]` (Dữ liệu hiện tại)
     - **Tập Thất Sinh (Lội Ngược Giới Hạn):** `SELECT ... FROM khach_hang_schedule_log WHERE old_ngay_hen_banhang = [Hôm Nay] AND updated_at >= [Từ Hôm Nay]` (Lôi cổ lại những người lẽ ra có lịch hẹn hôm nay nhưng họ đã bị chuyển đi nơi khác sau khi hôm nay khởi đầu).
   => **Kết quả:** Con số khách hàng mục tiêu gốc được bảo tồn nguyên vẹn 100%, tỷ lệ chốt được tính toán trung thực.
