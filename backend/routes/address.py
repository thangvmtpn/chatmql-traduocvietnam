from fastapi import APIRouter, HTTPException
from typing import List
from pydantic import BaseModel
from database import conn_fm

router = APIRouter()


class Province(BaseModel):
    id_prov: int
    prov: str


class Ward(BaseModel):
    id_ward: int
    ward: str
    id_prov: int


@router.get("/addresses/provinces", response_model=List[Province])
async def get_provinces():
    """Lấy danh sách tất cả tỉnh/thành phố"""
    cur = None
    try:
        cur = conn_fm.cursor()
        cur.execute("""
            SELECT DISTINCT id_prov, prov 
            FROM note_address 
            WHERE prov IS NOT NULL AND prov != ''
            ORDER BY prov
        """)
        rows = cur.fetchall()
        conn_fm.commit()
        
        return [
            Province(id_prov=row[0], prov=row[1])
            for row in rows
        ]
    except Exception as e:
        conn_fm.rollback()
        print(f"[address] Error fetching provinces: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching provinces: {str(e)}")
    finally:
        if cur:
            cur.close()


@router.get("/addresses/wards/{id_prov}", response_model=List[Ward])
async def get_wards_by_province(id_prov: int):
    """Lấy danh sách phường/xã theo tỉnh/thành phố"""
    cur = None
    try:
        cur = conn_fm.cursor()
        cur.execute("""
            SELECT id_ward, ward, id_prov
            FROM note_address 
            WHERE id_prov = %s AND ward IS NOT NULL AND ward != ''
            ORDER BY ward
        """, (id_prov,))
        rows = cur.fetchall()
        conn_fm.commit()
        
        return [
            Ward(id_ward=row[0], ward=row[1], id_prov=row[2])
            for row in rows
        ]
    except Exception as e:
        conn_fm.rollback()
        print(f"[address] Error fetching wards for province {id_prov}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching wards: {str(e)}")
    finally:
        if cur:
            cur.close()
