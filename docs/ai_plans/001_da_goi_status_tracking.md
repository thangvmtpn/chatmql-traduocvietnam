# Tính năng: Theo dõi Trạng thái "Đã Gọi" Khách hàng

## Vấn đề
Sales và CSKH cần biết được trong ngày hôm nay họ đã bấm số gọi cho những khách hàng nào trong list Lịch hẹn bán hàng hoặc Lịch phản hồi để tránh gọi trùng.

## Giải pháp triển khai
1. **Database:** Bổ sung trường `da_goi` kiểu boolean, giá trị mặc định là `false` vào bảng `khach_hang`.
2. **Backend API:**
   - Cung cấp Endpoint `PUT /api/customers/{id_kh}/da-goi` để FE thay đổi.
   - **Quy tắc Reset (Quan trọng):** Khi nhân viên thao tác "Cập nhật" thời gian của Lịch Bán hàng (`ngay_hen_banhang`) hoặc Lịch phản hồi (`thoi_gian_cs_lai`), backend sẽ tự động bắt lấy event này và đưa `da_goi = false`, nhằm buộc nhân viên phải gọi lại vào lần hẹn tiếp theo.
3. **Frontend:**
   - Tại `CustomerTable.tsx`, binding trạng thái Checkbox của cột "Đã gọi" trực tiếp bằng field `khach_hang.da_goi` trả về từ Backend (thay vì các Local State).
   - Dùng Hook `useUpdateCustomerDaGoi` (react-query mutation) để gửi event toggle, Invalidate lại cache ngay khi API trả về 200 OK.
