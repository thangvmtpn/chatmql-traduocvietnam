import asyncio
import json
import pprint
import traceback
from typing import Dict, List, Optional
from database import conn
from psycopg import sql
from utils.security import get_google_sheet
from datetime import datetime
from utils.security import decode_token

async def get_user(username: str):
    with conn.cursor() as cur:
        cur.execute("SELECT id_acc, user_id, name, chuc_vu, username, password, role_id, department_id, sub_account FROM account_users WHERE username = %s", (username,))
        user = cur.fetchone()
        if user:
            return {"id_acc": user[0], "user_id": user[1], "name": user[2], "chuc_vu": user[3], "username": user[4], "password": user[5], "role_id": user[6], "department_id": user[7], "sub_account": user[8]}
    return None


async def get_user_with_department(username: str):
    """
    Lấy thông tin user kèm theo tên phòng ban từ bảng departments
    """
    try:
        conn.rollback()
    except Exception:
        pass
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 
                u.id_acc, 
                u.user_id, 
                u.name, 
                u.chuc_vu, 
                u.username, 
                u.password, 
                u.role_id, 
                u.department_id,
                u.sub_account,
                d.department_name
            FROM account_users u
            LEFT JOIN departments d ON u.department_id = d.department_id
            WHERE u.username = %s
        """, (username,))
        user = cur.fetchone()
        if user:
            return {
                "id_acc": user[0], 
                "user_id": user[1], 
                "name": user[2], 
                "chuc_vu": user[3], 
                "username": user[4], 
                "password": user[5], 
                "role_id": user[6], 
                "department_id": user[7], 
                "sub_account": user[8],
                "department_name": user[9]  # Tên phòng ban
            }
    return None


async def get_phanquyen(id_acc: int):
    with conn.cursor() as cur:
        cur.execute("SELECT quyen_han FROM account_users WHERE id_acc = %s", (id_acc,))
        row = cur.fetchone()
        if row:
            quyen_han = row[0]
            print(f"✅ Quyền hạn của id_acc {id_acc}: {quyen_han}")
            return quyen_han
    return None


async def get_user_by_id_acc(id_acc: int) -> Optional[Dict]:
    """
    Lấy thông tin user từ id_acc (dùng để lấy dữ liệu mới nhất từ database)
    """
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    u.id_acc, 
                    u.user_id, 
                    u.name, 
                    u.chuc_vu, 
                    u.username, 
                    u.role_id, 
                    u.department_id,
                    u.sub_account,
                    d.department_name,
                    u.trang_thai
                FROM account_users u
                LEFT JOIN departments d ON u.department_id = d.department_id
                WHERE u.id_acc = %s
            """, (id_acc,))
            user = cur.fetchone()
            if user:
                return {
                    "id_acc": user[0], 
                    "user_id": user[1], 
                    "name": user[2], 
                    "chuc_vu": user[3], 
                    "username": user[4], 
                    "role_id": user[5], 
                    "department_id": user[6], 
                    "sub_account": user[7],
                    "department_name": user[8],
                    "trang_thai": user[9]
                }
    except Exception as e:
        print(f"❌ Lỗi khi lấy user từ id_acc {id_acc}: {str(e)}")
    return None


async def get_role_id_by_id_acc(id_acc: int) -> Optional[int]:
    """
    Lấy role_id của user từ id_acc
    Dùng để lấy dữ liệu mới nhất từ database (tránh dữ liệu cũ từ token)
    """
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT role_id FROM account_users WHERE id_acc = %s", (id_acc,))
            result = cur.fetchone()
            if result:
                return result[0]
    except Exception as e:
        print(f"❌ Lỗi khi lấy role_id từ id_acc {id_acc}: {str(e)}")
    return None

async def them_nhan_vien(user_data):
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO account_users (user_id, name, chuc_vu, username, password, role_id, department_id, sub_account) 
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_acc
            """, (
                user_data.user_id, user_data.name, user_data.chuc_vu, user_data.username, 
                user_data.password, user_data.role_id, user_data.department_id, user_data.sub_account
            ))
            conn.commit()
            return cur.fetchone()[0]  # Trả về ID của nhân viên vừa thêm
    except Exception as e:
        conn.rollback()

async def them_nhan_vien_tu_HRM(user_data):
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO account_users (user_id, name, chuc_vu, username, password, role_id, department_id, sub_account) 
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_acc
            """, (
                user_data.user_id, user_data.name, user_data.chuc_vu, user_data.username, 
                user_data.password, user_data.role_id, user_data.department_id, user_data.sub_account
            ))
            conn.commit()
            return cur.fetchone()[0]  # Trả về ID của nhân viên vừa thêm
    except Exception as e:
        conn.rollback()

async def get_quanli(phongban: Optional[int], capcha: int):
    try:
        with conn.cursor() as cur:
            if phongban is None:
                cur.execute(
                    "SELECT id_acc, user_id, name, chuc_vu, username, password, role_id, department_id, maneger_id "
                    "FROM account_users WHERE role_id <= %s", (capcha - 1,)
                )
            else:
                cur.execute(
                    "SELECT id_acc, user_id, name, chuc_vu, username, password, role_id, department_id, maneger_id "
                    "FROM account_users WHERE department_id = %s AND role_id <= %s", 
                    (phongban, capcha - 1)
                )

            userr = cur.fetchall()
            user_list = [{"id_acc": user[0], "user_id": user[1], "name": user[2], "chuc_vu": user[3],
                        "username": user[4], "password": user[5], "role_id": user[6], 
                        "department_id": user[7], "maneger_id": user[8]} for user in userr]
        return user_list

    except Exception as e:
        print(f"❌ Lỗi lấy danh sách quản lý: {str(e)}")

