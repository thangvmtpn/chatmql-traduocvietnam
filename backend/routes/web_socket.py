### 📁 File: routes/web_socket.py

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from ws_manager import ws_manager
from utils.security import check_token

router = APIRouter()

@router.websocket("/ws/{id_acc}")
async def websocket_endpoint(websocket: WebSocket, id_acc: int, token: str = Query(...)):
    try:
        user = await check_token(token)  # Xác thực thủ công
        assert user["id_acc"] == id_acc  # Bảo vệ chéo ID
    except:
        await websocket.close()
        return

    await ws_manager.connect(id_acc, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(id_acc)