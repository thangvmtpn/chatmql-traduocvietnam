import os
import json
import numpy as np
import faiss
import pymupdf4llm 
from fastembed import TextEmbedding
import re

BASE_DIR = os.path.dirname(__file__)
DOCS_DIR = os.path.join(BASE_DIR, "data", "tai_lieu_cong_ty")
INDEX_FILE = os.path.join(BASE_DIR, "data", "faiss_index.bin")
CHUNKS_FILE = os.path.join(BASE_DIR, "data", "chunks.json")

def clean_markdown_text(text):
    text = re.sub(r'(?<=\b\w)\s+(?=\w\b)', '', text)
    
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def chunk_markdown_smart(text, chunk_size=1500, overlap=200):
    paragraphs = re.split(r'\n\n(?=#|\||\*\*|Điều)', text) 
    
    chunks = []
    current_chunk = ""
    
    for para in paragraphs:
        if len(current_chunk) + len(para) <= chunk_size:
            current_chunk += para + "\n\n"
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            current_chunk = para + "\n\n"
            
    if current_chunk:
        chunks.append(current_chunk.strip())
        
    return chunks

def build_vector_db():
    print("--- 🚀 Bắt đầu xây dựng não bộ AI (Hỗ trợ Markdown) ---")
    
    embedding_model = TextEmbedding(model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
    
    if not os.path.exists(DOCS_DIR) or not os.listdir(DOCS_DIR):
        print("❌ Lỗi: Thư mục 'tai_lieu_cong_ty' trống hoặc không tồn tại!")
        return
        
    all_chunks = []
    for filename in os.listdir(DOCS_DIR):
        if filename.endswith(".pdf"):
            print(f"📄 Đang xử lý và trích xuất Bảng/Markdown: {filename}")
            path = os.path.join(DOCS_DIR, filename)
            
            try:
                md_text = pymupdf4llm.to_markdown(path)
                
                cleaned = clean_markdown_text(md_text)
                
                file_chunks = chunk_markdown_smart(cleaned)
                all_chunks.extend(file_chunks)
            except Exception as e:
                print(f"⚠️ Lỗi khi đọc file {filename}: {e}")

    print(f"3. Mã hóa {len(all_chunks)} đoạn văn bản (Chunks)...")
    embeddings = list(embedding_model.embed(all_chunks))
    embedding_matrix = np.vstack(embeddings).astype(np.float32)
    
    print("4. Đang tối ưu hóa và lưu trữ Vector DB...")
    faiss.normalize_L2(embedding_matrix) 
    index = faiss.IndexFlatIP(embedding_matrix.shape[1])
    index.add(embedding_matrix)
    
    os.makedirs(os.path.dirname(INDEX_FILE), exist_ok=True)
    faiss.write_index(index, INDEX_FILE)
    
    with open(CHUNKS_FILE, 'w', encoding='utf-8') as f:
        json.dump(all_chunks, f, ensure_ascii=False, indent=2)
        
    print(f"✅ Thành công! Dữ liệu đã sẵn sàng trong thư mục {os.path.dirname(INDEX_FILE)}")

if __name__ == "__main__":
    build_vector_db()