async def get_list_user(userInfo):
    try:
        with conn.cursor() as cur:
            # print("🔍 Lấy danh sách user với tài khoản:", userInfo)
            sql = 'SELECT * FROM account_users WHERE id_acc = %s'
            cur.execute(sql, (userInfo['id_acc'],))
            row = cur.fetchone()
            columns = [desc[0] for desc in cur.description]
            userInfo = dict(zip(columns, row))
            
            if userInfo['sub_account']:
                if 0 in userInfo['sub_account']:
                    sql = "SELECT * FROM account_users WHERE role_id >= %s ORDER BY id_acc ASC"
                    cur.execute(sql, (userInfo['role_id'],))
                    result = cur.fetchall()
                    columns = [desc[0] for desc in cur.description]
                    list_acc = [dict(zip(columns, row)) for row in result]
                else:
                    list_id_acc = userInfo['sub_account'] + [userInfo['id_acc']]
                    print(f"🔍 Danh sách id_acc cần lấy: {list_id_acc}")
                    sql = "SELECT * FROM account_users WHERE id_acc = ANY(%s) ORDER BY id_acc ASC"
                    cur.execute(sql, (list_id_acc,))
                    result = cur.fetchall()
                    columns = [desc[0] for desc in cur.description]
                    list_acc = [dict(zip(columns, row)) for row in result]
            else:
                list_acc = userInfo
            # print(f"✅ Danh sách id_acc được trả về: {list_acc}")
            return {
                "total_user": len(list_acc),
                "users": list_acc
            } 
    except Exception as e:
        print(f"❌ Lỗi khi lấy danh sách tài khoản: {str(e)}")
        traceback.print_exc()
        return {"error": str(e)}


async def get_all_users():
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id_acc, user_id, name, sub_account FROM account_users ORDER BY id_acc ASC")
            users = cur.fetchall()
            colomns = [desc[0] for desc in cur.description]
            user_list = [dict(zip(colomns, row)) for row in users]
        return user_list
    except Exception as e:
        print(f"❌ Lỗi lấy danh sách người dùng: {str(e)}")
        return []

# tìm tài khoản nhân sự theo mã nhân sự
async def tim_kiem_user(key_tk, truong_tk):
    try:
        with conn.cursor() as cur:
            query = sql.SQL("SELECT * FROM account_users WHERE {} ILIKE %s").format(sql.Identifier(truong_tk))
            
            cur.execute(query, (f"%{key_tk}%",))
            user = cur.fetchall()
            if not user:  # Kiểm tra nếu kết quả rỗng
                return {"message": "Không tìm thấy tài khoản nhân sự"}
            columns = [desc[0] for desc in cur.description]
            user_data = [dict(zip(columns, row)) for row in user]  # Chuyển tuple thành dictionary

            return user_data  # Trả về dict thay vì list
    except Exception as e:
        print(f"❌ Lỗi khi tìm tài khoản nhân sự: {str(e)}")
        return {"error": str(e)}

async def update_phu_trach(assignments: Dict[str, List[int]], time_update):
    try:
        with conn.cursor() as cur:
            
            query = """
                UPDATE khach_hang 
                SET id_acc = (SELECT id_acc FROM account_users WHERE user_id = %s), 
                    nhan_vien_pt = %s, 
                    thoi_gian_capnhat = %s
                WHERE id_kh = ANY(%s)
            """
            print(assignments)
            for user_id, id_kh in assignments.items():
                cur.execute(query, (user_id, user_id, time_update, id_kh))  

            conn.commit()  # ⚡ Lưu thay đổi vào DB
            
            return {"message": "Cập nhật thành công", "updated_users": len(assignments)}
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi cập nhật người phụ trách: {str(e)}")
        return {"error": str(e)}


async def timkiemnguoidung(query: str):
    try:
        with conn.cursor() as cur:
            sql = """
                SELECT id_acc, user_id, name, chuc_vu, username, role_id, department_id 
                FROM account_users 
                WHERE name ILIKE %s OR user_id ILIKE %s 
                ORDER BY name ASC 
            """
            cur.execute(sql, (f"%{query}%", f"%{query}%"))
            results = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            users = [dict(zip(columns, row)) for row in results]
        return users
    except Exception as e:
        print(f"❌ Lỗi khi tìm kiếm người dùng: {str(e)}")
        return {"error": str(e)}

async def check_user(token):
    try:
        with conn.cursor() as cur:
            sql = """
                SELECT *
                FROM account_users 
                WHERE id_acc = %s AND password = %s
            """
            cur.execute(sql, (token['id_acc'], token['password']))
            results = cur.fetchone()
            if results:
                return True
        return False
    except Exception as e:
        traceback.print_exc()
        conn.rollback()
        print(f"❌ Lỗi khi tìm kiếm người dùng: {str(e)}")
        return {"error": str(e)}
# asyncio.run(get_phanquyen(4))
























