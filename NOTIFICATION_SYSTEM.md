# Hệ thống Thông báo Realtime - Nhắc nhở chăm sóc khách hàng

## Tổng quan

Hệ thống tự động kiểm tra và gửi thông báo realtime cho nhân viên khi đến thời gian cần chăm sóc khách hàng (dựa trên cột `thoi_gian_cs_lai` trong bảng `khach_hang`).

## Cấu trúc

### Backend

1. **check_contact_time.py**
   - Script kiểm tra định kỳ các khách hàng cần được chăm sóc
   - Chạy mỗi 5 phút (có thể điều chỉnh)
   - Gửi thông báo qua Socket.IO khi đến thời gian

2. **main.py**
   - Tích hợp background task chạy `check_contact_time.py`
   - Tự động khởi động khi server start

3. **Socket.IO namespace: `/thong_bao`**
   - Event: `new_thong_bao`
   - Room: `id_acc` của nhân viên

### Frontend

1. **hooks/useNotifications.ts**
   - `useNotifications()`: Lấy danh sách thông báo từ API
   - `useRealtimeNotifications()`: Lắng nghe thông báo realtime qua socket

2. **components/RightSidebar/RightSidebar.tsx**
   - Hiển thị thông báo trong box "THÔNG BÁO QUAN TRỌNG"
   - Tự động cập nhật khi có thông báo mới
   - Click vào thông báo để đánh dấu đã đọc

3. **services/socketService.ts**
   - Quản lý kết nối Socket.IO
   - `connectNotification()`: Kết nối namespace `/thong_bao`
   - `onNotification()`: Lắng nghe events thông báo

4. **stores/useNotificationStore.ts**
   - Quản lý state thông báo (Zustand)
   - Đếm số thông báo chưa đọc
   - Đánh dấu đã đọc/xóa thông báo

## Cách hoạt động

1. **Cập nhật thời gian chăm sóc**
   - Nhân viên cập nhật `thoi_gian_cs_lai` cho khách hàng qua giao diện
   - Dữ liệu lưu vào database (bảng `khach_hang`)

2. **Kiểm tra tự động**
   - Script `check_contact_time.py` chạy mỗi 5 phút
   - Query database tìm khách hàng có `thoi_gian_cs_lai` trong vòng 1 giờ tới
   - Kiểm tra xem đã gửi thông báo chưa (tránh spam)

3. **Gửi thông báo**
   - Tạo bản ghi trong bảng `thong_bao`
   - Gửi event `new_thong_bao` qua Socket.IO đến room `id_acc` của nhân viên

4. **Hiển thị realtime**
   - Frontend lắng nghe event `new_thong_bao`
   - Thêm thông báo vào store
   - Hiển thị ngay lập tức trong RightSidebar
   - Đếm số thông báo chưa đọc

## Database Schema

### Bảng `khach_hang`

```sql
thoi_gian_cs_lai TIMESTAMP -- Thời gian cần chăm sóc lại
id_acc_pt INTEGER -- ID nhân viên phụ trách
```

### Bảng `thong_bao`

```sql
id_tb SERIAL PRIMARY KEY
id_acc INTEGER -- ID nhân viên nhận thông báo
ngay_thong_bao TIMESTAMP
noi_dung TEXT
tieu_de TEXT
id_kh INTEGER[] -- Array các ID khách hàng liên quan
```

## Cài đặt và Chạy

### Backend

1. Cài đặt dependencies (nếu chưa có):

```bash
pip install socketio
```

2. Server sẽ tự động chạy background task khi start:

```bash
cd backend
uvicorn main:app --reload
```

3. Hoặc chạy riêng script kiểm tra:

```bash
python check_contact_time.py
```

### Frontend

1. Không cần cài đặt thêm (đã có socket.io-client)

2. Component tự động kết nối socket khi render

## Cấu hình

### Thay đổi tần suất kiểm tra

Trong `main.py`:

```python
task = asyncio.create_task(run_periodic_check(interval_minutes=10))  # 10 phút
```

### Thay đổi thời gian cảnh báo trước

Trong `check_contact_time.py`:

```python
one_hour_later = now + timedelta(hours=2)  # Cảnh báo trước 2 giờ
```

## Testing

1. **Thêm dữ liệu test:**

```sql
UPDATE khach_hang
SET thoi_gian_cs_lai = NOW() + INTERVAL '30 minutes'
WHERE id_kh = 1;
```

2. **Kiểm tra log backend:**

```
✅ Đã gửi thông báo cho nhân viên Nguyen Van A (ID: 5) về khách hàng Tran Thi B
```

3. **Kiểm tra frontend:**

- Mở Developer Console
- Xem log: `📢 Nhận thông báo mới: {...}`
- Kiểm tra RightSidebar có hiển thị thông báo

## Troubleshooting

### Không nhận được thông báo

1. Kiểm tra socket connection:

```javascript
console.log(socketService.isNotificationConnected());
```

2. Kiểm tra backend log có emit event không

3. Kiểm tra `id_acc` trong token khớp với database

### Thông báo bị trùng

- Script đã có logic kiểm tra tránh gửi lại trong cùng ngày
- Nếu vẫn bị, kiểm tra query trong `check_contact_time.py`

### Performance

- Script chỉ query khách hàng cần chăm sóc trong 1 giờ tới
- Có index trên cột `thoi_gian_cs_lai` sẽ tối ưu hơn:

```sql
CREATE INDEX idx_khach_hang_thoi_gian_cs_lai
ON khach_hang(thoi_gian_cs_lai)
WHERE thoi_gian_cs_lai IS NOT NULL;
```

## Tương lai

- [ ] Cho phép nhân viên tùy chỉnh thời gian cảnh báo trước
- [ ] Push notification qua browser (Web Push API)
- [ ] Gửi email/SMS nhắc nhở
- [ ] Dashboard thống kê hiệu quả chăm sóc
