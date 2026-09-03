#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
# dong-bo-lich-su-zalo.sh — Kéo lịch sử chat Zalo của nhân viên về ChatMQL
#
# Vì sao cần: hệ thống chỉ lưu tin từ lúc tài khoản Zalo được kết nối trở đi.
# Hội thoại cũ chỉ có vài tin lẻ, và tài khoản nào rớt kết nối thì ngừng hẳn.
# Script này gọi API backfill có sẵn cho TỪNG tài khoản, lần lượt, có nghỉ giữa
# các tài khoản để Zalo không coi là spam.
#
# AN TOÀN: tin kéo về được đánh dấu "backfill" nên KHÔNG kích hoạt AI trả lời,
# không chạy automation, không gửi gì ra ngoài cho khách. Chỉ ghi vào CSDL.
#
# CÁCH DÙNG:
#   ./dong-bo-lich-su-zalo.sh                 # xem trước, KHÔNG chạy gì
#   ./dong-bo-lich-su-zalo.sh --chay          # chạy thật
#   ./dong-bo-lich-su-zalo.sh --chay --so-tin 2000
#   ./dong-bo-lich-su-zalo.sh --chay --khong-quet-ban-be
#
# Biến môi trường (đặt trước khi chạy nếu khác mặc định):
#   API=http://localhost:4520
#   EMAIL=..., PASSWORD=...          # tài khoản owner/admin của ChatMQL
#   PGURL=postgresql://...           # để đo trước/sau (bỏ qua nếu không có)
# ══════════════════════════════════════════════════════════════════════
set -uo pipefail

API="${API:-http://localhost:4520}"
EMAIL="${EMAIL:-}"
PASSWORD="${PASSWORD:-}"
PGURL="${PGURL:-}"
SO_TIN=1000           # số tin tối đa kéo cho MỖI hội thoại (kéo càng xa càng để cao)
QUET_BAN_BE=1         # 1 = sau khi xong hội thoại thì quét tiếp danh sách bạn bè
NGHI_GIUA_TK=120      # giây nghỉ giữa hai tài khoản
CHAY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --chay) CHAY=1 ;;
    --so-tin) SO_TIN="$2"; shift ;;
    --khong-quet-ban-be) QUET_BAN_BE=0 ;;
    --nghi) NGHI_GIUA_TK="$2"; shift ;;
    *) echo "Tham số lạ: $1"; exit 1 ;;
  esac
  shift
done

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  read -r -p "Email admin ChatMQL: " EMAIL
  read -r -s -p "Mật khẩu: " PASSWORD; echo
fi

echo "▸ Đăng nhập $API…"
TOKEN=$(curl -s -m 20 "$API/api/v1/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))' 2>/dev/null)
[ -z "$TOKEN" ] && { echo "✗ Đăng nhập thất bại"; exit 1; }
echo "  ✓ xong"

dem_tin() {   # đếm tin nhắn hiện có (nếu có PGURL)
  [ -z "$PGURL" ] && { echo "?"; return; }
  psql "$PGURL" -t -A -c "SELECT count(*) FROM messages;" 2>/dev/null || echo "?"
}

echo "▸ Lấy danh sách tài khoản Zalo…"
curl -s -m 30 "$API/api/v1/zalo-accounts" -H "Authorization: Bearer $TOKEN" > /tmp/zalo-acc.json
python3 - "$SO_TIN" <<'PY' > /tmp/zalo-acc.tsv
import json, sys
raw = json.load(open('/tmp/zalo-acc.json'))
rows = raw if isinstance(raw, list) else (raw.get('accounts') or raw.get('data') or [])
for r in rows:
    # chỉ Zalo cá nhân (platform 2) mới có API lịch sử; OA không hỗ trợ
    if r.get('platform') not in (2, '2'):
        continue
    print('\t'.join([str(r.get('id')), str(r.get('displayName') or '?'), str(r.get('status') or '?')]))
PY

TONG=$(wc -l < /tmp/zalo-acc.tsv | tr -d ' ')
echo "  ✓ $TONG tài khoản Zalo cá nhân"
echo
# không dùng printf căn cột: chữ có dấu làm lệch cột trên terminal
while IFS=$'\t' read -r id name status; do
  case "$status" in
    connected) MARK="✓ đã kết nối " ;;
    *)         MARK="✗ chưa kết nối" ;;
  esac
  echo "  $MARK  $name"
