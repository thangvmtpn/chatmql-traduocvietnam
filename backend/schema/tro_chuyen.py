from pydantic import BaseModel
from typing import Optional, Dict, List
from datetime import datetime

class MessageBase(BaseModel):
    content: str
    type: str = "text"

class MessageCreate(MessageBase):
    conversation_id: int

class MessageResponse(MessageBase):
    id: int
    conversation_id: int
    sender_id: int
    timestamp: datetime
    status: Optional[str]
    reactions: Dict = {}

class ConversationBase(BaseModel):
    name: Optional[str]
    is_group: bool = False

class ConversationCreate(ConversationBase):
    participant_ids: List[int]

class UserParticipant(BaseModel):
    id: int
    ho_ten: str
    gmail_cong_ty: Optional[str]
    status: Optional[str]
    avatar: Optional[str]

class ConversationResponse(ConversationBase):
    id: int
    created_at: datetime
    participants: List[UserParticipant]
    last_message: Optional[MessageResponse]
    unread_count: int
    is_muted: bool

class TypingEvent(BaseModel):
    conversation_id: int
    user_id: int
    is_typing: bool

class nguoiDungTC(BaseModel):
    id: int
    ho_ten: str
    gmail_cong_ty: Optional[str]
    status: Optional[str]
    avatar: Optional[str] = None


    # 
class ChatGPTRequest(BaseModel):
    message: str

class ChatGPTResponse(BaseModel):
    reply: str