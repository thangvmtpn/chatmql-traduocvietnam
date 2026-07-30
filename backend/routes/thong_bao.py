import json
from typing import List, Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from model.thong_bao import add_thong_bao, thong_bao, get_id_kh
from utils.security import check_token
from ws_manager import ws_manager
from sockets import sio, NAMESPACE_THONG_BAO

router = APIRouter()

@router.post("/thong_bao")
async def add_thong_bao_api(data: dict = Body(...), token: dict = Depends(check_token)):
    try:
        print(data)
        a = await add_thong_bao(data)
        id_acc = int(data.get("id_acc"))
        
        # if id_acc:
        #     print(f"id_acc = {id_acc} - Nhận thông báo qua WEBSOCKET")
        #     await ws_manager.send_notification(id_acc, data.get("tieu_de", "Thông báo mới"), "thong_bao")
        
        await sio.emit(
            "new_thong_bao",
            data,
            namespace=NAMESPACE_THONG_BAO,
            room=str(id_acc)  # 🔑 Convert to string để match frontend
        )
        return a
    except Exception as e:
        print("Lỗi: ", str(e))
        raise HTTPException(status_code=500, detail = "Lỗi khi thêm thông báo")
    
@router.get("/thong_bao")
async def show_thong_bao(
    id_acc_list: Optional[int] = Query(None, description="ID nhân viên"),
    search_conditions: Optional[str] = Query(None),
    token: dict = Depends(check_token)
):
    try:
        # Convert single int to list for compatibility
        if id_acc_list is not None:
            id_acc_list = [id_acc_list]
        if isinstance(search_conditions, str):  
            search_conditions = json.loads(search_conditions)
        a = await thong_bao(id_acc_list, search_conditions)
        return a
    except Exception as e:
        print(f"❌ Lỗi khi lấy thông báo: {str(e)}")
        raise HTTPException(status_code=500, detail = f"Lỗi khi lấy thông báo: {str(e)}")
    
@router.get("/thong_bao/id_kh/id_tb={id_tb}")
async def get_list_id_kh(id_tb: int, token: dict = Depends(check_token)):
    sdt_list = await get_id_kh(id_tb)
    if not sdt_list:
        raise HTTPException(status_code=404, detail="Không tìm thấy hoặc không có sdt")
    return sdt_list