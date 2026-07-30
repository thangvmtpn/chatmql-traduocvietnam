import io
from urllib.parse import urlencode
from PIL import Image, ImageDraw, ImageOps, ImageChops, ImageFont
import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers import CircleModuleDrawer

def build_url(base, params: dict) -> str:
    # Encode tham số an toàn (space -> +, ký tự đặc biệt -> %..)
    return f"{base}?{urlencode(params, doseq=True)}"

# --- Helpers cho logo ---
def _trim_logo(img: Image.Image) -> Image.Image:
    """Cắt viền trắng/transparent xung quanh logo (ưu tiên kênh alpha)."""
    img = img.convert("RGBA")
    alpha = img.split()[-1]
    bbox = alpha.getbbox()
    if bbox:
        return img.crop(bbox)
    # fallback nếu không có alpha: so nền trắng
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    diff = ImageChops.difference(img, bg).convert("L")
    bbox = diff.getbbox()
    return img.crop(bbox) if bbox else img

def _round_corners(img: Image.Image, radius: int) -> Image.Image:
    """Bo góc/bo tròn cho CHÍNH logo bằng mask alpha."""
    img = img.convert("RGBA")
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, w, h), radius=radius, fill=255)
    img.putalpha(mask)
    return img

def paste_logo_center(
    qr_img: Image.Image,
    logo_img: Image.Image,
    box_ratio=0.22,          # tỉ lệ cạnh LOGO so với cạnh QR
    rounded=True,            # có bo tròn logo + nền hay không
    pad_ratio=0.15,          # độ dày nền trắng xung quanh logo (tỉ lệ theo size logo)
    logo_round_ratio=1.0     # 1.0 = tròn hẳn; 0.3~0.5 = bo góc nhẹ
):
    """
    Dán logo đã trim + bo tròn vào giữa QR, có nền trắng bo góc phía sau.
    """
    qr_w, qr_h = qr_img.size
    logo_box = int(min(qr_w, qr_h) * box_ratio)

    # 1) Trim -> resize -> bo tròn CHÍNH logo
    logo = _trim_logo(logo_img.convert("RGBA"))
    logo = logo.resize((logo_box, logo_box), Image.LANCZOS)
    if rounded:
        radius_logo = int(logo_box * logo_round_ratio / 2)  # 1.0 => tròn hẳn
        logo = _round_corners(logo, radius_logo)

    # 2) Tạo nền trắng bo góc (đế) để dễ quét
    pad = int(logo_box * pad_ratio)
    bg_w, bg_h = logo_box + 2*pad, logo_box + 2*pad
    bg = Image.new("RGBA", (bg_w, bg_h), (255, 255, 255, 255))
    if rounded:
        radius_bg = int(bg_w * 0.28)  # giống style app
        mask_bg = Image.new("L", (bg_w, bg_h), 0)
        d = ImageDraw.Draw(mask_bg)
        d.rounded_rectangle((0, 0, bg_w, bg_h), radius=radius_bg, fill=255)
        bg.putalpha(mask_bg)

    # 3) Dán logo lên nền
    bg.paste(logo, (pad, pad), logo)

    # 4) Dán nền+logo vào giữa QR
    x = (qr_w - bg_w) // 2
    y = (qr_h - bg_h) // 2
    qr_img.paste(bg, (x, y), bg)
    return qr_img

def make_zalo_qr(
    url: str,
    out_path="qr_zalo.png",
    logo_path=None,
    dot_color=(15, 24, 36),
    bg_color=(255, 255, 255),
    logo_ratio=0.18,          # logo to/nhỏ so với QR
    pad_ratio=0.15,
    logo_round_ratio=1.0
):
    """
    dot_color: màu chấm (RGB)
    bg_color: màu nền QR
    """
    qr = qrcode.QRCode(
        version=None,  # tự scale theo độ dài URL
        error_correction=qrcode.constants.ERROR_CORRECT_H,  # H để dán logo vẫn quét tốt
        box_size=14,   # chấm to hơn giống mẫu
        border=1,      # khoảng trắng ngoài
    )
    qr.add_data(url)
    qr.make(fit=True)

    # Ảnh QR dạng chấm tròn
    img: Image.Image = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=CircleModuleDrawer(),
        fill_color=dot_color,
        back_color=bg_color
    ).convert("RGBA")

    # Dán logo nếu có
    if logo_path:
        logo = Image.open(logo_path)
        img = paste_logo_center(
            img, logo,
            box_ratio=logo_ratio,
            rounded=True,
            pad_ratio=pad_ratio,
            logo_round_ratio=logo_round_ratio
        )

    img.save(out_path)
    return out_path

# if __name__ == "__main__":
#     params = {
#         "ma_hd": "HD123456",
#         "tong_tien": 1500000,
#         "ma_kh": "KH001",
#         "sdt": "84909123456",
#         "nhan_vien_ban_hang": "Nguyen Van A",  # có dấu cách cũng OK
#     }
#     url2 = build_url("https://zalo.me/s/1575573710529516487", params)
#     make_zalo_qr(
#         url2,
#         out_path="qr_zalo_HD123456.png",
#         logo_path="zalo_logo.png",      # có thể để None nếu không muốn logo
#         logo_ratio=0.18,                 # chỉnh 0.18–0.24 tuỳ mắt
#         pad_ratio=0.08,                  # viền trắng quanh logo
#         logo_round_ratio=0.05             # 1.0 = logo tròn, 0.4 = bo góc nhẹ
#     )

    