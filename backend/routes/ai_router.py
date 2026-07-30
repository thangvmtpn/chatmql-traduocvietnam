from fastapi import APIRouter
from pydantic import BaseModel
from services.ai_service import chat_with_hr_bot 

router = APIRouter(prefix="/ai-assistant", tags=["AI Assistant"])

class ChatRequest(BaseModel):
    message: str

@router.post("/chat")
async def ai_chat(request: ChatRequest):
    return await chat_with_hr_bot(request.message)