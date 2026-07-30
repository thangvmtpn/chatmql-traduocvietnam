"""
Script cập nhật id_acc của khách hàng trong bảng khach_hang
Gán khách hàng có nhóm KH là F, FKT+ hoặc F...KT từ các nhân viên cũ sang nhân viên mới
"""

import psycopg
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def update_khachhang_by_nhomkh():
    """
    Update khách hàng có:
    - id_acc = 13, 14, 4, 6, 7, 8, 9, 11, 5, 10
    - nhom_kh = 'F' hoặc 'FKT+' hoặc pattern 'F%KT'
    sang id_acc = 30
    """
    
    # Danh sách id_acc cần chuyển
    old_id_accs = [13, 14, 4, 6, 7, 8, 9, 11, 5, 10]
    new_id_acc = 30
    
    try:
        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                # Đếm số khách hàng trước khi update - DÙNG TRIM
                # Pattern: 'F', 'FKT', 'FKT*', 'F*KT' (nhưng NOT FT*)
                cur.execute("""
                    SELECT id_acc, TRIM(nhom_kh) as nhom_kh_clean, COUNT(*) as so_luong
                    FROM khach_hang 
                    WHERE id_acc = ANY(%s)
                    AND (
                        TRIM(nhom_kh) = 'F' 
                        OR TRIM(nhom_kh) = 'FKT' 
                        OR TRIM(nhom_kh) LIKE 'FKT%%'
                        OR (TRIM(nhom_kh) LIKE 'F%%KT' AND TRIM(nhom_kh) NOT LIKE 'FT%%')
                    )
                    GROUP BY id_acc, TRIM(nhom_kh)
                    ORDER BY id_acc, TRIM(nhom_kh)
                """, (old_id_accs,))
                
                before_count = cur.fetchall()
                
                print("=== THỐNG KÊ TRƯỚC KHI UPDATE ===")
                total = 0
                for id_acc, nhom_kh, count in before_count:
                    print(f"ID_ACC {id_acc} - Nhóm '{nhom_kh}': {count:,} khách hàng")
                    total += count
                print(f"\nTỔNG: {total:,} khách hàng sẽ được chuyển")
                
                if total == 0:
                    print("\n⚠️  Không tìm thấy khách hàng nào phù hợp điều kiện")
                    return
                
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
                
                # Thực hiện update - DÙNG TRIM
                print("\n🔄 Đang cập nhật...")
                cur.execute("""
                    UPDATE khach_hang 
                    SET id_acc = %s
                    WHERE id_acc = ANY(%s)
                    AND (
                        TRIM(nhom_kh) = 'F' 
                        OR TRIM(nhom_kh) = 'FKT' 
                        OR TRIM(nhom_kh) LIKE 'FKT%%'
                        OR (TRIM(nhom_kh) LIKE 'F%%KT' AND TRIM(nhom_kh) NOT LIKE 'FT%%')
                    )
                """, (new_id_acc, old_id_accs))
                
                updated_count = cur.rowcount
                conn.commit()
                
                print(f"✅ ĐÃ CẬP NHẬT THÀNH CÔNG: {updated_count:,} khách hàng")
                
                # Kiểm tra sau khi update - DÙNG TRIM
                cur.execute("""
                    SELECT TRIM(nhom_kh) as nhom_kh_clean, COUNT(*) as so_luong
                    FROM khach_hang 
                    WHERE id_acc = %s
                    AND (
                        TRIM(nhom_kh) = 'F' 
                        OR TRIM(nhom_kh) = 'FKT' 
                        OR TRIM(nhom_kh) LIKE 'FKT%%'
                        OR (TRIM(nhom_kh) LIKE 'F%%KT' AND TRIM(nhom_kh) NOT LIKE 'FT%%')
                    )
                    GROUP BY TRIM(nhom_kh)
                    ORDER BY TRIM(nhom_kh)
                """, (new_id_acc,))
                
                after_count = cur.fetchall()
                print(f"\n=== SAU KHI UPDATE ===")
                print(f"ID_ACC {new_id_acc} hiện có:")
                for nhom_kh, count in after_count:
                    print(f"  - Nhóm '{nhom_kh}': {count:,} khách hàng")
                
    except Exception as e:
        print(f"❌ LỖI: {e}")
        raise

if __name__ == "__main__":
    print("=" * 60)
    print("SCRIPT CẬP NHẬT ID_ACC CHO KHÁCH HÀNG THEO NHÓM KH")
    print("=" * 60)
    update_khachhang_by_nhomkh()
    print("\n✅ HOÀN TẤT!")