done < /tmp/zalo-acc.tsv
echo

TRUOC=$(dem_tin)
echo "▸ Tin nhắn hiện có trong hệ thống: $TRUOC"
echo

if [ "$CHAY" -eq 0 ]; then
  cat <<'EOF'
──────────────────────────────────────────────────────────────
CHẾ ĐỘ XEM TRƯỚC — chưa chạy gì cả.

Trước khi chạy thật, mỗi nhân viên phải KẾT NỐI LẠI tài khoản Zalo
(Cài đặt → Kênh Zalo → Thêm/Kết nối → quét QR bằng điện thoại).
Tài khoản nào chưa kết nối thì script sẽ bỏ qua và báo rõ.

Chạy thật:  ./dong-bo-lich-su-zalo.sh --chay
──────────────────────────────────────────────────────────────
EOF
  exit 0
fi

echo "▸ BẮT ĐẦU kéo lịch sử (mỗi hội thoại tối đa $SO_TIN tin)"
[ "$QUET_BAN_BE" -eq 1 ] && echo "  Sau khi xong hội thoại sẽ QUÉT TIẾP danh sách bạn bè (lấy cả khách im lặng lâu)."
echo "  Tin kéo về KHÔNG kích hoạt AI, không gửi gì cho khách."
echo

DA_CHAY=0; BO_QUA=0
while IFS=$'\t' read -r id name status; do
  printf '── %s\n' "$name"
  QBB=$([ "$QUET_BAN_BE" -eq 1 ] && echo true || echo false)
  RES=$(curl -s -m 60 -X POST "$API/api/v1/zalo-accounts/$id/backfill" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -d "{\"maxMessages\":$SO_TIN,\"includeFriends\":$QBB}")
  if echo "$RES" | grep -q '"message"'; then
    echo "   ✓ đã khởi động, đang chạy nền trên máy chủ"
    DA_CHAY=$((DA_CHAY+1))
    echo "   … nghỉ ${NGHI_GIUA_TK}s trước tài khoản kế tiếp (tránh Zalo chặn)"
    sleep "$NGHI_GIUA_TK"
  else
    LY_DO=$(echo "$RES" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("error","?"))' 2>/dev/null || echo "$RES")
    echo "   ⏭ bỏ qua — $LY_DO"
    BO_QUA=$((BO_QUA+1))
  fi
done < /tmp/zalo-acc.tsv

echo
echo "▸ Đã khởi động: $DA_CHAY tài khoản · Bỏ qua: $BO_QUA (chưa kết nối)"
echo "  Việc kéo chạy NỀN, mỗi hội thoại cách nhau 4 giây nên có thể mất nhiều giờ."
echo "  Theo dõi: xem log máy chủ (dòng [backfill:...]) hoặc chạy lại lệnh đếm dưới đây."
echo
if [ -n "$PGURL" ]; then
  echo "▸ Theo dõi tiến độ (Ctrl+C để thoát, việc kéo vẫn chạy tiếp):"
  LAN_TRUOC=$TRUOC
  for i in $(seq 1 60); do
    sleep 60
    HIEN_TAI=$(dem_tin)
    THEM=$((HIEN_TAI - LAN_TRUOC))
    TONG_THEM=$((HIEN_TAI - TRUOC))
    printf '   phút %-3s tổng %-9s (+%s phút này, +%s từ đầu)\n' "$i" "$HIEN_TAI" "$THEM" "$TONG_THEM"
    LAN_TRUOC=$HIEN_TAI
  done
fi
