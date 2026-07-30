"""
Data Collector — Thu thập dữ liệu từ CRM PostgreSQL
Lấy dữ liệu lịch bán hàng, đơn hàng, mục tiêu cho từng nhân sự
"""
import psycopg
from datetime import datetime, timedelta
from typing import Optional
from config import DATABASE_URL, DATABASE_URL_FM, SALES_ROLE_ID, EXCLUDED_STATUS_ID


def get_connections():
    """Tạo kết nối database."""
    conn = psycopg.connect(DATABASE_URL)
    conn_fm = psycopg.connect(DATABASE_URL_FM)
    return conn, conn_fm


def get_sales_staff(conn) -> list:
    """Lấy danh sách nhân sự bán hàng (role_id=4)."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id_acc, user_id, name, username, chuc_vu
            FROM account_users
            WHERE role_id = %s AND trang_thai IS DISTINCT FROM 'inactive'
            ORDER BY name
        """, (SALES_ROLE_ID,))
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_staff_targets(conn) -> dict:
    """Lấy mục tiêu của từng nhân sự từ bảng muc_tieu."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id_acc, name_pt, dau_vao, muc_tieu,
                   dau_vao_banhang, dau_vao_chamsoc
            FROM muc_tieu
        """)
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
    return {row[0]: dict(zip(cols, row)) for row in rows}


def get_schedule_stats(conn, id_acc: int, from_dt: datetime, to_dt: datetime) -> dict:
    """
    Lấy thống kê lịch bán hàng cho 1 nhân viên.
    Trả về: tổng KH, KH lịch bán hàng (chốt), phản hồi, chưa cấu hình
    """
    with conn.cursor() as cur:
        cur.execute("""
            WITH CustomerStatus AS (
                SELECT
                    id_kh,
                    CASE
                        WHEN (ngay_hen_banhang >= %s AND ngay_hen_banhang <= %s)
                        THEN 'lich_ban_hang'
                        WHEN (thoi_gian_cs_lai >= %s AND thoi_gian_cs_lai <= %s)
                             AND NOT (ngay_hen_banhang >= %s AND ngay_hen_banhang <= %s)
                        THEN 'lich_cham_soc'
                        ELSE 'chua_cau_hinh'
                    END AS status
                FROM khach_hang
                WHERE id_acc = %s
            )
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'lich_ban_hang') as chot,
                COUNT(*) FILTER (WHERE status = 'lich_cham_soc') as phan_hoi,
                COUNT(*) FILTER (WHERE status = 'chua_cau_hinh') as chua_cau_hinh
            FROM CustomerStatus;
        """, (from_dt, to_dt, from_dt, to_dt, from_dt, to_dt, id_acc))

        row = cur.fetchone()
        return {
            "tong_kh": row[0] if row else 0,
            "chot": row[1] if row else 0,
            "phan_hoi": row[2] if row else 0,
            "chua_cau_hinh": row[3] if row else 0,
        }


def get_sales_results(conn, conn_fm, id_acc: int, code_seller: str,
                      from_dt: datetime, to_dt: datetime) -> dict:
    """
    Lấy kết quả bán hàng: đơn từ KH lịch BH + đơn thực tế tổng.
    Logic tương tự endpoint /cskh-schedule/ket-qua-ban-hang
    """
    result = {
        "so_khach_hang_lich": 0,
        "so_don_tu_lich": 0,
        "gmv_tu_lich": 0.0,
        "so_don_thuc_te": 0,
        "gmv_thuc_te": 0.0,
        "ti_le_chot": 0.0,
        "aov": 0.0,
    }

    # Bước 1: Lấy danh sách KH có lịch bán hàng trong khoảng ngày
    with conn.cursor() as cur:
        cur.execute("""
            SELECT ma_kh FROM khach_hang
            WHERE id_acc = %s AND ngay_hen_banhang >= %s AND ngay_hen_banhang <= %s
        """, (id_acc, from_dt, to_dt))
        ma_kh_list = [r[0] for r in cur.fetchall()]

    result["so_khach_hang_lich"] = len(ma_kh_list)

    if not code_seller:
        return result

    # Bước 2: Lấy id_seller từ FM database
    id_seller = None
    with conn_fm.cursor() as cur_fm:
        cur_fm.execute("""
            SELECT DISTINCT id_seller FROM invoice
            WHERE code_seller = %s AND id_seller IS NOT NULL LIMIT 1
        """, (code_seller,))
        row = cur_fm.fetchone()
        id_seller = row[0] if row else None

    if not id_seller:
        return result

    with conn_fm.cursor() as cur_fm:
        # Đơn từ KH có lịch bán hàng
        if ma_kh_list:
            placeholders = ",".join(["%s"] * len(ma_kh_list))
            cur_fm.execute(f"""
                SELECT COUNT(*), COALESCE(SUM(subtotal), 0)
                FROM invoice
                WHERE time_create >= %s AND time_create <= %s
                  AND id_status <> {EXCLUDED_STATUS_ID}
                  AND code_customer IN ({placeholders})
            """, [from_dt, to_dt] + ma_kh_list)
            row = cur_fm.fetchone()
            result["so_don_tu_lich"] = int(row[0]) if row else 0
            result["gmv_tu_lich"] = float(row[1]) if row else 0.0

        # Tổng đơn thực tế của seller
        cur_fm.execute("""
            SELECT COUNT(*), COALESCE(SUM(subtotal), 0) FROM invoice
            WHERE time_create >= %s AND time_create <= %s
              AND id_status <> %s AND id_seller = %s
        """, (from_dt, to_dt, EXCLUDED_STATUS_ID, id_seller))
        row = cur_fm.fetchone()
        result["so_don_thuc_te"] = int(row[0]) if row else 0
        result["gmv_thuc_te"] = float(row[1]) if row else 0.0

    # Tính tỷ lệ
    if result["so_khach_hang_lich"] > 0:
        result["ti_le_chot"] = round(
            result["so_don_tu_lich"] / result["so_khach_hang_lich"] * 100, 2
        )
    if result["so_don_tu_lich"] > 0:
        result["aov"] = round(result["gmv_tu_lich"] / result["so_don_tu_lich"])

    return result


