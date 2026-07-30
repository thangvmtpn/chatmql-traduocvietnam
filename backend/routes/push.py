from fastapi import APIRouter
from pydantic import BaseModel
from ..sockets import sio, NAMESPACE_CHAT, NAMESPACE_NOTIFY


router = APIRouter(prefix="/push", tags=["push"])


class ChatPush(BaseModel):
    room: str
    text: str


@router.post("/chat")
async def push_chat(payload: ChatPush):
    await sio.emit(
        "chat_message",
        {"from": "API", "text": payload.text},
        room=payload.room,
        namespace=NAMESPACE_CHAT,
    )
    return {"ok": True}


class Notice(BaseModel):
    title: str
    body: str = ""


@router.post("/notify")
async def push_notify(note: Notice):
    await sio.emit(
        "server_notice",
        note.model_dump(),
        room="notify",
        namespace=NAMESPACE_NOTIFY,
    )
    return {"ok": True}