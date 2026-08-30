# CRM TDVN — Bản Mobile App

Giao diện mẫu (prototype) phiên bản điện thoại của CRM Trà Dược Việt Nam, tách từ bản desktop `../chat-mql.html`.

## File
- **chat-mql-mobile.html** — toàn bộ app mobile trong 1 file **tự chứa** (HTML + CSS + JS nhúng sẵn).
  Không phụ thuộc ảnh/JS/CSS cục bộ nào; chỉ tải Google Fonts (Inter) qua internet.

## Cách mở
- Mở qua dev server để hiển thị đúng font:
  ```bash
  python3 ../serve.py        # rồi vào http://localhost:5273/CRM-Mobile/chat-mql-mobile.html
  ```
- Xem đúng khung điện thoại: bật chế độ mobile của trình duyệt (DevTools → Toggle device, ví dụ 375×812) hoặc mở trực tiếp trên điện thoại. Trên desktop, app tự giới hạn khung tối đa 480px ở giữa màn hình.

## Các màn đã dựng
Điều hướng chính bằng **bottom tab bar kiểu Zalo**: Hội thoại · Khách hàng · Tổng quan · Cá nhân.

1. **Hội thoại** — danh sách hội thoại + chip lọc; chạm để vào màn chat chi tiết.
2. **Chat chi tiết** — tin nhắn, thiệp sinh nhật, hàng nút nhanh (Tạo đơn / AI Gợi ý / Tin nhanh / Tài liệu / Thông tin / Ghi chú), nút Thư viện, menu ⋯ (Chế độ AI trả lời: Thủ công/Gợi ý/Tự động + Xóa hội thoại).
3. **Hồ sơ khách** (4 tab): Thông tin (CRM + AI phân tích), Ghi chú nhanh, Tạo đơn (đủ logic theo `../CRM/tao-don.html`), Tài liệu bán hàng (Hình ảnh/Content/Video, tìm theo tên-mã, gửi vào chat, copy).
4. **Kho lưu trữ** — Ảnh/Video · Files · Links.
5. **Lịch sử mua hàng**.
6. **Tổng quan** — dashboard: KPI, biểu đồ tin nhắn theo ngày, pipeline, nguồn khách hàng (donut), hoạt động gần đây.
7. **Khách hàng** — màn CRM Liên hệ: segment, bộ lọc, thẻ liên hệ (giai đoạn/nguồn/sale/điểm), bottom-sheet Thêm KH.
8. **Cá nhân** — Hồ sơ của tôi (form thông tin tài khoản).

> Đây là bản mẫu giao diện, **chưa nối API** — các thao tác lưu/gửi/xóa chỉ hiển thị thông báo mẫu.
