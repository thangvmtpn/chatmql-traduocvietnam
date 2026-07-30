import asyncio
from decimal import Decimal
import json
import pprint
import traceback
from typing import Dict, List, Optional
from database import conn
from psycopg import sql
from utils.security import get_google_sheet
from datetime import datetime, timedelta



async def get_loai_sanpham():
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT type_sanpham FROM type_sanpham ORDER BY id_type_sp")
            rows = cur.fetchall()
            
            # rows sẽ là list các tuple [(giá_trị,), (giá_trị,), ...]
            result = [row[0] for row in rows]  
      
            return result
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi get_loai_sanpham: {str(e)}")

async def get_nhom_sanpham():
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT nhom_sanpham FROM nhom_san_pham ORDER BY id_nhom_sp")
            rows = cur.fetchall()
            
            # rows sẽ là list các tuple [(giá_trị,), (giá_trị,), ...]
            result = [row[0] for row in rows]  
            # print(result)
            return result
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi get_nhom_sanpham: {str(e)}")

async def get_thuonghieu():
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT thuong_hieu FROM thuong_hieu ORDER BY id_thuong_hieu")
            rows = cur.fetchall()
            
            # rows sẽ là list các tuple [(giá_trị,), (giá_trị,), ...]
            result = [row[0] for row in rows]  
            return result
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi get_thuonghieu: {str(e)}")

async def get_san_pham(limit, page):
    try:
        with conn.cursor() as cur:
            offset = (page - 1) * limit
            # Lấy danh sách sản phẩm gốc
            sql = """
                WITH base_rows AS (
                    SELECT
                        spg.id_sp_goc,
                        spg.ma_sanpham          AS ma_sp,           -- mã hiển thị (gốc)
                        spg.ten_sanpham    AS ten_sanpham,     -- tên hiển thị (gốc)
                        nsp.nhom_sanpham,
                        tsp.type_sanpham,
                        th.thuong_hieu,
                        k.kho,
                        -- nếu có thêm chỉ số ở bảng gốc (ví dụ):
                        spg.gia,
                        spg.can_nang,
                        spg.ton_kho,
                        NULL::int          AS id_sp_phu,       -- để khớp schema với nhánh phụ
                        'goc'::text        AS loai
                    FROM san_pham_goc spg
                    LEFT JOIN nhom_san_pham nsp ON nsp.id_nhom_sp    = spg.id_nhom_sp
                    LEFT JOIN type_sanpham  tsp ON tsp.id_type_sp    = spg.id_type_sp
                    LEFT JOIN thuong_hieu    th ON th.id_thuong_hieu = spg.id_thuong_hieu
                    LEFT JOIN kho_sanpham     k ON k.id_kho          = spg.id_kho
                ),
                variant_rows AS (
                    SELECT
                        spg.id_sp_goc,
                        sp.ma_sp           AS ma_sp,           -- mã hiển thị (phụ)
                        sp.ten_sanpham     AS ten_sanpham,     -- tên hiển thị (phụ)
                        nsp.nhom_sanpham,                      -- các cột còn lại lấy từ spg
                        tsp.type_sanpham,
                        th.thuong_hieu,
                        k.kho,
                        spg.gia,
                        spg.can_nang,
                        spg.ton_kho,
                        sp.id_sp           AS id_sp_phu,
                        'phu'::text        AS loai
                    FROM san_pham sp
                    JOIN san_pham_goc spg       ON sp.id_sp_goc   = spg.id_sp_goc   -- chỉ lấy phụ có mã gốc
                    LEFT JOIN nhom_san_pham nsp ON nsp.id_nhom_sp = spg.id_nhom_sp
                    LEFT JOIN type_sanpham  tsp ON tsp.id_type_sp = spg.id_type_sp
                    LEFT JOIN thuong_hieu    th ON th.id_thuong_hieu = spg.id_thuong_hieu
                    LEFT JOIN kho_sanpham     k ON k.id_kho        = spg.id_kho
                )
                SELECT *
                FROM (
                    SELECT * FROM base_rows
                    UNION ALL
                    SELECT * FROM variant_rows
                ) t
                ORDER BY t.id_sp_goc, t.loai DESC, COALESCE(t.id_sp_phu, 0)
                LIMIT %s OFFSET %s; 
            """




            cur.execute(sql, (limit, offset))
            rows = cur.fetchall()
            
            columns = [desc[0] for desc in cur.description]
            result = [dict(zip(columns, row)) for row in rows]
            # print(result)
            t_sanpham = await tong_sp()


            return {"tong_sp": t_sanpham["tong_sp"], "tong_ton_kho": t_sanpham["tong_ton_kho"], "list_sanpham": result}
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi get_san_pham: {str(e)}")

