#!/usr/bin/env bash
# Xóa đơn hàng test khỏi các database LOCAL (crm_tdvn, fm_tdvn, bizcrm2).
#
# Chỉ xóa đơn có số điện thoại nằm trong danh sách SĐT test bên dưới, nên
# không đụng tới đơn thật. Nếu bạn lỡ test bằng SĐT của khách thật thì script
# này KHÔNG xử lý được — phải xóa thủ công và trừ lại GMV cho khách đó.
#
# Dùng:  bash scripts/xoa-don-test-local.sh
set -euo pipefail

TEST_PHONES="'0900000001','0900000002','84900000001'"

echo "=== Đơn test sắp xóa ==="
psql -d crm_tdvn -tAc \
  "SELECT ma_hd || '  ' || tong_tien || 'đ  ' || COALESCE(sdt,'')
   FROM hoa_don WHERE sdt IN ($TEST_PHONES) ORDER BY thoi_gian"

COUNT=$(psql -d crm_tdvn -tAc "SELECT count(*) FROM hoa_don WHERE sdt IN ($TEST_PHONES)")
if [ "$COUNT" = "0" ]; then
  echo "(không có đơn test nào — không cần dọn)"
  exit 0
fi

read -r -p "Xóa $COUNT đơn test này? [y/N] " ok
[ "$ok" = "y" ] || { echo "Đã hủy."; exit 0; }

# Lấy danh sách mã đơn để xóa bên FM
CODES=$(psql -d crm_tdvn -tAc \
  "SELECT string_agg(quote_literal(ma_hd), ',') FROM hoa_don WHERE sdt IN ($TEST_PHONES)")

if [ -n "$CODES" ]; then
  psql -d fm_tdvn  -q -c "DELETE FROM invoice_detail       WHERE code_invoice IN ($CODES);"
  psql -d fm_tdvn  -q -c "DELETE FROM delivery_information WHERE code_invoice IN ($CODES);"
  psql -d fm_tdvn  -q -c "DELETE FROM invoice              WHERE code_invoice IN ($CODES);"
  psql -d crm_tdvn -q -c "DELETE FROM chatmql_order_request WHERE ma_hd IN ($CODES);"
fi

# Thẻ đơn hàng trong khung chat ChatMQL. Thẻ luôn in số điện thoại người nhận
# theo dạng "(0900000001)", nên lọc theo SĐT test là đủ và không đụng đơn thật.
for PH in $(echo "$TEST_PHONES" | tr -d "'" | tr ',' ' '); do
  psql -d bizcrm2 -q -c \
    "DELETE FROM messages
     WHERE content LIKE '%ĐƠN HÀNG MỚI%' AND content LIKE '%($PH)%';"
done

psql -d crm_tdvn -q -c "DELETE FROM hoa_don WHERE sdt IN ($TEST_PHONES);"

echo "✓ Đã xóa. Kiểm tra lại:"
printf "  crm_tdvn.hoa_don còn : %s\n" "$(psql -d crm_tdvn -tAc "SELECT count(*) FROM hoa_don WHERE sdt IN ($TEST_PHONES)")"
printf "  fm_tdvn.invoice còn  : %s\n" "$(psql -d fm_tdvn  -tAc "SELECT count(*) FROM invoice WHERE phone_number IN ($TEST_PHONES)")"
