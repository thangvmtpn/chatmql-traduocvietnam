# models/tro_chuyen.py
from typing import List
# from database import conn
from fastapi import HTTPException
from database import conn
from psycopg.extras import RealDictCursor

def create_conversation(name: str, participant_ids: List[int], is_group: bool = False):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("BEGIN;")
            # Kiểm tra cuộc trò chuyện 1-1
            if not is_group and len(participant_ids) == 2:
                cur.execute(
                    """
                    SELECT 
                        c.id, 
                        c.name, 
                        c.created_at, 
                        c.is_group,
                        COALESCE(c.unread_counts, '{}') AS unread_counts,
                        COALESCE(c.muted_by, '{}') AS muted_by,
                        array_agg(json_build_object(
                            'id', u.id_acc,
                            'ho_ten', u.name,
                            'status', u.status, 
                            'avatar', '/image/bgr.jpg'
                        )) AS participants
                    FROM conversations c
                    JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
                    JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
                    JOIN account_users u ON cp1.user_id = u.id_acc OR cp2.user_id = u.id_acc
                    WHERE c.is_group = false
                    AND cp1.user_id = %s AND cp2.user_id = %s
                    GROUP BY c.id, c.name, c.created_at, c.is_group, c.unread_counts, c.muted_by
                    """,
                    (participant_ids[0], participant_ids[1])
                )
                existing_convo = cur.fetchone()
                if existing_convo:
                    conn.commit()
                    return {
                        'id': existing_convo['id'],
                        'name': existing_convo['name'],
                        'created_at': existing_convo['created_at'],
                        'is_group': existing_convo['is_group'],
                        'participants': existing_convo['participants'],
                        'last_message': None,
                        'unread_count': int(existing_convo['unread_counts'].get(str(participant_ids[0]), '0')),
                        'is_muted': bool(existing_convo['muted_by'].get(str(participant_ids[0])))
                    }

            # Tạo cuộc trò chuyện mới
            cur.execute(
                """
                INSERT INTO conversations (name, is_group, unread_counts, muted_by)
                VALUES (%s, %s, %s, %s) 
                RETURNING id, name, created_at, is_group, unread_counts, muted_by
                """,
                (name, is_group, '{}', '{}')
            )
            convo = cur.fetchone()
            
            # Thêm participants
            for user_id in participant_ids:
                cur.execute(
                    """
                    INSERT INTO conversation_participants (conversation_id, user_id)
                    VALUES (%s, %s)
                    """,
                    (convo['id'], user_id)
                )
            
            # Lấy thông tin participants
            cur.execute(
                """
                SELECT 
                    json_build_object(
                        'id', u.id_acc,
                        'ho_ten', u.name,
                        'status', u.status,
                        'avatar', '/image/bgr.jpg'
                    ) AS participant
                FROM conversation_participants cp
                JOIN account_users u ON cp.user_id = u.id_acc
                WHERE cp.conversation_id = %s
                """,
                (convo['id'],)
            )
            participants = [row['participant'] for row in cur.fetchall()]
            
            conn.commit()
            return {
                'id': convo['id'],
                'name': convo['ho_ten'],
                'created_at': convo['created_at'],
                'is_group': convo['is_group'],
                'participants': participants,
                'last_message': None,
                'unread_count': 0,
                'is_muted': False
            }
    except Exception as e:
        conn.rollback()
        raise Exception(f"Lỗi tạo cuộc trò chuyện: {str(e)}")
    

