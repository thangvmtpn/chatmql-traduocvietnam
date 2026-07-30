from model.gamification_model import get_gamification_config_db
from fastapi import APIRouter, HTTPException, Depends, Query
from utils.security import check_token
from schema.gamification_schema import GamiPostRequest
from services.gamification_handler import (
    create_gami_handler, 
    update_gami_handler, 
    delete_gami_handler, 
    list_gami_handler
)
from services.gamification_handler import calculate_deal_shock_stats, calculate_top_race_stats

router = APIRouter()


def _validate_deal_shock_payload(payload: GamiPostRequest):
    if (payload.type or '').upper() != 'DEAL_SHOCK':
        return

    missing_fields = []
    if not (payload.title or '').strip():
        missing_fields.append('tên chương trình')
    if not payload.start_date:
        missing_fields.append('ngày bắt đầu')
    if not payload.end_date:
        missing_fields.append('ngày kết thúc')
    if not (payload.start_time or '').strip():
        missing_fields.append('giờ bắt đầu')
    if not (payload.end_time or '').strip():
        missing_fields.append('giờ kết thúc')

    products = payload.config_data.get('products') if isinstance(payload.config_data, dict) else None
    if not products:
        missing_fields.append('sản phẩm áp dụng')

    if missing_fields:
        raise HTTPException(
            status_code=422,
            detail=f"Thiếu thông tin bắt buộc: {', '.join(missing_fields)}"
        )

    if payload.start_date == payload.end_date and payload.end_time <= payload.start_time:
        raise HTTPException(
            status_code=422,
            detail='Giờ kết thúc phải lớn hơn giờ bắt đầu khi cùng ngày'
        )

# 1. Lấy danh sách (Có phân trang, lọc theo loại)
@router.get("/gamification/individual")
async def get_list_gamification(
    type: str = Query(..., description="DEAL_SHOCK hoặc TOP_RACE"),
    page: int = 1,
    limit: int = 10,
    token: str = Depends(check_token)
):
    try:
        return await list_gami_handler(type, page, limit)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")

# 2. Tạo mới (Log người tạo)
@router.post("/gamification/individual")
async def create_gamification(
    payload: GamiPostRequest,
    token: dict = Depends(check_token)
):
    try:
        _validate_deal_shock_payload(payload)
        # Lấy thông tin người dùng từ Token để log
        user_id = token.get("id")
        user_name = token.get("username") or token.get("name") # Tùy cấu trúc token của bạn
        
        result = await create_gami_handler(payload.dict(), user_id, user_name)
        if result:
            return {"status": "success", "id": result, "msg": "Tạo thành công"}
        else:
            raise HTTPException(status_code=400, detail="Tạo thất bại")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")

# 3. Cập nhật (Log ngày update tự động trong DB)
@router.put("/gamification/individual/{id}")
async def update_gamification(
    id: int,
    payload: GamiPostRequest,
    token: dict = Depends(check_token)
):
    try:
        _validate_deal_shock_payload(payload)
        result = await update_gami_handler(id, payload.dict())
        if result:
            return {"status": "success", "msg": "Cập nhật thành công"}
        else:
            raise HTTPException(status_code=400, detail="Cập nhật thất bại")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")

# 4. Xóa
@router.delete("/gamification/individual/{id}")
async def delete_gamification(
    id: int,
    token: dict = Depends(check_token)
):
    try:
        result = await delete_gami_handler(id)
        if result:
            return {"status": "success", "msg": "Xóa thành công"}
        else:
            raise HTTPException(status_code=400, detail="Xóa thất bại")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")
    
@router.get("/gamification/detail/{post_id}")
async def get_gamification_detail_api(post_id: int, token: dict = Depends(check_token)):
    data = await get_gamification_config_db(post_id)
    
    if data:
        return data
    raise HTTPException(status_code=404, detail="Không tìm thấy cuộc đua này")

@router.get("/gamification/{post_id}/deal-shock-stats")
async def get_deal_shock_stats(post_id: int, token: dict = Depends(check_token)):
    result = await calculate_deal_shock_stats(post_id)
    return result

@router.get("/gamification/{post_id}/top-race-stats")
async def get_top_race_stats_api(post_id: int, token: dict = Depends(check_token)):
    result = await calculate_top_race_stats(post_id)
    return result
@router.get("/gamification/individual/products")
async def get_gami_products(token: str = Depends(check_token)):
    from database import conn_fm
    try:
        with conn_fm.cursor() as cursor:
            sql = """
                SELECT id_product, code_product, name_product, price FROM products
            """
            cursor.execute(sql)
            columns = [desc[0] for desc in cursor.description]
            products = [dict(zip(columns, row)) for row in cursor.fetchall()]
            return products
    except Exception as e:
        conn_fm.rollback()
        print(f"Lỗi lấy sản phẩm gamification: {str(e)}")
        raise HTTPException(status_code=500, detail="Lỗi server lấy danh sách sản phẩm gamification")
