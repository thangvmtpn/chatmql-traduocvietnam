"""
Script cập nhật nhan_vien_pt trong bảng khach_hang
Đồng bộ nhan_vien_pt theo user_id từ bảng account_users
Điều kiện: account_users.id_acc = khach_hang.id_acc
"""

import psycopg
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def update_nhan_vien_pt():
    """
    Cập nhật nhan_vien_pt trong khach_hang
    từ user_id trong account_users dựa trên id_acc
    """
    
    try:
        with psycopg.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                # Kiểm tra số lượng khách hàng cần cập nhật
                cur.execute("""
                    SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN kh.nhan_vien_pt != au.user_id THEN 1 END) as can_cap_nhat,
                        COUNT(CASE WHEN kh.nhan_vien_pt IS NULL THEN 1 END) as null_count
                    FROM khach_hang kh
                    INNER JOIN account_users au ON kh.id_acc = au.id_acc
                """)
                
                stats = cur.fetchone()
                total, can_cap_nhat, null_count = stats
                
                print("=== THỐNG KÊ TRƯỚC KHI UPDATE ===")
                print(f"Tổng số khách hàng có id_acc trong account_users: {total:,}")
                print(f"Số khách hàng có nhan_vien_pt khác với user_id: {can_cap_nhat:,}")
                print(f"Số khách hàng có nhan_vien_pt NULL: {null_count:,}")
                
                if can_cap_nhat == 0:
                    print("\n✅ Tất cả khách hàng đã có nhan_vien_pt chính xác!")
                    return
                
                # Hiển thị một số ví dụ cần cập nhật
                print("\n=== MỘT SỐ VÍ DỤ CẦN CẬP NHẬT ===")
                cur.execute("""
                    SELECT 
                        kh.id_kh,
                        kh.ten_khach_hang,
                        kh.id_acc,
                        au.name as ten_nhan_vien,
                        kh.nhan_vien_pt as pt_hien_tai,
                        au.user_id as pt_dung
                    FROM khach_hang kh
                    INNER JOIN account_users au ON kh.id_acc = au.id_acc
                    WHERE kh.nhan_vien_pt != au.user_id OR kh.nhan_vien_pt IS NULL
                    LIMIT 10
                """)
                
                examples = cur.fetchall()
                for row in examples:
                    ten_kh = (row[1] or "N/A")[:30] if row[1] else "N/A"
                    print(f"ID: {row[0]} | Khách hàng: {ten_kh:30} | id_acc: {row[2]} | "
                          f"NV: {row[3]:20} | PT hiện tại: {row[4]} -> PT đúng: {row[5]}")
                
                # Confirm trước khi update
                confirm = input(f"\n⚠️  Bạn có chắc muốn cập nhật {can_cap_nhat:,} khách hàng? (yes/no): ")
                if confirm.lower() != 'yes':
                    print("❌ Hủy bỏ cập nhật")
                    return
                
                # Thực hiện update
                print("\n🔄 Đang cập nhật nhan_vien_pt...")
                cur.execute("""
                    UPDATE khach_hang kh
                    SET nhan_vien_pt = au.user_id
                    FROM account_users au
                    WHERE kh.id_acc = au.id_acc
                    AND (kh.nhan_vien_pt != au.user_id OR kh.nhan_vien_pt IS NULL)
                """)
                
                updated_count = cur.rowcount
                conn.commit()
                
                print(f"✅ ĐÃ CẬP NHẬT THÀNH CÔNG: {updated_count:,} khách hàng")
                
                # Kiểm tra sau khi update
                cur.execute("""
                    SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN kh.nhan_vien_pt != au.user_id THEN 1 END) as con_sai
                    FROM khach_hang kh
                    INNER JOIN account_users au ON kh.id_acc = au.id_acc
                """)
                
                after_stats = cur.fetchone()
                print(f"\n=== SAU KHI UPDATE ===")
                print(f"Tổng số khách hàng: {after_stats[0]:,}")
                print(f"Số khách hàng còn sai: {after_stats[1]:,}")
                
                if after_stats[1] == 0:
                    print("✅ Tất cả nhan_vien_pt đã được đồng bộ chính xác!")
                
    except Exception as e:
        print(f"❌ LỖI: {e}")
        raise

if __name__ == "__main__":
    print("=" * 80)
    print("SCRIPT CẬP NHẬT NHAN_VIEN_PT CHO KHÁCH HÀNG")
    print("Đồng bộ nhan_vien_pt theo user_id từ account_users")
    print("=" * 80)
    update_nhan_vien_pt()
    print("\n✅ HOÀN TẤT!")