async def tong_sp():
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    (SELECT COUNT(*) 
                     FROM (
                         SELECT spg.id_sp_goc FROM san_pham_goc spg
                         UNION ALL
                         SELECT sp.id_sp FROM san_pham sp
                     ) t) AS tong_sp,
                    (SELECT SUM(ton_kho) 
                     FROM san_pham_goc) AS tong_ton_kho
            """)
            
            row = cur.fetchone()
            if row:
                tong_sp = row[0]
                tong_ton_kho = row[1]
                return {"tong_sp": tong_sp, "tong_ton_kho": tong_ton_kho}
            else:
                return {
                    "Lỗi"
                }

    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi tong_sp: {str(e)}")

async def get_chitiet_sp(ma_sp):
    print("Mã sản phẩm:", ma_sp)
    try:
        with conn.cursor() as cur:
            # 1. Check xem mã có trong bảng gốc không
            cur.execute("SELECT COUNT(*) FROM san_pham_goc WHERE ma_sanpham = %s", (ma_sp,))
            is_goc = cur.fetchone()[0] > 0

            if is_goc:
                # 👉 Nếu là sản phẩm gốc → lấy full thông tin từ bảng gốc
                cur.execute("""
                    SELECT spg.*, 
                           nsp.nhom_sanpham, 
                           tsp.type_sanpham, 
                           th.thuong_hieu, 
                           k.kho
                    FROM san_pham_goc spg
                    LEFT JOIN nhom_san_pham nsp ON nsp.id_nhom_sp    = spg.id_nhom_sp
                    LEFT JOIN type_sanpham  tsp ON tsp.id_type_sp    = spg.id_type_sp
                    LEFT JOIN thuong_hieu    th ON th.id_thuong_hieu = spg.id_thuong_hieu
                    LEFT JOIN kho_sanpham     k ON k.id_kho          = spg.id_kho
                    WHERE spg.ma_sanpham = %s
                """, (ma_sp,))
                row = cur.fetchone()
                columns = [desc[0] for desc in cur.description]
                san_pham = dict(zip(columns, row))
                return {"loai": "goc", "data": san_pham}
            else:
                # 👉 Nếu là sản phẩm phụ → lấy thông tin từ bảng phụ + join gốc
                cur.execute("""
                    SELECT sp.*,  -- full thông tin của sản phẩm phụ
                           spg.*, -- full thông tin của sản phẩm gốc
                           nsp.nhom_sanpham,
                           tsp.type_sanpham,
                           th.thuong_hieu,
                           k.kho
                    FROM san_pham sp
                    JOIN san_pham_goc spg       ON sp.id_sp_goc = spg.id_sp_goc
                    LEFT JOIN nhom_san_pham nsp ON nsp.id_nhom_sp    = spg.id_nhom_sp
                    LEFT JOIN type_sanpham  tsp ON tsp.id_type_sp    = spg.id_type_sp
                    LEFT JOIN thuong_hieu    th ON th.id_thuong_hieu = spg.id_thuong_hieu
                    LEFT JOIN kho_sanpham     k ON k.id_kho          = spg.id_kho
                    WHERE sp.ma_sp = %s
                """, (ma_sp,))
                row = cur.fetchone()
                columns = [desc[0] for desc in cur.description]
                san_pham = dict(zip(columns, row))
                return {"loai": "phu", "data": san_pham}

    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi get_chitiet_sp: {str(e)}")


async def update_mota(mota, ma_sanpham):
    try:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE san_pham_goc SET mo_ta = %s WHERE ma_sanpham = %s
            """, (mota, ma_sanpham))
            conn.commit()
            return {
                "message": f"Cập nhật mô tả cho mã sản phẩm {ma_sanpham} thành công"
            }

    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi update_mota: {str(e)}")

# asyncio.run(get_san_pham(30, 1))