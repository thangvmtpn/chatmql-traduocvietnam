# Hướng dẫn tính năng Deal Shock

## Tổng quan

Tính năng Deal Shock tự động kiểm tra và xử lý các sản phẩm khuyến mãi đặc biệt khi tạo đơn hàng.

## Cấu trúc Database

### Bảng `deal_soc`

```sql
- id: Serial Primary Key
- invoice_item_id: Foreign Key -> invoice_detail.id_invoice_detail
- quantity: Số lượng sản phẩm deal shock
- deal_shock_config_id: ID của cấu hình deal shock
- product_code: Mã sản phẩm
- reward_amount: Số tiền thưởng
- created_at, updated_at: Timestamp
```

## Quy trình xử lý

### 1. Cài đặt Database

Chạy script SQL để tạo bảng:

```bash
cd /Users/donguyen/DEV/Website/crm_tdvn/backend
psql -U your_username -d fm_tdvn -f create_deal_soc_table.sql
```

### 2. Khi tạo đơn hàng

Hệ thống sẽ tự động:

1. **Kiểm tra deal shock hôm nay**: Tìm trong bảng `gami_individual_posts` với:
   - `type = 'DEAL_SHOCK'`
   - `apply_date = today`
   - `start_date <= today <= end_date`

2. **Kiểm tra từng sản phẩm trong đơn**:
   - So sánh `code_product` với các sản phẩm trong `config_data`
   - Kiểm tra `quantity >= min_order_quantity`
   - Kiểm tra `deal_limit > 0`

3. **Nếu hợp lệ**:
   - Lưu thông tin vào bảng `deal_soc`
   - Giảm `deal_limit` trong `config_data` của `gami_individual_posts`
   - Tính toán `reward_amount = reward_per_deal × quantity`

### 3. Cấu trúc config_data trong gami_individual_posts

```json
{
  "products": [
    {
      "id": 3,
      "code": "FX/TP-CC03-100/KR",
      "name": "Vạn Phúc trà - Túi Kraft 100G",
      "price": 47000,
      "deal_limit": 20,
      "reward_per_deal": 20000,
      "min_order_quantity": 2
    },
    {
      "id": 8,
      "code": "FX/TP-CC04-500/KR",
      "name": "Vạn Lộc trà - Túi Kraft 500G",
      "price": 335000,
      "deal_limit": 30,
      "reward_per_deal": 30000,
      "min_order_quantity": 1
    }
  ]
}
```

## Các hàm chính

### `get_active_deal_shock_today()`

Lấy cấu hình deal shock đang active cho ngày hôm nay.

### `check_product_deal_shock(product_code, quantity, deal_shock_config)`

Kiểm tra sản phẩm có đủ điều kiện deal shock không.

**Trả về**: `(is_deal_shock: bool, deal_info: dict)`

### `insert_deal_soc(invoice_item_id, quantity, deal_shock_id, product_code, reward_amount)`

Lưu thông tin deal shock vào database.

### `update_deal_limit(deal_shock_id, product_code, quantity_sold)`

Cập nhật deal_limit sau khi bán.

### `process_deal_shock_for_invoice(invoice_details, code_invoice)`

Xử lý deal shock cho toàn bộ đơn hàng.

## Ví dụ sử dụng

### Tạo deal shock mới trong gami_individual_posts

```sql
INSERT INTO gami_individual_posts (
    type, title, frequency, apply_date, start_date, end_date,
    config_data, created_by, created_by_name, created_at, updated_at
) VALUES (
    'DEAL_SHOCK',
    'Deal sốc ngày 03/03/2026',
    'DAY',
    '2026-03-03',
    '2026-03-03',
    '2026-03-03',
    '{"products": [{"id": 3, "code": "FX/TP-CC03-100/KR", "name": "Vạn Phúc trà", "price": 47000, "deal_limit": 20, "reward_per_deal": 20000, "min_order_quantity": 2}]}',
    'admin',
    'Administrator',
    NOW(),
    NOW()
);
```

### Khi tạo đơn hàng qua API

Không cần làm gì thêm! Hệ thống tự động xử lý:

```python
POST /api/invoice/create
# Payload bình thường, hệ thống sẽ tự động kiểm tra deal shock
```

### Kiểm tra deal shock đã áp dụng

```sql
SELECT
    ds.id,
    ds.product_code,
    ds.quantity,
    ds.reward_amount,
    id.name_product,
    inv.code_invoice
FROM deal_soc ds
JOIN invoice_detail id ON ds.invoice_item_id = id.id_invoice_detail
JOIN invoice inv ON id.code_invoice = inv.code_invoice
WHERE ds.created_at >= CURRENT_DATE
ORDER BY ds.created_at DESC;
```

## Lưu ý quan trọng

1. **Xử lý không đồng bộ**: Deal shock được xử lý trong try-catch riêng, nếu lỗi sẽ không ảnh hưởng đến việc tạo đơn hàng.

2. **Deal limit**: Hệ thống tự động giảm deal_limit sau mỗi lần bán, khi deal_limit = 0 sẽ không còn áp dụng deal shock.

3. **Múi giờ**: Sử dụng timezone Asia/Ho_Chi_Minh để đảm bảo chính xác ngày.

4. **Số lượng tối thiểu**: Sản phẩm phải đạt min_order_quantity mới được tính là deal shock.

5. **Quantity tối đa**: Nếu số lượng mua > deal_limit còn lại, chỉ áp dụng cho deal_limit còn lại.

## Troubleshooting

### Không tìm thấy deal shock

- Kiểm tra apply_date, start_date, end_date
- Kiểm tra type = 'DEAL_SHOCK'

### Sản phẩm không được tính là deal shock

- Kiểm tra code_product có khớp không
- Kiểm tra quantity >= min_order_quantity
- Kiểm tra deal_limit > 0

### Lỗi khi update deal_limit

- Kiểm tra cấu trúc config_data có đúng JSON không
- Kiểm tra quyền update bảng gami_individual_posts

## Log messages

- `✅ Tìm thấy deal shock hôm nay`: Có deal shock active
- `ℹ️ Không có deal shock cho ngày`: Không có deal shock
- `✅ Sản phẩm {code} là deal shock hợp lệ`: Sản phẩm đủ điều kiện
- `⚠️ Sản phẩm {code} không đủ số lượng tối thiểu`: Không đủ min_order_quantity
- `⚠️ Sản phẩm {code} đã hết deal_limit`: Đã hết quota
- `✅ Lưu deal shock thành công`: Lưu vào bảng deal_soc thành công
- `📊 Update deal_limit cho {code}`: Cập nhật deal_limit thành công
