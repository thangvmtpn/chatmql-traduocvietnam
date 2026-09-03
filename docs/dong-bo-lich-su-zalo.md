# Đồng bộ lịch sử chat nhân viên ↔ khách hàng lên ChatMQL

## Hiện trạng (đo ngày 30/08/2026 trên CSDL bizcrm2)

| Chỉ số | Con số |
|---|---|
| Hội thoại trong hệ thống | 16.294 |
| **Hội thoại chỉ có 1–2 tin** | **8.572 (53%)** — lịch sử cũ chưa được kéo về |
| Tin nhắn cũ nhất | 04/05/2026 — không có gì trước mốc này |
| Tài khoản Zalo cá nhân | 25, **hiện 0 tài khoản còn kết nối** |
| Phiên Zalo đã lưu | 24 (đều hết hạn, tự kết nối lại thất bại) |
| Kênh ngừng đồng bộ | 8–41 ngày tuỳ tài khoản |

Nguyên nhân: ChatMQL chỉ ghi tin **từ lúc tài khoản Zalo được kết nối trở đi**.
Tin cũ hơn chỉ về nếu chủ động "kéo lịch sử". Tài khoản rớt kết nối thì ngừng hẳn.

## Cơ chế có sẵn

`POST /api/v1/zalo-accounts/:id/backfill` với `{ maxMessages }`:

- Duyệt từng hội thoại của tài khoản, gọi API lịch sử của Zalo, lùi dần về quá khứ.
- **An toàn**: tin kéo về gắn cờ `isBackfill` → **không kích hoạt AI trả lời**,
  không chạy automation, không gửi gì cho khách. Chỉ ghi vào CSDL.
- Chạy nền, nghỉ 3s/trang và 4s/hội thoại để Zalo không coi là spam.

## Các bước

### Bước 1 — Kết nối lại tài khoản Zalo của nhân viên

Trên ChatMQL: **Cài đặt → Kênh Zalo → Thêm tài khoản Zalo** → nhân viên quét mã QR
bằng điện thoại đang đăng nhập Zalo đó.

> Chỉ kết nối ở MỘT nơi. Zalo cá nhân thường chỉ giữ một phiên tự động;
> kết nối chỗ này có thể làm rớt phiên chỗ kia.

### Bước 2 — Xem trước

```bash
cd /path/to/bizcrm
EMAIL=admin@... PASSWORD=... PGURL="postgresql://user@host:5432/bizcrm2" \
  ./scripts/dong-bo-lich-su-zalo.sh
```

Liệt kê tài khoản nào đã kết nối / chưa, và số tin hiện có. Không chạy gì.

### Bước 3 — Chạy thật

```bash
EMAIL=admin@... PASSWORD=... PGURL="postgresql://user@host:5432/bizcrm2" \
  ./scripts/dong-bo-lich-su-zalo.sh --chay --so-tin 2000
```

Script khởi động lần lượt từng tài khoản, nghỉ 120 giây giữa các tài khoản,
rồi in tiến độ mỗi phút. Tài khoản chưa kết nối được bỏ qua kèm lý do.

- `--so-tin` = số tin tối đa kéo cho **mỗi hội thoại** (mặc định 1000).
  Muốn lấy càng xa về quá khứ thì để càng cao — Zalo trả về tới đâu thì lấy tới đó.
- Mặc định script **quét luôn danh sách bạn bè** sau khi xong phần hội thoại
  (xem mục dưới). Tắt bằng `--khong-quet-ban-be`.

### Bước 4 — Kiểm lại

```sql
SELECT count(*) FROM messages;                                   -- tổng tin
SELECT count(*) FROM (SELECT conversation_id FROM messages
  GROUP BY 1 HAVING count(*) <= 2) x;                            -- hội thoại còn nghèo tin
SELECT to_char(min(sent_at),'DD/MM/YYYY') FROM messages;          -- mốc lịch sử cũ nhất
```

## Thời gian và rủi ro

- **Thời gian**: ~4 giây/hội thoại. Tài khoản 3.000 hội thoại ≈ 3,5 giờ.
  Cả 25 tài khoản ≈ **15–20 giờ**. Nên chạy ban đêm, và chạy lần lượt (script đã làm vậy).
- **Rủi ro Zalo khoá tạm**: kéo nhiều là lưu lượng lớn. Script đã có nghỉ giữa các bước;
  đừng chạy song song nhiều tài khoản, đừng hạ thời gian nghỉ.
- **Không ảnh hưởng khách**: đã kiểm mã nguồn — nhánh AI/automation bị chặn với tin backfill.

## Quét theo danh sách bạn bè (mới bổ sung)

Phần backfill gốc chỉ đi qua hội thoại **đã có** trong CSDL. Khách từng chat trước
khi kết nối ChatMQL rồi im lặng thì không có hội thoại → mãi mãi không kéo được.

Đã bổ sung `POST /api/v1/zalo-accounts/:id/backfill-friends` (và cờ `includeFriends`
trên endpoint cũ): duyệt **danh sách bạn bè** đã đồng bộ lúc kết nối, bỏ qua ai đã có
hội thoại, thử kéo lịch sử cho phần còn lại. Ai thật sự có tin thì hệ thống tự tạo
hội thoại + liên hệ; ai không có tin thì không tạo gì, nên không sinh rác.

Quy mô hiện tại: **24.089 người bạn**, trong đó **8.464 người chưa có hội thoại nào** —
đây chính là phần lịch sử đang mất mà cách cũ không với tới được.

Hai luồng chạy **nối tiếp** trên cùng một tài khoản (không song song) — bắn hai vòng
lặp vào một tài khoản Zalo là cách nhanh nhất để bị khoá tạm.

> Phần này **chưa kiểm chứng được bằng dữ liệu thật** vì không có phiên Zalo nào đang
> kết nối. Đã kiểm: đường dẫn API, kiểm tra quyền, báo lỗi khi chưa kết nối, và thứ tự
> chạy nối tiếp. Lần chạy thật đầu tiên nên đặt `maxFriends` nhỏ (vd 20) để xem kết quả
> trước khi quét cả nghìn người.

## Giới hạn đã biết (nói trước để không kỳ vọng sai)

1. **Hội thoại nhóm chỉ lấy được 1 trang** (API nhóm của thư viện không có con trỏ phân trang).
   1-1 thì lùi được nhiều trang.
3. **Zalo OA (platform 1) không có API lịch sử** — chỉ nhận tin mới qua webhook.
4. Zalo chỉ giữ lịch sử ở máy chủ trong thời gian nhất định; quá cũ thì không còn để kéo.

## Việc có thể làm thêm (nếu cần lịch sử đầy đủ hơn)

- **Nhập từ Pancake**: mã nguồn đã có sẵn luồng `pull` (hội thoại + tin nhắn + khách).
  Hiện chưa cấu hình tích hợp nào. Nếu công ty đang dùng Pancake và ở đó có lịch sử
  dài hơn, đây là đường lấy được nhiều dữ liệu nhất mà không đụng tới phiên Zalo.
