from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import conn
import psycopg

router = APIRouter()


class SalesTargetCreate(BaseModel):
    kenh: str
    muc_tieu: int


class SalesTargetResponse(BaseModel):
    kenh: str
    muc_tieu: int


@router.get("/sales-target")
def get_sales_targets():
    """Lấy tất cả mục tiêu doanh số cho các kênh."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT kenh, muc_tieu
                FROM sales_target
                """
            )
            rows = cur.fetchall()
        result = [
            {"kenh": r[0], "muc_tieu": r[1]}
            for r in rows
        ]
        return result
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sales-target")
def upsert_sales_target(payload: SalesTargetCreate):
    """Tạo hoặc cập nhật mục tiêu doanh số cho một kênh."""
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO sales_target (kenh, muc_tieu, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (kenh)
                DO UPDATE SET muc_tieu = EXCLUDED.muc_tieu, updated_at = NOW()
                RETURNING kenh, muc_tieu
                """,
                (payload.kenh, payload.muc_tieu),
            )
            row = cur.fetchone()
        conn.commit()
        return {"kenh": row[0], "muc_tieu": row[1]}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
