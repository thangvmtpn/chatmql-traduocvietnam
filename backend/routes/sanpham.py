from datetime import datetime, timezone
import json
import mimetypes
import os
import random
import re
import shutil
import sys
import traceback
from typing import Dict, List, Optional
import uuid
from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Path, Query, Request, UploadFile
from schemas import KhachHangRequest, KhachHangResponse
from utils.security import check_token, get_google_sheet
from typing import Any
from model.sanpham import get_loai_sanpham, get_nhom_sanpham, get_thuonghieu, get_san_pham, get_chitiet_sp, update_mota

router = APIRouter()

@router.get("/sanpham/loai_sanpham")
async def getloaisp(token: dict = Depends(check_token)):
    try:
        return await get_loai_sanpham()
    except HTTPException as http_err:
        print(f"⚠️ Lỗi 400: {http_err.detail}")  # Debug lỗi cụ thể
        raise http_err  # Giữ nguyên lỗi 400, không bị chuyển thành 500

    except Exception as e:
        print(f"❌ Lỗi không mong muốn: {str(e)}")  # In lỗi ra để debug
        raise HTTPException(status_code=500, detail="Lỗi server lấy danh sách loại sản phẩm!")
    

@router.get("/sanpham/nhom_sanpham")
async def getnhomsp(token: dict = Depends(check_token)):
    try:
        return await get_nhom_sanpham()
    except HTTPException as http_err:
        print(f"⚠️ Lỗi 400: {http_err.detail}")  # Debug lỗi cụ thể
        raise http_err  # Giữ nguyên lỗi 400, không bị chuyển thành 500

    except Exception as e:
        print(f"❌ Lỗi không mong muốn: {str(e)}")  # In lỗi ra để debug
        raise HTTPException(status_code=500, detail="Lỗi server lấy danh sách nhóm sản phẩm!")
    

@router.get("/sanpham/thuong_hieu")
async def getth(token: dict = Depends(check_token)):
    try:
        return await get_thuonghieu()
    except HTTPException as http_err:
        print(f"⚠️ Lỗi 400: {http_err.detail}")  # Debug lỗi cụ thể
        raise http_err  # Giữ nguyên lỗi 400, không bị chuyển thành 500

    except Exception as e:
        print(f"❌ Lỗi không mong muốn: {str(e)}")  # In lỗi ra để debug
        raise HTTPException(status_code=500, detail="Lỗi server lấy danh sách thương hiệu!")
    

@router.get("/sanpham/get_all")
async def getallsp(limit: int, page: int, token: dict = Depends(check_token)):
    try:
        return await get_san_pham(limit, page)
    except HTTPException as http_err:
        print(f"⚠️ Lỗi 400: {http_err.detail}")  # Debug lỗi cụ thể
        raise http_err  # Giữ nguyên lỗi 400, không bị chuyển thành 500

    except Exception as e:
        print(f"❌ Lỗi không mong muốn: {str(e)}")  # In lỗi ra để debug
        raise HTTPException(status_code=500, detail="Lỗi server lấy danh sách sản phẩm!")
    

@router.get("/sanpham/get_chi_tiet_sanpham")
async def getctsp(ma_sp: str, token: dict = Depends(check_token)):
    try:
        return await get_chitiet_sp(ma_sp)
    except HTTPException as http_err:
        print(f"⚠️ Lỗi 400: {http_err.detail}")  # Debug lỗi cụ thể
        raise http_err  # Giữ nguyên lỗi 400, không bị chuyển thành 500

    except Exception as e:
        print(f"❌ Lỗi không mong muốn: {str(e)}")  # In lỗi ra để debug
        raise HTTPException(status_code=500, detail="Lỗi server lấy danh sách sản phẩm!")
    
def safe_name(name: str) -> str:
    # Chỉ giữ chữ, số, gạch ngang, gạch dưới
    return re.sub(r'[^a-zA-Z0-9_-]', '_', name)
@router.post("/sanpham/uploadImage")
async def upimage(
    token: dict = Depends(check_token),           # ✅ Token check sẵn
    upload: UploadFile = File(...),               # ✅ File CKEditor gửi
    ma_sanpham: str = Form(...)                   # ✅ Thêm field ma_sanpham nếu FE gửi
):
    try:
        safe_ma_sp = safe_name(ma_sanpham)
        base_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
        parent_dir = os.path.dirname(os.path.dirname(base_dir))
        product_dir = os.path.join(parent_dir, "frontend", "image", "san_pham", "mo_ta", safe_ma_sp)
        # Tạo thư mục nếu chưa có
        os.makedirs(product_dir, exist_ok=True)
        # Lấy đuôi file (vd .jpg, .png)
        ext = os.path.splitext(upload.filename)[1] or ".jpg"
        ext = mimetypes.guess_extension(upload.content_type) or os.path.splitext(upload.filename)[1] or ".jpg"

        # 🔥 Đặt tên file chính bằng ma_sp
        file_name = f"{safe_ma_sp}{ext}"
        file_path = os.path.join(product_dir, file_name)

        # Lưu file (ghi đè nếu có sẵn)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(upload.file, buffer)
        public_path = f"/image/san_pham/mo_ta/{safe_ma_sp}/{file_name}"
        return {"url": public_path}
        
    except HTTPException as http_err:
        print(f"⚠️ Lỗi 400: {http_err.detail}")
        raise http_err

    except Exception as e:
        print(f"❌ Lỗi không mong muốn: {str(e)}")
        raise HTTPException(status_code=500, detail="Lỗi server khi upload ảnh!")
    

@router.post("/sanpham/mota/save-html")
async def save_mota_html(request: Request, token: dict = Depends(check_token)):
    
    body = await request.json()
    ma_sp = body.get("ma_sp")
    html = body.get("html", "")

    try:
        return await update_mota(html, ma_sp)

    except HTTPException:
        raise
    except Exception as e:
        print("❌ Lỗi lưu mô tả:", e)
        raise HTTPException(status_code=500, detail="Lỗi server khi lưu mô tả sản phẩm")
    