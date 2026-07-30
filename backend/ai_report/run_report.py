#!/usr/bin/env python3
"""
AI Sales Report Bot — Main Runner
Chạy thủ công hoặc qua cron job.

Sử dụng:
  python3 run_report.py              # Báo cáo hôm nay
  python3 run_report.py 2026-04-15   # Báo cáo ngày cụ thể
  python3 run_report.py --test       # Test không gửi Lark
"""
import sys
import os
import json
from datetime import datetime

# Thêm thư mục hiện tại vào path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from data_collector import collect_daily_report
from ai_analyzer import analyze_report
from report_generator import generate_lark_report, generate_simple_text_report
from distributor import send_to_lark


def run(date_str: str = None, test_mode: bool = False):
    """Chạy toàn bộ pipeline báo cáo."""
    print("=" * 50)
    print("🤖 AI Sales Report Bot — TDVN CRM")
    print("=" * 50)

    # 1. Xác định ngày
    report_date = None
    if date_str:
        from zoneinfo import ZoneInfo
        report_date = datetime.strptime(date_str, "%Y-%m-%d").replace(
            tzinfo=ZoneInfo("Asia/Ho_Chi_Minh")
        )

    # 2. Thu thập dữ liệu
    print("\n📊 Đang thu thập dữ liệu...")
    try:
        report_data = collect_daily_report(report_date)
        print(f"✅ Dữ liệu ngày {report_data['report_date']}")
        print(f"   Nhân sự: {report_data['summary']['tong_nhan_su']}")
        print(f"   Tổng đơn: {report_data['summary']['tong_don']}")
        print(f"   Tổng GMV: {report_data['summary']['tong_gmv']:,.0f} VNĐ")
    except Exception as e:
        print(f"❌ Lỗi thu thập dữ liệu: {e}")
        import traceback
        traceback.print_exc()
        return False

    # 3. AI phân tích
    print("\n🤖 AI đang phân tích...")
    try:
        ai_analysis = analyze_report(report_data)
        print(f"✅ AI đã phân tích ({len(ai_analysis)} ký tự)")
    except Exception as e:
        print(f"⚠️ AI lỗi, dùng nhận xét mặc định: {e}")
        ai_analysis = "⚠️ Không thể phân tích AI. Vui lòng xem dữ liệu chi tiết ở trên."

    # 4. Tạo báo cáo
    print("\n📄 Tạo báo cáo...")
    lark_payload = generate_lark_report(report_data, ai_analysis)
    text_report = generate_simple_text_report(report_data, ai_analysis)

    if test_mode:
        print("\n" + "=" * 50)
        print("🧪 TEST MODE — Không gửi Lark")
        print("=" * 50)
        print(text_report)
        print("\n📋 Lark Payload:")
        print(json.dumps(lark_payload, indent=2, ensure_ascii=False)[:2000])
        return True

    # 5. Gửi báo cáo
    print("\n📬 Gửi báo cáo tới Lark Bot...")
    success = send_to_lark(lark_payload)

    if success:
        print("\n✅ Hoàn tất! Báo cáo đã được gửi thành công.")
    else:
        print("\n❌ Gửi báo cáo thất bại.")

    return success


if __name__ == "__main__":
    date_arg = None
    test_mode = False

    for arg in sys.argv[1:]:
        if arg == "--test":
            test_mode = True
        elif arg.startswith("20"):
            date_arg = arg

    success = run(date_str=date_arg, test_mode=test_mode)
    sys.exit(0 if success else 1)
