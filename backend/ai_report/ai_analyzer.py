"""
AI Analyzer — Sử dụng OpenAI để phân tích hiệu suất nhân sự
"""
import json
from openai import OpenAI
from config import OPENAI_API_KEY, OPENAI_MODEL


def format_currency(amount: float) -> str:
    """Format tiền VNĐ."""
    if amount >= 1_000_000:
        return f"{amount/1_000_000:.1f}M"
    elif amount >= 1_000:
        return f"{amount/1_000:.0f}K"
    return f"{amount:.0f}"


def analyze_report(report_data: dict) -> str:
    """
    Gửi dữ liệu báo cáo cho OpenAI phân tích.
    Trả về nhận xét AI dạng text.
    """
    client = OpenAI(api_key=OPENAI_API_KEY)

    # Chuẩn bị dữ liệu tóm tắt cho AI
    summary = report_data["summary"]
    staff_summaries = []

    for i, s in enumerate(report_data["staff_reports"], 1):
        sales = s["sales"]
        schedule = s["schedule"]
        staff_summaries.append({
            "rank": i,
            "name": s["name"],
            "chuc_vu": s["chuc_vu"],
            "kh_phu_trach": schedule["tong_kh"],
            "kh_chot_lich": schedule["chot"],
            "kh_phan_hoi": schedule["phan_hoi"],
            "kh_chua_cau_hinh": schedule["chua_cau_hinh"],
            "so_don_tu_lich": sales["so_don_tu_lich"],
            "gmv_tu_lich": sales["gmv_tu_lich"],
            "so_don_thuc_te": sales["so_don_thuc_te"],
            "gmv_thuc_te": sales["gmv_thuc_te"],
            "ti_le_chot": sales["ti_le_chot"],
            "aov": sales["aov"],
            "so_ghi_chu": s["activity_count"],
            "muc_tieu_thang": s["target"]["muc_tieu"],
        })

    prompt = f"""Bạn là quản lý bán hàng của công ty Trà Dược Việt Nam (TDVN). 
Hãy phân tích báo cáo bán hàng ngày {report_data['report_date']} và đưa ra nhận xét.

## DỮ LIỆU TỔNG QUAN
- Tổng nhân sự: {summary['tong_nhan_su']}
- Tổng đơn hàng: {summary['tong_don']}
- Tổng doanh số: {format_currency(summary['tong_gmv'])} VNĐ
- Tổng KH cấu hình chốt: {summary['tong_kh_chot']}

## CHI TIẾT TỪNG NHÂN SỰ (sắp xếp theo doanh số)
{json.dumps(staff_summaries, indent=2, ensure_ascii=False)}

## GIẢI THÍCH CHỈ SỐ
- kh_chot_lich: Số KH được phân lịch bán hàng = Chốt (theo ảnh dashboard)
- so_don_tu_lich: Số đơn hàng chốt từ KH có lịch
- so_don_thuc_te: Tổng đơn hàng thực tế trong ngày
- gmv_thuc_te: Tổng giá trị đơn hàng thực tế
- ti_le_chot: Tỷ lệ chốt = so_don_tu_lich / kh_chot_lich * 100
- muc_tieu_thang: Mục tiêu doanh số tháng

## YÊU CẦU PHÂN TÍCH
1. Đánh giá tổng quan hiệu suất bán hàng hôm nay
2. Xếp hạng hiệu suất từng nhân sự: ⭐ Xuất sắc / ✅ Tốt / ⚠️ Cần cải thiện / ❌ Kém
3. Ai cần được hỗ trợ đặc biệt?
4. Nhận xét ngắn gọn 2-3 câu cho từng nhân sự (tập trung vào tỷ lệ chốt + tổng giá trị đơn)
5. Đề xuất cải thiện nếu có

Viết bằng tiếng Việt, ngắn gọn, chuyên nghiệp. KHÔNG dùng markdown headers."""

    try:
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "Bạn là AI quản lý bán hàng. Phân tích dữ liệu và đưa nhận xét ngắn gọn, chuyên nghiệp bằng tiếng Việt."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2000,
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"⚠️ Không thể phân tích AI: {str(e)}"
