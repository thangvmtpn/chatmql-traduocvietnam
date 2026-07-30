from sockets import sio, NAMESPACE_INVOICE
from utils.security import decode_token
print("EVENT sio id =", id(sio))

def room_acc(acc_id: int) -> str:
    return f"acc:{int(acc_id)}"

@sio.event(namespace=NAMESPACE_INVOICE)
async def connect(sid, environ):
    # print(f"Vào đến đây Auth: {auth}")
    # Client gửi auth: { id_acc } -> server auto-join vào room acc:{id_acc}
    
    await sio.enter_room(
        sid,
        "invoice",
        namespace=NAMESPACE_INVOICE
    )
    print(f"✅ [notify] connect sid={sid}, invoice")

@sio.event(namespace=NAMESPACE_INVOICE)
async def disconnect(sid):
    print(f"❌ [notify] disconnect sid={sid}")


# Client tự đặt event tên "subscribe" để vào room broadcast chung: "notify"
# @sio.on("thong_bao", namespace=NAMESPACE_THONG_BAO)
# async def subscribe_notify(sid, data=None):
    