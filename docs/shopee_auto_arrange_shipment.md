# Tài liệu Tính năng: Tự động "Chuẩn bị hàng" (Auto Arrange Shipment) cho đơn Shopee

## 1. Mục đích của tính năng
Tính năng này được xây dựng để giải quyết triệt để lỗi `logistics.shipping_document_should_print_first` thường gặp khi in đơn hàng Shopee thông qua API. 

Lỗi này phát sinh khi người dùng cố gắng tải phiếu in PDF cho một đơn hàng **chưa được "Chuẩn bị hàng"** (Arrange Shipment) trên hệ thống Shopee. Thay vì báo lỗi và bắt người dùng phải quay lại trang Seller Center của Shopee để thao tác thủ công, tính năng này tự động phát hiện lỗi và thay mặt người dùng gửi yêu cầu chuẩn bị hàng bằng phương thức **Pickup** (lấy hàng tận nơi) ngay trong tiến trình in.

## 2. Luồng hoạt động (Workflow)

1. **Yêu cầu tạo phiếu in:** Khi người dùng nhấn nút "In phiếu Shopee" trên hệ thống CRM, frontend gửi danh sách mã đơn hàng (`order_sn_list`) xuống backend (API `/api/invoice/shopee/print`).
2. **Gọi API `create_shipping_document`:** Backend chuyển tiếp yêu cầu đến Shopee để tạo task sinh phiếu in.
3. **Bắt lỗi "Chưa chuẩn bị hàng":** Nếu Shopee trả về lỗi `logistics.order_not_ready` (hoặc mã lỗi tương tự báo rằng đơn chưa sẵn sàng) thay vì báo thành công hoặc "phiếu đã tồn tại", hệ thống sẽ kích hoạt tính năng tự động chuẩn bị hàng.
4. **Lấy thông số giao hàng (`get_shipping_parameter`):** Hệ thống gọi API lấy thông số giao hàng để biết kho hàng mặc định, các phương thức được hỗ trợ (Pickup/Dropoff) và các yêu cầu bắt buộc (ví dụ: `pickup_time_id`).
5. **Gửi yêu cầu Chuẩn bị hàng (`ship_order`):** 
    - Hệ thống ưu tiên trích xuất `address_id` đầu tiên trong danh sách kho lấy hàng và tiến hành gọi API `ship_order` bằng phương thức **Pickup**.
    - Nếu đơn vị vận chuyển không hỗ trợ Pickup, hệ thống sẽ tự động fallback (chuyển hướng) sang gửi phương thức **Dropoff** (gửi tại bưu cục).
6. **Thử lại quá trình in:** Sau khi chuẩn bị hàng thành công, hệ thống đợi 2 giây để Shopee cập nhật trạng thái, sau đó tự động **gọi lại `create_shipping_document`**.
7. **Tải PDF:** Cuối cùng, hệ thống gọi `download_shipping_document` để tải file PDF về cho frontend hiển thị qua iframe.

## 3. Các file mã nguồn liên quan

### `backend/utils/shopee.py`
Chứa các hàm tương tác trực tiếp với Shopee API:
- **`get_shipping_parameter(order_sn)`**: Lấy thông tin phương thức giao hàng, địa chỉ kho (`address_id`), và thời gian lấy hàng (`pickup_time_id`) nếu cần.
- **`ship_order(order_sn, pickup_data, dropoff_data)`**: Gửi lệnh xác nhận chuẩn bị hàng lên Shopee.
- **`auto_arrange_shipment(order_sn)`**: Hàm đóng gói logic tự động chọn phương thức (ưu tiên Pickup) và gọi `ship_order`.

### `backend/routes/invoice.py`
Chứa API endpoint xử lý logic in:
- **`print_shopee_waybill`**: Hàm xử lý API `POST /invoice/shopee/print`. Đã được sửa đổi để đọc thông báo lỗi từ bước `create_shipping_document` ban đầu. Nếu phát hiện đơn hàng chưa được chuẩn bị, nó sẽ duyệt qua các đơn bị lỗi, gọi `auto_arrange_shipment`, và sau đó lặp lại thao tác tạo phiếu in trước khi đi đến bước tải PDF.

## 4. Lưu ý quan trọng
- Tính năng này ưu tiên chọn địa chỉ lấy hàng (Pickup Address) đầu tiên được cấu hình trong hệ thống Shopee của tài khoản (do API `get_shipping_parameter` trả về).
- Vì có thêm bước gọi API chuẩn bị hàng và khoảng trễ 2 giây (delay), khi người dùng in một lô đơn hàng mà trong đó có đơn chưa được chuẩn bị, thời gian API phản hồi sẽ lâu hơn bình thường vài giây.
- Nếu việc tự động chuẩn bị hàng vẫn thất bại (do lỗi từ phía Shopee hoặc thiết lập kho hàng bị sai), hệ thống sẽ trả về chính xác lỗi gốc (kèm mã lỗi như `logistics.order_not_ready`) để người dùng dễ dàng xử lý.
