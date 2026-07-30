import json
import pprint
from typing import Dict, List, Optional
from database import conn
from psycopg import sql
from utils.security import get_google_sheet
from datetime import datetime




async def full_quyen():
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM phan_quyen")
            phan_quyen = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            phan_quyen_list = [dict(zip(columns, row)) for row in phan_quyen]
            return phan_quyen_list
    except Exception as e:
        print(f"❌ Lỗi không xác định: {str(e)}")
        return {"error": str(e)}

async def update_quyen(id_acc, quyen):
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE account_users SET quyen_han = %s WHERE id_acc = %s RETURNING name", (quyen, id_acc))
            conn.commit()
            return cur.fetchone()[0]
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi không xác định: {str(e)}")
        return {"error": str(e)}

async def get_quyen_canhan(id_acc):
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT quyen_han, sub_account FROM account_users WHERE id_acc = %s", (id_acc, ))
            phan_quyen = cur.fetchone()
            columns = [desc[0] for desc in cur.description]
            phan_quyen = dict(zip(columns, phan_quyen))
            # print(phan_quyen)
            return phan_quyen
    except Exception as e:
        print(f"❌ Lỗi không xác định: {str(e)}")
        return {"error": str(e)}