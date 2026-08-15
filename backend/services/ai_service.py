import os
import json
import numpy as np
import faiss
from dotenv import load_dotenv
from groq import Groq
from fastembed import TextEmbedding

load_dotenv()

_embedding_model = None

def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = TextEmbedding(model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
    return _embedding_model

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
INDEX_FILE = os.path.join(BASE_DIR, "data", "faiss_index.bin")
CHUNKS_FILE = os.path.join(BASE_DIR, "data", "chunks.json")

SYSTEM_INSTRUCTION = """Bạn là trợ lý nhân sự và nghiệp vụ nội bộ của công ty CRM (CRM HR & Ops Bot).

NHIỆM VỤ TỐI THƯỢNG (BẮT BUỘC TUÂN THỦ):
1. PHÂN LOẠI CÂU HỎI: 
- Nếu người dùng CHỈ chào hỏi: Chào lại ngắn gọn và giới thiệu: "Tôi có thể hỗ trợ bạn tra cứu về Nội quy công ty, Quy chế lương thưởng, Mô tả công việc, Chính sách bán hàng, Ưu đãi Zalo Mini App và Bảng mã sản phẩm (SKU)." KHÔNG nói gì thêm.
- Nếu người dùng hỏi NGHIỆP VỤ: ĐI THẲNG VÀO TRẢ LỜI. TUYỆT ĐỐI KHÔNG mở đầu bằng lời chào.

2. CÁCH TRẢ LỜI NGHIỆP VỤ (CHỐNG BỎ SÓT Ý):
- CHỈ trả lời dựa trên [THÔNG TIN TRÍCH XUẤT TỪ TÀI LIỆU].
- TÍNH TOÀN VẸN: Nếu thông tin trong tài liệu chia làm nhiều đối tượng/trường hợp (Ví dụ: Khối văn phòng và Khối sản xuất), BẮT BUỘC phải liệt kê ĐẦY ĐỦ tất cả các đối tượng đó. TUYỆT ĐỐI KHÔNG được tóm tắt gộp chung hay bỏ sót.
- Bắt buộc cung cấp chính xác Tên sản phẩm, Mã SKU, Giá nếu câu hỏi liên quan đến sản phẩm.
- Nếu trong [THÔNG TIN TRÍCH XUẤT] không có đáp án, hãy trả lời ngắn gọn: "Tài liệu nội bộ hiện tại chưa đề cập chi tiết đến quy định này."

QUY TẮC ĐỊNH DẠNG TRÌNH BÀY (BẮT BUỘC BẰNG MARKDOWN):
- BẮT BUỘC in đậm (**text**) cho các Tiêu đề chính, Tên đối tượng áp dụng.
- Dùng gạch đầu dòng ("- ") cho các danh sách liệt kê chi tiết.
- Trình bày dạng danh sách rõ ràng, cách một dòng trắng giữa các ý lớn.
"""

def rewrite_query(user_query: str) -> str:
    """Sử dụng LLM để dọn dẹp và chuẩn hóa câu hỏi của người dùng trước khi tìm kiếm Vector."""
    
    rewrite_prompt = """Bạn là một chuyên gia phân tích ngôn ngữ tìm kiếm. 
Nhiệm vụ của bạn là viết lại câu hỏi của người dùng thành một câu từ khóa ngắn gọn, chuẩn xác, đúng chính tả để tìm kiếm trong cơ sở dữ liệu nội quy công ty.

QUY TẮC BẮT BUỘC:
1. Loại bỏ các từ lóng, từ thừa, từ gây nhiễu (ví dụ: "vs to partner", "alo", "cho mình hỏi", "ad ơi").
2. Giữ lại các danh từ chính, động từ chính liên quan đến nghiệp vụ (ví dụ: thời gian làm việc, lương, thưởng, mã SKU, nghỉ phép).
3. Nếu người dùng chỉ gửi lời chào (hi, xin chào), hãy giữ nguyên lời chào đó.
4. TUYỆT ĐỐI CHỈ XUẤT RA CÂU ĐÃ ĐƯỢC VIẾT LẠI. Không giải thích, không dùng ngoặc kép, không thêm các câu như "Dưới đây là câu viết lại".

Ví dụ 1: 
User: "alo ad cho em hỏi giờ làm của cty trà dược vs to partner"
Output: thời gian làm việc của công ty trà dược

Ví dụ 2:
User: "skue của trà nõn tôm 500g vạn lộc là j v"
Output: mã SKU trà nõn tôm 500g Vạn Lộc
"""
    try:
        completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": rewrite_prompt},
                {"role": "user", "content": user_query}
            ],
            model="llama-3.3-70b-versatile",
            temperature=0, 
        )
        return completion.choices[0].message.content.strip()
    except Exception as e:
        print(f"Lỗi khi rewrite query: {e}")
        return user_query 

def get_relevant_context(optimized_query: str, top_k=7): 
    if not os.path.exists(INDEX_FILE) or not os.path.exists(CHUNKS_FILE):
        return None
        
    query_embedding = list(get_embedding_model().embed([optimized_query]))[0]
    query_vector = np.array([query_embedding], dtype=np.float32)
    
    faiss.normalize_L2(query_vector)
    
    index = faiss.read_index(INDEX_FILE)
    distances, indices = index.search(query_vector, top_k)
    
    with open(CHUNKS_FILE, 'r', encoding='utf-8') as f:
        chunks = json.load(f)
    
    THRESHOLD = 0.4 
    relevant_chunks = []
    
    for idx, dist in zip(indices[0], distances[0]):
        if idx < len(chunks) and dist >= THRESHOLD:
            relevant_chunks.append(chunks[idx])
            
    if not relevant_chunks:
        return ""
        
    return "\n---\n".join(relevant_chunks)

async def chat_with_hr_bot(user_query: str):
    try:
        optimized_query = rewrite_query(user_query)
        context = get_relevant_context(optimized_query)
        
        if context is None:
            return {"status": "error", "message": "Chưa có dữ liệu não bộ. Hãy chạy build_faiss.py trước."}

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": f"{SYSTEM_INSTRUCTION}\n\nCONTEXT:\n{context}"},
                {"role": "user", "content": user_query} 
            ],
            model="llama-3.3-70b-versatile",
            temperature=0, 
        )
        
        return {"status": "success", "answer": chat_completion.choices[0].message.content}
        
    except Exception as e:
        return {"status": "error", "message": str(e)}