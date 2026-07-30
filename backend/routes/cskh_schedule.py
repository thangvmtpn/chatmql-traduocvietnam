from fastapi import APIRouter, Depends, HTTPException, status, Query
from datetime import datetime, timedelta, date
from typing import Optional
from database import conn, conn_fm
from utils.security import check_token

router = APIRouter()


# ============================================================
# SALES SCHEDULE OVERVIEW — tổng hợp TẤT CẢ nhân viên role_id=4
# ============================================================

def get_role4_id_accs():
    """Lấy danh sách id_acc của tất cả nhân viên có role_id = 4"""
    with conn.cursor() as cur:
        cur.execute("SELECT id_acc FROM account_users WHERE role_id = 4 AND trang_thai = 'Đang làm'")
        rows = cur.fetchall()
    return [r[0] for r in rows]


@router.get("/sales-schedule-overview/stats")
async def get_sales_schedule_overview_stats(
    from_date: Optional[str] = Query(None, description="Từ ngày (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Đến ngày (YYYY-MM-DD)"),
    current_user: dict = Depends(check_token)
):
    """Thống kê tổng hợp lịch bán hàng cho tất cả nhân viên role_id=4."""
    try:
        from_dt, to_dt = get_date_range(from_date, to_date)
        id_accs = get_role4_id_accs()

        if not id_accs:
            return {"total": 0, "lich_ban_hang": 0, "lich_cham_soc": 0, "chua_cau_hinh": 0, "da_cau_hinh": 0}

        placeholders = ",".join(["%s"] * len(id_accs))
        with conn.cursor() as cur:
            # 4 nhóm mutually-exclusive (tổng = tất cả KH):
            # 1. Chốt    : ngay_hen_banhang trong [from, to]
            # 2. Phản hồi: thoi_gian_cs_lai trong [from, to] và KHÔNG phải Chốt
            # 3. Đã cấu hình: ngay_hen_banhang > NOW() và KHÔNG phải Chốt
            # 4. Chưa cấu hình: còn lại (ngay_hen_banhang quá hạn hoặc NULL)
            query = f"""
            WITH CustomerStatus AS (
                SELECT
                    id_kh,
                    CASE
                        WHEN (ngay_hen_banhang >= %s AND ngay_hen_banhang <= %s)
                            THEN 'chot'
                        WHEN ngay_hen_banhang > NOW()
                            THEN 'da_cau_hinh'
                        WHEN (thoi_gian_cs_lai >= %s AND thoi_gian_cs_lai <= %s)
                            THEN 'phan_hoi'
                        ELSE 'chua_cau_hinh'
                    END as status
                FROM khach_hang kh
                WHERE id_acc IN ({placeholders})
                AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                AND DATE(kh.thoi_gian_tao::timestamp) <= CURRENT_DATE
            )
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'chot') as lich_ban_hang_count,
                COUNT(*) FILTER (WHERE status = 'phan_hoi') as lich_cham_soc_count,
                COUNT(*) FILTER (WHERE status = 'chua_cau_hinh') as chua_cau_hinh_count,
                COUNT(*) FILTER (WHERE status = 'da_cau_hinh') as da_cau_hinh_count
            FROM CustomerStatus;
            """
            cur.execute(query, tuple([from_dt, to_dt, from_dt, to_dt] + id_accs))
            result = cur.fetchone()

        don_trong_ky = 0
        with conn_fm.cursor() as cur_fm:
            cur_fm.execute(
                "SELECT DISTINCT code_customer FROM invoice WHERE time_create >= %s AND time_create <= %s AND id_status <> 12 AND (status_value IS NULL OR status_value NOT IN ('Đã huỷ', 'Đã hủy')) AND code_customer IS NOT NULL",
                (from_dt, to_dt)
            )
            dk_customers = [r[0] for r in cur_fm.fetchall()]
        if dk_customers:
            dk_ph = ",".join(["%s"] * len(dk_customers))
            with conn.cursor() as cur:
                cur.execute(f"SELECT COUNT(DISTINCT id_kh) FROM khach_hang kh WHERE id_acc IN ({placeholders}) AND ma_kh IN ({dk_ph}) AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL AND DATE(kh.thoi_gian_tao::timestamp) <= CURRENT_DATE", tuple(id_accs + dk_customers))
                don_trong_ky = cur.fetchone()[0]

        return {
            "total": result[0] or 0,
            "don_trong_ky": don_trong_ky,
            "lich_ban_hang": result[1] or 0,
            "lich_cham_soc": result[2] or 0,
            "chua_cau_hinh": result[3] or 0,
            "da_cau_hinh": result[4] or 0,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sales-schedule-overview")
async def get_sales_schedule_overview(
    schedule_type: str = Query("all", description="all, ban_hang, cham_soc, chua_cau_hinh"),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    ma_kh: Optional[str] = None,
    ten_kh: Optional[str] = None,
    sdt: Optional[str] = None,
    from_date: Optional[str] = Query(None, description="Từ ngày (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Đến ngày (YYYY-MM-DD)"),
    current_user: dict = Depends(check_token)
):
    """Danh sách khách hàng theo lịch bán hàng – tổng hợp tất cả nhân viên role_id=4."""
    try:
        from_dt, to_dt = get_date_range(from_date, to_date)
        id_accs = get_role4_id_accs()
        offset = (page - 1) * page_size

        if not id_accs:
            return {"total": 0, "page": page, "page_size": page_size, "total_pages": 0,
                    "schedule_type": schedule_type, "data": []}

        acc_placeholders = ",".join(["%s"] * len(id_accs))

        where_clause = " AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL AND DATE(kh.thoi_gian_tao::timestamp) <= CURRENT_DATE"
        extra_params: list = []

        if schedule_type == "ban_hang":
            where_clause += " AND kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s"
            extra_params.extend([from_dt, to_dt])
        elif schedule_type == "cham_soc":
            where_clause += """
                AND kh.thoi_gian_cs_lai >= %s AND kh.thoi_gian_cs_lai <= %s
                AND NOT COALESCE(kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s, FALSE)
                AND NOT COALESCE(kh.ngay_hen_banhang > NOW(), FALSE)
            """
            extra_params.extend([from_dt, to_dt, from_dt, to_dt])
        elif schedule_type == "chua_cau_hinh":
            where_clause += """
                AND NOT COALESCE(kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s, FALSE)
                AND NOT COALESCE(kh.thoi_gian_cs_lai >= %s AND kh.thoi_gian_cs_lai <= %s, FALSE)
                AND NOT COALESCE(kh.ngay_hen_banhang > NOW(), FALSE)
            """
            extra_params.extend([from_dt, to_dt, from_dt, to_dt])
        elif schedule_type == "da_cau_hinh":
            where_clause += """
                AND COALESCE(kh.ngay_hen_banhang > NOW(), FALSE)
                AND NOT COALESCE(kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s, FALSE)
            """
            extra_params.extend([from_dt, to_dt])
        elif schedule_type == "don_trong_ky":
            with conn_fm.cursor() as cur_fm:
                cur_fm.execute("SELECT DISTINCT code_customer FROM invoice WHERE time_create >= %s AND time_create <= %s AND id_status <> 12 AND (status_value IS NULL OR status_value NOT IN ('Đã huỷ', 'Đã hủy')) AND code_customer IS NOT NULL", (from_dt, to_dt))
                dk_customers = [r[0] for r in cur_fm.fetchall()]
            if not dk_customers:
                return {"total": 0, "page": page, "page_size": page_size, "total_pages": 0, "schedule_type": schedule_type, "data": []}
            dk_ph = ",".join(["%s"] * len(dk_customers))
            where_clause += f" AND kh.ma_kh IN ({dk_ph})"
            extra_params.extend(dk_customers)

        if ma_kh:
            where_clause += " AND kh.ma_kh ILIKE %s"
            extra_params.append(f"%{ma_kh}%")
        if ten_kh:
            where_clause += " AND kh.ten_khach_hang ILIKE %s"
            extra_params.append(f"%{ten_kh}%")
        if sdt:
            where_clause += " AND kh.sdt1 ILIKE %s"
            extra_params.append(f"%{sdt}%")

        base_params = list(id_accs) + extra_params

        order_logic = """
            CASE
                WHEN kh.ngay_hen_banhang IS NULL THEN kh.thoi_gian_cs_lai
                WHEN kh.thoi_gian_cs_lai IS NULL THEN kh.ngay_hen_banhang
                ELSE LEAST(kh.ngay_hen_banhang, kh.thoi_gian_cs_lai)
            END
        """

        with conn.cursor() as cur:
            count_q = f"SELECT COUNT(*) FROM khach_hang kh WHERE kh.id_acc IN ({acc_placeholders}) {where_clause}"
            cur.execute(count_q, tuple(base_params))
            total = cur.fetchone()[0]

            query = f"""
            SELECT kh.*, au.name as ten_nhan_vien
            FROM khach_hang kh
            LEFT JOIN account_users au ON au.id_acc = kh.id_acc
            WHERE kh.id_acc IN ({acc_placeholders}) {where_clause}
            ORDER BY {order_logic} ASC NULLS LAST
            LIMIT %s OFFSET %s
            """
            cur.execute(query, tuple(base_params + [page_size, offset]))
            columns = [desc[0] for desc in cur.description]
            customer_list = [dict(zip(columns, row)) for row in cur.fetchall()]

            for customer in customer_list:
                for k in ['thoi_gian_cs_lai', 'ngay_hen_banhang', 'ngay_sinh']:
                    if customer.get(k) and isinstance(customer[k], (datetime, date)):
                        customer[k] = customer[k].isoformat()

        return {
            "total": total, "page": page, "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
            "schedule_type": schedule_type, "data": customer_list
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sales-schedule-overview/nhan-vien")
async def get_sales_schedule_overview_nhan_vien(
    schedule_type: str = Query("all", description="all, ban_hang, cham_soc, chua_cau_hinh"),
    from_date: Optional[str] = Query(None, description="Từ ngày (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Đến ngày (YYYY-MM-DD)"),
    current_user: dict = Depends(check_token)
):
    """Danh sách nhân viên role_id=4 kèm số lượng khách hàng theo từng loại lịch."""
    try:
        from_dt, to_dt = get_date_range(from_date, to_date)

        with conn.cursor() as cur:
            where_clause = " AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL AND DATE(kh.thoi_gian_tao::timestamp) <= CURRENT_DATE"
            if schedule_type == "ban_hang":
                where_clause += " AND kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s"
                extra_params = [from_dt, to_dt]
            elif schedule_type == "cham_soc":
                where_clause += """
                    AND kh.thoi_gian_cs_lai >= %s AND kh.thoi_gian_cs_lai <= %s
                    AND NOT COALESCE(kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s, FALSE)
                    AND NOT COALESCE(kh.ngay_hen_banhang > NOW(), FALSE)
                """
                extra_params = [from_dt, to_dt, from_dt, to_dt]
            elif schedule_type == "chua_cau_hinh":
                where_clause += """
                    AND NOT COALESCE(kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s, FALSE)
                    AND NOT COALESCE(kh.thoi_gian_cs_lai >= %s AND kh.thoi_gian_cs_lai <= %s, FALSE)
                    AND NOT COALESCE(kh.ngay_hen_banhang > NOW(), FALSE)
                """
                extra_params = [from_dt, to_dt, from_dt, to_dt]
            elif schedule_type == "da_cau_hinh":
                where_clause += """
                    AND COALESCE(kh.ngay_hen_banhang > NOW(), FALSE)
                    AND NOT COALESCE(kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s, FALSE)
                """
                extra_params = [from_dt, to_dt]
            elif schedule_type == "don_trong_ky":
                with conn_fm.cursor() as cur_fm:
                    cur_fm.execute("SELECT DISTINCT code_customer FROM invoice WHERE time_create >= %s AND time_create <= %s AND id_status <> 12 AND (status_value IS NULL OR status_value NOT IN ('Đã huỷ', 'Đã hủy')) AND code_customer IS NOT NULL", (from_dt, to_dt))
                    dk_customers = [r[0] for r in cur_fm.fetchall()]
                if not dk_customers:
                    return {"data": [], "total": 0, "schedule_type": schedule_type}
                dk_ph = ",".join(["%s"] * len(dk_customers))
                where_clause += f" AND kh.ma_kh IN ({dk_ph})"
                extra_params = dk_customers
            else:  # all
                extra_params = []

            query = f"""
            SELECT
                au.id_acc,
                au.user_id as ma_nhan_vien,
                au.name as ten_nhan_vien,
                COUNT(kh.id_kh) as so_khach_hang
            FROM account_users au
            LEFT JOIN khach_hang kh ON kh.id_acc = au.id_acc {where_clause}
            WHERE au.role_id = 4 AND au.trang_thai = 'Đang làm'
            GROUP BY au.id_acc, au.user_id, au.name
            ORDER BY so_khach_hang DESC, au.name ASC
            """
            cur.execute(query, tuple(extra_params))
            columns = [desc[0] for desc in cur.description]
            rows = [dict(zip(columns, row)) for row in cur.fetchall()]

        return {"data": rows, "total": len(rows), "schedule_type": schedule_type}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sales-schedule-overview/nhan-vien/{id_acc}")
async def get_sales_schedule_overview_kh_nhan_vien(
    id_acc: int,
    schedule_type: str = Query("all", description="all, ban_hang, cham_soc, chua_cau_hinh"),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    ma_kh: Optional[str] = None,
    ten_kh: Optional[str] = None,
    sdt: Optional[str] = None,
    from_date: Optional[str] = Query(None, description="Từ ngày (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Đến ngày (YYYY-MM-DD)"),
    current_user: dict = Depends(check_token)
):
    """Danh sách khách hàng của một nhân viên cụ thể theo loại lịch."""
    try:
        from_dt, to_dt = get_date_range(from_date, to_date)
        offset = (page - 1) * page_size

        where_clause = " AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL AND DATE(kh.thoi_gian_tao::timestamp) <= CURRENT_DATE"
        extra_params: list = []

        if schedule_type == "ban_hang":
            where_clause += " AND kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s"
            extra_params.extend([from_dt, to_dt])
        elif schedule_type == "cham_soc":
            where_clause += """
                AND kh.thoi_gian_cs_lai >= %s AND kh.thoi_gian_cs_lai <= %s
                AND NOT COALESCE(kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s, FALSE)
                AND NOT COALESCE(kh.ngay_hen_banhang > NOW(), FALSE)
            """
            extra_params.extend([from_dt, to_dt, from_dt, to_dt])
        elif schedule_type == "chua_cau_hinh":
            where_clause += """
                AND NOT COALESCE(kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s, FALSE)
                AND NOT COALESCE(kh.thoi_gian_cs_lai >= %s AND kh.thoi_gian_cs_lai <= %s, FALSE)
                AND NOT COALESCE(kh.ngay_hen_banhang > NOW(), FALSE)
            """
            extra_params.extend([from_dt, to_dt, from_dt, to_dt])
        elif schedule_type == "da_cau_hinh":
            where_clause += """
                AND COALESCE(kh.ngay_hen_banhang > NOW(), FALSE)
                AND NOT COALESCE(kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s, FALSE)
            """
            extra_params.extend([from_dt, to_dt])
        elif schedule_type == "don_trong_ky":
            with conn_fm.cursor() as cur_fm:
                cur_fm.execute("SELECT DISTINCT code_customer FROM invoice WHERE time_create >= %s AND time_create <= %s AND id_status <> 12 AND (status_value IS NULL OR status_value NOT IN ('Đã huỷ', 'Đã hủy')) AND code_customer IS NOT NULL", (from_dt, to_dt))
                dk_customers = [r[0] for r in cur_fm.fetchall()]
            if not dk_customers:
                with conn.cursor() as cur:
                    cur.execute("SELECT id_acc, user_id as ma_nhan_vien, name as ten_nhan_vien FROM account_users WHERE id_acc = %s", (id_acc,))
                    nv_row = cur.fetchone()
                    nv_info = dict(zip(["id_acc", "ma_nhan_vien", "ten_nhan_vien"], nv_row)) if nv_row else {}
                return {
                    "total": 0, "page": page, "page_size": page_size, "total_pages": 0,
                    "schedule_type": schedule_type, "nhan_vien": nv_info, "data": []
                }
            dk_ph = ",".join(["%s"] * len(dk_customers))
            where_clause += f" AND kh.ma_kh IN ({dk_ph})"
            extra_params.extend(dk_customers)

        if ma_kh:
            where_clause += " AND kh.ma_kh ILIKE %s"
            extra_params.append(f"%{ma_kh}%")
        if ten_kh:
            where_clause += " AND kh.ten_khach_hang ILIKE %s"
            extra_params.append(f"%{ten_kh}%")
        if sdt:
            where_clause += " AND kh.sdt1 ILIKE %s"
            extra_params.append(f"%{sdt}%")

        base_params = [id_acc] + extra_params

        order_logic = """
            CASE
                WHEN kh.ngay_hen_banhang IS NULL THEN kh.thoi_gian_cs_lai
                WHEN kh.thoi_gian_cs_lai IS NULL THEN kh.ngay_hen_banhang
                ELSE LEAST(kh.ngay_hen_banhang, kh.thoi_gian_cs_lai)
            END
        """

        with conn.cursor() as cur:
            count_q = f"SELECT COUNT(*) FROM khach_hang kh WHERE kh.id_acc = %s {where_clause}"
            cur.execute(count_q, tuple(base_params))
            total = cur.fetchone()[0]

            query = f"""
            SELECT kh.*, au.name as ten_nhan_vien
            FROM khach_hang kh
            LEFT JOIN account_users au ON au.id_acc = kh.id_acc
            WHERE kh.id_acc = %s {where_clause}
            ORDER BY {order_logic} ASC NULLS LAST
            LIMIT %s OFFSET %s
            """
            cur.execute(query, tuple(base_params + [page_size, offset]))
            columns = [desc[0] for desc in cur.description]
            customer_list = [dict(zip(columns, row)) for row in cur.fetchall()]

            for customer in customer_list:
                for k in ['thoi_gian_cs_lai', 'ngay_hen_banhang', 'ngay_sinh']:
                    if customer.get(k) and isinstance(customer[k], (datetime, date)):
                        customer[k] = customer[k].isoformat()

        # Lấy thông tin nhân viên
        with conn.cursor() as cur:
            cur.execute("SELECT id_acc, user_id as ma_nhan_vien, name as ten_nhan_vien FROM account_users WHERE id_acc = %s", (id_acc,))
            nv_row = cur.fetchone()
            nv_info = dict(zip(["id_acc", "ma_nhan_vien", "ten_nhan_vien"], nv_row)) if nv_row else {}

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
            "schedule_type": schedule_type,
            "nhan_vien": nv_info,
            "data": customer_list,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sales-schedule-overview/ket-qua-ban-hang/nhan-vien")
async def get_sales_schedule_overview_ket_qua_nhan_vien(
    from_date: Optional[str] = Query(None, description="Từ ngày (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Đến ngày (YYYY-MM-DD)"),
    current_user: dict = Depends(check_token)
):
    """Kết quả bán hàng theo từng nhân viên role_id=4."""
    try:
        from_dt, to_dt = get_date_range(from_date, to_date)

        # Lấy danh sách nhân viên role_id=4
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id_acc, user_id, name FROM account_users WHERE role_id = 4 AND trang_thai = 'Đang làm' ORDER BY name ASC"
            )
            employees = [{"id_acc": r[0], "user_id": r[1], "name": r[2]} for r in cur.fetchall()]

        if not employees:
            return {"data": []}

        rows = []
        for emp in employees:
            id_acc = emp["id_acc"]
            user_id = emp["user_id"]  # = code_seller

            # Số KH có lịch BH trong khoảng
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT ma_kh FROM khach_hang kh
                    WHERE kh.id_acc = %s AND kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s
                    AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL AND DATE(kh.thoi_gian_tao::timestamp) <= CURRENT_DATE
                    UNION
                    SELECT k.ma_kh 
                    FROM khach_hang_schedule_log l
                    JOIN khach_hang k ON l.id_kh = k.id_kh
                    WHERE k.id_acc = %s 
                      AND l.old_ngay_hen_banhang >= %s AND l.old_ngay_hen_banhang <= %s
                      AND l.updated_at >= %s
                      AND COALESCE(NULLIF(TRIM(k.thoi_gian_tao::text), ''), NULL) IS NOT NULL AND DATE(k.thoi_gian_tao::timestamp) <= CURRENT_DATE
                    """,
                    (id_acc, from_dt, to_dt, id_acc, from_dt, to_dt, from_dt)
                )
                ma_kh_list = [r[0] for r in cur.fetchall()]
                
                cur.execute(
                    """
                    SELECT ma_kh FROM khach_hang kh
                    WHERE kh.id_acc = %s AND kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s
                    AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL AND DATE(kh.thoi_gian_tao::timestamp) <= CURRENT_DATE
                    """,
                    (id_acc, from_dt, to_dt)
                )
                so_khach_hang_hien_tai = len(cur.fetchall())

            so_khach_hang = len(ma_kh_list)
            so_don = 0
            gmv = 0.0
            so_don_thuc_te = 0

            if user_id:
                try:
                    with conn_fm.cursor() as cur_fm:
                        # Đơn từ KH có lịch BH
                        if ma_kh_list:
                            kh_ph = ",".join(["%s"] * len(ma_kh_list))
                            cur_fm.execute(
                                f"""SELECT COUNT(*), COALESCE(SUM(subtotal), 0)
                                FROM invoice
                                WHERE time_create >= %s AND time_create <= %s
                                  AND id_status <> 12 AND (status_value IS NULL OR status_value NOT IN ('Đã huỷ', 'Đã hủy'))
                                  AND code_customer IN ({kh_ph})""",
                                [from_dt, to_dt] + ma_kh_list
                            )
                            row = cur_fm.fetchone()
                            so_don = int(row[0]) if row else 0
                            gmv = float(row[1]) if row else 0.0

                        # Tổng đơn thực tế theo code_seller
                        cur_fm.execute(
                            """SELECT COUNT(*) FROM invoice
                            WHERE time_create >= %s AND time_create <= %s
                              AND id_status <> 12 AND (status_value IS NULL OR status_value NOT IN ('Đã huỷ', 'Đã hủy'))
                              AND code_seller = %s""",
                            (from_dt, to_dt, user_id)
                        )
                        row_total = cur_fm.fetchone()
                        so_don_thuc_te = int(row_total[0]) if row_total else 0
                except Exception:
                    pass

            aov = round(gmv / so_don) if so_don > 0 else 0
            ti_le = round(so_don / so_khach_hang * 100, 2) if so_khach_hang > 0 else 0.0
            ti_le_tong = round(so_don_thuc_te / so_khach_hang * 100, 2) if so_khach_hang > 0 else 0.0

            rows.append({
                "id_acc": id_acc,
                "ma_nhan_vien": user_id or "",
                "ten_nhan_vien": emp["name"],
                "so_khach_hang": so_khach_hang,
                "so_khach_hang_hien_tai": so_khach_hang_hien_tai,
                "so_don": so_don,
                "gmv": int(gmv),
                "aov": aov,
                "ti_le_chot_lich": ti_le,
                "so_don_thuc_te": so_don_thuc_te,
                "ti_le_tong": ti_le_tong,
            })

        # Sắp xếp theo gmv DESC
        rows.sort(key=lambda x: x["gmv"], reverse=True)
        return {"data": rows}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sales-schedule-overview/ket-qua-ban-hang")
async def get_sales_schedule_overview_ket_qua(
    from_date: Optional[str] = Query(None, description="Từ ngày (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Đến ngày (YYYY-MM-DD)"),
    current_user: dict = Depends(check_token)
):
    """Kết quả bán hàng tổng hợp cho tất cả nhân viên role_id=4."""
    try:
        from_dt, to_dt = get_date_range(from_date, to_date)
        id_accs = get_role4_id_accs()

        empty = {
            "so_khach_hang": 0, "so_don": 0, "gmv": 0, "aov": 0,
            "ti_le_chot_lich": 0.0, "so_don_thuc_te": 0, "ti_le_tong": 0.0
        }

        if not id_accs:
            return empty

        acc_placeholders = ",".join(["%s"] * len(id_accs))

        # Bước 1: Lấy tất cả code_seller từ account_users cho role_id=4
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT user_id FROM account_users WHERE id_acc IN ({acc_placeholders}) AND user_id IS NOT NULL",
                tuple(id_accs)
            )
            code_sellers = [r[0] for r in cur.fetchall()]

        # Bước 2: Lấy id_seller list từ FM
        id_sellers: list = []
        if code_sellers:
            cs_ph = ",".join(["%s"] * len(code_sellers))
            with conn_fm.cursor() as cur_fm:
                cur_fm.execute(
                    f"SELECT DISTINCT id_seller FROM invoice WHERE code_seller IN ({cs_ph}) AND id_seller IS NOT NULL",
                    tuple(code_sellers)
                )
                id_sellers = [r[0] for r in cur_fm.fetchall()]

        # Bước 3: Lấy danh sách KH có lịch BH trong khoảng ngày (tất cả role_id=4)
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT ma_kh FROM khach_hang kh WHERE kh.id_acc IN ({acc_placeholders}) AND kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL AND DATE(kh.thoi_gian_tao::timestamp) <= CURRENT_DATE",
                tuple(id_accs) + (from_dt, to_dt)
            )
            ma_kh_list = [r[0] for r in cur.fetchall()]

        so_khach_hang = len(ma_kh_list)
        so_don = 0
        gmv = 0.0
        so_don_thuc_te = 0

        with conn_fm.cursor() as cur_fm:
            if ma_kh_list:
                kh_ph = ",".join(["%s"] * len(ma_kh_list))
                cur_fm.execute(
                    f"""SELECT COUNT(*), COALESCE(SUM(subtotal), 0)
                    FROM invoice
                    WHERE time_create >= %s AND time_create <= %s
                      AND id_status <> 12 AND (status_value IS NULL OR status_value NOT IN ('Đã huỷ', 'Đã hủy'))
                      AND code_customer IN ({kh_ph})""",
                    [from_dt, to_dt] + ma_kh_list
                )
                row_don = cur_fm.fetchone()
                so_don = int(row_don[0]) if row_don else 0
                gmv = float(row_don[1]) if row_don else 0.0

            if id_sellers:
                sel_ph = ",".join(["%s"] * len(id_sellers))
                cur_fm.execute(
                    f"""SELECT COUNT(*) FROM invoice
                    WHERE time_create >= %s AND time_create <= %s
                      AND id_status <> 12 AND (status_value IS NULL OR status_value NOT IN ('Đã huỷ', 'Đã hủy'))
                      AND id_seller IN ({sel_ph})""",
                    [from_dt, to_dt] + id_sellers
                )
                row_total = cur_fm.fetchone()
                so_don_thuc_te = int(row_total[0]) if row_total else 0

        aov = round(gmv / so_don) if so_don > 0 else 0
        ti_le_chot_lich = round(so_don / so_khach_hang * 100, 2) if so_khach_hang > 0 else 0.0
        ti_le_tong = round(so_don_thuc_te / so_khach_hang * 100, 2) if so_khach_hang > 0 else 0.0

        return {
            "so_khach_hang": so_khach_hang,
            "so_don": so_don,
            "gmv": int(gmv),
            "aov": aov,
            "ti_le_chot_lich": ti_le_chot_lich,
            "so_don_thuc_te": so_don_thuc_te,
            "ti_le_tong": ti_le_tong
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from zoneinfo import ZoneInfo
HCM_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

def get_date_range(from_date_str: Optional[str], to_date_str: Optional[str]):
    """Tính toán khoảng ngày từ from_date đến to_date, mặc định là hôm nay"""
    today = datetime.now(HCM_TZ)

    if from_date_str:
        try:
            from_dt = datetime.strptime(from_date_str, "%Y-%m-%d").replace(tzinfo=HCM_TZ)
        except ValueError:
            from_dt = today
    else:
        from_dt = today

    if to_date_str:
        try:
            to_dt = datetime.strptime(to_date_str, "%Y-%m-%d").replace(tzinfo=HCM_TZ)
        except ValueError:
            to_dt = from_dt
    else:
        to_dt = from_dt

    from_dt = from_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    to_dt = to_dt.replace(hour=23, minute=59, second=59, microsecond=999999)

    return from_dt, to_dt

@router.get("/cskh-schedule")
async def get_cskh_schedule(
    schedule_type: str = Query("all", description="all, ban_hang, cham_soc, chua_cau_hinh"),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    ma_kh: Optional[str] = None,
    ten_kh: Optional[str] = None,
    sdt: Optional[str] = None,
    from_date: Optional[str] = Query(None, description="Từ ngày (YYYY-MM-DD), mặc định hôm nay"),
    to_date: Optional[str] = Query(None, description="Đến ngày (YYYY-MM-DD), mặc định from_date"),
    current_user: dict = Depends(check_token)
):
    try:
        id_acc = current_user.get("id_acc") or current_user.get("user_id")
        offset = (page - 1) * page_size

        from_dt, to_dt = get_date_range(from_date, to_date)

        where_clause = " AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL AND DATE(kh.thoi_gian_tao::timestamp) <= CURRENT_DATE"
        params = []

        # 1. Lịch Bán Hàng: ngay_hen_banhang nằm trong khoảng
        if schedule_type == "ban_hang":
            where_clause += """
                AND kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s
            """
            params.extend([from_dt, to_dt])

        # 2. Lịch Chăm Sóc: thoi_gian_cs_lai trong khoảng VÀ ngay_hen_banhang KHÔNG trong khoảng
        elif schedule_type == "cham_soc":
            where_clause += """
                AND kh.thoi_gian_cs_lai >= %s AND kh.thoi_gian_cs_lai <= %s
                AND NOT COALESCE(kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s, FALSE)
                AND NOT COALESCE(kh.ngay_hen_banhang > NOW(), FALSE)
            """
            params.extend([from_dt, to_dt, from_dt, to_dt])

        # 3. Chưa cấu hình: không có lịch nào trong khoảng VÀ không có lịch BH tương lai
        elif schedule_type == "chua_cau_hinh":
            where_clause += """
                AND NOT COALESCE(kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s, FALSE)
                AND NOT COALESCE(kh.thoi_gian_cs_lai >= %s AND kh.thoi_gian_cs_lai <= %s, FALSE)
                AND NOT COALESCE(kh.ngay_hen_banhang > NOW(), FALSE)
            """
            params.extend([from_dt, to_dt, from_dt, to_dt])

        # 4. Đã cấu hình: lịch BH tương lai và không nằm trong khoảng chốt/phản hồi
        elif schedule_type == "da_cau_hinh":
            where_clause += """
                AND COALESCE(kh.ngay_hen_banhang > NOW(), FALSE)
                AND NOT COALESCE(kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s, FALSE)
            """
            params.extend([from_dt, to_dt])

        # 4. all: không filter thêm
        if ma_kh:
            where_clause += " AND kh.ma_kh ILIKE %s"
            params.append(f"%{ma_kh}%")
        if ten_kh:
            where_clause += " AND kh.ten_khach_hang ILIKE %s"
            params.append(f"%{ten_kh}%")
        if sdt:
            where_clause += " AND kh.sdt1 ILIKE %s"
            params.append(f"%{sdt}%")

        with conn.cursor() as cur:
            count_query = f"SELECT COUNT(*) as total FROM khach_hang kh WHERE kh.id_acc = %s {where_clause}"
            cur.execute(count_query, tuple([id_acc] + params))
            total = cur.fetchone()[0]

            order_logic = """
                CASE
                    WHEN kh.ngay_hen_banhang IS NULL THEN kh.thoi_gian_cs_lai
                    WHEN kh.thoi_gian_cs_lai IS NULL THEN kh.ngay_hen_banhang
                    ELSE LEAST(kh.ngay_hen_banhang, kh.thoi_gian_cs_lai)
                END
            """

            query = f"""
            SELECT kh.* FROM khach_hang kh
            WHERE kh.id_acc = %s {where_clause}
            ORDER BY {order_logic} ASC NULLS LAST
            LIMIT %s OFFSET %s
            """

            cur.execute(query, tuple([id_acc] + params + [page_size, offset]))
            columns = [desc[0] for desc in cur.description]
            customer_list = [dict(zip(columns, row)) for row in cur.fetchall()]

            for customer in customer_list:
                for k in ['thoi_gian_cs_lai', 'ngay_hen_banhang', 'ngay_sinh']:
                    if customer.get(k) and isinstance(customer[k], (datetime, date)):
                        customer[k] = customer[k].isoformat()

            return {
                "total": total, "page": page, "page_size": page_size,
                "total_pages": (total + page_size - 1) // page_size,
                "schedule_type": schedule_type, "data": customer_list
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cskh-schedule/stats")
async def get_cskh_stats(
    from_date: Optional[str] = Query(None, description="Từ ngày (YYYY-MM-DD), mặc định hôm nay"),
    to_date: Optional[str] = Query(None, description="Đến ngày (YYYY-MM-DD), mặc định from_date"),
    current_user: dict = Depends(check_token)
):
    try:
        id_acc = current_user.get("id_acc") or current_user.get("user_id")
        from_dt, to_dt = get_date_range(from_date, to_date)

        with conn.cursor() as cur:
            # Ưu tiên: Lịch BH > Lịch CS > Đã cấu hình > Chưa cấu hình
            query = """
            WITH CustomerStatus AS (
                SELECT
                    id_kh,
                    CASE
                        -- Ưu tiên 1: Lịch Bán Hàng trong khoảng
                        WHEN (ngay_hen_banhang >= %s AND ngay_hen_banhang <= %s)
                        THEN 'lich_ban_hang'

                        -- Ưu tiên 2: Đã cấu hình (lịch BH tương lai)
                        WHEN ngay_hen_banhang > NOW()
                        THEN 'da_cau_hinh'

                        -- Ưu tiên 3: Lịch Chăm Sóc trong khoảng (và không có lịch BH hay đã cấu hình)
                        WHEN (thoi_gian_cs_lai >= %s AND thoi_gian_cs_lai <= %s)
                        THEN 'lich_cham_soc'

                        -- Còn lại: Chưa cấu hình
                        ELSE 'chua_cau_hinh'
                    END as status
                FROM khach_hang kh
                WHERE kh.id_acc = %s
                AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                AND DATE(kh.thoi_gian_tao::timestamp) <= CURRENT_DATE
            )
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'lich_ban_hang') as lich_ban_hang_count,
                COUNT(*) FILTER (WHERE status = 'lich_cham_soc') as lich_cham_soc_count,
                COUNT(*) FILTER (WHERE status = 'chua_cau_hinh') as chua_cau_hinh_count,
                COUNT(*) FILTER (WHERE status = 'da_cau_hinh') as da_cau_hinh_count
            FROM CustomerStatus;
            """

            cur.execute(query, (
                from_dt, to_dt,   # Lịch Bán Hàng
                from_dt, to_dt,   # Lịch Chăm Sóc
                id_acc
            ))

            result = cur.fetchone()

            return {
                "total": result[0] or 0,
                "lich_ban_hang": result[1] or 0,
                "lich_cham_soc": result[2] or 0,
                "chua_cau_hinh": result[3] or 0,
                "da_cau_hinh": result[4] or 0,
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cskh-schedule/ket-qua-ban-hang")
async def get_ket_qua_ban_hang(
    from_date: Optional[str] = Query(None, description="Từ ngày (YYYY-MM-DD), mặc định hôm nay"),
    to_date: Optional[str] = Query(None, description="Đến ngày (YYYY-MM-DD), mặc định from_date"),
    current_user: dict = Depends(check_token)
):
    """Thống kê kết quả bán hàng theo lịch BH của nhân viên đang đăng nhập."""
    try:
        id_acc = current_user.get("id_acc") or current_user.get("user_id")

        from_dt, to_dt = get_date_range(from_date, to_date)
        from_date_only = from_dt.date()
        to_date_only = to_dt.date()

        empty = {
            "so_khach_hang": 0, "so_don": 0, "gmv": 0, "aov": 0,
            "ti_le_chot_lich": 0.0, "so_don_thuc_te": 0, "ti_le_tong": 0.0
        }

        # Bước 1: Lấy code_seller (user_id) từ account_users
        with conn.cursor() as cur:
            cur.execute("SELECT user_id FROM account_users WHERE id_acc = %s LIMIT 1", (id_acc,))
            row = cur.fetchone()
        if not row or not row[0]:
            return empty
        code_seller = row[0]

        # Bước 2: Lấy id_seller từ FM
        with conn_fm.cursor() as cur_fm:
            cur_fm.execute(
                "SELECT id_seller FROM invoice WHERE code_seller = %s AND id_seller IS NOT NULL LIMIT 1",
                (code_seller,)
            )
            row_fm = cur_fm.fetchone()
        id_seller = row_fm[0] if row_fm else None

        # Bước 3: Lấy danh sách KH có lịch bán hàng trong khoảng ngày
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT ma_kh FROM khach_hang WHERE id_acc = %s AND ngay_hen_banhang >= %s AND ngay_hen_banhang <= %s
                UNION
                SELECT k.ma_kh 
                FROM khach_hang_schedule_log l
                JOIN khach_hang k ON l.id_kh = k.id_kh
                WHERE k.id_acc = %s 
                  AND l.old_ngay_hen_banhang >= %s AND l.old_ngay_hen_banhang <= %s
                  AND l.updated_at >= %s
                """,
                (id_acc, from_dt, to_dt, id_acc, from_dt, to_dt, from_dt)
            )
            ma_kh_list = [r[0] for r in cur.fetchall()]
            
            cur.execute(
                """
                SELECT ma_kh FROM khach_hang
                WHERE id_acc = %s AND ngay_hen_banhang >= %s AND ngay_hen_banhang <= %s
                """,
                (id_acc, from_dt, to_dt)
            )
            so_khach_hang_hien_tai = len(cur.fetchall())

        so_khach_hang = len(ma_kh_list)
        so_don = 0
        gmv = 0.0
        so_don_thuc_te = 0

        if id_seller:
            with conn_fm.cursor() as cur_fm:
                # Đơn từ KH có lịch bán hàng hôm nay
                if ma_kh_list:
                    placeholders = ",".join(["%s"] * len(ma_kh_list))
                    cur_fm.execute(
                        f"""SELECT COUNT(*), COALESCE(SUM(subtotal), 0)
                        FROM invoice
                        WHERE time_create >= %s AND time_create <= %s
                          AND id_status <> 12 AND (status_value IS NULL OR status_value NOT IN ('Đã huỷ', 'Đã hủy'))
                          AND code_customer IN ({placeholders})""",
                        [from_dt, to_dt] + ma_kh_list
                    )
                    row_don = cur_fm.fetchone()
                    so_don = int(row_don[0]) if row_don else 0
                    gmv = float(row_don[1]) if row_don else 0.0

                # Tổng đơn thực tế của seller trong khoảng ngày
                cur_fm.execute(
                    """SELECT COUNT(*) FROM invoice
                    WHERE time_create >= %s AND time_create <= %s AND id_status <> 12 AND (status_value IS NULL OR status_value NOT IN ('Đã huỷ', 'Đã hủy')) AND id_seller = %s""",
                    (from_dt, to_dt, id_seller)
                )
                row_total = cur_fm.fetchone()
                so_don_thuc_te = int(row_total[0]) if row_total else 0

        aov = round(gmv / so_don) if so_don > 0 else 0
        ti_le_chot_lich = round(so_don / so_khach_hang * 100, 2) if so_khach_hang > 0 else 0.0
        ti_le_tong = round(so_don_thuc_te / so_khach_hang * 100, 2) if so_khach_hang > 0 else 0.0

        return {
            "so_khach_hang": so_khach_hang,
            "so_khach_hang_hien_tai": so_khach_hang_hien_tai,
            "so_don": so_don,
            "gmv": int(gmv),
            "aov": aov,
            "ti_le_chot_lich": ti_le_chot_lich,
            "so_don_thuc_te": so_don_thuc_te,
            "ti_le_tong": ti_le_tong
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# from typing import Optional, List, Dict, Any
# from database import conn
# from utils.security import check_token

# router = APIRouter()


# @router.get("/cskh-schedule")
# async def get_cskh_schedule(
#     filter_type: str = Query("all", description="Filter type: all, overdue, today, upcoming"),
#     page: int = Query(1, ge=1),
#     page_size: int = Query(30, ge=1, le=100),
#     ma_kh: Optional[str] = Query(None, description="Lọc theo mã khách hàng"),
#     ten_kh: Optional[str] = Query(None, description="Lọc theo tên khách hàng"),
#     sdt: Optional[str] = Query(None, description="Lọc theo số điện thoại"),
#     thoi_gian: Optional[str] = Query(None, description="Lọc theo ngày cụ thể (YYYY-MM-DD)"),
#     current_user: dict = Depends(check_token)
# ):

#     try:
#         # Lấy id_acc từ token (ID của account đăng nhập)
#         id_acc = current_user.get("id_acc")
#         user_id = current_user.get("user_id")  # Mã nhân viên (backup)
        
#         if not id_acc:
#             id_acc = user_id  # Nếu không có id_acc, dùng user_id
        
#         offset = (page - 1) * page_size
        
#         # Lấy ngày hiện tại
#         today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
#         today_end = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)
#         tomorrow_start = today_end + timedelta(seconds=1)  # Bắt đầu ngày mai
        
#         # Build WHERE clause based on filter type
#         where_clause = ""
#         params = []
        
#         if filter_type == "overdue":
#             where_clause = """
#                 AND (
#                     (kh.thoi_gian_cs_lai < %s AND kh.thoi_gian_cs_lai IS NOT NULL) 
#                     OR 
#                     (kh.ngay_hen_banhang < %s AND kh.ngay_hen_banhang IS NOT NULL)
#                 )
#             """
#             params.extend([today_start, today_start])
            
#         elif filter_type == "today":
#             where_clause = """
#                 AND (
#                     (kh.thoi_gian_cs_lai >= %s AND kh.thoi_gian_cs_lai <= %s) 
#                     OR 
#                     (kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s)
#                 )
#             """
#             params.extend([today_start, today_end, today_start, today_end])
            
#         elif filter_type == "upcoming":
#             where_clause = """
#                 AND (
#                     kh.thoi_gian_cs_lai > %s 
#                     OR 
#                     kh.ngay_hen_banhang > %s
#                 )
#             """
#             params.extend([today_end, today_end])
            
#         else: # filter_type == "all"
#             # Thường "all" có nghĩa là lấy những khách ĐANG CÓ ÍT NHẤT 1 LỊCH (CS hoặc BH)
#             where_clause = "AND (kh.thoi_gian_cs_lai IS NOT NULL OR kh.ngay_hen_banhang IS NOT NULL)"
        
#         if ma_kh:
#             where_clause += " AND kh.ma_kh ILIKE %s"
#             params.append(f"%{ma_kh}%")
            
#         if ten_kh:
#             where_clause += " AND kh.ten_khach_hang ILIKE %s"
#             params.append(f"%{ten_kh}%")
            
#         if sdt:
#             where_clause += " AND kh.sdt1 ILIKE %s" 
#             params.append(f"%{sdt}%")
            
#         if thoi_gian:
#             where_clause += " AND (DATE(kh.thoi_gian_cs_lai) = %s OR DATE(kh.ngay_hen_banhang) = %s)"
#             params.extend([thoi_gian, thoi_gian])
        
#         with conn.cursor() as cur:
#             # Get total count with filter (lọc theo id_acc)
#             count_query = f"""
#             SELECT COUNT(*) as total 
#             FROM khach_hang kh
#             WHERE kh.id_acc = %s {where_clause}
#             """
#             cur.execute(count_query, tuple([id_acc] + params))
#             total = cur.fetchone()[0]
            
#             order_logic = """
#                 CASE 
#                     WHEN kh.thoi_gian_cs_lai IS NULL THEN kh.ngay_hen_banhang
#                     WHEN kh.ngay_hen_banhang IS NULL THEN kh.thoi_gian_cs_lai
#                     ELSE LEAST(kh.thoi_gian_cs_lai, kh.ngay_hen_banhang)
#                 END
#             """
        
#             # Get customers with pagination
#             query = f"""
#             SELECT 
#                 kh.id_kh,
#                 kh.ma_kh,
#                 kh.ten_khach_hang,
#                 kh.sdt1,
#                 kh.dia_chi,
#                 kh.ngay_sinh,
#                 kh.gioi_tinh,
#                 kh.nghe_nghiep,
#                 kh.nhom_kh,
#                 kh.trang_thai,
#                 kh.id_acc,
#                 kh.thoi_gian_cs_lai,
#                 kh.ngay_hen_banhang,
#                 kh.tan_suat_mua,
#                 kh.ghi_chu,
#                 kh.gmv,
#                 kh.nhan_vien_pt
#             FROM khach_hang kh
#             WHERE kh.id_acc = %s {where_clause}
#             ORDER BY {order_logic} ASC NULLS LAST
#             LIMIT %s OFFSET %s
#             """
            
#             cur.execute(query, tuple([id_acc] + params + [page_size, offset]))
#             customers = cur.fetchall()

#             columns = [desc[0] for desc in cur.description]
#             customer_list = [dict(zip(columns, row)) for row in customers]
            
#             # Convert datetime to string for JSON serialization
#             for customer in customer_list:
#                 if customer.get("thoi_gian_cs_lai"):
#                     customer["thoi_gian_cs_lai"] = customer["thoi_gian_cs_lai"].isoformat()
#                 if customer.get("ngay_hen_banhang"):
#                     customer["ngay_hen_banhang"] = customer["ngay_hen_banhang"].isoformat()
#                 if customer.get("ngay_sinh"):
#                     customer["ngay_sinh"] = customer["ngay_sinh"].isoformat() if isinstance(customer["ngay_sinh"], (datetime, date)) else customer["ngay_sinh"]
            
#             return {
#                 "total": total,
#                 "page": page,
#                 "page_size": page_size,
#                 "total_pages": (total + page_size - 1) // page_size,
#                 "filter_type": filter_type,
#                 "data": customer_list
#             }
            
#     except Exception as e:
#         print(f"❌ Lỗi khi lấy lịch CSKH: {str(e)}")
#         raise HTTPException(
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             detail=f"Lỗi khi lấy lịch CSKH: {str(e)}"
#         )


# @router.get("/cskh-schedule/stats")
# async def get_cskh_stats(
#     current_user: dict = Depends(check_token)
# ):
#     """
#     Lấy thống kê số lượng khách hàng theo từng loại
#     """
#     try:
#         id_acc = current_user.get("id_acc")
#         user_id = current_user.get("user_id")  # Mã nhân viên (backup)
        
#         if not id_acc:
#             id_acc = user_id
        
#         today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
#         today_end = datetime.now().replace(hour=23, minute=59, second=59, microsecond=999999)
        
#         with conn.cursor() as cur:
#             query = f"""
#             SELECT 
#                 -- Tổng số: Chỉ đếm những người CÓ ÍT NHẤT 1 TRONG 2 LỊCH
#                 COUNT(*) as total,
                
#                 -- Quá hạn: CS quá hạn (bao gồm cả chưa có lịch) HOẶC BH quá hạn
#                 -- (Lưu ý: Logic đếm overdue cũ của bạn đang cộng cả những người NULL. Tôi giữ nguyên logic đó)
#                 COUNT(*) FILTER (
#                     WHERE (kh.thoi_gian_cs_lai < %s OR kh.thoi_gian_cs_lai IS NULL) 
#                     OR (kh.ngay_hen_banhang < %s OR kh.ngay_hen_banhang IS NULL)
#                 ) as overdue,
                
#                 -- Hôm nay: CS hôm nay HOẶC BH hôm nay
#                 COUNT(*) FILTER (
#                     WHERE (kh.thoi_gian_cs_lai >= %s AND kh.thoi_gian_cs_lai <= %s) 
#                     OR (kh.ngay_hen_banhang >= %s AND kh.ngay_hen_banhang <= %s)
#                 ) as today,
                
#                 -- Sắp tới: CS sắp tới HOẶC BH sắp tới
#                 COUNT(*) FILTER (
#                     WHERE kh.thoi_gian_cs_lai > %s 
#                     OR kh.ngay_hen_banhang > %s
#                 ) as upcoming
                
#             FROM khach_hang kh
#             WHERE kh.id_acc = %s
#             """
            
#             cur.execute(query, (
#                 today_start, today_start,            # Cho overdue
#                 today_start, today_end, today_start, today_end, # Cho today
#                 today_end, today_end,                # Cho upcoming
#                 id_acc                               # Cho WHERE chính
#             ))
             
#             result = cur.fetchone()
            
#             return {
#                 "total": result[0] or 0,
#                 "overdue": result[1] or 0,
#                 "today": result[2] or 0,
#                 "upcoming": result[3] or 0
#             }
            
#     except Exception as e:
#         print(f"❌ Lỗi khi lấy thống kê CSKH: {str(e)}")
#         raise HTTPException(
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             detail=f"Lỗi khi lấy thống kê CSKH: {str(e)}"
#         )
