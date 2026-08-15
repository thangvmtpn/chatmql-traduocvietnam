
import asyncio
from contextlib import asynccontextmanager
import os
import sys
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import comment
from routes import auth_IP,auth, users, roles, lead, hoa_don, thong_bao, phan_quyen, web_socket, api_lark_bdsd, sanpham, dashboard, invoice, address, cskh_schedule, ai_router, zns, sales_target, admin_accounts, manager_dashboard, gamification
from model import hoadon
import socketio
from sockets import sio
print("MAIN sio id =", id(sio))
from event_socket import thong_bao as event_thong_bao
from event_socket import hoadon as event_hoadon
from event_socket import chat
from check_contact_time import run_periodic_check

# Background task cho kiểm tra thời gian chăm sóc
background_tasks = set()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Khởi chạy background task kiểm tra thời gian chăm sóc
    task = asyncio.create_task(run_periodic_check(interval_minutes=5))
    background_tasks.add(task)
    print("✅ Background task kiểm tra thời gian chăm sóc đã được khởi động")
    
    yield
    
    # Shutdown: Hủy background tasks
    for task in background_tasks:
        task.cancel()
    await asyncio.gather(*background_tasks, return_exceptions=True)
    print("❌ Background tasks đã được dừng")
    


app = FastAPI(lifespan=lifespan)

# Cấu hình CORS để frontend (React) có thể gọi API
cors_origins = [
    "http://localhost:5173",
    "https://crm-biz.traduoc.ai",
    "https://crmdev.traduocvietnam.com",
    "https://crm.traduocvietnam.com",
    "https://crm.traduoc.vn"
    # "https://cf75-2001-ee0-46e7-be00-e95b-2c1e-c99a-d77b.ngrok-free.app",
]

# IMPORTANT: Add CORS middleware AFTER all routes but it will still run first
# The key is that Socket.IO will handle its own CORS for WebSocket upgrades
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def db_session_middleware(request: Request, call_next):
    try:
        response = await call_next(request)
        try:
            from database import conn, conn_fm
            if response.status_code >= 400:
                conn.rollback()
                conn_fm.rollback()
            else:
                conn.commit()
                conn_fm.commit()
        except Exception:
            pass
        return response
    except Exception as e:
        try:
            from database import conn, conn_fm
            conn.rollback()
            conn_fm.rollback()
        except Exception:
            pass
        raise e

# Cấu hình Socket.IO với CORS - PHẢI MATCH với FastAPI CORS
sio.eio.async_mode = 'asgi'
sio.eio.cors_allowed_origins = cors_origins
# Cho phép tất cả các phương thức cho WebSocket
sio.eio.cors_methods = ["GET", "POST", "OPTIONS", "PUT", "DELETE", "PATCH"]
sio.eio.cors_credentials = True
# Explicit ping/pong để giữ kết nối
sio.eio.ping_interval = 25
sio.eio.ping_timeout = 60

# Đăng ký các API routes
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(roles.router, prefix="/api")
app.include_router(lead.router, prefix="/api")
app.include_router(hoa_don.router, prefix="/api")
app.include_router(thong_bao.router, prefix="/api")
app.include_router(phan_quyen.router, prefix="/api")
app.include_router(web_socket.router, prefix="/api")
app.include_router(api_lark_bdsd.router, prefix="/api")
app.include_router(sanpham.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(invoice.router, prefix="/api")
app.include_router(address.router, prefix="/api")
app.include_router(cskh_schedule.router, prefix="/api")
app.include_router(comment.router, prefix="/api")
# app.include_router(tro_chuyen.router, prefix="/api")
app.include_router(auth_IP.router, prefix="/api")
app.include_router(ai_router.router, prefix="/api")
app.include_router(zns.router, prefix="/api")
app.include_router(sales_target.router, prefix="/api")
app.include_router(admin_accounts.router, prefix="/api")
app.include_router(manager_dashboard.router, prefix="/api")
app.include_router(gamification.router, prefix="/api")

# Không cần mount static files nữa vì frontend React chạy riêng với Vite dev server

# Bọc FastAPI app với Socket.IO ASGI middleware
# Điều này cho phép Socket.IO xử lý /socket.io/* routes trước FastAPI

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

UPLOAD_ROOT = os.path.join(BASE_DIR, "upload")

os.makedirs(UPLOAD_ROOT, exist_ok=True)

app.mount("/upload", StaticFiles(directory=UPLOAD_ROOT), name="upload")


_fastapi_app = app
app = socketio.ASGIApp(sio, other_asgi_app=_fastapi_app)

# Khởi động server FastAPI (chỉ chạy khi thực thi trực tiếp)
if __name__ == "__main__":
    import uvicorn
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    port = int(os.getenv("PORT", 8002))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)