def create_message(conversation_id: int, sender_id: int, content: str, type: str = "text"):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("BEGIN;")
            # Tạo tin nhắn
            cur.execute(
                """
                INSERT INTO messages (conversation_id, sender_id, content, type, timestamp, status)
                VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP, %s)
                RETURNING id, conversation_id, sender_id, content, type, timestamp, status
                """,
                (conversation_id, sender_id, content, type, 'sent')
            )
            message = cur.fetchone()
            # Cập nhật last_message_id
            cur.execute(
                """
                UPDATE conversations
                SET last_message_id = %s
                WHERE id = %s
                """,
                (message["id"], conversation_id)
            )
            # Tăng unread_counts cho các participants khác
            cur.execute(
                """
                SELECT user_id FROM conversation_participants
                WHERE conversation_id = %s AND user_id != %s
                """,
                (conversation_id, sender_id)
            )
            other_participants = [row['user_id'] for row in cur.fetchall()]
            for user_id in other_participants:
                cur.execute(
                    """
                    UPDATE conversations
                    SET unread_counts = unread_counts || jsonb_build_object(%s, COALESCE(unread_counts->>%s::text, '0')::int + 1)
                    WHERE id = %s
                    """,
                    (str(user_id), str(user_id), conversation_id)
                )
            conn.commit()
            # Chuyển timestamp thành chuỗi ISO
            message = dict(message)  # Chuyển RealDictRow thành dict thường
            message['timestamp'] = message['timestamp'].isoformat()
            print(f"Đã tạo tin nhắn: {message}")  # Debug log
            print(f"Tin nhắn đã được tạo trong cơ sở dữ liệu: {message}")
            return message
    except Exception as e:
        conn.rollback()
        print(f"Tin nhắn lỗi khi tạo trong cơ sở dữ liệu: {str(e)}")
        raise Exception(f"Lỗi tạo tin nhắn: {str(e)}")



def get_conversations(user_id: int):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT 
                    c.id, 
                    c.name, 
                    c.created_at, 
                    c.is_group,
                    COALESCE(c.unread_counts->>%s::text, '0')::int AS unread_count,
                    CASE WHEN c.muted_by->>%s::text IS NOT NULL THEN true ELSE false END AS is_muted,
                    array_agg(json_build_object(
                        'id', u.id_acc,
                        'ho_ten', u.name,
                        'status', u.status,
                        'avatar', '/image/bgr.jpg'
                    )) AS participants,
                    json_build_object(
                        'id', m.id,
                        'conversation_id', m.conversation_id,
                        'sender_id', m.sender_id,
                        'content', m.content,
                        'type', m.type,
                        'timestamp', m.timestamp,
                        'status', m.status,
                        'reactions', COALESCE(m.reactions, '{}')
                    ) AS last_message
                FROM conversations c
                JOIN conversation_participants cp ON c.id = cp.conversation_id
                JOIN conversation_participants cp_all ON c.id = cp_all.conversation_id
                JOIN account_users u ON cp_all.user_id = u.id_acc
                LEFT JOIN messages m ON c.last_message_id = m.id
                WHERE cp.user_id = %s
                GROUP BY c.id, c.name, c.created_at, c.is_group, c.unread_counts, c.muted_by, m.id
                ORDER BY COALESCE(m.timestamp, c.created_at) DESC
                """,
                (str(user_id), str(user_id), user_id)
            )
            rows = cur.fetchall()
            print(f"Dữ liệu thô lấy cho người dùng {user_id}: {rows}")  # Debug log
            result = []
            for row in rows:
                result.append({
                    'id': row['id'],
                    'name': row['ho_ten'],
                    'created_at': row['created_at'],
                    'is_group': row['is_group'],
                    'participants': row['participants'],
                    'last_message': row['last_message'] if row['last_message']['id'] else None,
                    'unread_count': row['unread_count'],
                    'is_muted': row['is_muted']
                })
            print(f"Danh sách cuộc trò chuyện đã xử lý cho người dùng {user_id}: {result}")  # Debug log
            return result
    except Exception as e:
        print(f" Lỗi khi lấy cuộc trò chuyện cho người dùng {user_id}: {str(e)}")
        raise



def get_messages(conversation_id: int, limit: int = 50, offset: int = 0):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT *
            FROM messages
            WHERE conversation_id = %s
            ORDER BY timestamp ASC
            LIMIT %s OFFSET %s
            """,
            (conversation_id, limit, offset)
        )
        return cur.fetchall()
    

def timkiemnguoidung(query: str) -> List[dict]:
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id_acc, name, status
                FROM account_users
                WHERE name ILIKE %s
                LIMIT 10
                """,
                (f"%{query}%",)
            )
            return cur.fetchall()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=400, detail=f"Lỗi tìm kiếm người dùng: {str(e)}")