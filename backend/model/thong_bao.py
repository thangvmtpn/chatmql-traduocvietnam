
import json
import pprint
from typing import Dict, List, Optional
from database import conn
from psycopg import sql
from utils.security import get_google_sheet
from datetime import datetime

async def add_thong_bao(data):
    try:
        with conn.cursor() as cur:
            # Giá trị mặc định cho trạng_thái nếu không có
            trang_thai = data.get("trang_thai", "chua_doc")
            
            cur.execute("""
                INSERT INTO thong_bao (id_acc, ngay_thong_bao, noi_dung, tieu_de, id_kh, trang_thai) 
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id_tb
            """, (
                data["id_acc"], data["time_update"], data["noi_dung"], data["tieu_de"], data.get("id_kh"), trang_thai
            ))
            id_tb = cur.fetchone()[0]
            conn.commit()
            return {"message": "Thêm thông báo thành công", "id_tb": id_tb}
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi thêm thông báo: {str(e)}")
        raise e

async def thong_bao(id_acc_list, search_conditions):
    try:
        with conn.cursor() as cur:
            if not id_acc_list:
                return {"message": "Danh sách ID trống"}

            id_acc_placeholder = ", ".join(["%s"] * len(id_acc_list))
            params = id_acc_list  # Truyền ID vào danh sách params

            # Điều kiện tìm kiếm
            search_clauses = []
            search_params = []
            if search_conditions:
                for field, value in search_conditions.items():
                    # if field in valid_search_columns and value:
                    if value:    
                        search_clauses.append(f"tb.{field} ILIKE %s")  # LIKE tìm kiếm gần đúng
                        search_params.append(f"%{value}%")

            search_condition = f"AND {' AND '.join(search_clauses)}" if search_clauses else ""
            params.extend(search_params)  # Thêm tham số tìm kiếm

            sql = f"""
                SELECT 
                    tb.*
                FROM thong_bao tb
                WHERE tb.id_acc IN ({id_acc_placeholder})
                    {search_condition}
                ORDER BY tb.ngay_thong_bao DESC;
            """
            # DATE(tb.ngay_thong_bao) = CURRENT_DATE 
            cur.execute(sql, params)
            rows = cur.fetchall()

            # print(f"SQL: {sql}")
            # print(f"Params: {params}")

            if not rows:
                return {"message": "Không có thông báo"}

            columns = [desc[0] for desc in cur.description]
            thong_bao_list = [dict(zip(columns, row)) for row in rows]

            return thong_bao_list

    except Exception as e:
        print(f"❌ Lỗi không xác định: {str(e)}")
        return {"error": str(e)}

# hàm lấy id_kh từ thong_bao
async def get_id_kh(id_tb):
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id_kh FROM thong_bao WHERE id_tb = %s", (id_tb,))
            id_kh = cur.fetchone()

            if id_kh:
                id_kh_array = id_kh[0]  # Đây là mảng số điện thoại
                # print(sdt_array)
                return id_kh_array       # Trả về list như ['0912...', '0987...']
            else:
                return []
    except Exception as e:
        print(f"❌ Lỗi khi lấy dữ liệu hóa đơn: {str(e)}")

















