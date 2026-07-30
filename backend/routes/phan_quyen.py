import json
from typing import List, Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from model.phan_quyen import full_quyen, update_quyen, get_quyen_canhan
from utils.security import check_token

router = APIRouter()

@router.get("/get_full_quyen")
async def get_full_quyen(token: dict = Depends(check_token)):
    try:
        a = await full_quyen()
        return a
    except Exception as e:
        raise HTTPException(status_code=500, detail = "Lỗi khi thêm thông báo")
    
@router.put("/update_quyen/id_acc={id_acc}")
async def update_quyen_han(
    id_acc: int,
    quyen: List[int], 
    token: dict = Depends(check_token)
):
    print(quyen)
    result = await update_quyen(id_acc, quyen)
    return result

@router.get("/get_quyen_canhan/id_acc={id_acc}")
async def get_quyencanhan(id_acc: int, token: dict = Depends(check_token)):
    try:
        a = await get_quyen_canhan(id_acc)
        return a
    except Exception as e:
        raise HTTPException(status_code=500, detail = "Lỗi khi thêm thông báo")