import traceback
import json
from database import conn_fm as conn

# 1. Hàm TẠO MỚI (Create)
async def create_gami_post_db(data: dict, user_id, user_name):
    try:
        with conn.cursor() as cursor:
            sql = """
                INSERT INTO gami_individual_posts 
                (type, title, frequency, apply_date, start_date, end_date, start_time, end_time, target_description, config_data, created_by, created_by_name)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id;
            """
            config_json = json.dumps(data.get('config_data'))
            
            cursor.execute(sql, (
                data.get('type'),
                data.get('title'),
                data.get('frequency'),
                data.get('apply_date'),
                data.get('start_date'),
                data.get('end_date'),
                data.get('start_time'),
                data.get('end_time'),
                data.get('target_description'),
                config_json,
                user_id,
                user_name
            ))
            conn.commit()
            return cursor.fetchone()[0]
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi tạo gamification: {str(e)}")
        return None

# 2. Hàm CẬP NHẬT (Update)
async def update_gami_post_db(post_id: int, data: dict):
    try:
        with conn.cursor() as cursor:
            sql = """
                UPDATE gami_individual_posts 
                SET title = %s,
                    frequency = %s,
                    apply_date = %s,
                    start_date = %s,
                    end_date = %s,
                    start_time = %s,
                    end_time = %s,
                    target_description = %s,
                    config_data = %s,
                    updated_at = NOW()
                WHERE id = %s
            """
            config_json = json.dumps(data.get('config_data'))
            
            cursor.execute(sql, (
                data.get('title'),
                data.get('frequency'),
                data.get('apply_date'),
                data.get('start_date'),
                data.get('end_date'),
                data.get('start_time'), 
                data.get('end_time'),  
                data.get('target_description'),
                config_json,
                post_id
            ))
            conn.commit()
            return True
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi sửa gamification: {str(e)}")
        return False

# 3. Hàm XÓA (Delete) - Giữ nguyên
async def delete_gami_post_db(post_id: int):
    try:
        with conn.cursor() as cursor:
            sql = "DELETE FROM gami_individual_posts WHERE id = %s"
            cursor.execute(sql, (post_id,))
            conn.commit()
            return True
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi xóa gamification: {str(e)}")
        return False

# 4. Hàm LẤY DANH SÁCH (List) - Sửa lại lấy đủ cột
async def get_gami_posts_db(post_type: str, page: int, limit: int):
    try:
        with conn.cursor() as cursor:
            offset = (page - 1) * limit
            sql = """
                SELECT 
                    id, type, title, frequency, 
                    apply_date, start_date, end_date, start_time, end_time,
                    target_description, config_data, 
                    created_by, created_by_name, created_at
                FROM gami_individual_posts 
                WHERE type = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """
            cursor.execute(sql, (post_type, limit, offset))
            columns = [desc[0] for desc in cursor.description]
            posts = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            count_sql = "SELECT COUNT(*) FROM gami_individual_posts WHERE type = %s"
            cursor.execute(count_sql, (post_type,))
            total = cursor.fetchone()[0]
            
            return {"data": posts, "total": total}
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi lấy danh sách: {str(e)}")
        return {"data": [], "total": 0}

