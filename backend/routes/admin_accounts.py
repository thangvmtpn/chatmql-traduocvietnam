from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import conn
from utils.security import check_token
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


class AccountCreate(BaseModel):
    user_id: str
    name: str
    chuc_vu: Optional[str] = ""
    username: str
    password: str
    role_id: int
    department_id: Optional[int] = None
    quyen_han: Optional[int] = None
    sub_account: Optional[int] = None
    trang_thai: Optional[str] = "Đang làm"


class AccountUpdate(BaseModel):
    user_id: Optional[str] = None
    name: Optional[str] = None
    chuc_vu: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    role_id: Optional[int] = None
    department_id: Optional[int] = None
    quyen_han: Optional[int] = None
    sub_account: Optional[int] = None
    trang_thai: Optional[str] = None


def require_admin(current_user: dict):
    if current_user.get("role_id") not in [1, 2]:
        raise HTTPException(status_code=403, detail="Chỉ Admin mới có quyền thực hiện thao tác này")


@router.get("/admin/accounts")
async def list_accounts(current_user: dict = Depends(check_token)):
    """Lấy danh sách tất cả tài khoản (chỉ admin)"""
    require_admin(current_user)
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id_acc, user_id, name, chuc_vu, username, password,
                       role_id, department_id, quyen_han, sub_account, trang_thai
                FROM account_users
                ORDER BY id_acc ASC
            """)
            cols = [d[0] for d in cur.description]
            rows = [dict(zip(cols, row)) for row in cur.fetchall()]
        return {"success": True, "data": rows, "total": len(rows)}
    except Exception as e:
        logger.error(f"list_accounts error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/accounts")
async def create_account(data: AccountCreate, current_user: dict = Depends(check_token)):
    """Tạo tài khoản mới (chỉ admin)"""
    require_admin(current_user)
    try:
        with conn.cursor() as cur:
            # Kiểm tra username đã tồn tại chưa
            cur.execute("SELECT id_acc FROM account_users WHERE username = %s", (data.username,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail=f"Username '{data.username}' đã tồn tại")

            # Kiểm tra user_id đã tồn tại chưa
            cur.execute("SELECT id_acc FROM account_users WHERE user_id = %s", (data.user_id,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail=f"Mã nhân viên '{data.user_id}' đã tồn tại")

            cur.execute("""
                INSERT INTO account_users
                    (user_id, name, chuc_vu, username, password, role_id, department_id, quyen_han, sub_account, trang_thai)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id_acc
            """, (
                data.user_id, data.name, data.chuc_vu or "", data.username, data.password,
                data.role_id, data.department_id, data.quyen_han, data.sub_account,
                data.trang_thai or "Đang làm"
            ))
            new_id = cur.fetchone()[0]
            conn.commit()
        return {"success": True, "message": "Tạo tài khoản thành công", "id_acc": new_id}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"create_account error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/admin/accounts/{id_acc}")
async def update_account(id_acc: int, data: AccountUpdate, current_user: dict = Depends(check_token)):
    """Cập nhật thông tin tài khoản (chỉ admin)"""
    require_admin(current_user)
    try:
        fields = []
        values = []
        for field, value in data.dict(exclude_none=True).items():
            fields.append(f"{field} = %s")
            values.append(value)

        if not fields:
            raise HTTPException(status_code=400, detail="Không có trường nào để cập nhật")

        values.append(id_acc)
        with conn.cursor() as cur:
            cur.execute(f"UPDATE account_users SET {', '.join(fields)} WHERE id_acc = %s", values)
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản")
            conn.commit()
        return {"success": True, "message": "Cập nhật tài khoản thành công"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"update_account error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
