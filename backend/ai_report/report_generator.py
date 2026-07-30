"""
Report Generator — Tạo báo cáo dạng text cho Lark Bot
"""
from ai_analyzer import format_currency


def generate_lark_report(report_data: dict, ai_analysis: str) -> dict:
    """
    Tạo Lark message card từ dữ liệu báo cáo.
    Returns: dict payload cho Lark Webhook
    """
    summary = report_data["summary"]
    date_str = report_data["report_date"]

    # === Header ===
    lines = [
        f"📊 BÁO CÁO BÁN HÀNG — {date_str}",
        "",
        "━━━━━━━━━━━━━━━━━━━━━",
        "🏆 TỔNG QUAN",
        f"├── Tổng doanh số: {format_currency(summary['tong_gmv'])} VNĐ",
        f"├── Tổng đơn hàng: {summary['tong_don']} đơn",
        f"├── Tổng KH chốt lịch: {summary['tong_kh_chot']}",
        f"└── Nhân sự: {summary['tong_nhan_su']} người",
        "",
        "━━━━━━━━━━━━━━━━━━━━━",
        "👥 CHI TIẾT NHÂN SỰ",
        "",
    ]

    # === Staff details table ===
    for i, s in enumerate(report_data["staff_reports"], 1):
        sales = s["sales"]
        schedule = s["schedule"]

        # Emoji đánh giá
        gmv = sales["gmv_thuc_te"]
        chot = schedule["chot"]
        ti_le = sales["ti_le_chot"]

        if gmv > 3_000_000 and ti_le > 5:
            badge = "⭐"
        elif gmv > 1_000_000 or ti_le > 3:
            badge = "✅"
        elif gmv > 0 or chot > 0:
            badge = "⚠️"
        else:
            badge = "❌"

        lines.append(f"{badge} {i}. {s['name']} ({s['chuc_vu']})")
        lines.append(f"   KH phụ trách: {schedule['tong_kh']} | Chốt: {chot} | Phản hồi: {schedule['phan_hoi']}")
        lines.append(f"   Đơn lịch: {sales['so_don_tu_lich']} | Đơn thực tế: {sales['so_don_thuc_te']}")
        lines.append(f"   💰 Doanh số: {format_currency(gmv)} VNĐ | AOV: {format_currency(sales['aov'])}")

        if ti_le > 0:
            lines.append(f"   📈 Tỷ lệ chốt: {ti_le}%")

        if s["activity_count"] > 0:
            lines.append(f"   📝 Ghi chú: {s['activity_count']} lượt")

        lines.append("")

    # === AI Analysis ===
    lines.append("━━━━━━━━━━━━━━━━━━━━━")
    lines.append("🤖 AI NHẬN XÉT")
    lines.append("")
    lines.append(ai_analysis)
    lines.append("")
    lines.append(f"⏰ Báo cáo tự động lúc 17:00 — AI Sales Assistant TDVN")

    text_content = "\n".join(lines)

    # Lark message format (rich text)
    payload = {
        "msg_type": "interactive",
        "card": {
            "config": {
                "wide_screen_mode": True
            },
            "header": {
                "title": {
                    "tag": "plain_text",
                    "content": f"📊 Báo Cáo Bán Hàng — {date_str}"
                },
                "template": "blue"
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "tag": "lark_md",
                        "content": text_content
                    }
                }
            ]
        }
    }

    return payload


def generate_simple_text_report(report_data: dict, ai_analysis: str) -> str:
    """Tạo báo cáo text đơn giản (fallback)."""
    summary = report_data["summary"]
    date_str = report_data["report_date"]

    lines = [
        f"📊 BÁO CÁO BÁN HÀNG — {date_str}",
        "",
        f"🏆 Tổng doanh số: {format_currency(summary['tong_gmv'])} VNĐ",
        f"📦 Tổng đơn: {summary['tong_don']} | KH chốt: {summary['tong_kh_chot']}",
        "",
    ]

    for i, s in enumerate(report_data["staff_reports"], 1):
        sales = s["sales"]
        schedule = s["schedule"]
        lines.append(
            f"{i}. {s['name']}: {format_currency(sales['gmv_thuc_te'])} VNĐ "
            f"({sales['so_don_thuc_te']} đơn, chốt: {schedule['chot']}, "
            f"tỷ lệ: {sales['ti_le_chot']}%)"
        )

    lines.append("")
    lines.append("🤖 AI:")
    lines.append(ai_analysis)

    return "\n".join(lines)
