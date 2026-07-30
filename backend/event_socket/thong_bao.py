from sockets import sio, NAMESPACE_THONG_BAO
from utils.security import decode_token
print("EVENT sio id =", id(sio))

def room_acc(acc_id: int) -> str:
    return f"acc:{int(acc_id)}"

@sio.event(namespace=NAMESPACE_THONG_BAO)
async def connect(sid, environ, auth):
    # print(f"Vào đến đây Auth: {auth}")
    # Client gửi auth: { id_acc } -> server auto-join vào room acc:{id_acc}
    if isinstance(auth, dict) and auth.get("token") is not None:
        payload = await decode_token(auth.get("token"))
        id_acc = payload.get("id_acc")
        # 🔑 Convert to string để match với emit room format
        await sio.enter_room(
            sid,
            str(id_acc),
            namespace=NAMESPACE_THONG_BAO
        )
    print(f"✅ [notify] connect sid={sid}, id_acc={id_acc}, room={str(id_acc)}")

@sio.event(namespace=NAMESPACE_THONG_BAO)
async def disconnect(sid):
    print(f"❌ [notify] disconnect sid={sid}")


@sio.event(namespace=NAMESPACE_THONG_BAO)
async def join_room(sid, data):
    """Nhận event join_room từ client để confirm đã join room"""
    room = data.get("room")
    print(f"✅ [notify] Client {sid} confirmed join room: {room}")


# Client tự đặt event tên "subscribe" để vào room broadcast chung: "notify"
# @sio.on("thong_bao", namespace=NAMESPACE_THONG_BAO)
# async def subscribe_notify(sid, data=None):
    