def get_activity_log(conn, id_acc: int, from_dt: datetime, to_dt: datetime) -> int:
    """Đếm số ghi chú/nhật ký bán hàng trong ngày."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM nhat_ky_ban_hang
            WHERE id_acc = %s AND thoi_gian >= %s AND thoi_gian <= %s
        """, (id_acc, from_dt, to_dt))
        row = cur.fetchone()
        return row[0] if row else 0


def collect_daily_report(report_date: Optional[datetime] = None) -> dict:
    """
    Thu thập toàn bộ dữ liệu cho báo cáo ngày.
    Returns: dict với thông tin tổng quan + chi tiết từng nhân sự
    """
    conn, conn_fm = get_connections()

    try:
        if report_date is None:
            from zoneinfo import ZoneInfo
            report_date = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))

        from_dt = report_date.replace(hour=0, minute=0, second=0, microsecond=0)
        to_dt = report_date.replace(hour=23, minute=59, second=59, microsecond=999999)

        # Lấy danh sách nhân sự
        staff_list = get_sales_staff(conn)
        targets = get_staff_targets(conn)

        # Thu thập dữ liệu cho từng nhân sự
        staff_reports = []
        total_don = 0
        total_gmv = 0.0
        total_chot = 0

        for staff in staff_list:
            id_acc = staff["id_acc"]
            code_seller = staff.get("user_id", "")

            # Lịch bán hàng stats
            schedule = get_schedule_stats(conn, id_acc, from_dt, to_dt)

            # Kết quả bán hàng
            sales = get_sales_results(conn, conn_fm, id_acc, code_seller, from_dt, to_dt)

            # Nhật ký hoạt động
            activity_count = get_activity_log(conn, id_acc, from_dt, to_dt)

            # Mục tiêu
            target = targets.get(id_acc, {})

            staff_report = {
                "id_acc": id_acc,
                "name": staff["name"],
                "username": staff["username"],
                "chuc_vu": staff.get("chuc_vu", ""),
                "schedule": schedule,
                "sales": sales,
                "activity_count": activity_count,
                "target": {
                    "muc_tieu": float(target.get("muc_tieu", 0) or 0),
                    "dau_vao": float(target.get("dau_vao", 0) or 0),
                },
            }
            staff_reports.append(staff_report)

            total_don += sales["so_don_thuc_te"]
            total_gmv += sales["gmv_thuc_te"]
            total_chot += schedule["chot"]

        # Sắp xếp theo GMV giảm dần
        staff_reports.sort(key=lambda x: x["sales"]["gmv_thuc_te"], reverse=True)

        report = {
            "report_date": report_date.strftime("%d/%m/%Y"),
            "report_date_iso": report_date.strftime("%Y-%m-%d"),
            "summary": {
                "tong_nhan_su": len(staff_reports),
                "tong_don": total_don,
                "tong_gmv": total_gmv,
                "tong_kh_chot": total_chot,
            },
            "staff_reports": staff_reports,
        }

        return report

    finally:
        conn.close()
        conn_fm.close()


if __name__ == "__main__":
    import json
    data = collect_daily_report()
    print(json.dumps(data, indent=2, ensure_ascii=False, default=str))
