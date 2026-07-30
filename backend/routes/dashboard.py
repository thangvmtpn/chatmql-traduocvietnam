from datetime import date, datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel
from database import conn_fm
from utils.security import check_token
from model.users import get_role_id_by_id_acc

router = APIRouter()


# Schema cho ghi chú
class NoteCreate(BaseModel):
    noi_dung: str
    loai_ghi_chu: Optional[str] = "ghi_chu"


class NoteResponse(BaseModel):
    id: int
    id_kh: int
    id_acc: int
    noi_dung: str
    thoi_gian: Optional[str] = None
    loai_ghi_chu: str
    ten_nhan_vien: Optional[str] = None


@router.get("/dashboard/overview")
async def get_dashboard_overview(
    from_date: Optional[str] = Query(None, description="Ngày bắt đầu (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Ngày kết thúc (YYYY-MM-DD)"),
    token: dict = Depends(check_token)
):
    """
    Lấy dữ liệu tổng quan quản trị theo chỉ số quan trọng
    - Số khách hàng phụ trách (khách hàng đã bàn giao) trong kỳ
    - Số đơn hàng trong kỳ
    - Tổng GMV (doanh số) trong kỳ
    - ARPU = GMV / Số đơn hàng
    - PF = Số đơn hàng / Số khách hàng phụ trách
    
    Trả về: đầu kỳ (tính đến from_date - 1), cuối kỳ (tính đến to_date)
    """
    try:
        from database import conn
        
        # Nếu không truyền ngày, mặc định là ngày hiện tại
        if not from_date or not to_date:
            today = date.today()
            from_date = today.strftime("%Y-%m-%d")
            to_date = today.strftime("%Y-%m-%d")
        
        # Parse dates
        start_date = datetime.strptime(from_date, "%Y-%m-%d").date()
        end_date = datetime.strptime(to_date, "%Y-%m-%d").date()
        
        # Ngày hôm trước from_date (để tính "đầu kỳ")
        day_before_start = (start_date - timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Đồng bộ với customer-management: handed_over(role=4, thoi_gian_tao <= date) + not_handed_over
        sql_customers_start = """
            SELECT (
                SELECT COUNT(*)
                FROM khach_hang kh
                INNER JOIN account_users au ON kh.id_acc = au.id_acc
                WHERE au.trang_thai = 'Đang làm'
                    AND au.role_id = 4
                    AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                    AND DATE(kh.thoi_gian_tao::timestamp) <= %s
            ) + (
                SELECT COUNT(*)
                FROM khach_hang kh
                WHERE (
                    kh.id_acc IS NULL
                    OR kh.id_acc NOT IN (
                        SELECT id_acc FROM account_users
                        WHERE trang_thai = 'Đang làm' AND role_id = 4
                    )
                    OR COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NULL
                )
            );
        """

        sql_customers_end = """
            SELECT (
                SELECT COUNT(*)
                FROM khach_hang kh
                INNER JOIN account_users au ON kh.id_acc = au.id_acc
                WHERE au.trang_thai = 'Đang làm'
                    AND au.role_id = 4
                    AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                    AND DATE(kh.thoi_gian_tao::timestamp) <= %s
            ) + (
                SELECT COUNT(*)
                FROM khach_hang kh
                WHERE (
                    kh.id_acc IS NULL
                    OR kh.id_acc NOT IN (
                        SELECT id_acc FROM account_users
                        WHERE trang_thai = 'Đang làm' AND role_id = 4
                    )
                    OR COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NULL
                )
            );
        """
        
        # 3. Số đơn hàng và GMV tại đầu kỳ (tính đến from_date - 1)
        sql_start = """
            SELECT 
                COUNT(*) AS so_don_hang,
                COALESCE(SUM(CASE WHEN time_create >= '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) AS gmv_sau,
                COALESCE(SUM(CASE WHEN time_create < '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) AS gmv_truoc,
                COUNT(CASE WHEN time_create < '2026-01-01 00:00:00+07' THEN 1 END) AS don_hang_truoc
            FROM invoice
            WHERE DATE(time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') <= %s
                AND id_status <> 12
        """
        
        # 4. Số đơn hàng và GMV tại cuối kỳ (tính đến to_date)
        sql_end = """
            SELECT 
                COUNT(*) AS so_don_hang,
                COALESCE(SUM(CASE WHEN time_create >= '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) AS gmv_sau,
                COALESCE(SUM(CASE WHEN time_create < '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) AS gmv_truoc,
                COUNT(CASE WHEN time_create < '2026-01-01 00:00:00+07' THEN 1 END) AS don_hang_truoc
            FROM invoice
            WHERE DATE(time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') <= %s
                AND id_status <> 12
        """
        
        # Lấy số khách hàng phụ trách từ database conn (khach_hang)
        with conn.cursor() as cur:
            cur.execute(sql_customers_start, (day_before_start,))
            so_khach_hang_phu_trach_dau_ky = cur.fetchone()[0] or 0

            cur.execute(sql_customers_end, (to_date,))
            so_khach_hang_phu_trach_cuoi_ky = cur.fetchone()[0] or 0
        
        # Lấy dữ liệu invoice từ database conn_fm (invoice)
        with conn_fm.cursor() as cur_fm:
            # Lấy dữ liệu đầu kỳ
            cur_fm.execute(sql_start, (day_before_start,))
            result_start = cur_fm.fetchone()
            so_don_hang_dau_ky = result_start[0] if result_start else 0
            gmv_dau_ky = float(result_start[1]) if result_start and result_start[1] else 0
            gmv_truoc_2026_dau_ky = float(result_start[2]) if result_start and result_start[2] else 0
            don_hang_truoc_2026_dau_ky = int(result_start[3]) if result_start and result_start[3] else 0
            
            # Lấy dữ liệu cuối kỳ
            cur_fm.execute(sql_end, (to_date,))
            result_end = cur_fm.fetchone()
            so_don_hang_cuoi_ky = result_end[0] if result_end else 0
            gmv_cuoi_ky = float(result_end[1]) if result_end and result_end[1] else 0
            gmv_truoc_2026_cuoi_ky = float(result_end[2]) if result_end and result_end[2] else 0
            don_hang_truoc_2026_cuoi_ky = int(result_end[3]) if result_end and result_end[3] else 0
        
        # Tính ARPU: vẫn dùng TỔNG GMV (truoc + sau) để ARPU không bị biến đổi đột ngột
        arpu_dau_ky = (gmv_dau_ky + gmv_truoc_2026_dau_ky) / so_don_hang_dau_ky if so_don_hang_dau_ky > 0 else 0
        arpu_cuoi_ky = (gmv_cuoi_ky + gmv_truoc_2026_cuoi_ky) / so_don_hang_cuoi_ky if so_don_hang_cuoi_ky > 0 else 0
        
        # Tính PF (Purchase Frequency)
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
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Error in get_dashboard_overview: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/dashboard/performance")
async def get_dashboard_performance(
    from_date: Optional[str] = Query(None, description="Ngày bắt đầu (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Ngày kết thúc (YYYY-MM-DD)"),
    token: dict = Depends(check_token)
):
    """
    Lấy dữ liệu tổng quan kết quả kinh doanh theo kỳ
    - Số đơn hàng: COUNT(*) từ bảng invoice
    - Doanh số: SUM(total_amount) từ bảng invoice
    - AOV: doanh_so / so_don
    """
    try:
        # Nếu không truyền ngày, mặc định là tháng hiện tại
        if not from_date or not to_date:
            today = date.today()
            from_date = today.replace(day=1).strftime("%Y-%m-%d")
            # Ngày cuối tháng
            if today.month == 12:
                to_date = today.replace(day=31).strftime("%Y-%m-%d")
            else:
                next_month = today.replace(month=today.month + 1, day=1)
                to_date = (next_month - timedelta(days=1)).strftime("%Y-%m-%d")
        
        sql = """
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
                AND id_status <> 12
        """
        
        with conn_fm.cursor() as cur:
            cur.execute(sql, (from_date, to_date))
            result = cur.fetchone()
            
            if result:
                return {
                    "so_don_hang": result[0],
                    "doanh_so": float(result[1]) if result[1] else 0,
                    "aov": float(result[2]) if result[2] else 0,
                    "from_date": from_date,
                    "to_date": to_date
                }
            else:
                return {
                    "so_don_hang": 0,
                    "doanh_so": 0,
                    "aov": 0,
                    "from_date": from_date,
                    "to_date": to_date
                }
                
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/dashboard/customer-management")
async def get_customer_management(
    token: dict = Depends(check_token),
    role_id: int = 4
):
    """
    Lấy dữ liệu quản lý khách hàng
    - Admin (role_id = 1): Bao gồm tất cả khách hàng và nhân sự kể cả role_id = 1
    - Subadmin (role_id = 2): Không bao gồm khách hàng và nhân sự của role_id = 1
    - Số khách hàng đang quản lý: COUNT khách hàng có id_acc trong account_users với trang_thai = 'Đang làm' và có thoi_gian_tao hợp lệ
    - Số khách hàng đã bàn giao: COUNT khách hàng có id_acc trong account_users với trang_thai = 'Đang làm' và role_id = 4
    - Số khách hàng chưa bàn giao: Khách hàng không có id_acc hoặc id_acc không trong account_users đang làm
    - Số nhân sự đang phụ trách: COUNT DISTINCT id_acc từ account_users với trang_thai = 'Đang làm'
    """
    try:
        from database import conn
        
        # Lấy id_acc từ token
        id_acc = token.get("id_acc", None)
        
        # Query role_id mới nhất từ database dựa trên id_acc để tránh cache cũ
        user_role_id = await get_role_id_by_id_acc(id_acc) or 0
        print(f"[DEBUG] user_role_id: {user_role_id}, id_acc: {id_acc}")
        
        # Lấy ngày hôm nay để lọc (giống logic overview)
        today = date.today().strftime("%Y-%m-%d")
        
        # Logic giống với /dashboard/overview: Chỉ lấy khách hàng đã bàn giao, có thoi_gian_tao hợp lệ
        # Nếu là admin (role_id = 1): lấy tất cả
        # Nếu là subadmin (role_id = 2): loại trừ role_id = 1
        if user_role_id == 1:
            # Admin: Lấy tất cả khách hàng đã bàn giao (có id_acc, account đang làm, có thoi_gian_tao hợp lệ)
            sql_total = """
                SELECT COUNT(*)
                FROM khach_hang kh
                INNER JOIN account_users au ON kh.id_acc = au.id_acc
                WHERE au.trang_thai = 'Đang làm'
                    AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                    AND DATE(kh.thoi_gian_tao::timestamp) <= %s;
            """
            
            # Admin: Lấy tất cả nhân sự đang làm
            sql_staff = """
                SELECT COUNT(DISTINCT id_acc)
                FROM account_users
                WHERE trang_thai = 'Đang làm';
            """
        else:
            # Subadmin và các role khác: Loại trừ khách hàng của admin (role_id = 1)
            sql_total = """
                SELECT COUNT(*)
                FROM khach_hang kh
                INNER JOIN account_users au ON kh.id_acc = au.id_acc
                WHERE au.trang_thai = 'Đang làm'
                    AND au.role_id != 1
                    AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                    AND DATE(kh.thoi_gian_tao::timestamp) <= %s;
            """
            
            # Subadmin và các role khác: Loại trừ nhân sự admin (role_id = 1)
            sql_staff = """
                SELECT COUNT(DISTINCT id_acc)
                FROM account_users
                WHERE trang_thai = 'Đang làm'
                AND role_id != 1;
            """
        
        # Lấy số khách hàng đã bàn giao cho nhân viên (role_id = 4)
        if user_role_id == 1:
            sql_handed_over = """
                SELECT COUNT(*)
                FROM khach_hang kh
                INNER JOIN account_users au ON kh.id_acc = au.id_acc
                WHERE au.trang_thai = 'Đang làm' 
                    AND au.role_id = %s
                    AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                    AND DATE(kh.thoi_gian_tao::timestamp) <= %s;
            """
            # Admin: đếm trực tiếp KH chưa bàn giao (đồng bộ với get_customers_groups)
            sql_not_handed_over = """
                SELECT COUNT(*)
                FROM khach_hang kh
                WHERE (
                    kh.id_acc IS NULL
                    OR kh.id_acc NOT IN (
                        SELECT id_acc FROM account_users
                        WHERE trang_thai = 'Đang làm' AND role_id = 4
                    )
                    OR COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NULL
                );
            """
        else:
            sql_handed_over = """
                SELECT COUNT(*)
                FROM khach_hang kh
                INNER JOIN account_users au ON kh.id_acc = au.id_acc
                WHERE au.trang_thai = 'Đang làm' 
                    AND au.role_id = %s
                    AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                    AND DATE(kh.thoi_gian_tao::timestamp) <= %s;
            """
            # Subadmin: đếm trực tiếp KH chưa bàn giao, loại trừ KH của Admin (role=1)
            sql_not_handed_over = """
                SELECT COUNT(*)
                FROM khach_hang kh
                WHERE (
                    kh.id_acc IS NULL
                    OR kh.id_acc NOT IN (
                        SELECT id_acc FROM account_users
                        WHERE trang_thai = 'Đang làm' AND role_id = 4
                    )
                    OR COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NULL
                )
                AND (kh.id_acc IS NULL OR kh.id_acc NOT IN (
                    SELECT id_acc FROM account_users WHERE role_id = 1
                ));
            """

        with conn.cursor() as cur:
            # Số khách hàng đã bàn giao cho nhân viên
            cur.execute(sql_handed_over, (role_id, today))
            handed_over_customers = cur.fetchone()[0] or 0
            print(f"[DEBUG] so_khach_hang_da_ban_giao (role_id={role_id}): {handed_over_customers}")
            
            # Số nhân sự đang phụ trách
            cur.execute(sql_staff)
            active_staff = cur.fetchone()[0] or 0
            
            # Số khách hàng chưa bàn giao: đếm trực tiếp (đồng bộ với get_customers_groups)
            cur.execute(sql_not_handed_over)
            not_handed_over = cur.fetchone()[0] or 0
            print(f"[DEBUG] so_khach_hang_chua_ban_giao (direct count): {not_handed_over}")
            
            # Tổng = đã bàn giao + chưa bàn giao (luôn nhất quán)
            total_customers = handed_over_customers + not_handed_over
            print(f"[DEBUG] so_khach_hang_dang_quan_ly: {total_customers}")
            
            return {
                "so_khach_hang_dang_quan_ly": total_customers,
                "so_khach_hang_da_ban_giao": handed_over_customers,
                "so_khach_hang_chua_ban_giao": not_handed_over,
                "so_nhan_su_dang_phu_trach": active_staff
            }
                
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/dashboard/staff-list")
async def get_staff_list(
    filter_type: str = Query("handed_over", description="Loại filter: all, handed_over"),
    token: dict = Depends(check_token)
):
    """
    Lấy danh sách tài khoản có khách hàng được bàn giao
    - filter_type = 'all': Tất cả tài khoản
        + Admin (role_id = 1): Xem tất cả tài khoản kể cả admin, hiển thị cả tài khoản có 0 khách hàng
        + Subadmin (role_id = 2): Xem tất cả tài khoản trừ admin (role_id = 1)
    - filter_type = 'handed_over': Chỉ nhân viên role_id = 4
    """
    try:
        from database import conn
        
        # Lấy id_acc từ token
        id_acc = token.get("id_acc", None)
        
        # Query role_id mới nhất từ database để tránh cache cũ
        user_role_id = await get_role_id_by_id_acc(id_acc) or 0
        
        # Lấy ngày hôm nay để lọc (giống logic customer-management)
        today = date.today().strftime("%Y-%m-%d")
        
        if filter_type == "all":
            # Lấy tất cả tài khoản
            if user_role_id == 1:
                # Admin: Xem tất cả tài khoản kể cả admin, hiển thị cả tài khoản có 0 khách hàng
                sql = """
                    SELECT 
                        au.id_acc,
                        au.name,
                        au.role_id,
                        CASE 
                            WHEN au.role_id = 1 THEN (
                                SELECT COUNT(kh_sub.id_kh)
                                FROM khach_hang kh_sub
                                WHERE COALESCE(NULLIF(TRIM(kh_sub.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                                AND DATE(kh_sub.thoi_gian_tao::timestamp) <= %s
                            )
                            ELSE COALESCE(COUNT(kh.id_kh), 0)
                        END as customer_count
                    FROM account_users au
                    LEFT JOIN khach_hang kh ON au.id_acc = kh.id_acc
                        AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                        AND DATE(kh.thoi_gian_tao::timestamp) <= %s
                    WHERE au.trang_thai = 'Đang làm'
                    GROUP BY au.id_acc, au.name, au.role_id
                    ORDER BY au.name
                """
                sql_params = (today, today)
            elif user_role_id == 2:
                # Subadmin: Xem tất cả tài khoản trừ admin (role_id = 1)
                sql = """
                    SELECT 
                        au.id_acc,
                        au.name,
                        au.role_id,
                        COALESCE(COUNT(kh.id_kh), 0) as customer_count
                    FROM account_users au
                    LEFT JOIN khach_hang kh ON au.id_acc = kh.id_acc
                        AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                        AND DATE(kh.thoi_gian_tao::timestamp) <= %s
                    WHERE au.trang_thai = 'Đang làm'
                    AND au.role_id != 1
                    GROUP BY au.id_acc, au.name, au.role_id
                    ORDER BY au.name
                """
                sql_params = (today,)
            else:
                # Các role khác: hiển thị tất cả tài khoản trừ admin
                sql = """
                    SELECT 
                        au.id_acc,
                        au.name,
                        au.role_id,
                        COALESCE(COUNT(kh.id_kh), 0) as customer_count
                    FROM account_users au
                    LEFT JOIN khach_hang kh ON au.id_acc = kh.id_acc
                        AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                        AND DATE(kh.thoi_gian_tao::timestamp) <= %s
                    WHERE au.trang_thai = 'Đang làm'
                    AND au.role_id != 1
                    GROUP BY au.id_acc, au.name, au.role_id
                    ORDER BY au.name
                """
                sql_params = (today,)
        else:
            # Chỉ lấy nhân viên role_id = 4
            sql = """
                SELECT 
                    au.id_acc,
                    au.name,
                    au.role_id,
                    COUNT(kh.id_kh) as customer_count
                FROM account_users au
                INNER JOIN khach_hang kh ON au.id_acc = kh.id_acc
                WHERE au.role_id = 4
                AND au.trang_thai = 'Đang làm'
                AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                AND DATE(kh.thoi_gian_tao::timestamp) <= %s
                GROUP BY au.id_acc, au.name, au.role_id
                HAVING COUNT(kh.id_kh) > 0
                ORDER BY au.name
            """
            sql_params = (today,)
        
        with conn.cursor() as cur:
            cur.execute(sql, sql_params)
            rows = cur.fetchall()
            
            if filter_type == "all":
                # Nhóm các tài khoản không phải role_id = 1 hoặc 2 thành "SUBADMIN - Head"
                staff_list = []
                other_count = 0
                
                for row in rows:
                    if row[2] in (1, 2):  # role_id = 1 hoặc 2, giữ nguyên
                        staff_list.append({
                            "id_acc": row[0],
                            "name": row[1],
                            "role_id": row[2],
                            "customer_count": row[3]
                        })
                    else:
                        # Nhóm các tài khoản khác
                        other_count += row[3]
                
                # Thêm dòng "SUBADMIN - HEAD" nếu có tài khoản khác role_id = 1, 2
                if other_count > 0:
                    staff_list.append({
                        "id_acc": None,
                        "name": "SUBADMIN - HEAD",
                        "role_id": None,
                        "customer_count": other_count
                    })
            else:
                # Cho handed_over filter, giữ nguyên logic cũ
                staff_list = [
                    {
                        "id_acc": row[0],
                        "name": row[1],
                        "role_id": row[2],
                        "customer_count": row[3]
                    }
                    for row in rows
                ]
            
            return {"data": staff_list}
                
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/dashboard/customers-groups")
async def get_customers_groups(
    token: dict = Depends(check_token)
):
    """
    Lấy số lượng khách hàng chưa bàn giao theo Cấp VIP.
    GMV được tính từ bảng invoice (id_status <> 12), KHÔNG dùng khach_hang.gmv.
    """
    try:
        from database import conn

        role_id = token.get("role_id")

        # WHERE cho khách chưa bàn giao (Đồng bộ với get_customers_list)
        if int(role_id) == 1:
            not_handed_over_cond = """
                (kh.id_acc IS NULL
                 OR kh.id_acc NOT IN (
                     SELECT id_acc FROM account_users
                     WHERE trang_thai = 'Đang làm' AND role_id = 4
                 )
                 OR COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NULL)
            """
        else:
            not_handed_over_cond = """
                (kh.id_acc IS NULL
                 OR kh.id_acc NOT IN (
                     SELECT id_acc FROM account_users
                     WHERE trang_thai = 'Đang làm' AND role_id = 4
                 )
                 OR COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NULL)
                AND (kh.id_acc IS NULL OR kh.id_acc NOT IN (
                    SELECT id_acc FROM account_users WHERE role_id = 1
                ))
            """

        # Bước 1: lấy danh sách ma_kh chưa bàn giao
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT kh.ma_kh
                FROM khach_hang kh
                WHERE {not_handed_over_cond}
            """)
            rows = cur.fetchall()
            ma_kh_list = [r[0] for r in rows if r[0]]

        if not ma_kh_list:
            return {"data": [
                {"nhom_kh": "VIP 0-9",   "so_luong_kh": 0},
                {"nhom_kh": "VIP 10-19", "so_luong_kh": 0},
                {"nhom_kh": "VIP 20-29", "so_luong_kh": 0},
                {"nhom_kh": "VIP 30+",   "so_luong_kh": 0},
            ]}

        # Bước 2: Load GMV cho TẤT CẢ khách hàng (giống get_customers_list)
        gmv_map = {}
        with conn_fm.cursor() as cur_fm:
            cur_fm.execute("""
                SELECT 
                    code_customer,
                    COALESCE(SUM(subtotal), 0)
                FROM invoice
                WHERE id_status <> 12
                GROUP BY code_customer
            """)
            for r in cur_fm.fetchall():
                if r[0]:
                    gmv_map[r[0]] = float(r[1] or 0)

        # Bước 3: phân nhóm theo Cấp VIP
        vip_groups = {"VIP 0-9": 0, "VIP 10-19": 0, "VIP 20-29": 0, "VIP 30+": 0}
        for ma_kh in ma_kh_list:
            gmv = gmv_map.get(ma_kh, 0)
            if gmv < 10_000_000:
                vip_groups["VIP 0-9"] += 1
            elif gmv < 60_000_000:
                vip_groups["VIP 10-19"] += 1
            elif gmv < 160_000_000:
                vip_groups["VIP 20-29"] += 1
            else:
                vip_groups["VIP 30+"] += 1

        groups = [{"nhom_kh": k, "so_luong_kh": v} for k, v in vip_groups.items()]
        return {"data": groups}

    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")



@router.get("/dashboard/customers-groups-list")
async def get_customers_groups_list(
    token: dict = Depends(check_token)
):
    """
    Lấy danh sách tất cả các nhóm khách hàng duy nhất
    Được sử dụng để populate dropdown
    """
    try:
        from database import conn
        
        query = """
            SELECT DISTINCT COALESCE(nhom_kh, 'Chưa phân loại') as nhom_kh
            FROM khach_hang
            WHERE nhom_kh IS NOT NULL
            ORDER BY nhom_kh ASC
        """
        
        with conn.cursor() as cur:
            cur.execute(query)
            rows = cur.fetchall()
            
            groups = [{"nhom_kh": row[0]} for row in rows]
            
            return {
                "success": True,
                "data": groups
            }
                
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/dashboard/customers")
async def get_customers_list(
    filter_type: str = Query("all", description="Loại filter: all, handed_over, not_handed_over"),
    page: int = Query(1, ge=1, description="Trang hiện tại"),
    page_size: int = Query(50, ge=1, le=100, description="Số bản ghi mỗi trang"),
    customer_id: str = Query(None, description="Mã khách hàng để tìm kiếm"),
    phone_number: str = Query(None, description="Số điện thoại khách hàng để tìm kiếm"),
    gmv_min: Optional[float] = Query(None, description="GMV tối thiểu"),
    gmv_max: Optional[float] = Query(None, description="GMV tối đa"),
    pf_min: Optional[float] = Query(None, description="PF tối thiểu"),
    pf_max: Optional[float] = Query(None, description="PF tối đa"),
    aov_min: Optional[float] = Query(None, description="AOV tối thiểu"),
    aov_max: Optional[float] = Query(None, description="AOV tối đa"),
    mien: Optional[str] = Query(None, description="Miền: Bắc, Trung, Nam"),
    nhom_kh: Optional[str] = Query(None, description="Nhóm khách hàng"),
    staff_id: Optional[int] = Query(None, description="ID nhân viên để lọc"),
    sort_by: Optional[str] = Query(None, description="Cột sắp xếp: gmv, so_lan_mua, tham_nien, cap_vip"),
    sort_order: Optional[str] = Query(None, description="Hướng sắp xếp: asc, desc"),
    cs_lai_today: Optional[str] = Query(None, description="Lọc khách hàng có thời gian chăm sóc lại = hôm nay: true/false"),
    token: dict = Depends(check_token)
):
    """
    Lấy danh sách khách hàng
    - filter_type: all (tất cả), handed_over (đã bàn giao), not_handed_over (chưa bàn giao)
    - customer_id: Tìm khách hàng theo mã khách hàng
    - phone_number: Tìm khách hàng theo số điện thoại
    - gmv_min, gmv_max: Lọc theo khoảng GMV
    - staff_id: Lọc theo nhân viên cụ thể (chỉ áp dụng cho filter handed_over)
    - pf_min, pf_max: Lọc theo khoảng PF
    - aov_min, aov_max: Lọc theo khoảng AOV
    - mien: Lọc theo miền (Bắc, Trung, Nam)
    - nhom_kh: Lọc theo nhóm khách hàng
    - Các trường: ma_kh, nhom_kh, ten_khach_hang, sdt1, dia_chi, gmv, so_lan_mua, aov, 
                  thâm niên, PF, gioi_tinh, tuổi
    """
    try:
        from database import conn
        
        print(f"🔍 [GMV FROM INVOICE] Fetching customers with filter_type={filter_type}, staff_id={staff_id}")
        
        # Lấy id_acc và role_id từ token
        id_acc = token.get("id_acc")
        role_id = token.get("role_id")
        if not id_acc:
            raise HTTPException(status_code=401, detail="Không tìm thấy thông tin người dùng")
        
        # Bước 1: Lấy danh sách mã khách hàng và tính GMV + số lần mua từ bảng invoice trong fm_tdvn
        # (Chỉ lấy các đơn có id_status <> 12)
        print(f"📊 [GMV FROM INVOICE] Calculating GMV and purchase count from invoice table...")
        gmv_dict = {}  # {code_customer: gmv (>= 2026)}
        gmv_truoc_dict = {}  # {code_customer: gmv_truoc (< 2026)}
        so_lan_mua_dict = {}  # {code_customer: count}
        so_lan_mua_truoc_dict = {}  # {code_customer: count_truoc}
        
        with conn_fm.cursor() as cur_fm:
            cur_fm.execute("""
                SELECT 
                    code_customer,
                    COALESCE(SUM(CASE WHEN time_create >= '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) as gmv_sau,
                    COALESCE(SUM(CASE WHEN time_create < '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) as gmv_truoc,
                    COUNT(CASE WHEN time_create >= '2026-01-01 00:00:00+07' THEN 1 END) as so_lan_mua_sau,
                    COUNT(CASE WHEN time_create < '2026-01-01 00:00:00+07' THEN 1 END) as so_lan_mua_truoc,
                    EXTRACT(EPOCH FROM (NOW() - MIN(time_create))) / 86400 as so_ngay_tu_ngay_mua_dau,
                    EXTRACT(EPOCH FROM (NOW() - MAX(time_create))) / 86400 as recency
                FROM invoice
                WHERE id_status <> 12
                GROUP BY code_customer
            """)
            gmv_results = cur_fm.fetchall()
            so_ngay_tu_ngay_mua_dau_dict = {}
            recency_dict = {}
            for row in gmv_results:
                if row[0]:  # code_customer
                    gmv_dict[row[0]] = float(row[1]) if row[1] else 0
                    gmv_truoc_dict[row[0]] = float(row[2]) if row[2] else 0
                    so_lan_mua_dict[row[0]] = int(row[3]) if row[3] else 0
                    so_lan_mua_truoc_dict[row[0]] = int(row[4]) if row[4] else 0
                    so_ngay_tu_ngay_mua_dau_dict[row[0]] = float(row[5]) if row[5] else 0
                    recency_dict[row[0]] = int(row[6]) if row[6] else 0
        
        print(f"✅ [GMV FROM INVOICE] Loaded GMV and purchase count for {len(gmv_dict)} customers from invoice table")
        print(f"📋 [FILTER TYPE] Applying for filter_type={filter_type} with {len(gmv_dict)} records available")
        
        # Base query với các tính toán
        # GMV sẽ được update sau khi fetch từ database
        base_select = """
            SELECT 
                kh.id_kh,
                kh.ma_kh,
                kh.nhom_kh,
                kh.ten_khach_hang,
                kh.sdt1,
                kh.dia_chi,
                0 as gmv,
                0 as so_lan_mua,
                0 as aov,
                CASE 
                    WHEN COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                    THEN GREATEST(0, ROUND((EXTRACT(YEAR FROM AGE(NOW(), kh.thoi_gian_tao::timestamp)) * 12 + 
                         EXTRACT(MONTH FROM AGE(NOW(), kh.thoi_gian_tao::timestamp)) +
                         EXTRACT(DAY FROM AGE(NOW(), kh.thoi_gian_tao::timestamp)) / 30.0)::numeric, 1))
                    ELSE 0
                END as tham_nien_thang,
                CASE 
                    WHEN COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
                         AND (EXTRACT(YEAR FROM AGE(NOW(), kh.thoi_gian_tao::timestamp)) * 12 + 
                              EXTRACT(MONTH FROM AGE(NOW(), kh.thoi_gian_tao::timestamp))) > 0 
                    THEN ROUND((COALESCE(kh.so_lan_mua, 0)::numeric / 
                               (EXTRACT(YEAR FROM AGE(NOW(), kh.thoi_gian_tao::timestamp)) * 12 + 
                                EXTRACT(MONTH FROM AGE(NOW(), kh.thoi_gian_tao::timestamp)))), 2)
                    ELSE 0 
                END as pf,
                kh.gioi_tinh,
                kh.ngay_sinh as tuoi,
                kh.id_acc,
                COALESCE(kh.mien, '') as mien
            FROM khach_hang kh
        """
        
        # Thêm điều kiện WHERE dựa trên filter_type
        join_clause = ""
        where_conditions = []
        query_params = []
        
        # Determine if it's a global search
        is_global_search = bool(customer_id or phone_number)
        
        # Chỉ áp dụng lọc id_acc cho Employee (role_id = 4)
        # Admin/Manager/Supervisor (role_id = 1, 2, 3) xem được tất cả khách hàng
        if int(role_id) == 4:
            # Employee - chỉ xem khách hàng của chính họ
            where_conditions.append("kh.id_acc = %s")
            query_params.append(id_acc)
        
        # Kiểm tra xem staff_id được truyền lên có phải là Admin không
        is_requested_staff_admin = False
        if staff_id:
            with conn.cursor() as cur:
                cur.execute("SELECT role_id FROM account_users WHERE id_acc = %s", (staff_id,))
                staff_role_row = cur.fetchone()
                if staff_role_row and staff_role_row[0] == 1:
                    is_requested_staff_admin = True
                    
        # Nếu có staff_id, lọc theo nhân viên cụ thể (bất kể filter_type)
        if staff_id:
            if is_requested_staff_admin:
                where_conditions.append("COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL")
            else:
                where_conditions.append("kh.id_acc = %s")
                query_params.append(staff_id)
                where_conditions.append("COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL")
        elif not is_global_search:
            if filter_type == "all":
                # filter_type = "all": Chỉ lấy khách hàng đã bàn giao hợp lệ (có id_acc, account đang làm, có thoi_gian_tao)
                join_clause = "INNER JOIN account_users au ON kh.id_acc = au.id_acc"
                where_conditions.append("au.trang_thai = 'Đang làm'")
                where_conditions.append("COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL")
            elif filter_type == "handed_over":
                join_clause = "INNER JOIN account_users au ON kh.id_acc = au.id_acc"
                where_conditions.append("au.trang_thai = 'Đang làm'")
                where_conditions.append("au.role_id = %s")  # Lọc theo role_id = 4
                where_conditions.append("COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL")
                query_params.append(4)
            elif filter_type == "not_handed_over":
                # Nếu là Admin (role_id = 1): xem tất cả khách hàng chưa bàn giao
                # Nếu là Subadmin/Others (role_id != 1): loại trừ khách hàng của Admin
                if int(role_id) == 1:
                    # Admin: xem tất cả khách hàng chưa bàn giao
                    where_conditions.append("""(kh.id_acc IS NULL 
                           OR kh.id_acc NOT IN (
                               SELECT id_acc FROM account_users WHERE trang_thai = 'Đang làm' AND role_id = %s
                           )
                           OR COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NULL)""")
                    query_params.append(4)
                else:
                    # Subadmin/Others: loại trừ khách hàng của Admin (role_id = 1)
                    # Điều kiện: (id_acc IS NULL hoặc không phải nhân viên role 4 hoặc không có thoi_gian_tao) VÀ (id_acc không phải admin)
                    where_conditions.append("""(kh.id_acc IS NULL 
                           OR kh.id_acc NOT IN (
                               SELECT id_acc FROM account_users WHERE trang_thai = 'Đang làm' AND role_id = %s
                           )
                           OR COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NULL)
                           AND (kh.id_acc IS NULL OR kh.id_acc NOT IN (
                               SELECT id_acc FROM account_users WHERE role_id = %s
                           ))""")
                    query_params.append(4)
                    query_params.append(1)
        
        # Thêm điều kiện lọc khách hàng có thoi_gian_cs_lai = hôm nay
        if cs_lai_today and cs_lai_today.lower() == "true":
            from datetime import date
            today = date.today().strftime("%Y-%m-%d")
            where_conditions.append("kh.thoi_gian_cs_lai IS NOT NULL AND DATE(kh.thoi_gian_cs_lai) = %s")
            query_params.append(today)
        
        # Thêm điều kiện tìm kiếm theo mã khách hàng
        if customer_id:
            where_conditions.append("kh.ma_kh LIKE %s")
            query_params.append(f"%{customer_id}%")
        
        # Thêm điều kiện tìm kiếm theo số điện thoại
        if phone_number:
            # Normalize phone number to match the last 9 digits (handles 84 vs 0 prefix)
            clean_phone = ''.join(filter(str.isdigit, phone_number))
            search_phone = clean_phone[-9:] if len(clean_phone) >= 9 else clean_phone
            where_conditions.append("(kh.sdt1 LIKE %s OR kh.sdt2 LIKE %s)")
            query_params.append(f"%{search_phone}%")
            query_params.append(f"%{search_phone}%")
        
        # Thêm các filter mới CHỈ cho khách hàng chưa bàn giao
        # Note: GMV filter sẽ được xử lý sau khi fetch data vì GMV được tính từ bảng invoice
        if filter_type == "not_handed_over":
            # GMV filter đã được xóa - sẽ filter sau khi fetch
            # (không thể filter trực tiếp vì GMV được tính từ bảng khác)
            
            # Thêm điều kiện lọc theo AOV
            if aov_min is not None:
                where_conditions.append("COALESCE(kh.aov, 0) >= %s")
                query_params.append(aov_min)
            
            if aov_max is not None:
                where_conditions.append("COALESCE(kh.aov, 0) <= %s")
                query_params.append(aov_max)
            
            # Thêm điều kiện lọc theo Miền (sử dụng cột mien trực tiếp)
            if mien:
                where_conditions.append("UPPER(kh.mien) = %s")
                query_params.append(mien.upper())
            
            # Thêm điều kiện lọc theo Nhóm khách hàng
            if nhom_kh:
                # VIP groups được filter sau trong Python dùng GMV thực từ invoice
                # Các filter khác (text-based nhom_kh) vẫn dùng SQL
                if nhom_kh in ("VIP 0-9", "VIP 10-19", "VIP 20-29", "VIP 30+"):
                    pass  # sẽ filter trong Python
                elif nhom_kh == "F0":
                    # Lọc nhóm bắt đầu bằng F0
                    where_conditions.append("kh.nhom_kh LIKE %s")
                    query_params.append("F0%")
                elif nhom_kh == "FTET":
                    # Lọc nhóm bắt đầu bằng FTET
                    where_conditions.append("kh.nhom_kh LIKE %s")
                    query_params.append("FTET%")
                elif nhom_kh == "FnKT":
                    # Lọc nhóm bắt đầu bằng FKT hoặc bắt đầu bằng F và kết thúc bằng KT
                    where_conditions.append("(kh.nhom_kh LIKE %s OR (kh.nhom_kh LIKE %s AND kh.nhom_kh LIKE %s))")
                    query_params.append("FKT%")
                    query_params.append("F%")
                    query_params.append("%KT")
                elif nhom_kh == "FnT":
                    # Lọc nhóm bắt đầu bằng FT (nhưng không phải FKT) hoặc bắt đầu bằng F, kết thúc bằng T nhưng không phải KT
                    where_conditions.append("((kh.nhom_kh LIKE %s AND kh.nhom_kh NOT LIKE %s) OR (kh.nhom_kh LIKE %s AND kh.nhom_kh LIKE %s AND kh.nhom_kh NOT LIKE %s))")
                    query_params.append("FT%")
                    query_params.append("FKT%")
                    query_params.append("F%")
                    query_params.append("%T")
                    query_params.append("%KT")
                elif nhom_kh == "Khác":
                    # Lọc nhóm không phải F, không bắt đầu bằng F0, không bắt đầu bằng FTET, không bắt đầu bằng FKT, không bắt đầu bằng FT, và không (F...KT) hoặc (F...T và không KT)
                    where_conditions.append("""kh.nhom_kh != %s 
                       AND kh.nhom_kh NOT LIKE %s
                       AND kh.nhom_kh NOT LIKE %s
                       AND kh.nhom_kh NOT LIKE %s
                       AND kh.nhom_kh NOT LIKE %s
                       AND NOT (kh.nhom_kh LIKE %s AND kh.nhom_kh LIKE %s)
                       AND NOT (kh.nhom_kh LIKE %s AND kh.nhom_kh LIKE %s AND kh.nhom_kh NOT LIKE %s)""")
                    query_params.append("F")
                    query_params.append("F0%")
                    query_params.append("FTET%")
                    query_params.append("FKT%")
                    query_params.append("FT%")
                    query_params.append("F%")
                    query_params.append("%KT")
                    query_params.append("F%")
                    query_params.append("%T")
                    query_params.append("%KT")
                else:
                    # Lọc nhóm chính xác
                    where_conditions.append("kh.nhom_kh = %s")
                    query_params.append(nhom_kh)
        

        # Kết hợp các điều kiện WHERE
        where_clause = "WHERE " + " AND ".join(where_conditions) if where_conditions else ""
        
        # Xóa logic filter PF trong SQL vì PF được tính lại động dựa trên tổng số lần mua
        
        # Base query cho pagination (nếu không cần filter động trong Python)
        count_query = f"""
            SELECT COUNT(*)
            FROM khach_hang kh
            {join_clause}
            {where_clause}
        """
        
        offset = (page - 1) * page_size
        main_query = f"""
            {base_select}
            {join_clause}
            {where_clause}
            ORDER BY kh.thoi_gian_tao DESC
            LIMIT %s OFFSET %s
        """
        
        count_params = tuple(query_params)
        all_params = tuple(query_params) + (page_size, offset)
        
        # Kiểm tra xem có filter động cần xử lý bằng Python không
        has_gmv_filter = gmv_min is not None or gmv_max is not None
        has_pf_filter = pf_min is not None or pf_max is not None
        has_sort = sort_by is not None
        has_vip_filter = nhom_kh in ("VIP 0-9", "VIP 10-19", "VIP 20-29", "VIP 30+") if nhom_kh else False
        
        # VIP filter yêu cầu fetch all để lọc trong Python
        if has_vip_filter:
            has_gmv_filter = True  # force fetch-all mode
        
        with conn.cursor() as cur:
            try:
                if has_gmv_filter or has_sort or has_pf_filter:
                    print(f"🔄 [SORT/FILTER] Fetching ALL records for sorting/filtering")
                    
                    query_all = f"""
                        {base_select}
                        {join_clause}
                        {where_clause}
                        ORDER BY kh.thoi_gian_tao DESC
                    """
                    query_params_all = tuple(query_params)
                    
                    cur.execute(query_all, query_params_all)
                    rows = cur.fetchall()
                    
                    # Build customers list with GMV/AOV
                    customers_all = []
                    for row in rows:
                        ma_kh = row[1]
                        gmv = gmv_dict.get(ma_kh, 0)
                        gmv_truoc = gmv_truoc_dict.get(ma_kh, 0)
                        so_lan_mua = so_lan_mua_dict.get(ma_kh, 0)
                        so_lan_mua_truoc = so_lan_mua_truoc_dict.get(ma_kh, 0)
                        
                        # Cấp admin (role=1) tính GMV cả trước 2026, các cấp khác chỉ tính từ 2026
                        # Số lần mua tính toàn bộ cho tất cả các role
                        total_gmv_calc = gmv if int(role_id) != 1 else (gmv + gmv_truoc)
                        total_orders_calc = so_lan_mua + so_lan_mua_truoc
                        
                        # AOV luôn tính trên toàn thời gian để xếp hạng VIP Badge hiển thị chính xác cho mọi role
                        total_all_time_gmv = gmv + gmv_truoc
                        total_all_time_so_lan_mua = so_lan_mua + so_lan_mua_truoc
                        aov = round(total_all_time_gmv / total_all_time_so_lan_mua, 0) if total_all_time_so_lan_mua > 0 else 0
                        
                        
                        # Calculate PF dynamically based on total_orders_calc
                        tham_nien_val = float(row[9]) if row[9] else 0
                        pf_calc = round(total_orders_calc / tham_nien_val, 2) if tham_nien_val > 0 else 0
                        
                        so_ngay = so_ngay_tu_ngay_mua_dau_dict.get(ma_kh, 0)
                        real_total_orders = so_lan_mua + so_lan_mua_truoc
                        chu_ky = round(so_ngay / real_total_orders) if real_total_orders > 1 else 0
                        
                        # Apply GMV filter if exists
                        if gmv_min is not None and total_gmv_calc < gmv_min:
                            continue
                        if gmv_max is not None and total_gmv_calc > gmv_max:
                            continue
                        
                        # Apply VIP tier filter using real GMV from invoice
                        if has_vip_filter:
                            total_gmv_for_vip = total_gmv_calc  # gmv sau + trước 2026 (tuỳ role)
                            if nhom_kh == "VIP 0-9" and not (total_gmv_for_vip < 10_000_000):
                                continue
                            elif nhom_kh == "VIP 10-19" and not (10_000_000 <= total_gmv_for_vip < 60_000_000):
                                continue
                            elif nhom_kh == "VIP 20-29" and not (60_000_000 <= total_gmv_for_vip < 160_000_000):
                                continue
                            elif nhom_kh == "VIP 30+" and not (total_gmv_for_vip >= 160_000_000):
                                continue
                            
                        # Apply PF filter if exists
                        if pf_min is not None and pf_calc < pf_min:
                            continue
                        if pf_max is not None and pf_calc > pf_max:
                            continue

                        
                        tuoi = None
                        ngay_sinh_str = None
                        if row[12] and str(row[12]).strip():
                            ngay_sinh_str = str(row[12]).strip()[:10]
                            try:
                                from datetime import datetime, date
                                birth = datetime.strptime(ngay_sinh_str, "%Y-%m-%d").date()
                                today = date.today()
                                tuoi = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
                            except Exception:
                                pass

                        customers_all.append({
                            "id_kh": int(row[0]) if row[0] else None,
                            "ma_kh": ma_kh,
                            "nhom_kh": row[2],
                            "ten_khach_hang": row[3],
                            "sdt": row[4],
                            "dia_chi": row[5],
                            "gmv": gmv, # Trả về gmv_sau
                            "gmv_truoc_2026": gmv_truoc, # Trả về gmv_truoc
                            "so_lan_mua": total_orders_calc,
                            "aov": aov,
                            "tham_nien": tham_nien_val,
                            "pf": pf_calc,
                            "chu_ky": chu_ky,
                            "recency": recency_dict.get(ma_kh, 0),
                            "gioi_tinh": row[11],
                            "tuoi": tuoi,
                            "ngay_sinh": ngay_sinh_str,
                            "mien": row[14],
                            "trang_thai": ""
                        })
                    
                    # Apply sorting if sort_by is provided
                    if sort_by and sort_by in ["gmv", "so_lan_mua", "tham_nien", "cap_vip", "recency"]:
                        reverse = sort_order == "desc"
                        if sort_by == "gmv":
                            customers_all.sort(key=lambda x: x.get("gmv", 0) if int(role_id) != 1 else (x.get("gmv", 0) + x.get("gmv_truoc_2026", 0)), reverse=reverse)
                        elif sort_by == "cap_vip":
                            def get_vip_level(gmv_val: float) -> int:
                                g = gmv_val / 1_000_000.0
                                if g < 1: return 0
                                if g < 10: return int(g)
                                if g < 60: return min(int((g - 10) / 5) + 10, 19)
                                if g < 160: return min(int((g - 60) / 10) + 20, 29)
                                return min(int((g - 160) / 50) + 30, 39)
                            customers_all.sort(key=lambda x: (get_vip_level(x.get("gmv", 0) + x.get("gmv_truoc_2026", 0)), x.get("aov", 0), x.get("gmv", 0) + x.get("gmv_truoc_2026", 0)), reverse=reverse)
                        elif sort_by == "recency":
                            customers_all.sort(key=lambda x: x.get("recency", 0), reverse=reverse)
                        else:
                            customers_all.sort(key=lambda x: x.get(sort_by, 0), reverse=reverse)
                        print(f"✅ [SORT] Sorted {len(customers_all)} customers by {sort_by} {sort_order}")
                    
                    # Calculate total after filtering
                    total = len(customers_all)
                    
                    # Apply pagination in Python
                    offset = (page - 1) * page_size
                    customers = customers_all[offset:offset + page_size]
                    
                else:
                    # Không có GMV filter và không có sort, giữ nguyên pagination trong SQL
                    # Get total count
                    cur.execute(count_query, count_params)
                    total = cur.fetchone()[0] or 0
                    
                    # Get paginated data
                    cur.execute(main_query, all_params)
                    rows = cur.fetchall()
                    
                    customers = []
                    for row in rows:
                        ma_kh = row[1]
                        gmv = gmv_dict.get(ma_kh, 0)
                        gmv_truoc = gmv_truoc_dict.get(ma_kh, 0)
                        so_lan_mua = so_lan_mua_dict.get(ma_kh, 0)
                        so_lan_mua_truoc = so_lan_mua_truoc_dict.get(ma_kh, 0)
                        
                        # Cấp nhân sự (role=4) chỉ tính GMV từ 2026, các cấp khác tính GMV cả trước 2026
                        # Số lần mua luôn tính toàn bộ
                        total_gmv_calc = gmv if role_id == 4 else (gmv + gmv_truoc)
                        total_orders_calc = so_lan_mua + so_lan_mua_truoc
                        
                        # AOV luôn tính trên toàn thời gian để xếp hạng VIP Badge hiển thị chính xác cho mọi role
                        total_all_time_gmv = gmv + gmv_truoc
                        total_all_time_so_lan_mua = so_lan_mua + so_lan_mua_truoc
                        aov = round(total_all_time_gmv / total_all_time_so_lan_mua, 0) if total_all_time_so_lan_mua > 0 else 0
                        
                        # Calculate PF dynamically based on total_orders_calc
                        tham_nien_val = float(row[9]) if row[9] else 0
                        pf_calc = round(total_orders_calc / tham_nien_val, 2) if tham_nien_val > 0 else 0
                        
                        so_ngay = so_ngay_tu_ngay_mua_dau_dict.get(ma_kh, 0)
                        real_total_orders = so_lan_mua + so_lan_mua_truoc
                        chu_ky = round(so_ngay / real_total_orders) if real_total_orders > 1 else 0
                        
                        tuoi = None
                        ngay_sinh_str = None
                        if row[12] and str(row[12]).strip():
                            ngay_sinh_str = str(row[12]).strip()[:10]
                            try:
                                from datetime import datetime, date
                                birth = datetime.strptime(ngay_sinh_str, "%Y-%m-%d").date()
                                today = date.today()
                                tuoi = today.year - birth.year - ((today.month, today.day) < (birth.month, birth.day))
                            except Exception:
                                pass

                        customers.append({
                            "id_kh": int(row[0]) if row[0] else None,
                            "ma_kh": ma_kh,
                            "nhom_kh": row[2],
                            "ten_khach_hang": row[3],
                            "sdt": row[4],
                            "dia_chi": row[5],
                            "gmv": gmv,
                            "gmv_truoc_2026": gmv_truoc,
                            "so_lan_mua": total_orders_calc,
                            "aov": aov,
                            "tham_nien": tham_nien_val,
                            "pf": pf_calc,
                            "chu_ky": chu_ky,
                            "recency": recency_dict.get(ma_kh, 0),
                            "gioi_tinh": row[11],
                            "tuoi": tuoi,
                            "ngay_sinh": ngay_sinh_str,
                            "mien": row[14],
                            "trang_thai": ""
                        })
                

                
                return {
                    "data": customers,
                    "total": total,
                    "page": page,
                    "page_size": page_size,
                    "total_pages": (total + page_size - 1) // page_size
                }
            except Exception as db_error:
                try:
                    from database import conn
                    conn.rollback()
                except:
                    pass
                print(f"Database error: {str(db_error)}")
                print(f"Count query: {count_query}")
                print(f"Main query: {main_query}")
                raise
                
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Full error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/dashboard/employee-overview")
async def get_employee_overview(
    from_date: Optional[str] = Query(None, description="Ngày bắt đầu (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Ngày kết thúc (YYYY-MM-DD)"),
    token: dict = Depends(check_token)
):
    """
    Lấy dữ liệu tổng quan cho nhân viên cá nhân
    - Tổng khách hàng
    - Số đơn hàng
    - Tổng GMV
    - ARPU
    - PF
    
    Trả về: đầu kỳ, cuối kỳ cho mỗi chỉ số
    """
    try:
        from database import conn
        
        # Lấy id_acc từ token
        id_acc = token.get("id_acc")
        if not id_acc:
            raise HTTPException(status_code=401, detail="Không tìm thấy thông tin người dùng")
        
        # Nếu không truyền ngày, mặc định là ngày hiện tại
        if not from_date or not to_date:
            today = date.today()
            from_date = today.strftime("%Y-%m-%d")
            to_date = today.strftime("%Y-%m-%d")
        
        # Parse dates
        start_date = datetime.strptime(from_date, "%Y-%m-%d").date()
        end_date = datetime.strptime(to_date, "%Y-%m-%d").date()
        
        # Ngày hôm trước from_date (để tính "đầu kỳ")
        day_before_start = (start_date - timedelta(days=1)).strftime("%Y-%m-%d")
        
        # 1. Số khách hàng của nhân viên tại đầu kỳ và cuối kỳ
        sql_customers_start = """
            SELECT COUNT(*)
            FROM khach_hang
            WHERE id_acc = %s
                AND DATE(thoi_gian_tao) <= %s;
        """
        
        sql_customers_end = """
            SELECT COUNT(*)
            FROM khach_hang
            WHERE id_acc = %s
                AND DATE(thoi_gian_tao) <= %s;
        """
        
        # 2. Lấy danh sách mã khách hàng của nhân viên
        sql_customer_codes = """
            SELECT ma_kh
            FROM khach_hang
            WHERE id_acc = %s;
        """
        
        # Lấy số khách hàng từ database conn (khach_hang)
        with conn.cursor() as cur:
            try:
                # Số khách hàng đến hết ngày trước from_date (đầu kỳ)
                cur.execute(sql_customers_start, (id_acc, day_before_start))
                so_khach_hang_dau_ky = cur.fetchone()[0] or 0
                
                # Số khách hàng đến hết to_date (cuối kỳ)
                cur.execute(sql_customers_end, (id_acc, to_date))
                so_khach_hang_cuoi_ky = cur.fetchone()[0] or 0
                
                # Lấy danh sách mã khách hàng
                cur.execute(sql_customer_codes, (id_acc,))
                customer_codes = [row[0] for row in cur.fetchall()]
            except Exception as e:
                try:
                    from database import conn
                    conn.rollback()
                except:
                    pass
                conn.rollback()
                raise e
        
        # 3. Lấy dữ liệu đơn hàng từ database conn_fm (invoice)
        so_don_hang_dau_ky = 0
        gmv_dau_ky = 0
        gmv_truoc_dau_ky = 0
        so_don_hang_cuoi_ky = 0
        gmv_cuoi_ky = 0
        gmv_truoc_cuoi_ky = 0
        
        if customer_codes:
            # Tạo placeholder cho IN clause
            placeholders = ','.join(['%s'] * len(customer_codes))
            
            sql_orders_start = f"""
                SELECT 
                    COUNT(*) AS so_don_hang,
                    COALESCE(SUM(CASE WHEN time_create >= '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) AS gmv,
                    COALESCE(SUM(CASE WHEN time_create < '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) AS gmv_truoc,
                    COUNT(CASE WHEN time_create < '2026-01-01 00:00:00+07' THEN 1 END) AS don_hang_truoc
                FROM invoice
                WHERE code_customer IN ({placeholders})
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
                WHERE code_customer IN ({placeholders})
                    AND DATE(time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') <= %s
                    AND id_status <> 12
            """
            
            with conn_fm.cursor() as cur_fm:
                # Lấy dữ liệu đầu kỳ (tính đến day_before_start)
                cur_fm.execute(sql_orders_start, customer_codes + [day_before_start])
                result_start = cur_fm.fetchone()
                so_don_hang_dau_ky = result_start[0] if result_start else 0
                gmv_dau_ky = float(result_start[1]) if result_start and result_start[1] else 0
                gmv_truoc_dau_ky = float(result_start[2]) if result_start and result_start[2] else 0
                don_hang_truoc_dau_ky = int(result_start[3]) if result_start and result_start[3] else 0
                
                # Lấy dữ liệu cuối kỳ (tính đến to_date)
                cur_fm.execute(sql_orders_end, customer_codes + [to_date])
                result_end = cur_fm.fetchone()
                so_don_hang_cuoi_ky = result_end[0] if result_end else 0
                gmv_cuoi_ky = float(result_end[1]) if result_end and result_end[1] else 0
                gmv_truoc_cuoi_ky = float(result_end[2]) if result_end and result_end[2] else 0
                don_hang_truoc_cuoi_ky = int(result_end[3]) if result_end and result_end[3] else 0
        
        # Tính ARPU (Dựa trên tổng GMV)
        arpu_dau_ky = (gmv_dau_ky + gmv_truoc_dau_ky) / so_don_hang_dau_ky if so_don_hang_dau_ky > 0 else 0
        arpu_cuoi_ky = (gmv_cuoi_ky + gmv_truoc_cuoi_ky) / so_don_hang_cuoi_ky if so_don_hang_cuoi_ky > 0 else 0
        
        # Tính PF (Purchase Frequency)
        pf_dau_ky = so_don_hang_dau_ky / so_khach_hang_dau_ky if so_khach_hang_dau_ky > 0 else 0
        pf_cuoi_ky = so_don_hang_cuoi_ky / so_khach_hang_cuoi_ky if so_khach_hang_cuoi_ky > 0 else 0
        
        return {
            "tong_khach_hang_dau_ky": so_khach_hang_dau_ky,
            "tong_khach_hang_cuoi_ky": so_khach_hang_cuoi_ky,
            "so_don_hang_dau_ky": so_don_hang_dau_ky,
            "so_don_hang_cuoi_ky": so_don_hang_cuoi_ky,
            "gmv_dau_ky": gmv_dau_ky,
            "gmv_cuoi_ky": gmv_cuoi_ky,
            "gmv_truoc_2026": gmv_truoc_cuoi_ky,
            "don_hang_truoc_2026_dau_ky": don_hang_truoc_dau_ky if customer_codes else 0,
            "don_hang_truoc_2026_cuoi_ky": don_hang_truoc_cuoi_ky if customer_codes else 0,
            "arpu_dau_ky": arpu_dau_ky,
            "arpu_cuoi_ky": arpu_cuoi_ky,
            "pf_dau_ky": pf_dau_ky,
            "pf_cuoi_ky": pf_cuoi_ky,
            "from_date": from_date,
            "to_date": to_date
        }
                
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Error in get_employee_overview: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/dashboard/admin-top-products")
async def get_admin_top_products(
    limit: int = Query(100, description="Số lượng sản phẩm top"),
    sort_by: str = Query("gmv", description="Sắp xếp theo: gmv hoặc so_lan_mua"),
    from_date: str = Query(None, description="Ngày bắt đầu (YYYY-MM-DD)"),
    to_date: str = Query(None, description="Ngày kết thúc (YYYY-MM-DD)"),
    token: dict = Depends(check_token)
):
    """
    Lấy danh sách top sản phẩm của toàn công ty (dành cho admin)
    - GMV: Tổng giá trị bán được (SUM(total))
    - Số lần bán: SUM(quantity)
    - Hỗ trợ lọc theo ngày
    """
    try:
        # Validate sort_by parameter
        if sort_by not in ["gmv", "so_lan_mua"]:
            raise HTTPException(status_code=400, detail="sort_by phải là 'gmv' hoặc 'so_lan_mua'")
        
        # Xác định ORDER BY clause
        if sort_by == "so_lan_mua":
            order_clause = "so_lan_ban DESC, gmv DESC"
        else:  # gmv
            order_clause = "gmv DESC"
        
        # Xây dựng WHERE clause với date filter
        where_clause = "1=1"
        params = []
        
        if from_date:
            where_clause += " AND DATE(inv.time_create) >= %s"
            params.append(from_date)
        
        if to_date:
            where_clause += " AND DATE(inv.time_create) <= %s"
            params.append(to_date)
        
        params.append(limit)
        
        sql_top_products = f"""
            SELECT 
                id.code_product,
                id.name_product,
                SUM(id.total) as gmv,
                SUM(id.quantity) as so_lan_ban
            FROM invoice_detail id
            INNER JOIN invoice inv ON id.code_invoice = inv.code_invoice
            WHERE {where_clause}
            GROUP BY id.code_product, id.name_product
            ORDER BY {order_clause}
            LIMIT %s;
        """
        
        with conn_fm.cursor() as cur_fm:
            cur_fm.execute(sql_top_products, params)
            rows = cur_fm.fetchall()
            
            print(f"📊 Found {len(rows) if rows else 0} products")
            
            products = []
            for idx, row in enumerate(rows, 1):
                products.append({
                    "stt": idx,
                    "code_product": row[0],
                    "name_product": row[1],
                    "gmv": float(row[2]) if row[2] else 0,
                    "so_lan_ban": int(row[3]) if row[3] else 0
                })
            
            return {
                "success": True,
                "data": products,
                "total": len(products),
                "sort_by": sort_by,
                "from_date": from_date,
                "to_date": to_date
            }
                
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"❌ Error in get_admin_top_products: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/dashboard/employee-top-products")
async def get_employee_top_products(
    limit: int = Query(100, description="Số lượng sản phẩm top"),
    sort_by: str = Query("gmv", description="Sắp xếp theo: gmv hoặc so_lan_mua"),
    token: dict = Depends(check_token)
):
    """
    Lấy danh sách top sản phẩm của nhân viên
    - GMV: Tổng giá trị bán được (SUM(total))
    - Số lần mua: COUNT(DISTINCT code_invoice) hoặc SUM(quantity)
    """
    try:
        from database import conn
        
        # Lấy id_acc từ token
        id_acc = token.get("id_acc")
        if not id_acc:
            raise HTTPException(status_code=401, detail="Không tìm thấy thông tin người dùng")
        
        # Validate sort_by parameter
        if sort_by not in ["gmv", "so_lan_mua"]:
            raise HTTPException(status_code=400, detail="sort_by phải là 'gmv' hoặc 'so_lan_mua'")
        
        # 1. Lấy danh sách mã khách hàng của nhân viên từ CRM
        sql_customer_codes = """
            SELECT ma_kh
            FROM khach_hang
            WHERE id_acc = %s;
        """
        
        with conn.cursor() as cur:
            cur.execute(sql_customer_codes, (id_acc,))
            customer_codes = [row[0] for row in cur.fetchall()]
        
        if not customer_codes:
            return {
                "success": True,
                "data": [],
                "total": 0,
                "sort_by": sort_by
            }
        
        # 2. Query top products từ invoice_detail join với invoice
        placeholders = ','.join(['%s'] * len(customer_codes))
        
        # Xác định ORDER BY clause
        if sort_by == "so_lan_mua":
            order_clause = "so_lan_mua DESC, gmv DESC"
        else:  # gmv
            order_clause = "gmv DESC"
        
        sql_top_products = f"""
            SELECT 
                id.code_product,
                id.name_product,
                SUM(id.total) as gmv,
                SUM(id.quantity) as so_lan_mua,
                COUNT(DISTINCT id.code_invoice) as so_don_hang
            FROM invoice_detail id
            INNER JOIN invoice inv ON id.code_invoice = inv.code_invoice
            WHERE inv.code_customer IN ({placeholders})
                AND inv.id_status NOT IN (5, 6, 7)
            GROUP BY id.code_product, id.name_product
            ORDER BY {order_clause}
            LIMIT %s;
        """
        
        with conn_fm.cursor() as cur_fm:
            cur_fm.execute(sql_top_products, customer_codes + [limit])
            rows = cur_fm.fetchall()
            
            products = []
            for idx, row in enumerate(rows, 1):
                products.append({
                    "stt": idx,
                    "code_product": row[0],
                    "name_product": row[1],
                    "gmv": float(row[2]) if row[2] else 0,
                    "so_lan_mua": int(row[3]) if row[3] else 0,
                    "so_don_hang": int(row[4]) if row[4] else 0
                })
            
            return {
                "success": True,
                "data": products,
                "total": len(products),
                "sort_by": sort_by
            }
                
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Error in get_employee_top_products: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/dashboard/employee-region-stats")
async def get_employee_region_stats(
    token: dict = Depends(check_token)
):
    """
    Lấy thống kê khách hàng theo vùng miền của nhân viên
    - Số lượng khách hàng theo từng miền (Bắc, Trung, Nam, Nước ngoài)
    - Tỷ trọng % của mỗi miền
    """
    try:
        from database import conn
        
        # Lấy id_acc từ token
        id_acc = token.get("id_acc")
        if not id_acc:
            raise HTTPException(status_code=401, detail="Không tìm thấy thông tin người dùng")
        
        # Query thống kê theo vùng miền
        sql = """
            SELECT 
                COALESCE(mien, 'Chưa xác định') as mien,
                COUNT(*) as so_khach_hang
            FROM khach_hang
            WHERE id_acc = %s
            GROUP BY mien
            ORDER BY 
                CASE 
                    WHEN mien = 'BẮC' THEN 1
                    WHEN mien = 'TRUNG' THEN 2
                    WHEN mien = 'NAM' THEN 3
                    WHEN mien = 'NƯỚC NGOÀI' THEN 4
                    ELSE 5
                END;
        """
        
        with conn.cursor() as cur:
            cur.execute(sql, (id_acc,))
            rows = cur.fetchall()
            
            # Tính tổng số khách hàng
            tong_khach_hang = sum(row[1] for row in rows)
            
            # Tạo danh sách kết quả
            regions = []
            for row in rows:
                mien = row[0]
                so_khach_hang = row[1]
                ty_trong = round((so_khach_hang / tong_khach_hang * 100), 2) if tong_khach_hang > 0 else 0
                
                regions.append({
                    "phan_loai": mien,
                    "so_khach_hang": so_khach_hang,
                    "ty_trong": ty_trong
                })
            
            return {
                "success": True,
                "data": regions,
                "tong_khach_hang": tong_khach_hang
            }
                
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Error in get_employee_region_stats: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/dashboard/employee-region-customers")
async def get_employee_region_customers(
    mien: str = Query(..., description="Vùng miền (BẮC, TRUNG, NAM, NƯỚC NGOÀI, Chưa xác định)"),
    token: dict = Depends(check_token)
):
    """
    Lấy danh sách khách hàng của nhân viên theo vùng miền
    """
    try:
        from database import conn
        
        id_acc = token.get("id_acc")
        if not id_acc:
            raise HTTPException(status_code=401, detail="Không tìm thấy thông tin người dùng")
        
        sql = """
            SELECT 
                ROW_NUMBER() OVER (ORDER BY gmv DESC) as stt,
                ma_kh as code_customer,
                ten_khach_hang as name_customer,
                sdt1 as phone_number,
                COALESCE(gmv, 0) as gmv,
                COALESCE(so_lan_mua, 0) as so_lan_mua,
                mien
            FROM khach_hang
            WHERE id_acc = %s AND COALESCE(mien, 'Chưa xác định') = %s
            ORDER BY gmv DESC
        """
        
        with conn.cursor() as cur:
            cur.execute(sql, (id_acc, mien))
            rows = cur.fetchall()
            
            customers = []
            for row in rows:
                customers.append({
                    "stt": row[0],
                    "code_customer": row[1],
                    "name_customer": row[2],
                    "phone_number": row[3],
                    "gmv": row[4],
                    "so_lan_mua": row[5],
                    "mien": row[6]
                })
            
            return {
                "success": True,
                "data": customers,
                "total": len(customers),
                "mien": mien
            }
                
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Error in get_employee_region_customers: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.post("/customers/{id_kh}/notes")
async def create_customer_note(
    id_kh: int,
    note: NoteCreate = Body(...),
    token: dict = Depends(check_token)
):
    """
    Thêm ghi chú mới cho khách hàng vào cột ghi_chu
    """
    try:
        from database import conn
        from datetime import datetime
        
        id_acc = token.get("id_acc")
        if not id_acc:
            raise HTTPException(status_code=401, detail="Không tìm thấy thông tin người dùng")
        
        thoi_gian = datetime.now()
        
        with conn.cursor() as cur:
            # Lưu vào bảng nhat_ky_ban_hang
            cur.execute("""
                INSERT INTO nhat_ky_ban_hang (id_kh, id_acc, noi_dung, thoi_gian, loai_ghi_chu)
                VALUES (%s, %s, %s, %s, %s)
            """, (id_kh, id_acc, note.noi_dung, thoi_gian, note.loai_ghi_chu))
            
            # Cập nhật thoi_gian_capnhat_ghichu trong bảng khach_hang
            cur.execute("""
                UPDATE khach_hang 
                SET thoi_gian_capnhat_ghichu = %s 
                WHERE id_kh = %s
            """, (thoi_gian, id_kh))
            
            conn.commit()
        
        return {
            "success": True,
            "message": "Đã thêm ghi chú thành công",
            "data": {
                "thoi_gian": thoi_gian.isoformat()
            }
        }
            
    except HTTPException:
        raise
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Error in create_customer_note: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/customers/{id_kh}/notes", response_model=List[NoteResponse])
async def get_customer_notes(
    id_kh: int,
    token: dict = Depends(check_token)
):
    """
    Lấy danh sách ghi chú của khách hàng từ cột ghi_chu
    """
    try:
        from database import conn
        import re
        
        # Lấy ghi chú từ khách hàng
        with conn.cursor() as cur:
            cur.execute("""
                SELECT ghi_chu, id_acc 
                FROM khach_hang 
                WHERE id_kh = %s
            """, (id_kh,))
            result = cur.fetchone()
            
            if not result:
                raise HTTPException(status_code=404, detail="Không tìm thấy khách hàng")
            
            id_acc = result[1]
        
        # Parse ghi chú text thành list các note
        new_notes = []
        
        # 1. Lấy ghi chú từ nhat_ky_ban_hang (Ghi chú mới)
        with conn.cursor() as cur:
            cur.execute("""
                SELECT nk.id, nk.id_kh, nk.id_acc, nk.noi_dung, nk.thoi_gian, nk.loai_ghi_chu, au.name
                FROM nhat_ky_ban_hang nk
                LEFT JOIN account_users au ON nk.id_acc = au.id_acc
                WHERE nk.id_kh = %s
                ORDER BY nk.thoi_gian DESC
            """, (id_kh,))
            rows = cur.fetchall()
            for row in rows:
                new_notes.append({
                    "id": row[0],
                    "id_kh": row[1],
                    "id_acc": row[2],
                    "noi_dung": row[3],
                    "thoi_gian": row[4].isoformat() if row[4] else None,
                    "loai_ghi_chu": row[5] or "ghi_chu",
                    "ten_nhan_vien": row[6] or "Nhân viên"
                })
        # 2. Toàn bộ ghi chú cũ đã được migrate vào nhat_ky_ban_hang
        # Nên chỉ cần return new_notes (đã chứa tất cả)
        return new_notes
            
    except HTTPException:
        raise
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Error in get_customer_notes: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


# Schema cho assign khách hàng
class AssignCustomersRequest(BaseModel):
    customer_ids: List[int]
    account_id: int


# API bàn giao khách hàng
@router.post("/customers/assign")
async def assign_customers(
    request: AssignCustomersRequest,
    token: dict = Depends(check_token)
):
    """
    Bàn giao nhiều khách hàng cho 1 nhân viên
    """
    try:
        from database import conn
        from model.thong_bao import add_thong_bao
        from sockets import sio, NAMESPACE_THONG_BAO
        from datetime import datetime
        
        if not request.customer_ids or len(request.customer_ids) == 0:
            raise HTTPException(status_code=400, detail="Danh sách khách hàng trống!")
        
        if not request.account_id:
            raise HTTPException(status_code=400, detail="Chưa chọn nhân viên phụ trách!")
        
        cursor = conn.cursor()
        
        # Kiểm tra account_id có tồn tại
        cursor.execute("SELECT id_acc, name, user_id FROM account_users WHERE id_acc = %s", (request.account_id,))
        account = cursor.fetchone()
        if not account:
            raise HTTPException(status_code=404, detail="Không tìm thấy nhân viên!")
        
        account_id = account[0]
        account_name = account[1]
        user_id = account[2]
        
        # Lấy thông tin người bàn giao
        assigner_id = token.get("id_acc")
        cursor.execute("SELECT name FROM account_users WHERE id_acc = %s", (assigner_id,))
        assigner = cursor.fetchone()
        assigner_name = assigner[0] if assigner else "Quản trị viên"
        
        # Update khách hàng
        success_count = 0
        assigned_customer_codes = []
        
        for customer_id in request.customer_ids:
            # Lấy mã khách hàng trước khi update
            cursor.execute("SELECT ma_kh FROM khach_hang WHERE id_kh = %s", (customer_id,))
            customer = cursor.fetchone()
            
            cursor.execute("""
                UPDATE khach_hang 
                SET id_acc = %s,
                    nhan_vien_pt = %s,
                    thoi_gian_capnhat = NOW()
                WHERE id_kh = %s
            """, (account_id, user_id, customer_id))
            
            if cursor.rowcount > 0:
                success_count += 1
                if customer:
                    assigned_customer_codes.append(customer[0])
        
        conn.commit()
        
        # Gửi thông báo cho nhân viên được bàn giao
        if success_count > 0:
            notification_data = {
                "id_acc": request.account_id,
                "time_update": datetime.now().isoformat(),
                "noi_dung": f"{assigner_name} đã bàn giao {success_count} khách hàng cho bạn. Mã KH: {', '.join(assigned_customer_codes[:5])}{' ...' if len(assigned_customer_codes) > 5 else ''}",
                "tieu_de": f"Bàn giao {success_count} khách hàng mới",
                "id_kh": assigned_customer_codes if assigned_customer_codes else None,
                "trang_thai": "chua_doc"
            }
            
            # Lưu thông báo vào database
            result = await add_thong_bao(notification_data)
            notification_data["id_tb"] = result["id_tb"]
            
            # Gửi thông báo realtime qua WebSocket
            await sio.emit(
                "new_thong_bao",
                notification_data,
                namespace=NAMESPACE_THONG_BAO,
                room=str(request.account_id)
            )
        
        cursor.close()
        
        return {
            "success": True,
            "message": f"Đã bàn giao {success_count}/{len(request.customer_ids)} khách hàng cho {account_name}",
            "assigned_count": success_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Error in assign_customers: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


# API lấy danh sách accounts (nhân viên)
@router.get("/accounts")
async def get_accounts(
    token: dict = Depends(check_token)
):
    """
    Lấy danh sách tất cả accounts/nhân viên để chọn người phụ trách
    """
    try:
        from database import conn
        
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                id_acc,
                name,
                chuc_vu,
                role_id
            FROM account_users
            WHERE role_id IN (2, 3, 4)
            AND trang_thai = 'Đang làm'
            ORDER BY name ASC
        """)
        
        accounts = []
        for row in cursor.fetchall():
            accounts.append({
                "id_acc": row[0],
                "name": row[1],
                "chuc_vu": row[2],
                "role_id": row[3]
            })
        
        cursor.close()
        
        return {
            "success": True,
            "data": accounts
        }
        
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Error in get_accounts: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


# API lấy thông báo của user hiện tại
@router.get("/notifications/my-notifications")
async def get_my_notifications(
    token: dict = Depends(check_token)
):
    """
    Lấy danh sách thông báo của user hiện tại (tối đa 50 thông báo gần nhất)
    """
    try:
        from database import conn
        
        user_id = token.get("id_acc")
        if not user_id:
            raise HTTPException(status_code=401, detail="Chưa xác thực!")
        
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                id_tb,
                id_acc,
                ngay_thong_bao,
                noi_dung,
                tieu_de,
                id_kh,
                trang_thai
            FROM thong_bao
            WHERE id_acc = %s
            ORDER BY ngay_thong_bao DESC
            LIMIT 50
        """, (user_id,))
        
        notifications = cursor.fetchall()
        cursor.close()
        
        if not notifications:
            return []
        
        # Format response
        result = []
        for notif in notifications:
            result.append({
                "id_tb": notif[0],
                "id_acc": notif[1],
                "ngay_thong_bao": notif[2].isoformat() if notif[2] else None,
                "noi_dung": notif[3],
                "tieu_de": notif[4],
                "id_kh": notif[5],
                "trang_thai": notif[6]
            })
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Error in get_my_notifications: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/dashboard/search-products")
async def search_products(
    q: str = Query(..., description="Từ khóa tìm kiếm tên sản phẩm"),
    limit: int = Query(10, description="Số lượng kết quả tối đa"),
    exclude_deal_soc: bool = Query(False, description="True: loại bỏ sản phẩm deal sốc (mã DS%), False: lấy cả deal sốc"),
    token: dict = Depends(check_token)
):
    """
    Tìm kiếm sản phẩm trong database fm_tdvn theo tên
    Chỉ lấy các sản phẩm có status = 'Hoạt động'
    
    Parameters:
    - q: Từ khóa tìm kiếm
    - limit: Số lượng kết quả tối đa
    - exclude_deal_soc: True = loại bỏ sản phẩm deal sốc, False = lấy cả deal sốc
    """
    try:
        search_term = f"%{q}%"
        
        # Build WHERE clause động
        where_clauses = [
            "status = 'Hoạt động'",
            "name_product ILIKE %s"
        ]
        params = [search_term]
        
        # Thêm điều kiện lọc deal sốc nếu cần
        if exclude_deal_soc:
            where_clauses.append("code_product NOT LIKE %s")
            params.append('DS%')
        
        where_clause = " AND ".join(where_clauses)
        params.append(limit)
        
        sql = f"""
            SELECT 
                id_product,
                code_product,
                name_product,
                price,
                weight,
                unit,
                status
            FROM products
            WHERE {where_clause}
            ORDER BY name_product
            LIMIT %s
        """
        
        with conn_fm.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            
            products = []
            for row in rows:
                products.append({
                    "id_product": row[0],
                    "code_product": row[1],
                    "name_product": row[2],
                    "price": float(row[3]) if row[3] else 0,
                    "weight": float(row[4]) if row[4] else 0,
                    "unit": row[5],
                    "status": row[6]
                })
            
            return {
                "success": True,
                "data": products,
                "total": len(products)
            }
    
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Error in search_products: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/dashboard/product-customers")
async def get_product_customers(
    code_product: str = Query(..., description="Mã sản phẩm"),
    sort_by: str = Query("gmv", description="Sắp xếp theo: gmv hoặc so_lan_mua"),
    token: dict = Depends(check_token)
):
    """
    Lấy danh sách khách hàng đã mua một sản phẩm cụ thể
    Trả về: Mã KH, Tên KH, SĐT, Số lần mua, GMV
    Sắp xếp theo GMV hoặc số lần mua (từ cao đến thấp)
    """
    try:
        from database import conn
        
        # Lấy id_acc từ token
        id_acc = token.get("id_acc")
        if not id_acc:
            raise HTTPException(status_code=401, detail="Không tìm thấy thông tin người dùng")
        
        # Step 1: Lấy danh sách khách hàng thuộc về user từ db crm_tdvn
        sql_customers = """
            SELECT id_kh, ma_kh, ten_khach_hang, COALESCE(sdt1, sdt2)
            FROM khach_hang
            WHERE id_acc = %s
        """
        
        customer_map = {}
        with conn.cursor() as cur:
            cur.execute(sql_customers, (id_acc,))
            rows = cur.fetchall()
            for row in rows:
                customer_map[row[0]] = {  # key: id_kh
                    "ma_kh": row[1],
                    "ten_khach_hang": row[2],
                    "sdt": row[3]
                }
        
        if not customer_map:
            return {
                "success": True,
                "data": [],
                "total": 0,
                "code_product": code_product,
                "sort_by": sort_by
            }
        
        # Step 2: Lấy danh sách invoice_detail cho sản phẩm từ db fm_tdvn
        # Filter theo danh sách khách hàng từ step 1
        sql_purchases = """
            SELECT 
                i.id_customer,
                COUNT(DISTINCT i.code_invoice) as so_lan_mua,
                SUM(id.total) as gmv,
                SUM(id.quantity) as so_luong
            FROM invoice i
            INNER JOIN invoice_detail id ON i.code_invoice = id.code_invoice
            WHERE id.code_product = %s
            AND i.id_customer = ANY(%s)
            AND i.id_status NOT IN (1, 2, 3, 4)
            GROUP BY i.id_customer
        """
        
        customer_ids = list(customer_map.keys())
        
        with conn_fm.cursor() as cur:
            cur.execute(sql_purchases, (code_product, customer_ids))
            rows = cur.fetchall()
            
            # Sắp xếp theo gmv hoặc so_lan_mua
            order_key = 2 if sort_by == "gmv" else 1
            sorted_rows = sorted(rows, key=lambda x: x[order_key] or 0, reverse=True)
            
            customers = []
            for idx, row in enumerate(sorted_rows, 1):
                id_customer = row[0]
                so_lan_mua = row[1]
                gmv = row[2]
                so_luong = row[3]
                
                if id_customer in customer_map:
                    customer_info = customer_map[id_customer]
                    customers.append({
                        "stt": idx,
                        "code_customer": customer_info["ma_kh"],
                        "name_customer": customer_info["ten_khach_hang"],
                        "phone_number": customer_info["sdt"],
                        "so_lan_mua": so_lan_mua,
                        "so_luong": int(so_luong) if so_luong else 0,
                        "gmv": float(gmv) if gmv else 0
                    })
            
            return {
                "success": True,
                "data": customers,
                "total": len(customers),
                "code_product": code_product,
                "sort_by": sort_by
            }
    
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Error in get_product_customers: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/dashboard/f0-target")
async def get_f0_target_data(token: dict = Depends(check_token)):
    """
    API lấy dữ liệu cho bảng mục tiêu F0
    - Lấy dữ liệu từ bảng invoice của db fm_tdvn
    - Tính kết quả ngày hôm qua theo kênh bán hàng
    - Lọc status_value khác "Đã huỷ"
    """
    try:
        from database import conn_fm
        from datetime import date, timedelta, datetime
        
        # Lấy ngày hôm qua
        today = date.today()
        yesterday = today - timedelta(days=1)
        yesterday_start = datetime.combine(yesterday, datetime.min.time())
        yesterday_end = datetime.combine(yesterday, datetime.max.time())
        
        print(f"📊 [F0 TARGET] Querying F0 data for date: {yesterday}")
        
        # Mapping kênh
        channel_mapping = {
            "SHOPEE": "SHOPEE MALL",
            "TIKTOK SHOP ADS": "TIKTOK SHOP",
            "FACEBOOK": "FACEBOOK",
            "WEBSITE": "WEBSITE",
            "GG/YTB": "GG/YTB",
        }
        
        channels_data = []
        total_revenue = 0
        
        with conn_fm.cursor() as cur_fm:
            # Truy vấn cho mỗi kênh
            for channel_display, channel_db in channel_mapping.items():
                cur_fm.execute("""
                    SELECT 
                        COUNT(*) as so_don,
                        SUM(total_amount) as doanh_so
                    FROM invoice
                    WHERE time_create >= %s 
                        AND time_create < %s
                        AND status_value != 'Đã huỷ'
                        AND name_salechannel = %s
                """, (yesterday_start, yesterday_end, channel_db))
                
                result = cur_fm.fetchone()
                so_don = int(result[0]) if result[0] else 0
                doanh_so = float(result[1]) if result[1] else 0
                aov = doanh_so / so_don if so_don > 0 else 0
                
                total_revenue += doanh_so
                
                channels_data.append({
                    "channel": channel_display,
                    "result": doanh_so,
                    "orders": so_don,
                    "aov": aov
                })
            
            # Tính tỉ trọng cho mỗi kênh
            for channel in channels_data:
                channel["ti_trong"] = (channel["result"] / total_revenue * 100) if total_revenue > 0 else 0
        
        print(f"✅ [F0 TARGET] Loaded data for {len(channels_data)} channels, total revenue: {total_revenue}")
        
        return {
            "success": True,
            "data": channels_data,
            "total_revenue": total_revenue,
            "date": today.isoformat(),
            "yesterday": yesterday.isoformat()
        }
    
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Error in get_f0_target_data: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/dashboard/fn-target")
async def get_fn_target_data(token: dict = Depends(check_token)):
    """
    API lấy dữ liệu cho bảng mục tiêu FN
    - Lấy danh sách nhân viên có role_id = 4
    - Tính số cơ hội (số khách hàng có ngay_hen_banhang trong ngày hôm nay)
    - Tính kết quả ngày hôm qua (số đơn, doanh số) từ bảng invoice
    - Tính số đơn dự kiến theo tỉ lệ chuyển đổi dựa trên số lần mua từ bảng invoice:
      + Cấp 1: 5% (đã mua 1 lần)
      + Cấp 2: 6.5% (đã mua 2-4 lần)
      + Cấp 3: 9% (đã mua 5-9 lần)
      + Cấp 4: 10% (đã mua 10-19 lần)
      + Cấp 5: 30% (đã mua từ 20 lần trở lên)
    """
    try:
        from database import conn
        from datetime import date, timedelta
        
        # Lấy ngày hôm nay và hôm qua
        today = date.today()
        yesterday = today - timedelta(days=1)
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())
        yesterday_start = datetime.combine(yesterday, datetime.min.time())
        yesterday_end = datetime.combine(yesterday, datetime.max.time())
        
        # Bước 1: Lấy số lần mua của từng khách hàng từ bảng invoice (db fm_tdvn)
        print(f"📊 [FN TARGET] Calculating purchase count from invoice table...")
        purchase_count_dict = {}  # {code_customer: so_lan_mua}
        
        with conn_fm.cursor() as cur_fm:
            cur_fm.execute("""
                SELECT 
                    i.code_customer,
                    COUNT(*) as so_lan_mua
                FROM invoice i
                WHERE i.id_status <> 12
                GROUP BY i.code_customer
            """)
            purchase_results = cur_fm.fetchall()
            for row in purchase_results:
                if row[0]:  # code_customer
                    purchase_count_dict[row[0]] = int(row[1]) if row[1] else 0
        
        print(f"✅ [FN TARGET] Loaded purchase count for {len(purchase_count_dict)} customers")
        
        # Bước 2: Lấy kết quả ngày hôm qua (số đơn và doanh số) cho từng nhân viên
        print(f"📊 [FN TARGET] Calculating yesterday results from invoice table...")
        yesterday_results = {}  # {id_seller: {so_don: x, doanh_so: y}}
        
        with conn_fm.cursor() as cur_fm:
            cur_fm.execute("""
                SELECT 
                    i.id_seller,
                    COUNT(*) as so_don,
                    SUM(i.total_amount) as doanh_so
                FROM invoice i
                WHERE i.time_create >= %s 
                    AND i.time_create < %s
                    AND i.status_value != 'Đã huỷ'
                GROUP BY i.id_seller
            """, (yesterday_start, yesterday_end))
            
            yesterday_rows = cur_fm.fetchall()
            for row in yesterday_rows:
                if row[0]:  # id_seller
                    yesterday_results[row[0]] = {
                        "so_don": int(row[1]) if row[1] else 0,
                        "doanh_so": float(row[2]) if row[2] else 0
                    }
        
        print(f"✅ [FN TARGET] Loaded yesterday results for {len(yesterday_results)} sellers")
        
        with conn.cursor() as cur:
            # Bước 3: Lấy danh sách nhân viên role_id = 4 và khách hàng cần chăm sóc hôm nay
            sql = """
                SELECT 
                    au.id_acc,
                    au.user_id,
                    au.name,
                    au.chuc_vu,
                    kh.id_kh,
                    kh.ma_kh
                FROM account_users au
                LEFT JOIN khach_hang kh ON au.id_acc = kh.id_acc
                    AND kh.ngay_hen_banhang IS NOT NULL
                    AND DATE(kh.ngay_hen_banhang) = %s
                WHERE au.role_id = 4
                    AND au.trang_thai = 'Đang làm'
                ORDER BY au.name ASC
            """
            
            cur.execute(sql, (today,))
            rows = cur.fetchall()
            
            # Tỉ lệ chuyển đổi cho mỗi cấp
            conversion_rates = {
                "cap1": 0.05,   # 5%
                "cap2": 0.065,  # 6.5%
                "cap3": 0.09,   # 9%
                "cap4": 0.10,   # 10%
                "cap5": 0.30    # 30%
            }
            
            # Nhóm dữ liệu theo nhân viên
            salesman_data = {}
            for row in rows:
                id_acc = row[0]
                user_id = row[1]
                name = row[2]
                chuc_vu = row[3]
                id_kh = row[4]
                ma_kh = row[5]
                
                if id_acc not in salesman_data:
                    salesman_data[id_acc] = {
                        "user_id": user_id,
                        "name": name,
                        "chuc_vu": chuc_vu,
                        "customers": []
                    }
                
                if id_kh and ma_kh:
                    salesman_data[id_acc]["customers"].append(ma_kh)
            
            # Tính toán cho từng nhân viên
            salesmen = []
            total_doanh_so_yesterday = sum(data["doanh_so"] for data in yesterday_results.values())
            
            for id_acc, data in salesman_data.items():
                cap1 = cap2 = cap3 = cap4 = cap5 = 0
                co_hoi = len(data["customers"])
                
                # Phân loại khách hàng theo số lần mua từ invoice
                for ma_kh in data["customers"]:
                    so_lan_mua = purchase_count_dict.get(ma_kh, 0)
                    
                    if so_lan_mua == 1:
                        cap1 += 1
                    elif 2 <= so_lan_mua <= 4:
                        cap2 += 1
                    elif 5 <= so_lan_mua <= 9:
                        cap3 += 1
                    elif 10 <= so_lan_mua <= 19:
                        cap4 += 1
                    elif so_lan_mua >= 20:
                        cap5 += 1
                
                # Tính số đơn dự kiến
                so_don_du_kien = (
                    cap1 * conversion_rates["cap1"] +
                    cap2 * conversion_rates["cap2"] +
                    cap3 * conversion_rates["cap3"] +
                    cap4 * conversion_rates["cap4"] +
                    cap5 * conversion_rates["cap5"]
                )
                
                # AOV dự kiến tạm thời = 650,000
                aov_du_kien = 650000
                # Doanh số dự kiến = Số đơn dự kiến × AOV dự kiến
                doanh_so_du_kien = so_don_du_kien * aov_du_kien
                
                # Lấy kết quả ngày hôm qua
                yesterday_data = yesterday_results.get(id_acc, {"so_don": 0, "doanh_so": 0})
                so_don_yesterday = yesterday_data["so_don"]
                doanh_so_yesterday = yesterday_data["doanh_so"]
                aov_yesterday = doanh_so_yesterday / so_don_yesterday if so_don_yesterday > 0 else 0
                ti_trong_yesterday = (doanh_so_yesterday / total_doanh_so_yesterday * 100) if total_doanh_so_yesterday > 0 else 0
                
                salesmen.append({
                    "id_acc": id_acc,
                    "user_id": data["user_id"],
                    "name": data["name"],
                    "chuc_vu": data["chuc_vu"],
                    "co_hoi": co_hoi,
                    "so_don_du_kien": round(so_don_du_kien, 2),
                    "doanh_so_du_kien": round(doanh_so_du_kien, 2),
                    "aov_du_kien": aov_du_kien,
                    # Kết quả ngày hôm qua
                    "so_don_yesterday": so_don_yesterday,
                    "doanh_so_yesterday": round(doanh_so_yesterday, 2),
                    "aov_yesterday": round(aov_yesterday, 2),
                    "ti_trong_yesterday": round(ti_trong_yesterday, 2),
                    # Debug info
                    "cap1": cap1,
                    "cap2": cap2,
                    "cap3": cap3,
                    "cap4": cap4,
                    "cap5": cap5
                })
            
            return {
                "success": True,
                "data": salesmen,
                "date": today.isoformat(),
                "yesterday": yesterday.isoformat()
            }
    
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Error in get_fn_target_data: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")

@router.get("/dashboard/my-fn-target")
async def get_my_fn_target_data(token: dict = Depends(check_token)):
    """
    API lấy dữ liệu mục tiêu FN của nhân viên cá nhân (cho dashboard của nhân sự)
    - Tính số cơ hội (số khách hàng có ngay_hen_banhang trong ngày hôm nay)
    - Tính kết quả ngày hôm qua (số đơn, doanh số) từ bảng invoice
    - Tính số đơn dự kiến theo tỉ lệ chuyển đổi dựa trên số lần mua
    """
    try:
        from database import conn
        from datetime import date, timedelta
        
        # Lấy id_acc từ token
        id_acc = token.get("id_acc")
        if not id_acc:
            raise HTTPException(status_code=401, detail="Không tìm thấy thông tin người dùng")
        
        # Lấy ngày hôm nay và hôm qua
        today = date.today()
        yesterday = today - timedelta(days=1)
        today_start = datetime.combine(today, datetime.min.time())
        today_end = datetime.combine(today, datetime.max.time())
        yesterday_start = datetime.combine(yesterday, datetime.min.time())
        yesterday_end = datetime.combine(yesterday, datetime.max.time())
        
        # Bước 1: Lấy số lần mua của từng khách hàng từ bảng invoice
        print(f"📊 [MY FN TARGET] Calculating purchase count for user {id_acc}...")
        purchase_count_dict = {}  # {code_customer: so_lan_mua}
        
        with conn_fm.cursor() as cur_fm:
            cur_fm.execute("""
                SELECT 
                    i.code_customer,
                    COUNT(*) as so_lan_mua
                FROM invoice i
                WHERE i.id_status <> 12
                GROUP BY i.code_customer
            """)
            purchase_results = cur_fm.fetchall()
            for row in purchase_results:
                if row[0]:  # code_customer
                    purchase_count_dict[row[0]] = int(row[1]) if row[1] else 0
        
        # Bước 2: Lấy kết quả ngày hôm qua
        print(f"📊 [MY FN TARGET] Calculating yesterday results...")
        so_don_yesterday = 0
        doanh_so_yesterday = 0
        
        with conn_fm.cursor() as cur_fm:
            cur_fm.execute("""
                SELECT 
                    COUNT(*) as so_don,
                    SUM(i.total_amount) as doanh_so
                FROM invoice i
                WHERE i.id_seller = %s
                    AND i.time_create >= %s 
                    AND i.time_create < %s
                    AND i.status_value != 'Đã huỷ'
            """, (id_acc, yesterday_start, yesterday_end))
            
            row = cur_fm.fetchone()
            if row:
                so_don_yesterday = int(row[0]) if row[0] else 0
                doanh_so_yesterday = float(row[1]) if row[1] else 0
        
        with conn.cursor() as cur:
            # Bước 3: Lấy danh sách khách hàng cần chăm sóc hôm nay của nhân viên này
            sql = """
                SELECT 
                    kh.ma_kh
                FROM khach_hang kh
                WHERE kh.id_acc = %s
                    AND kh.ngay_hen_banhang IS NOT NULL
                    AND DATE(kh.ngay_hen_banhang) = %s
            """
            
            cur.execute(sql, (id_acc, today))
            rows = cur.fetchall()
            
            # Tỉ lệ chuyển đổi cho mỗi cấp
            conversion_rates = {
                "cap1": 0.05,   # 5%
                "cap2": 0.065,  # 6.5%
                "cap3": 0.09,   # 9%
                "cap4": 0.10,   # 10%
                "cap5": 0.30    # 30%
            }
            
            # Phân loại khách hàng và tính toán
            cap1 = cap2 = cap3 = cap4 = cap5 = 0
            customers = []
            
            for row in rows:
                ma_kh = row[0]
                customers.append(ma_kh)
                
                so_lan_mua = purchase_count_dict.get(ma_kh, 0)
                
                if so_lan_mua == 1:
                    cap1 += 1
                elif 2 <= so_lan_mua <= 4:
                    cap2 += 1
                elif 5 <= so_lan_mua <= 9:
                    cap3 += 1
                elif 10 <= so_lan_mua <= 19:
                    cap4 += 1
                elif so_lan_mua >= 20:
                    cap5 += 1
            
            co_hoi = len(customers)
            
            # Tính số đơn dự kiến
            so_don_du_kien = (
                cap1 * conversion_rates["cap1"] +
                cap2 * conversion_rates["cap2"] +
                cap3 * conversion_rates["cap3"] +
                cap4 * conversion_rates["cap4"] +
                cap5 * conversion_rates["cap5"]
            )
            
            # AOV dự kiến
            aov_du_kien = 650000
            # Doanh số dự kiến = Số đơn dự kiến × AOV dự kiến
            doanh_so_du_kien = so_don_du_kien * aov_du_kien
            
            # Tính AOV và tỉ lệ chuyển đổi ngày hôm qua
            aov_yesterday = doanh_so_yesterday / so_don_yesterday if so_don_yesterday > 0 else 0
            ti_le_chuyen_doi = (so_don_du_kien / co_hoi * 100) if co_hoi > 0 else 0
            
            return {
                "success": True,
                "data": {
                    "co_hoi": co_hoi,
                    "so_don_du_kien": round(so_don_du_kien, 2),
                    "doanh_so_du_kien": round(doanh_so_du_kien, 2),
                    "aov_du_kien": aov_du_kien,
                    "ti_le_chuyen_doi": round(ti_le_chuyen_doi, 2),
                    # Kết quả ngày hôm qua
                    "so_don_yesterday": so_don_yesterday,
                    "doanh_so_yesterday": round(doanh_so_yesterday, 2),
                    "aov_yesterday": round(aov_yesterday, 2),
                    # Debug info
                    "cap1": cap1,
                    "cap2": cap2,
                    "cap3": cap3,
                    "cap4": cap4,
                    "cap5": cap5
                },
                "date": today.isoformat(),
                "yesterday": yesterday.isoformat()
            }
    
    except Exception as e:
        try:
            from database import conn
            conn.rollback()
        except:
            pass
        import traceback
        print(f"Error in get_my_fn_target_data: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")
