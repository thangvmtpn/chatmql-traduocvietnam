import ipaddress
import json
from fastapi import APIRouter, Depends, HTTPException, Request, Form
from model.users import get_user, get_user_with_department
from schemas import LoginRequest, TokenResponse
from utils.security import create_access_token
from datetime import timedelta
import os
from database import conn

router = APIRouter()

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"))

async def verify_company_ip(request: Request):
    # 1. Lấy IP thực của client
    client_ip_str = request.headers.get("X-Forwarded-For")
    if client_ip_str:
        client_ip_str = client_ip_str.split(",")[0].strip()
    else:
        client_ip_str = request.client.host

    try:
        # Chuyển chuỗi IP thành đối tượng IP
        client_ip = ipaddress.ip_address(client_ip_str)
        print(f"🔍 Kiểm tra IP: {client_ip}")
    except ValueError:
        raise HTTPException(status_code=403, detail="Định dạng IP không hợp lệ.")

    # 2. Lấy danh sách mạng hợp lệ từ Database
    allowed_networks = []
    cur = None
    try:
        cur = conn.cursor()
        # Chỉ lấy những IP đang có trạng thái hoat_dong = TRUE
        cur.execute("SELECT dia_chi_ip FROM bang_ip_hop_le WHERE hoat_dong = TRUE")
        rows = cur.fetchall()
        conn.commit()
        
        for row in rows:
            try:
                # Ép kiểu chuỗi IP từ DB (vd: 14.166.80.120/32) thành đối tượng ip_network
                network = ipaddress.ip_network(row[0], strict=False)
                allowed_networks.append(network)
            except ValueError:
                print(f"⚠️ Bỏ qua IP cấu hình sai trong DB: {row[0]}")
                continue
                
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi truy vấn bảng IP: {str(e)}")
        raise HTTPException(status_code=500, detail="Lỗi hệ thống khi xác thực IP.")
    finally:
        if cur:
            cur.close()

    # Luôn cho phép localhost để bạn test code trên máy cá nhân không bị chặn
    allowed_networks.append(ipaddress.ip_network("127.0.0.1/32", strict=False))

    # 3. Kiểm tra: Client IP có nằm trong bất kỳ dải mạng nào không?
    is_allowed = any(client_ip in network for network in allowed_networks)

    if not is_allowed:
        print(f"⚠️ Truy cập bị từ chối từ IP: {client_ip_str}")
        raise HTTPException(
            status_code=403,
            detail=f"Truy cập bị từ chối từ IP: {client_ip_str}"
        )

# @router.post("/login", response_model=TokenResponse, dependencies=[Depends(verify_company_ip)])
@router.post("/login", response_model=TokenResponse)
async def login(username: str = Form(...), password: str = Form(...)):
    username = username.strip()
    print(f"🔑 Login attempt for username: '{username}'")
    # Lấy thông tin user kèm department name
    user = await get_user_with_department(username)
    if not user:
        print(f"❌ User not found: '{username}'")
        raise HTTPException(status_code=400, detail="Tài khoản không tồn tại")

    if password != user["password"]:
        raise HTTPException(status_code=400, detail="Sai mật khẩu")

    # Tạo token JWT
    access_token = await create_access_token(
        data = user,
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    # Trả về token và thông tin user (không bao gồm password)
    user_info = {
        "id": user["id_acc"],
        "user_id": user["user_id"],  # Mã nhân viên
        "username": user["username"],
        "name": user.get("name"),
        "chuc_vu": user.get("chuc_vu"),  # Chức danh
        "role_id": user["role_id"],
        "department_id": user.get("department_id"),
        "department_name": user.get("department_name"),  # Tên phòng ban
    }

    return {
        "access_token": access_token, 
        "token_type": "Bearer",
        "user": user_info
    }

# Route chính
@router.post("/test")
async def webhook_hoa_don(request: Request):
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Dữ liệu không hợp lệ")
    print(json.dumps(data, indent=4, ensure_ascii=False))
    
    
