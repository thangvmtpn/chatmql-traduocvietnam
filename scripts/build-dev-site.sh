#!/usr/bin/env bash
#
# build-dev-site.sh — dựng bản frontend cho site dev.
#
# VÌ SAO CẦN SCRIPT NÀY
# ChatMQL chỉ còn bản build, không có mã nguồn React, nên không thể build lại
# với biến môi trường. Địa chỉ backend bị nhúng cứng thành chuỗi
# "http://localhost:4520" ở 13 chỗ trong 7 file. Deploy nguyên si lên tên miền
# dev thì trình duyệt của nhân viên sẽ gọi về localhost máy họ — trắng màn hình.
#
# Script thay chuỗi đó bằng địa chỉ API thật. Chỉ thay CHUỖI, không đổi cấu
# trúc mã, nên không có rủi ro hỏng cú pháp.
#
# DÙNG:
#   ./scripts/build-dev-site.sh https://api-chatmql-dev.traduocvietnam.com
#
set -euo pipefail

API_ORIGIN="${1:-}"
if [ -z "$API_ORIGIN" ]; then
  echo "Thiếu địa chỉ API. Ví dụ:"
  echo "  $0 https://api-chatmql-dev.traduocvietnam.com"
  exit 1
fi
API_ORIGIN="${API_ORIGIN%/}"   # bỏ dấu / cuối

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/bizcrm_frontend_dist"
OUT="$ROOT/dist-dev"

echo "▸ Nguồn      : $SRC"
echo "▸ Đích       : $OUT"
echo "▸ API backend: $API_ORIGIN"
echo

rm -rf "$OUT"
cp -R "$SRC" "$OUT"

# 1) Địa chỉ backend nhúng cứng trong bundle React
N=0
while IFS= read -r f; do
  c=$(grep -o "http://localhost:4520" "$f" 2>/dev/null | wc -l | tr -d ' ' || true)
  [ "$c" = "0" ] && continue
  # LC_ALL=C: bundle có ký tự nhiều byte, sed sẽ báo lỗi nếu không đặt
  LC_ALL=C sed -i '' "s|http://localhost:4520|$API_ORIGIN|g" "$f"
  N=$((N + c))
  printf "  ✓ %-34s %s chỗ\n" "$(basename "$f")" "$c"
done < <(find "$OUT" \( -name "*.js" -o -name "*.html" \))

# 2) Script chọn API base trong index.html và order-ui-bridge.js.
#    Hai file này tự dò hostname: localhost thì gọi localhost, còn lại gọi
#    tracrm-api.bizino.ai (API của bản live cũ). Trên site dev phải trỏ về API
#    dev, nếu không dữ liệu dev sẽ ghi thẳng vào hệ thống thật.
for f in "$OUT/index.html" "$OUT/order-ui-bridge.js"; do
  [ -f "$f" ] || continue
  c=$(grep -o "https://tracrm-api.bizino.ai" "$f" 2>/dev/null | wc -l | tr -d ' ' || true)
  [ "$c" = "0" ] && continue
  LC_ALL=C sed -i '' "s|https://tracrm-api.bizino.ai|$API_ORIGIN|g" "$f"
  N=$((N + c))
  printf "  ✓ %-34s %s chỗ (API bản live cũ)\n" "$(basename "$f")" "$c"
done

echo
echo "▸ Đã thay $N chỗ."

# 3) Kiểm tra lại: không được sót localhost hay API cũ
LEFT_LOCAL=$(grep -rl "localhost:4520" "$OUT" 2>/dev/null | wc -l | tr -d ' ' || true)
LEFT_OLD=$(grep -rl "tracrm-api.bizino.ai" "$OUT" 2>/dev/null | wc -l | tr -d ' ' || true)
echo "▸ Còn sót localhost:4520      : $LEFT_LOCAL file"
echo "▸ Còn sót tracrm-api.bizino.ai: $LEFT_OLD file"

# 4) Cú pháp JS phải còn hợp lệ sau khi thay
if command -v node >/dev/null; then
  BAD=0
  for f in "$OUT"/order-ui-bridge.js; do
    node --check "$f" >/dev/null 2>&1 || { echo "  ✗ LỖI CÚ PHÁP: $f"; BAD=1; }
  done
  [ "$BAD" = "0" ] && echo "▸ Cú pháp JS: hợp lệ"
fi

if [ "$LEFT_LOCAL" != "0" ] || [ "$LEFT_OLD" != "0" ]; then
  echo
  echo "✗ CHƯA SẠCH — đừng deploy. Còn địa chỉ cũ trong bản build."
  exit 1
fi

echo
echo "✓ Xong. Thư mục sẵn sàng deploy: $OUT"
