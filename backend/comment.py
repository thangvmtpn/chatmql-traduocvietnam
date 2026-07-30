import os
import shutil
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request
import gspread
from oauth2client.service_account import ServiceAccountCredentials

from utils.security import check_token

router = APIRouter()

# --- 1. CẤU HÌNH THƯ MỤC LƯU ẢNH ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "upload", "comment")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# --- 2. CẤU HÌNH GOOGLE SHEETS ---
json_path = os.path.join(BASE_DIR, "TPN.json")
scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
creds = ServiceAccountCredentials.from_json_keyfile_name(json_path, scope)
client = gspread.authorize(creds)
sheet = client.open("Feedbacks nâng cấp hệ thống").worksheet("Sheet1")
# sheet = client.open("testABCXZC").worksheet("sheetahihi")


@router.post("/suggestions")
async def create_suggestion(
    request: Request,
) -> dict:
    try:
        # Parse form data manually
        form = await request.form()
        category = form.get("category", "")
        problem = form.get("problem", "")
        goal = form.get("goal", "")
        images_files = form.getlist("images")
        
        # Validate
        if not category or not problem.strip() or not goal.strip():
            raise Exception("Vui lòng điền đầy đủ các thông tin bắt buộc")
        
        # Lấy user từ token header
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        user = await check_token(token)  # Await vì check_token là async
        print("User from token:", user)  # Debug thông tin user
        
        saved_image_paths = []
        DOMAIN = "https://crmdev.traduocvietnam.com"
        # DOMAIN = "http://localhost:8000"
        
        # --- 3. XỬ LÝ LƯU ẢNH VÀO BACKEND ---
        if images_files:
            for image in images_files:
                if not hasattr(image, 'filename') or not image.filename:
                    continue

                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                safe_filename = f"{timestamp}_{image.filename}"
                
                file_path = os.path.join(UPLOAD_DIR, safe_filename)
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(image.file, buffer)

                file_url = f"{DOMAIN}/upload/comment/{safe_filename}"
                saved_image_paths.append(file_url)
            
        # --- 4. GHI DỮ LIỆU LÊN GOOGLE SHEETS ---
        images_str = "\n".join(saved_image_paths)
        
        code_user = user.get('user_id', '')
        name = user.get('name', '')
        nguoi_gop_y = f"{code_user} - {name}"
        
        col_a_values = sheet.col_values(1)
        non_empty_rows = len([val for val in col_a_values if val.strip() != ""])
        stt = max(non_empty_rows - 1, 1)

        row_data = [
            stt,
            "CRM",
            datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
            nguoi_gop_y,
            category,
            problem,
            goal,
            images_str,
        ]

        sheet.append_row(row_data, value_input_option="USER_ENTERED")

        return {
            "status": "success",
            "message": "Đã ghi nhận góp ý và lưu ảnh thành công!",
            "saved_images": saved_image_paths,
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=400, 
            detail=f"Lỗi: {str(e)}"
        )
