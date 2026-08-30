# 🎬 Hướng dẫn xem demo — ChatMQL Mobile & Desktop

## Xem trên ĐIỆN THOẠI (cùng Wi-Fi với máy Mac)

Mở trình duyệt điện thoại, vào:

**http://10.16.10.77:5182/m/**

> Địa chỉ IP đổi theo mạng Wi-Fi. Nếu không vào được, chạy trên Mac:
> `ipconfig getifaddr en0` để lấy IP mới, rồi thay vào địa chỉ trên.

Đăng nhập tài khoản test (an toàn — chỉ thấy hội thoại test, không đụng khách thật):

- Email: `test.mobile@traduoc.ai`
- Mật khẩu: `Mbf06f5f0b`

> Nếu không vào được: kiểm tra điện thoại và Mac cùng một Wi-Fi, và tường lửa
> macOS cho phép Node nhận kết nối (System Settings → Network → Firewall).

## Xem trên MÁY TÍNH

| Bản | Địa chỉ |
|---|---|
| Mobile (khung điện thoại: F12 → Toggle device) | http://localhost:5182/m/ |
| ChatMQL desktop (giao diện mới 4 tab) | http://localhost:3000 |
| CRM | http://localhost:5175 |
| FM | http://localhost:3004 |

⚠️ **Bản desktop chỉ xem bằng `localhost` trên chính máy Mac.** Mở nó qua IP
LAN từ máy khác thì trình duyệt sẽ gọi thẳng API của bản LIVE
(tracrm-api.bizino.ai) — đó là cách bản build cũ chọn máy chủ. Bản mobile
không dính điều này.

## Kịch bản demo gợi ý (10 phút)

1. **Đăng nhập** → danh sách hội thoại thật, chip lọc Chưa đọc/Chưa trả lời
2. **Mở hội thoại "Khách test web"** → tin nhắn thật, ảnh sản phẩm, nhãn 🤖 AI
3. **Gửi tin nhắn** → hiện ngay; mở cùng hội thoại trên desktop (localhost:3000)
   để thấy tin đồng bộ hai đầu qua socket
4. **Chip "AI Gợi ý"** → 3 bản nháp theo giọng điệu → chạm để điền vào ô nhập
5. **Menu ⋯** → đổi chế độ AI trả lời (Thủ công/Gợi ý/Tự động)
6. **Chạm tên khách** → hồ sơ 4 tab:
   - Thông tin CRM · Ghi chú nhanh (thêm ghi chú thật)
   - **Tạo đơn**: tìm "atiso" → chọn sản phẩm → tăng số lượng → chọn tỉnh/xã
     → xem tổng tiền tự tính → Đặt hàng (đơn vào CRM + FM thật, thẻ đơn hiện
     trong chat; đơn test xoá được)
   - Tài liệu bán hàng: tick 2 ảnh → "Gửi vào chat"
7. **Nút thư viện** trên header chat → Kho lưu trữ ảnh/file/link đã trao đổi
8. **Tab Tổng quan** → dashboard đúng vai trò (nhân viên thấy số của mình)
9. **Tab Khách hàng** → danh sách + thêm KH mới bằng bottom-sheet
10. **Tab Cá nhân** → hồ sơ, đăng xuất; đăng nhập tài khoản owner sẽ thấy thêm
    "Xem dưới quyền nhân viên khác" (dải băng cam + quay lại tài khoản gốc)

## Lưu ý

- AI Gợi ý / Customer 360 / AI tự trả lời tốn credit OpenAI thật
- "Thêm vào màn hình chính" (PWA đầy đủ) chỉ chạy trên HTTPS — tức sau khi
  deploy lên `chatmql-dev.traduocvietnam.com`; bản demo LAN chạy như web thường
- Toàn bộ demo nằm trên dữ liệu local, không đụng hệ thống live
