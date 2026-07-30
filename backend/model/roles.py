
import json
import pprint
from typing import Dict, List, Optional
from database import conn
from psycopg import sql
from utils.security import get_google_sheet
from datetime import datetime

async def get_all_roles():
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT role_id, role_name FROM roles")
            roles = cur.fetchall()
            # Chuyển đổi thành danh sách dictionary
            roles_list = [{"role_id": role[0], "role_name": role[1]} for role in roles]
            return roles_list  # Trả về danh sách thay vì set
    except Exception as e:
        print(f"❌ Lỗi khi lấy danh sách quyền: {str(e)}")