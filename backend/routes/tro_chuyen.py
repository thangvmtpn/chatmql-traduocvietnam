# routes/tro_chuyen.py
from fastapi import APIRouter, Depends, HTTPException, Query
# import openai
# from openai import OpenAI
from schema.tro_chuyen import nguoiDungTC, MessageCreate, MessageResponse, ConversationCreate, ConversationResponse
from model.tro_chuyen import  timkiemnguoidung, create_conversation, create_message, get_conversations, get_messages
from typing import List
from utils.security import check_token
import socketio
from database import conn
import os
from dotenv import load_dotenv
from sockets import sio, NAMESPACE_CHAT

router = APIRouter()

@router.get("/conversations", response_model=List[ConversationResponse])
async def get_user_conversations(token: dict = Depends(check_token)):
    user_id = token.get("id_acc")
    try:
        conversations = get_conversations(user_id)
        return conversations
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Lỗi lấy danh sách cuộc trò chuyện: {str(e)}")

@router.post("/conversations", response_model=ConversationResponse)
async def create_new_conversation(data: ConversationCreate, token: dict = Depends(check_token)):
    user_id = token.get("id_acc")
    print(f"Đang tạo cuộc trò chuyện với dữ liệu: {data}, user_id: {user_id}")
    if user_id not in data.participant_ids:
        data.participant_ids.append(user_id)
    try:
        convo = create_conversation(data.name, data.participant_ids, data.is_group)
        print(f" Đã tạo cuộc trò chuyện: {convo}")
        return convo
    except Exception as e:
        print(f"Lỗi khi tạo cuộc trò chuyện: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Lỗi tạo cuộc trò chuyện: {str(e)}")

@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_conversation_messages(conversation_id: int, limit: int = 50, offset: int = 0, token: dict = Depends(check_token)):
    try:
        messages = get_messages(conversation_id, limit, offset)
        return messages
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/messages", response_model=MessageResponse)
async def send_message(data: MessageCreate, token: dict = Depends(check_token)):
    user_id = token.get("id_acc")
    print(f" Đang gửi tin nhắn: conversation_id={data.conversation_id}, user_id={user_id}, content={data.content}")
    try:
        message = create_message(data.conversation_id, user_id, data.content, data.type)
        await sio.emit(
            'new_message', 
            message, 
            namespace=NAMESPACE_CHAT,
            room=f"conversation_{data.conversation_id}"
        )
        print(f"Đã gửi tin nhắn: {message}")
        return message
    except Exception as e:
        print(f"Lỗi khi gửi tin nhắn: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    


@router.get("/users/search", response_model=List[nguoiDungTC])
async def search_users(query: str = Query(...), token: dict = Depends(check_token)):
    return timkiemnguoidung(query)




# # =====================
# load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))
# api_key = os.getenv("OPENAI_API_KEY")
# print("OPENAI_API_KEY ============================", api_key[:10] + "..." if api_key else "Not found")
# if not api_key:
#     raise RuntimeError("OPENAI_API_KEY not found in .env")
# client = OpenAI(api_key=api_key)

# @router.post("/tro_ly_chatgpt", response_model=ChatGPTResponse)
# async def tro_ly_chatgpt_api(data: ChatGPTRequest):
#     print("client ============================", client)
#     try:
#         response = client.chat.completions.create(
#             model="gpt-4o-mini",
#             messages=[
#                 {"role": "user", "content": data.message}
#             ],
#             temperature=0.7,
#             max_tokens=200,
#         )
#         reply_text = response.choices[0].message.content
#         return {"reply": reply_text}
#     except openai.RateLimitError as e:
#         raise HTTPException(status_code=429, detail="Vượt quá giới hạn yêu cầu API OpenAI. Vui lòng thử lại sau hoặc kiểm tra quota tài khoản.")
#     except openai.AuthenticationError as e:
#         raise HTTPException(status_code=401, detail="API key không hợp lệ. Vui lòng kiểm tra OPENAI_API_KEY trong .env.")
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Lỗi không xác định: {str(e)}")