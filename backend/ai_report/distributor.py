"""
Distributor — Gửi báo cáo qua Lark Bot Webhook
"""
import json
import requests
from config import LARK_WEBHOOK_URL


def send_to_lark(payload: dict) -> bool:
    """
    Gửi message card tới Lark Bot Webhook.
    Returns: True nếu thành công.
    """
    try:
        response = requests.post(
            LARK_WEBHOOK_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        result = response.json()

        if result.get("code") == 0 or result.get("StatusCode") == 0:
            print(f"✅ Đã gửi báo cáo thành công tới Lark Bot")
            return True
        else:
            print(f"❌ Lark Bot lỗi: {result}")
            # Fallback: gửi text đơn giản
            return send_text_fallback(payload)

    except Exception as e:
        print(f"❌ Lỗi gửi Lark: {e}")
        return False


def send_text_fallback(payload: dict) -> bool:
    """Gửi text đơn giản nếu card bị lỗi."""
    try:
        # Trích xuất text từ card
        elements = payload.get("card", {}).get("elements", [])
        text = ""
        for el in elements:
            txt = el.get("text", {}).get("content", "")
            if txt:
                text += txt + "\n"

        if not text:
            return False

        # Cắt ngắn nếu quá dài (Lark limit ~ 4000 chars)
        if len(text) > 3800:
            text = text[:3800] + "\n\n... (báo cáo bị cắt do quá dài)"

        simple_payload = {
            "msg_type": "text",
            "content": {
                "text": text
            }
        }

        response = requests.post(
            LARK_WEBHOOK_URL,
            json=simple_payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        result = response.json()
        success = result.get("code") == 0 or result.get("StatusCode") == 0
        print(f"{'✅' if success else '❌'} Fallback text: {result}")
        return success

    except Exception as e:
        print(f"❌ Lỗi fallback: {e}")
        return False
