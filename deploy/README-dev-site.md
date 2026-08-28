# Triển khai site dev — chatmql-dev.traduocvietnam.com

Mục đích: dựng bản chạy thử đầy đủ tính năng để kiểm tra trước khi golive.

## Nguyên tắc bắt buộc

Site dev phải **tách hoàn toàn** khỏi hệ thống thật:

| Thành phần | Bắt buộc |
|---|---|
| Cơ sở dữ liệu | 3 CSDL riêng: `bizcrm2_dev`, `crm_tdvn_dev`, `fm_tdvn_dev` |
| Khóa JWT | sinh mới, không dùng lại khóa bản thật |
| Khóa cầu nối CRM | sinh mới |
| Khóa AI | project key riêng để tách hạn mức chi tiêu |
| Tài khoản Zalo | **không kết nối tài khoản Zalo thật** — mỗi lần test AI tự trả lời là tin nhắn bay thẳng tới khách hàng thật |
| Báo cáo Lark | `DISABLE_LARK_REPORT=1` trong `.env` của CRM backend |

Dùng chung CSDL với bản thật thì mỗi lần test lên đơn, tích điểm, gửi tin đều
ghi vào dữ liệu khách hàng thật — đã từng xảy ra một lần trong quá trình làm
(đơn test lọt vào hồ sơ khách thật, phải xoá tay và trừ lại doanh số).

## Kiến trúc

```
chatmql-dev.traduocvietnam.com          → frontend tĩnh (thư mục dist-dev)
api-chatmql-dev.traduocvietnam.com      → ChatMQL backend (Node 20, cổng 4520)
api-crm-dev.traduocvietnam.com          → CRM backend (Python, cổng 8000)
   (FM backend cổng 8010 — chỉ CRM gọi, không cần mở ra ngoài)
```

Trình duyệt **không bao giờ** gọi thẳng CRM. Mọi thứ liên quan tới đơn hàng đi
qua ChatMQL backend — nơi giữ khóa dịch vụ và kiểm tra quyền nhân viên.

## Các bước

### 1. DNS

Tạo 3 bản ghi trỏ về máy chủ dev:

```
chatmql-dev.traduocvietnam.com       A/CNAME → máy chủ dev
api-chatmql-dev.traduocvietnam.com   A       → máy chủ dev
api-crm-dev.traduocvietnam.com       A       → máy chủ dev
```

Hiện `chatmql-dev.traduocvietnam.com` **chưa có bản ghi DNS nào**.

### 2. Cơ sở dữ liệu

```bash
createdb bizcrm2_dev && createdb crm_tdvn_dev && createdb fm_tdvn_dev
```

Nạp dữ liệu mẫu (nếu muốn giống thật để test), rồi chạy migration CRM **theo
đúng thứ tự**:

```bash
cd crm_tdvn/backend/migrations
for f in $(ls *.sql | sort); do psql "$CRM_DEV_URL" -f "$f"; done
```

Ba migration mới của đợt này: `2026_08_20_chatmql_order_request.sql`,
`2026_08_21_dot3_order_fields.sql`, `2026_08_21_dot5_khuyen_mai.sql`.

Với ChatMQL, schema Prisma có thêm cột mới. **TUYỆT ĐỐI KHÔNG chạy
`prisma db push --accept-data-loss`** — lệnh đó sẽ xoá các cột vector
(`embedding` của 7 ai_scenarios và 28 products) vì chúng không được khai báo
trong schema. Dùng `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` rồi
`prisma generate`.

### 3. Backend

```bash
cp deploy/dev.env.example bizcrm_backend_source/.env   # rồi điền giá trị thật
cd bizcrm_backend_source && npm ci && npx prisma generate && npm run build
```

Sinh khóa: `openssl rand -hex 32` (mỗi khóa một lần chạy riêng).

`CRM_ORDER_API_KEY` (ChatMQL) phải **trùng** `CHATMQL_SECRET_KEY` (CRM).

### 4. Frontend

```bash
./scripts/build-dev-site.sh https://api-chatmql-dev.traduocvietnam.com
```

Script thay 22 chỗ nhúng cứng địa chỉ backend trong bản build, rồi tự kiểm tra
không còn sót `localhost:4520` hay `tracrm-api.bizino.ai`. Kết quả ở `dist-dev/`.

Cần script này vì ChatMQL chỉ còn bản build, không có mã nguồn React nên không
build lại bằng biến môi trường được.

### 5. Kiểm tra sau khi deploy

```bash
# CORS phải chỉ cho phép domain dev
curl -I -H "Origin: https://chatmql-dev.traduocvietnam.com" \
  https://api-chatmql-dev.traduocvietnam.com/api/v1/conversations

# Bridge CRM phải trả 401 khi không có khóa dịch vụ
curl -o /dev/null -w "%{http_code}\n" \
  https://api-crm-dev.traduocvietnam.com/api/external/chatmql/stats/sales
```

Rồi mở site và kiểm tay: đăng nhập → mở hội thoại → 4 tab cột phải → lên một
đơn thử → xem đơn về CRM và FM → Chat thử AI xin ảnh sản phẩm.

## Đã biết trước, không phải lỗi mới

- **17/27 ảnh sản phẩm đã mất** trên máy chủ live, cần upload lại. Danh sách 15
  sản phẩm thiếu ảnh đã có. AI được lập trình để nói thật là chưa có ảnh thay
  vì hứa suông.
- **Gửi ảnh qua Zalo OA chưa hỗ trợ** — API OA cần bước upload attachment lấy
  `attachment_id`, bước đó chưa có trong mã nguồn. Zalo cá nhân chạy bình thường.
- **Mật khẩu lưu dạng chữ thường** trong CSDL CRM và FM. Không phát sinh từ đợt
  này nhưng nên xử lý trước khi golive.
