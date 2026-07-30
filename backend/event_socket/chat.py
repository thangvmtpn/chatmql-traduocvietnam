from sockets import sio, NAMESPACE_CHAT
from utils.security import decode_token

@sio.event(namespace=NAMESPACE_CHAT)
async def connect(sid, environ, auth):
    if isinstance(auth, dict) and auth.get("token") is not None:
        payload = await decode_token(auth.get("token"))
        id_acc = payload.get("id_acc")
    print(f"✅ [chat] connect sid={sid}, id_acc={id_acc}")


@sio.event(namespace=NAMESPACE_CHAT)
async def disconnect(sid):
    print(f"[chat] disconnect sid={sid}")


# Client tự đặt event tên "join" để yêu cầu vào 1 room cụ thể

@sio.event(namespace=NAMESPACE_CHAT)
async def join_conversation(sid, data):
    # session = await sio.get_session(sid)
    conversation_id = data.get("conversation_id")
    # print(f"Người dùng {session['user_id']} đã tham gia cuộc trò chuyện {conversation_id}")
    await sio.enter_room(sid, f"conversation_{conversation_id}")

# @sio.event(namespace=NAMESPACE_CHAT)
# async def typing(sid, data):
#     # session = await sio.get_session(sid)
#     conversation_id = data.get("conversation_id")
#     is_typing = data.get("is_typing")
#     # print(f"Người dùng {session['user_id']} đang nhập trong cuộc trò chuyện {conversation_id}: {is_typing}")
#     await sio.emit(
#         'typing',
#         {"user_id": session["user_id"], "conversation_id": conversation_id, "is_typing": is_typing},
#         room=f"conversation_{conversation_id}",
#         skip_sid=sid
#     )
