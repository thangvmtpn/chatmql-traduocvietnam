import socketio

# Socket.IO server dùng chung toàn hệ thống
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "https://crmdev.traduocvietnam.com",
        "https://crmbackend.traduocvietnam.com",
    ],
    ping_interval=25,
    ping_timeout=60,
    logger=False,
    engineio_logger=False,
)

# Namespace chung
NAMESPACE_CHAT = "/chat"
NAMESPACE_THONG_BAO ="/thong_bao"
NAMESPACE_INVOICE ="/invoice"


