from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from database import conn  # Nhớ import đúng file database của bạn

router = APIRouter(prefix="/ip-hop-le", tags=["Quản lý IP"])

# --- ĐỊNH NGHĨA MODEL (PYDANTIC) ---
class ThongTinIP(BaseModel):
    dia_chi_ip: str
    ghi_chu: Optional[str] = None

class PhanHoiIP(BaseModel):
    id: int
    dia_chi_ip: str
    ghi_chu: Optional[str] = None
    hoat_dong: bool

# --- CÁC API CRUD ---

@router.get("/", response_model=List[PhanHoiIP])
async def lay_danh_sach_ip():
    """Lấy danh sách tất cả các IP hợp lệ"""
    cur = None
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, dia_chi_ip, ghi_chu, hoat_dong 
            FROM bang_ip_hop_le 
            ORDER BY id DESC
        """)
        rows = cur.fetchall()
        conn.commit()
        
        return [
            PhanHoiIP(
                id=row[0], 
                dia_chi_ip=row[1], 
                ghi_chu=row[2], 
                hoat_dong=row[3]
            )
            for row in rows
        ]
    except Exception as e:
        conn.rollback()
        print(f"[IP] Lỗi lấy danh sách IP: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Lỗi lấy danh sách IP: {str(e)}")
    finally:
        if cur:
            cur.close()


@router.post("/", response_model=PhanHoiIP)
async def them_ip_moi(du_lieu: ThongTinIP):
    """Thêm một IP mới vào danh sách hợp lệ"""
    cur = None
    try:
        cur = conn.cursor()
        
        # Kiểm tra xem IP đã tồn tại chưa
        cur.execute("SELECT id FROM bang_ip_hop_le WHERE dia_chi_ip = %s", (du_lieu.dia_chi_ip,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Địa chỉ IP này đã tồn tại trong hệ thống.")

        # Thêm mới
        cur.execute("""
            INSERT INTO bang_ip_hop_le (dia_chi_ip, ghi_chu) 
            VALUES (%s, %s) 
            RETURNING id, dia_chi_ip, ghi_chu, hoat_dong
        """, (du_lieu.dia_chi_ip, du_lieu.ghi_chu))
        
        row = cur.fetchone()
        conn.commit()
        
        return PhanHoiIP(
            id=row[0], 
            dia_chi_ip=row[1], 
            ghi_chu=row[2], 
            hoat_dong=row[3]
        )
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        print(f"[IP] Lỗi thêm IP mới: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Lỗi thêm IP mới: {str(e)}")
    finally:
        if cur:
            cur.close()


@router.delete("/{id_ip}")
async def xoa_ip(id_ip: int):
    """Xóa một IP khỏi danh sách hợp lệ"""
    cur = None
    try:
        cur = conn.cursor()
        
        # Xóa và trả về id để kiểm tra xem có thực sự xóa được không
        cur.execute("DELETE FROM bang_ip_hop_le WHERE id = %s RETURNING id", (id_ip,))
        deleted_row = cur.fetchone()
        
        if not deleted_row:
            raise HTTPException(status_code=404, detail="Không tìm thấy IP để xóa.")
            
        conn.commit()
        
        return {"thong_bao": "Đã xóa IP thành công"}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        print(f"[IP] Lỗi xóa IP: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Lỗi xóa IP: {str(e)}")
    finally:
        if cur:
            cur.close()