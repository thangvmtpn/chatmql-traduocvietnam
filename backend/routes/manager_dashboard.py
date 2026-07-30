from datetime import date, datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from database import conn_fm
from utils.security import check_token
from model.users import get_user_by_id_acc

router = APIRouter()

@router.get("/dashboard/manager/overview")
async def get_manager_overview(
    from_date: Optional[str] = Query(None, description="Ngày bắt đầu (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Ngày kết thúc (YYYY-MM-DD)"),
    token: dict = Depends(check_token)
):
    try:
        from database import conn
        
        id_acc = token.get("id_acc")
        user_info = await get_user_by_id_acc(id_acc)
        if not user_info or user_info.get("role_id") != 2:
            raise HTTPException(status_code=403, detail="Không có quyền Manager")
            
        sub_account = user_info.get("sub_account") or []
        if not sub_account:
            # Nếu không có cấp dưới
            return {
                "so_khach_hang_phu_trach_dau_ky": 0,
                "so_khach_hang_phu_trach_cuoi_ky": 0,
                "so_don_hang_dau_ky": 0,
                "so_don_hang_cuoi_ky": 0,
                "gmv_dau_ky": 0, "gmv_cuoi_ky": 0,
                "gmv_truoc_2026_dau_ky": 0, "gmv_truoc_2026_cuoi_ky": 0,
                "don_hang_truoc_2026_dau_ky": 0, "don_hang_truoc_2026_cuoi_ky": 0,
                "arpu_dau_ky": 0, "arpu_cuoi_ky": 0,
                "pf_dau_ky": 0, "pf_cuoi_ky": 0,
                "from_date": from_date, "to_date": to_date
            }

        if not from_date or not to_date:
            today = date.today()
            from_date = today.strftime("%Y-%m-%d")
            to_date = today.strftime("%Y-%m-%d")
            
        start_date = datetime.strptime(from_date, "%Y-%m-%d").date()
        day_before_start = (start_date - timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Đếm số khách hàng của cấp dưới
        sql_customers_start = """
            SELECT COUNT(*) FROM khach_hang kh
            INNER JOIN account_users au ON kh.id_acc = au.id_acc
            WHERE au.trang_thai = 'Đang làm' 
                AND kh.id_acc = ANY(%s)
                AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                AND DATE(kh.thoi_gian_tao::timestamp) <= %s;
        """
        sql_customers_end = """
            SELECT COUNT(*) FROM khach_hang kh
            INNER JOIN account_users au ON kh.id_acc = au.id_acc
            WHERE au.trang_thai = 'Đang làm' 
                AND kh.id_acc = ANY(%s)
                AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                AND DATE(kh.thoi_gian_tao::timestamp) <= %s;
        """
        
        sql_customer_codes = "SELECT ma_kh FROM khach_hang WHERE id_acc = ANY(%s) AND ma_kh IS NOT NULL"
        
        with conn.cursor() as cur:
            cur.execute(sql_customers_start, (sub_account, day_before_start))
            so_khach_hang_phu_trach_dau_ky = cur.fetchone()[0] or 0
            
            cur.execute(sql_customers_end, (sub_account, to_date))
            so_khach_hang_phu_trach_cuoi_ky = cur.fetchone()[0] or 0
            
            cur.execute(sql_customer_codes, (sub_account,))
            customer_codes = [row[0] for row in cur.fetchall()]
            
        so_don_hang_dau_ky = 0
        gmv_dau_ky = 0
        gmv_truoc_2026_dau_ky = 0
        don_hang_truoc_2026_dau_ky = 0
        so_don_hang_cuoi_ky = 0
        gmv_cuoi_ky = 0
        gmv_truoc_2026_cuoi_ky = 0
        don_hang_truoc_2026_cuoi_ky = 0
        
        if customer_codes:
            placeholders = ','.join(['%s'] * len(customer_codes))
            customer_condition = f"code_customer IN ({placeholders})"
            params_start = customer_codes + [day_before_start]
            params_end = customer_codes + [to_date]
        else:
            customer_condition = "1=0"
            params_start = [day_before_start]
            params_end = [to_date]
            
        sql_orders_start = f"""
            SELECT 
                COUNT(*) AS so_don_hang,
                COALESCE(SUM(CASE WHEN time_create >= '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) AS gmv,
                COALESCE(SUM(CASE WHEN time_create < '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) AS gmv_truoc,
                COUNT(CASE WHEN time_create < '2026-01-01 00:00:00+07' THEN 1 END) AS don_hang_truoc
            FROM invoice
            WHERE ({customer_condition} OR name_salechannel ILIKE '%%SHOPEE%%' OR name_salechannel ILIKE '%%TIKTOK%%' OR name_salechannel ILIKE '%%LAZADA%%')
                AND DATE(time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') <= %s
                AND id_status <> 12
        """
        
        sql_orders_end = f"""
            SELECT 
                COUNT(*) AS so_don_hang,
                COALESCE(SUM(CASE WHEN time_create >= '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) AS gmv,
                COALESCE(SUM(CASE WHEN time_create < '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) AS gmv_truoc,
                COUNT(CASE WHEN time_create < '2026-01-01 00:00:00+07' THEN 1 END) AS don_hang_truoc
            FROM invoice
            WHERE ({customer_condition} OR name_salechannel ILIKE '%%SHOPEE%%' OR name_salechannel ILIKE '%%TIKTOK%%' OR name_salechannel ILIKE '%%LAZADA%%')
                AND DATE(time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') <= %s
                AND id_status <> 12
        """
        
        with conn_fm.cursor() as cur_fm:
            cur_fm.execute(sql_orders_start, tuple(params_start))
            result_start = cur_fm.fetchone()
            if result_start:
                so_don_hang_dau_ky = result_start[0]
                gmv_dau_ky = float(result_start[1])
                gmv_truoc_2026_dau_ky = float(result_start[2])
                don_hang_truoc_2026_dau_ky = int(result_start[3])
            
            cur_fm.execute(sql_orders_end, tuple(params_end))
            result_end = cur_fm.fetchone()
            if result_end:
                so_don_hang_cuoi_ky = result_end[0]
                gmv_cuoi_ky = float(result_end[1])
                gmv_truoc_2026_cuoi_ky = float(result_end[2])
                don_hang_truoc_2026_cuoi_ky = int(result_end[3])
                    
        arpu_dau_ky = (gmv_dau_ky + gmv_truoc_2026_dau_ky) / so_don_hang_dau_ky if so_don_hang_dau_ky > 0 else 0
        arpu_cuoi_ky = (gmv_cuoi_ky + gmv_truoc_2026_cuoi_ky) / so_don_hang_cuoi_ky if so_don_hang_cuoi_ky > 0 else 0
        pf_dau_ky = so_don_hang_dau_ky / so_khach_hang_phu_trach_dau_ky if so_khach_hang_phu_trach_dau_ky > 0 else 0
        pf_cuoi_ky = so_don_hang_cuoi_ky / so_khach_hang_phu_trach_cuoi_ky if so_khach_hang_phu_trach_cuoi_ky > 0 else 0
        
        return {
            "so_khach_hang_phu_trach_dau_ky": so_khach_hang_phu_trach_dau_ky,
            "so_khach_hang_phu_trach_cuoi_ky": so_khach_hang_phu_trach_cuoi_ky,
            "so_don_hang_dau_ky": so_don_hang_dau_ky,
            "so_don_hang_cuoi_ky": so_don_hang_cuoi_ky,
            "gmv_dau_ky": gmv_dau_ky,
            "gmv_cuoi_ky": gmv_cuoi_ky,
            "gmv_truoc_2026_dau_ky": gmv_truoc_2026_dau_ky,
            "gmv_truoc_2026_cuoi_ky": gmv_truoc_2026_cuoi_ky,
            "don_hang_truoc_2026_dau_ky": don_hang_truoc_2026_dau_ky,
            "don_hang_truoc_2026_cuoi_ky": don_hang_truoc_2026_cuoi_ky,
            "arpu_dau_ky": arpu_dau_ky,
            "arpu_cuoi_ky": arpu_cuoi_ky,
            "pf_dau_ky": pf_dau_ky,
            "pf_cuoi_ky": pf_cuoi_ky,
            "from_date": from_date,
            "to_date": to_date
        }
    except Exception as e:
        import traceback
        print(f"Error in get_manager_overview: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")

@router.get("/dashboard/manager/performance")
async def get_manager_performance(
    from_date: Optional[str] = Query(None, description="Ngày bắt đầu (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Ngày kết thúc (YYYY-MM-DD)"),
    token: dict = Depends(check_token)
):
    try:
        from database import conn
        
        id_acc = token.get("id_acc")
        user_info = await get_user_by_id_acc(id_acc)
        if not user_info or user_info.get("role_id") != 2:
            raise HTTPException(status_code=403, detail="Không có quyền Manager")
            
        sub_account = user_info.get("sub_account") or []
        if not sub_account:
            return {"so_don_hang": 0, "doanh_so": 0, "aov": 0}

        if not from_date or not to_date:
            today = date.today()
            from_date = today.replace(day=1).strftime("%Y-%m-%d")
            if today.month == 12:
                to_date = today.replace(day=31).strftime("%Y-%m-%d")
            else:
                next_month = today.replace(month=today.month + 1, day=1)
                to_date = (next_month - timedelta(days=1)).strftime("%Y-%m-%d")
                
        sql_customer_codes = "SELECT ma_kh FROM khach_hang WHERE id_acc = ANY(%s) AND ma_kh IS NOT NULL"
        with conn.cursor() as cur:
            cur.execute(sql_customer_codes, (sub_account,))
            customer_codes = [row[0] for row in cur.fetchall()]
            
        if not customer_codes:
            customer_condition = "1=0"
            params = [from_date, to_date]
        else:
            placeholders = ','.join(['%s'] * len(customer_codes))
            customer_condition = f"code_customer IN ({placeholders})"
            params = [from_date, to_date] + customer_codes
            
        sql = f"""
            SELECT 
                COUNT(*) AS so_don_hang,
                COALESCE(SUM(subtotal), 0) AS doanh_so,
                CASE 
                    WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(subtotal), 0)::numeric / COUNT(*), 0)
                    ELSE 0 
                END AS aov
            FROM invoice
            WHERE DATE(time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') >= %s 
                AND DATE(time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') <= %s
                AND ({customer_condition} OR name_salechannel ILIKE '%%SHOPEE%%' OR name_salechannel ILIKE '%%TIKTOK%%' OR name_salechannel ILIKE '%%LAZADA%%')
                AND id_status <> 12
        """
        
        with conn_fm.cursor() as cur:
            cur.execute(sql, tuple(params))
            result = cur.fetchone()
            if result:
                return {
                    "so_don_hang": result[0],
                    "doanh_so": float(result[1]) if result[1] else 0,
                    "aov": float(result[2]) if result[2] else 0,
                    "from_date": from_date,
                    "to_date": to_date
                }
        return {"so_don_hang": 0, "doanh_so": 0, "aov": 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dashboard/manager/customer-management")
async def get_manager_customer_management(
    token: dict = Depends(check_token),
    role_id: int = 4
):
    try:
        from database import conn
        
        id_acc = token.get("id_acc")
        user_info = await get_user_by_id_acc(id_acc)
        if not user_info or user_info.get("role_id") != 2:
            raise HTTPException(status_code=403, detail="Không có quyền Manager")
            
        sub_account = user_info.get("sub_account") or []
        if not sub_account:
            return {
                "so_khach_hang_dang_quan_ly": 0,
                "so_khach_hang_da_ban_giao": 0,
                "so_khach_hang_chua_ban_giao": 0,
                "so_nhan_su_dang_phu_trach": 0
            }

        today = date.today().strftime("%Y-%m-%d")
        
        sql_total = """
            SELECT COUNT(*)
            FROM khach_hang kh
            INNER JOIN account_users au ON kh.id_acc = au.id_acc
            WHERE au.trang_thai = 'Đang làm'
                AND kh.id_acc = ANY(%s)
                AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                AND DATE(kh.thoi_gian_tao::timestamp) <= %s;
        """
        
        sql_handed_over = """
            SELECT COUNT(*)
            FROM khach_hang kh
            INNER JOIN account_users au ON kh.id_acc = au.id_acc
            WHERE au.trang_thai = 'Đang làm' 
                AND au.role_id = %s
                AND kh.id_acc = ANY(%s)
                AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                AND DATE(kh.thoi_gian_tao::timestamp) <= %s;
        """
        
        sql_staff = """
            SELECT COUNT(DISTINCT id_acc)
            FROM account_users
            WHERE trang_thai = 'Đang làm' AND id_acc = ANY(%s);
        """

        with conn.cursor() as cur:
            cur.execute(sql_total, (sub_account, today))
            total_customers = cur.fetchone()[0] or 0
            
            cur.execute(sql_handed_over, (role_id, sub_account, today))
            handed_over_customers = cur.fetchone()[0] or 0
            
            cur.execute(sql_staff, (sub_account,))
            active_staff = cur.fetchone()[0] or 0
            
            not_handed_over = total_customers - handed_over_customers
            
            return {
                "so_khach_hang_dang_quan_ly": total_customers,
                "so_khach_hang_da_ban_giao": handed_over_customers,
                "so_khach_hang_chua_ban_giao": not_handed_over,
                "so_nhan_su_dang_phu_trach": active_staff
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from pydantic import BaseModel



@router.get("/dashboard/manager/staff-list")
async def get_manager_staff_list(token: dict = Depends(check_token)):
    try:
        from database import conn
        id_acc = token.get("id_acc")
        user_info = await get_user_by_id_acc(id_acc)
        if not user_info or user_info.get("role_id") not in (1, 2):
            raise HTTPException(status_code=403, detail="Không có quyền truy cập")
            
        role_id = user_info.get("role_id")
        sub_account = user_info.get("sub_account") or []
        
        with conn.cursor() as cur:
            if role_id == 1:
                cur.execute("""
                    SELECT id_acc, name, role_id 
                    FROM account_users 
                    WHERE trang_thai = 'Đang làm'
                    ORDER BY name
                """)
            else:
                if not sub_account:
                    return {"data": []}
                
                target_accounts_str = ','.join(map(str, sub_account))
                cur.execute(f"""
                    SELECT id_acc, name, role_id 
                    FROM account_users 
                    WHERE id_acc IN ({target_accounts_str}) AND trang_thai = 'Đang làm'
                    ORDER BY name
                """)
            rows = cur.fetchall()
            staff_list = []
            for row in rows:
                staff_list.append({
                    "id_acc": row[0],
                    "name": row[1] or f"Nhân sự {row[0]}",
                    "role_id": row[2]
                })
            return {"data": staff_list}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dashboard/manager/activities")
async def get_manager_activities(
    log_type: str = Query(..., description="Loại log: 'sales_diary' hoặc 'system_log'"),
    staff_id: Optional[int] = Query(None, description="Lọc theo một nhân viên cụ thể"),
    from_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    token: dict = Depends(check_token)
):
    try:
        from database import conn
        
        id_acc = token.get("id_acc")
        user_info = await get_user_by_id_acc(id_acc)
        if not user_info or user_info.get("role_id") not in (1, 2):
            raise HTTPException(status_code=403, detail="Không có quyền truy cập")
            
        role_id = user_info.get("role_id")
        sub_account = user_info.get("sub_account") or []
        
        if role_id == 1:
            if staff_id:
                target_accounts_str = str(staff_id)
            else:
                target_accounts_str = "SELECT id_acc FROM account_users"
        else:
            if not sub_account:
                return {"data": [], "total": 0, "page": page, "limit": limit}
                
            if staff_id:
                if staff_id not in sub_account:
                    return {"data": [], "total": 0, "page": page, "limit": limit}
                target_accounts_str = str(staff_id)
            else:
                target_accounts_str = ','.join(map(str, sub_account))
        
        date_filter = ""
        params = []
        
        if log_type == "sales_diary":
            if from_date and to_date:
                date_filter = "AND DATE(nk.thoi_gian) >= %s AND DATE(nk.thoi_gian) <= %s"
                params.extend([from_date, to_date])
                
            count_sql = f"""
                SELECT COUNT(*) FROM nhat_ky_ban_hang nk
                WHERE nk.id_acc IN ({target_accounts_str}) {date_filter}
            """
            
            data_sql = f"""
                SELECT 
                    nk.id, 
                    nk.thoi_gian AS created_at, 
                    nk.noi_dung AS content, 
                    nk.loai_ghi_chu AS action_type,
                    au.name AS staff_name,
                    kh.ma_kh AS customer_code,
                    kh.ten_khach_hang AS customer_name,
                    kh.sdt1 AS customer_phone
                FROM nhat_ky_ban_hang nk
                LEFT JOIN account_users au ON nk.id_acc = au.id_acc
                LEFT JOIN khach_hang kh ON nk.id_kh = kh.id_kh
                WHERE nk.id_acc IN ({target_accounts_str}) {date_filter}
                ORDER BY nk.thoi_gian DESC
                LIMIT %s OFFSET %s
            """
        elif log_type == "system_log":
            if from_date and to_date:
                date_filter = "AND DATE(log.thoi_gian) >= %s AND DATE(log.thoi_gian) <= %s"
                params.extend([from_date, to_date])
                
            count_sql = f"""
                SELECT COUNT(*) FROM log_lich_su_thaotac log
                WHERE log.id_acc IN ({target_accounts_str}) {date_filter}
            """
            
            data_sql = f"""
                SELECT 
                    log.id_tt AS id, 
                    log.thoi_gian AS created_at, 
                    log.action AS action_type, 
                    log.payload AS content,
                    au.name AS staff_name,
                    log.key_tt AS customer_code,
                    NULL AS customer_name,
                    NULL AS customer_phone
                FROM log_lich_su_thaotac log
                LEFT JOIN account_users au ON log.id_acc = au.id_acc
                WHERE log.id_acc IN ({target_accounts_str}) {date_filter}
                ORDER BY log.thoi_gian DESC
                LIMIT %s OFFSET %s
            """
        else:
            raise HTTPException(status_code=400, detail="Invalid log_type")
            
        with conn.cursor() as cur:
            cur.execute(count_sql, tuple(params))
            total = cur.fetchone()[0] or 0
            
            offset = (page - 1) * limit
            cur.execute(data_sql, tuple(params + [limit, offset]))
            
            columns = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            
            data = []
            for row in rows:
                item = dict(zip(columns, row))
                if item["created_at"]:
                    item["created_at"] = item["created_at"].isoformat()
                # Ensure content is string for easy display
                if log_type == "system_log" and isinstance(item["content"], dict):
                    import json
                    item["content"] = json.dumps(item["content"], ensure_ascii=False)
                data.append(item)
                
            return {
                "data": data,
                "total": total,
                "page": page,
                "limit": limit
            }
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

