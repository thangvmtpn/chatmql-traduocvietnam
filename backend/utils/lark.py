import asyncio
from datetime import datetime
import json
import os
import sys
import requests

base_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))

# Quay lại 1 cấp (từ /backend/utils → /backend)
backend_dir = os.path.dirname(base_dir)
# Đường dẫn setup.json
setup_path = os.path.join(backend_dir, "setup.json")

async def send_lark_message(data):
    # Lấy URL từ biến môi trường, fallback về bot test nếu không định nghĩa
    url = os.getenv(
        "LARKSUITE_URL",
        "https://open.larksuite.com/open-apis/bot/v2/hook/7b6f4e19-6c16-4ac5-b805-e98e15d0b8cb"
    )
     
    USER_A_ID = "ou_9ecb1e27b71ddc04a01b9da1ad66ba6d"  # ID anh phương
    USER_B_ID = "ou_6d761d8d04d9df74276a441d67498475"  # ID chị thủy
    USER_C_ID = "ou_9c6d1c89985cde6113b38e0950a4accd"

    body_text = (
        f"**{data['don_hang_moi']}**\n"
        f"**- Kênh:** {data['kenh']}\n"
        f"**- Người bán:** {data['nguoi_ban']}\n"
        f"**- Sản phẩm:** \n{data['san_pham']}\n"
        f"**- Số hóa đơn:** {data['ma_hoa_don']}\n"
        f"**- Trạng thái:** {data['trang_thai']}"
    )
    tag_ten = ()
    # ✅ Chỉ tag khi có chữ "ghi chú" trong trạng thái
    if "Ghi chú" in data["trang_thai"] or data["trang_thai"] == "Đã hủy":
        tag_ten = (
            f"\n<at id=\"{USER_A_ID}\">Anh Phương</at> "
            f"<at id=\"{USER_B_ID}\">Chị Thủy</at>"
            f"<at id=\"{USER_C_ID}\">ADMIN</at>"
        )
    
    # build phần "elements" cho card
    elements = [
        {
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": body_text
            }
        }
    ]

    # chỉ thêm block mention nếu có
    if tag_ten:
        elements.append({
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": tag_ten
            }
        })

    card_payload = {
        "config": {
            "wide_screen_mode": True
        },
        "header": {
            "title": {
                "tag": "plain_text",
                "content": "THÔNG BÁO ĐƠN HÀNG MỚI"
            }
        },
        "elements": elements
    }

    message = {
        "msg_type": "interactive",
        "card": card_payload
    }
    response = requests.post(url, data=json.dumps(message), headers={'Content-Type': 'application/json'})
    if response.status_code == 200:
        print("✅ Gửi Lark thành công!")
    else:
        print(f"❌ Lỗi gửi Lark: {response.status_code}, {response.text}")
