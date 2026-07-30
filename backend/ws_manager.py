### 📁 File: ws_manager.py (ngang cấp main.py)

from typing import Dict
from fastapi import WebSocket

class WSManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}

    async def connect(self, id_acc: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[id_acc] = websocket
        print(f"✅ Client {id_acc} connected")

    def disconnect(self, id_acc: int):
        if id_acc in self.active_connections:
            del self.active_connections[id_acc]
            print(f"❌ Client {id_acc} disconnected")

    async def send_notification(self, id_acc: int, message: str, type_: str):
        ws = self.active_connections.get(id_acc)
        if ws:
            print(f"id_acc = {id_acc}, message: {message}, type: {type_}")
            await ws.send_json({
                "type": type_,     # hoặc "chat", "system", tuỳ loại
                "msg": message
            })

# ✅ Instance dùng chung
ws_manager = WSManager()