async def get_gamification_config_db(post_id: int):
    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT 
                    id, 
                    title, 
                    frequency, 
                    apply_date, 
                    start_date,
                    end_date,
                    start_time,
                    end_time,
                    target_description, 
                    config_data, 
                    created_at 
                FROM public.gami_individual_posts 
                WHERE id = %s
            """
            cursor.execute(sql, (post_id,))
            
            if cursor.description:
                columns = [desc[0] for desc in cursor.description]
                result = cursor.fetchone()
                if result:
                    return dict(zip(columns, result))
            return None
            
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi lấy chi tiết gamification: {e}")
        return None
    
async def get_deal_shock_history_db(post_id: int):
    """
    Lấy lịch sử bán deal sốc từ bảng deal_soc, 
    nối với invoice_detail và invoice để lấy thông tin Sale
    """
    try:
        with conn.cursor() as cursor:
            # CÂU LỆNH SQL ĐÃ ĐƯỢC SỬA CHUẨN VỚI CẤU TRÚC DATABASE CỦA BẠN
            query = """
                SELECT 
                    i.code_seller AS user_id, 
                    i.name_seller AS user_name, 
                    ds.product_code, 
                    SUM(ds.quantity) AS total_deals, 
                    SUM(ds.reward_amount) AS total_reward
                FROM deal_soc ds
                JOIN invoice_detail d ON ds.invoice_item_id = d.id_invoice_detail
                JOIN invoice i ON d.code_invoice = i.code_invoice
                WHERE ds.deal_shock_config_id = %s
                GROUP BY i.code_seller, i.name_seller, ds.product_code
            """
            cursor.execute(query, (post_id,))
            if cursor.description:
                columns = [desc[0] for desc in cursor.description]
                return [dict(zip(columns, row)) for row in cursor.fetchall()]
            return []
    except Exception as e:
        conn.rollback() 
        print(f"❌ Lỗi get_deal_shock_history_db: {str(e)}")
        return []
    
async def get_top_race_raw_stats_db(start_date, end_date):
    try:
        from database import conn_fm as conn
        with conn.cursor() as cursor:
            print(f"🕒 [DEBUG - ĐUA TOP] Tham số nhận vào: start_date='{start_date}', end_date='{end_date}'")
            check_time_sql = """
                SELECT 
                    MIN(time_create AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') as min_time,
                    MAX(time_create AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') as max_time
                FROM invoice
                WHERE DATE(time_create AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') >= %s 
                  AND DATE(time_create AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') <= %s
                  AND id_status <> 12
            """
            cursor.execute(check_time_sql, (start_date, end_date))
            min_t, max_t = cursor.fetchone()
            print(f"🔍 [DEBUG - ĐUA TOP] Dữ liệu thực tế quét được từ: {min_t} ĐẾN {max_t}")

            query = """
                SELECT 
                    i.code_seller AS user_id, 
                    MAX(i.name_seller) AS user_name, 
                    COALESCE(i.name_salechannel, 'Khác') AS channel_name,
                    COUNT(DISTINCT i.code_invoice) AS total_orders, 
                    COALESCE(SUM(d.total), 0) AS total_revenue,
                    ARRAY_AGG(DISTINCT TO_CHAR(i.time_create AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI:SS')) as order_times
                FROM invoice i
                JOIN invoice_detail d ON i.code_invoice = d.code_invoice
                WHERE DATE(i.time_create AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') >= %s 
                  AND DATE(i.time_create AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh') <= %s
                  AND i.id_status <> 12
                  AND LOWER(COALESCE(d.type_product, '')) <> 'gift'
                GROUP BY i.code_seller, COALESCE(i.name_salechannel, 'Khác')
                ORDER BY total_revenue DESC;
            """
            cursor.execute(query, (start_date, end_date))
            
            if cursor.description:
                columns = [desc[0] for desc in cursor.description]
                return [dict(zip(columns, row)) for row in cursor.fetchall()]
            return []
    except Exception as e:
        import traceback
        traceback.print_exc()
        conn.rollback()
        print(f"❌ Lỗi get_top_race_raw_stats_db: {str(e)}")
        return []

async def get_previous_gamification_db(frequency: str, current_start_date: str):
    """
    Tìm chiến dịch đua top có cùng frequency gần nhất tính từ trước ngày current_start_date.
    """
    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT 
                    id, 
                    title, 
                    frequency, 
                    apply_date, 
                    start_date,
                    end_date,
                    start_time,
                    end_time,
                    target_description, 
                    config_data, 
                    created_at 
                FROM gami_individual_posts 
                WHERE type = 'TOP_RACE' 
                  AND frequency = %s 
                  AND start_date < %s
                ORDER BY start_date DESC 
                LIMIT 1
            """
            cursor.execute(sql, (frequency, current_start_date))
            
            if cursor.description:
                columns = [desc[0] for desc in cursor.description]
                result = cursor.fetchone()
                if result:
                    return dict(zip(columns, result))
            return None
            
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi tìm chiến dịch kỳ trước: {e}")
        return None