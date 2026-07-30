"""
Script kiểm tra và gửi thông báo khi đến thời gian tiếp cận khách hàng.
Chạy định kỳ mỗi 5 phút hoặc mỗi giờ.
"""

import asyncio
from datetime import datetime, timedelta
from database import conn
from sockets import sio, NAMESPACE_THONG_BAO

async def check_and_notify_contact_time():
    """
    Kiểm tra các khách hàng có thoi_gian_cs_lai trong vòng 1 giờ tới
    và gửi thông báo cho nhân viên phụ trách.
    """
    try:
        with conn.cursor() as cur:
            # Lấy thời gian hiện tại và 1 giờ sau
            now = datetime.now()
            one_hour_later = now + timedelta(hours=1)
            
            # Query lấy các khách hàng cần chăm sóc trong 1 giờ tới
            # và chưa được thông báo (kiểm tra bảng thong_bao)
            query = """
                SELECT 
                    kh.id_kh,
                    kh.ten_khach_hang,
                    kh.sdt1,
                    kh.thoi_gian_cs_lai,
                    kh.id_acc,
                    u.name as ten_nv
                FROM khach_hang kh
                LEFT JOIN account_users u ON kh.id_acc = u.id_acc
                WHERE kh.thoi_gian_cs_lai IS NOT NULL
                    AND kh.thoi_gian_cs_lai BETWEEN %s AND %s
                    AND NOT EXISTS (
                        SELECT 1 FROM thong_bao tb
                        WHERE kh.id_kh::text = ANY(tb.id_kh)
                            AND tb.tieu_de LIKE '%%Nhắc nhở chăm sóc%%'
                            AND DATE(tb.ngay_thong_bao) = CURRENT_DATE
                    )
            """
            
            cur.execute(query, (now, one_hour_later))
            customers = cur.fetchall()
            
            if not customers:
                conn.commit()
                print(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] Không có khách hàng cần thông báo")
                return
            
            columns = [desc[0] for desc in cur.description]
            
            for row in customers:
                customer = dict(zip(columns, row))
                id_kh = customer['id_kh']
                ten_kh = customer['ten_khach_hang']
                sdt = customer['sdt1']
                thoi_gian_cs_lai = customer['thoi_gian_cs_lai']
                id_acc = customer['id_acc']
                ten_nv = customer['ten_nv']
                
                # Format thời gian
                time_str = thoi_gian_cs_lai.strftime("%H:%M ngày %d/%m/%Y")
                
                # Tạo nội dung thông báo
                tieu_de = "⏰ Nhắc nhở chăm sóc khách hàng"
                noi_dung = f"Đến giờ chăm sóc khách hàng {ten_kh} ({sdt}). Thời gian: {time_str}"
                
                # Lưu vào database
                insert_query = """
                    INSERT INTO thong_bao (id_acc, ngay_thong_bao, noi_dung, tieu_de, id_kh)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id_tb
                """
                cur.execute(insert_query, (
                    id_acc,
                    now,
                    noi_dung,
                    tieu_de,
                    [str(id_kh)]  # PostgreSQL text array
                ))
                conn.commit()
                
                id_tb = cur.fetchone()[0]
                
                # Gửi thông báo qua Socket.IO
                notification_data = {
                    "id_tb": id_tb,
                    "id_acc": id_acc,
                    "tieu_de": tieu_de,
                    "noi_dung": noi_dung,
                    "ten_khach_hang": ten_kh,
                    "sdt": sdt,
                    "thoi_gian_cs_lai": time_str,
                    "id_kh": [id_kh],
                    "time_update": now.isoformat(),
                    "type": "contact_reminder"
                }
                
                try:
                    await sio.emit(
                        "new_thong_bao",
                        notification_data,
                        namespace=NAMESPACE_THONG_BAO,
                        room=str(id_acc)  # 🔑 Convert to string để match frontend
                    )
                    print(f"✅ Đã gửi thông báo cho nhân viên {ten_nv} (ID: {id_acc}) về khách hàng {ten_kh}")
                except Exception as e:
                    print(f"❌ Lỗi khi gửi socket notification: {e}")
                
    except Exception as e:
        print(f"❌ Lỗi khi kiểm tra thời gian chăm sóc: {str(e)}")
        conn.rollback()

async def run_periodic_check(interval_minutes=5):
    """
    Chạy kiểm tra định kỳ theo khoảng thời gian (phút)
    """
    print(f"🚀 Bắt đầu kiểm tra định kỳ mỗi {interval_minutes} phút...")
    
    while True:
        try:
            await check_and_notify_contact_time()
        except Exception as e:
            print(f"❌ Lỗi trong vòng lặp kiểm tra: {e}")
        
        # Chờ interval_minutes phút
        await asyncio.sleep(interval_minutes * 60)

if __name__ == "__main__":
    # Chạy kiểm tra mỗi 5 phút
    asyncio.run(run_periodic_check(interval_minutes=5))
