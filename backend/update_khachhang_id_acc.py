"""
Script cập nhật id_acc của khách hàng trong bảng khach_hang
Gán tất cả khách hàng từ các nhân viên cũ sang nhân viên mới
"""

import psycopg
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def update_khachhang_id_acc():
    """
    Update khách hàng có id_acc = 19, 24, 25, 15, 18, 20, 23, 22, 12, 26, 16, 21, 27
    sang id_acc = 30
    """
    
    # Danh sách id_acc cần chuyển
    old_id_accs = [19, 24, 25, 15, 18, 20, 23, 22, 12, 26, 16, 21, 27]
    new_id_acc = 30
    
    try:
        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                # Đếm số khách hàng trước khi update
                cur.execute("""
                    SELECT id_acc, COUNT(*) as so_luong
                    FROM khach_hang 
                    WHERE id_acc = ANY(%s)
                    GROUP BY id_acc
                    ORDER BY id_acc
                """, (old_id_accs,))
                
                before_count = cur.fetchall()
                
                print("=== THỐNG KÊ TRƯỚC KHI UPDATE ===")
                total = 0
                for id_acc, count in before_count:
                    print(f"ID_ACC {id_acc}: {count:,} khách hàng")
                    total += count
                print(f"TỔNG: {total:,} khách hàng sẽ được chuyển")
                
                # Kiểm tra nhân viên đích có tồn tại không
                cur.execute("SELECT user_id, name FROM account_users WHERE id_acc = %s", (new_id_acc,))
                nhan_vien = cur.fetchone()
                
                if not nhan_vien:
                    print(f"\n❌ CẢNH BÁO: Không tìm thấy nhân viên có id_acc = {new_id_acc}")
                    return
                
                print(f"\n✅ Nhân viên đích: {nhan_vien[0]} - {nhan_vien[1]}")
                
                # Confirm trước khi update
                confirm = input(f"\n⚠️  Bạn có chắc muốn chuyển {total:,} khách hàng sang nhân viên này? (yes/no): ")
                if confirm.lower() != 'yes':
                    print("❌ Hủy bỏ cập nhật")
                    return
                
                # Thực hiện update
                print("\n🔄 Đang cập nhật...")
                cur.execute("""
                    UPDATE khach_hang 
                    SET id_acc = %s
                    WHERE id_acc = ANY(%s)
                """, (new_id_acc, old_id_accs))
                
                updated_count = cur.rowcount
                conn.commit()
                
                print(f"✅ ĐÃ CẬP NHẬT THÀNH CÔNG: {updated_count:,} khách hàng")
                
                # Kiểm tra sau khi update
                cur.execute("""
                    SELECT COUNT(*) 
                    FROM khach_hang 
                    WHERE id_acc = %s
                """, (new_id_acc,))
                
                after_count = cur.fetchone()[0]
                print(f"\n=== SAU KHI UPDATE ===")
                print(f"ID_ACC {new_id_acc} hiện có: {after_count:,} khách hàng")
                
    except Exception as e:
        print(f"❌ LỖI: {e}")
        raise

if __name__ == "__main__":
    print("=" * 60)
    print("SCRIPT CẬP NHẬT ID_ACC CHO KHÁCH HÀNG")
    print("=" * 60)
    update_khachhang_id_acc()
    print("\n✅ HOÀN TẤT!")
