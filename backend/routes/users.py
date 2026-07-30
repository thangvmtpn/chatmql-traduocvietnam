from typing import List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from utils.security import check_token
from schemas import NhanVienRequest, NhanVienResponse
from model.users import them_nhan_vien,them_nhan_vien_tu_HRM, get_quanli, get_list_user, tim_kiem_user, get_all_users, timkiemnguoidung, check_user, get_user_with_department
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# API lấy thông tin user hiện tại (bao gồm tên phòng ban)
@router.get("/users/me")
async def read_users_me(current_user: dict = Depends(check_token)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Không tìm thấy user!")
    
    # Lấy thông tin user kèm department name
    username = current_user.get("username")
    if username:
        user_with_dept = await get_user_with_department(username)
        if user_with_dept:
            return {
                "id_acc": user_with_dept.get("id_acc"),
                "user_id": user_with_dept.get("user_id"),  # Mã nhân viên
                "name": user_with_dept.get("name"),
                "chuc_vu": user_with_dept.get("chuc_vu"),  # Chức danh
                "role_id": user_with_dept.get("role_id"),
                "department_id": user_with_dept.get("department_id"),
                "department_name": user_with_dept.get("department_name"),  # Tên phòng ban
                "sub_account": user_with_dept.get("sub_account"),
            }
    
    # Fallback nếu không tìm thấy
    return {
        "id_acc": current_user.get("id_acc"),
        "user_id": current_user.get("user_id"),
        "name": current_user.get("name"),
        "chuc_vu": current_user.get("chuc_vu"),
        "role_id": current_user.get("role_id"),
        "department_id": current_user.get("department_id"),
        "sub_account": current_user.get("sub_account"),
    }

# API Thêm nhân viên mới
@router.post("/users/add", response_model=NhanVienResponse)
async def add_user(user: NhanVienRequest, token: dict = Depends(check_token)):
    try:
        new_user_id = await them_nhan_vien(user)
        if not new_user_id:
            raise HTTPException(status_code=400, detail="Lỗi khi thêm nhân viên!")

        return {**user.dict(), "id_acc": new_user_id}  # Trả về thông tin nhân viên mới

    except Exception as e:
        logger.error(f"Lỗi thêm nhân viên: {str(e)}")  # Ghi log lỗi
        raise HTTPException(status_code=500, detail="Lỗi server khi thêm nhân viên!")
    
@router.post("/users/add_HRM", response_model=NhanVienResponse)
async def add_user(user: NhanVienRequest, token: dict = Depends(check_token)):
    try:
        new_user_id = await them_nhan_vien_tu_HRM(user)
        if not new_user_id:
            raise HTTPException(status_code=400, detail="Lỗi khi thêm nhân viên!")

        return {**user.dict(), "id_acc": new_user_id}  # Trả về thông tin nhân viên mới

    except Exception as e:
        logger.error(f"Lỗi thêm nhân viên: {str(e)}")  # Ghi log lỗi
        raise HTTPException(status_code=500, detail="Lỗi server khi thêm nhân viên!")

@router.get("/users/quanli")
async def get_quanli_api(
    phongban: Optional[Union[str, int]] = None, 
    capcha: int = Query(...), 
    token: dict = Depends(check_token)
):
    try:
        # Nếu phongban là "null" hoặc None, đặt thành None
        if phongban in ["null", None, ""]:
            phongban = None
        else:
            try:
                phongban = int(phongban)  # Ép kiểu nếu có giá trị số
            except ValueError:
                raise HTTPException(status_code=400, detail="phongban phải là số hoặc null")

        list_quanli = await get_quanli(phongban, capcha)
        return {"success": True, "data": list_quanli}
    
    except Exception as e:
        logger.error(f"Lỗi khi lấy danh sách quản lý: {str(e)}")
        raise HTTPException(status_code=500, detail="Lỗi server")
    
@router.post("/user/get_list_user")
async def get_list_user_api(request: Request, token: dict = Depends(check_token)):
    try:
        data = await request.json()   # Lấy body JSON thành dict
        userInfo = data.get("userInfo", {})
        list_acc = await get_list_user(userInfo)
        
        return list_acc
    except Exception as e:
        logger.error(f"Lỗi khi lấy danh sách user: {str(e)}")
        raise HTTPException(status_code=500, detail="Lỗi server")
    
@router.get("/user/all-users")
async def api_get_all_users(token: dict = Depends(check_token)):
    try:
        users = await get_all_users()
        return {"success": True, "data": users}
    except Exception as e:
        logger.error(f"Lỗi khi lấy tất cả user: {str(e)}")
        raise HTTPException(status_code=500, detail="Lỗi server")

    
@router.get("/user/tim-kiem-user")
async def api_tim_kiem_user(key_tk: str = Query(..., description="Từ khóa tìm kiếm"), 
                       truong_tk: str = Query(..., description="Cột tìm kiếm")):
    return await tim_kiem_user(key_tk, truong_tk)


@router.get("/users/search")
async def api_tim_kiem_user(query: str, token: dict = Depends(check_token)):
    return await timkiemnguoidung(query)

# API tìm kiếm khách hàng theo mã khách hàng hoặc SDT
@router.get("/customers/search")
async def search_customers(query: str, token: dict = Depends(check_token)):
    """
    Tìm kiếm khách hàng theo mã khách hàng (ma_kh) hoặc SDT (sdt1, sdt2)
    Returns: List of customers with their current handler (name_pt)
    """
    from database import conn
    print(f"🔍 Search customers: query={query}")
    try:
        with conn.cursor() as cur:
            # Tìm kiếm theo mã khách hàng hoặc SDT
            search_query = f"%{query}%"
            cur.execute("""
                SELECT 
                    kh.id_kh, 
                    kh.ma_kh,
                    kh.ten_khach_hang, 
                    kh.sdt1,
                    kh.sdt2,
                    kh.name_pt,
                    kh.id_acc
                FROM khach_hang kh
                WHERE kh.ma_kh ILIKE %s 
                   OR kh.sdt1 ILIKE %s 
                   OR kh.sdt2 ILIKE %s
                ORDER BY kh.ten_khach_hang
                LIMIT 20
            """, (search_query, search_query, search_query))
            
            customers = cur.fetchall()
            result = []
            for customer in customers:
                result.append({
                    "id_kh": customer[0],
                    "ma_kh": customer[1],
                    "ten_khach_hang": customer[2],
                    "sdt1": customer[3],
                    "sdt2": customer[4],
                    "nhan_vien_pt": customer[5],
                    "id_acc": customer[6]
                })
            
            print(f"✅ Found {len(result)} customers")
            return {"success": True, "data": result}
    except Exception as e:
        print(f"❌ Search error: {str(e)}")
        return {"success": False, "error": str(e)}

@router.get("/user/trangchu")
async def trangchu(token: dict = Depends(check_token)):
    check = await check_user(token)
    if check is False:
        return False
    return {"message": "Chào mừng bạn đến Trang Chủ", "name": token["name"]}
@router.get("/department/list")
async def get_all_departments(token: dict = Depends(check_token)):
    from database import conn
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT department_id, department_name FROM departments ORDER BY department_name")
            columns = [desc[0] for desc in cur.description]
            departments = [dict(zip(columns, row)) for row in cur.fetchall()]
            return {"success": True, "data": departments}
    except Exception as e:
        logger.error(f"Lỗi lấy danh sách phòng ban: {str(e)}")
        raise HTTPException(status_code=500, detail="Lỗi server")

@router.get("/department/{dept_id}/members")
async def get_department_members(dept_id: int, token: dict = Depends(check_token)):
    from database import conn
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id_acc, user_id, name, chuc_vu, username, role_id 
                FROM account_users 
                WHERE department_id = %s
                ORDER BY name
            """, (dept_id,))
            columns = [desc[0] for desc in cur.description]
            members = [dict(zip(columns, row)) for row in cur.fetchall()]
            return {"success": True, "data": members}
    except Exception as e:
        logger.error(f"Lỗi lấy nhân sự phòng ban {dept_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Lỗi server")
