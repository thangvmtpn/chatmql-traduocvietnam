"""
Script cập nhật cột 'mien' trong bảng khach_hang dựa trên địa chỉ
Phân loại theo 3 miền: BẮC, TRUNG, NAM
"""

import psycopg
from dotenv import load_dotenv
import os
import re
from typing import Optional

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

# Mapping 64 tỉnh thành theo vùng miền
MIEN_BAC = [
    'Hà Nội', 'Hải Phòng', 'Quảng Ninh', 'Bắc Giang', 'Bắc Kạn', 
    'Cao Bằng', 'Hà Giang', 'Lạng Sơn', 'Lào Cai', 'Phú Thọ', 
    'Thái Nguyên', 'Tuyên Quang', 'Yên Bái', 'Điện Biên', 'Hòa Bình', 
    'Lai Châu', 'Sơn La', 'Bắc Ninh', 'Hà Nam', 'Hải Dương', 
    'Hưng Yên', 'Nam Định', 'Ninh Bình', 'Thái Bình', 'Vĩnh Phúc'
]

MIEN_TRUNG = [
    'Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Bình', 'Quảng Trị', 
    'Thừa Thiên Huế', 'Đà Nẵng', 'Quảng Nam', 'Quảng Ngãi', 'Bình Định', 
    'Phú Yên', 'Khánh Hòa', 'Ninh Thuận', 'Bình Thuận'
]

MIEN_NAM = [
    'Kon Tum', 'Gia Lai', 'Đắk Lắk', 'Đắk Nông', 'Lâm Đồng',
    'Bình Phước', 'Tây Ninh', 'Bình Dương', 'Đồng Nai', 'Bà Rịa - Vũng Tàu',
    'Hồ Chí Minh', 'Long An', 'Tiền Giang', 'Bến Tre', 'Trà Vinh',
    'Vĩnh Long', 'Đồng Tháp', 'An Giang', 'Kiên Giang', 'Cần Thơ',
    'Hậu Giang', 'Sóc Trăng', 'Bạc Liêu', 'Cà Mau'
]

# Tạo mapping ngược từ tên tỉnh sang miền
TINH_TO_MIEN = {}
for tinh in MIEN_BAC:
    TINH_TO_MIEN[tinh] = 'BẮC'
for tinh in MIEN_TRUNG:
    TINH_TO_MIEN[tinh] = 'TRUNG'
for tinh in MIEN_NAM:
    TINH_TO_MIEN[tinh] = 'NAM'

# Các biến thể tên tỉnh thường gặp
TINH_VARIANTS = {
    'HCM': 'Hồ Chí Minh',
    'Hồ Chí Minh': 'Hồ Chí Minh',
    'TP HCM': 'Hồ Chí Minh',
    'TP.HCM': 'Hồ Chí Minh',
    'Sài Gòn': 'Hồ Chí Minh',
    'Huế': 'Thừa Thiên Huế',
    'Đà Nẵng': 'Đà Nẵng',
    'Da Nang': 'Đà Nẵng',
    'Hà Nội': 'Hà Nội',
    'Ha Noi': 'Hà Nội',
    'Hải Phòng': 'Hải Phòng',
    'Hai Phong': 'Hải Phòng',
    'Cần Thơ': 'Cần Thơ',
    'Can Tho': 'Cần Thơ',
}


def normalize_text(text: str) -> str:
    """Chuẩn hóa text để so sánh (lowercase, remove accents variants)"""
    if not text:
        return ""
    
    # Loại bỏ khoảng trắng thừa
    text = re.sub(r'\s+', ' ', text.strip())
    
    return text


def detect_tinh_from_address(dia_chi: str) -> Optional[str]:
    """
    Phát hiện tên tỉnh từ địa chỉ
    Returns: Tên tỉnh chuẩn hóa hoặc None nếu không tìm thấy
    """
    if not dia_chi:
        return None
    
    dia_chi = normalize_text(dia_chi)
    dia_chi_lower = dia_chi.lower()
    
    # Kiểm tra các biến thể tên tỉnh trước
    for variant, tinh_chinh in TINH_VARIANTS.items():
        variant_lower = variant.lower()
        if variant_lower in dia_chi_lower:
            return tinh_chinh
    
    # Kiểm tra tất cả các tỉnh trong mapping
    for tinh in TINH_TO_MIEN.keys():
        tinh_lower = tinh.lower()
        
        # Tìm kiếm chính xác tên tỉnh
        if tinh_lower in dia_chi_lower:
            return tinh
        
        # Tìm kiếm không dấu (basic)
        tinh_no_space = tinh.replace(' ', '')
        tinh_no_space_lower = tinh_no_space.lower()
        if tinh_no_space_lower in dia_chi_lower.replace(' ', ''):
            return tinh
    
    return None


def get_mien_from_tinh(tinh: str) -> Optional[str]:
    """Lấy vùng miền từ tên tỉnh"""
    return TINH_TO_MIEN.get(tinh)


def update_mien_for_customers():
    """
    Cập nhật cột mien cho tất cả khách hàng trong database
    """
    try:
        conn = psycopg.connect(DATABASE_URL)
        cur = conn.cursor()
        
        # Lấy tất cả khách hàng có địa chỉ
        print("Đang lấy dữ liệu khách hàng...")
        cur.execute("""
            SELECT id_kh, dia_chi, mien 
            FROM khach_hang 
            WHERE dia_chi IS NOT NULL AND dia_chi != ''
        """)
        
        customers = cur.fetchall()
        print(f"Tìm thấy {len(customers)} khách hàng có địa chỉ")
        
        # Thống kê
        updated_count = 0
        not_found_count = 0
        skipped_count = 0
        stats_by_mien = {'BẮC': 0, 'TRUNG': 0, 'NAM': 0}
        
        # Danh sách khách hàng không xác định được vùng
        not_found_addresses = []
        
        for customer_id, dia_chi, current_mien in customers:
            # Phát hiện tỉnh từ địa chỉ
            tinh = detect_tinh_from_address(dia_chi)
            
            if tinh:
                mien = get_mien_from_tinh(tinh)
                
                if mien:
                    # Chỉ update nếu khác với giá trị hiện tại
                    if current_mien != mien:
                        cur.execute("""
                            UPDATE khach_hang 
                            SET mien = %s 
                            WHERE id_kh = %s
                        """, (mien, customer_id))
                        updated_count += 1
                        stats_by_mien[mien] += 1
                        print(f"✓ ID {customer_id}: {tinh} → {mien}")
                    else:
                        skipped_count += 1
                else:
                    not_found_count += 1
                    not_found_addresses.append((customer_id, dia_chi))
            else:
                not_found_count += 1
                not_found_addresses.append((customer_id, dia_chi))
        
        # Commit changes
        conn.commit()
        
        # In kết quả
        print("\n" + "="*60)
        print("KẾT QUẢ CẬP NHẬT:")
        print("="*60)
        print(f"Tổng số khách hàng có địa chỉ: {len(customers)}")
        print(f"Đã cập nhật thành công: {updated_count}")
        print(f"  - Miền BẮC: {stats_by_mien['BẮC']}")
        print(f"  - Miền TRUNG: {stats_by_mien['TRUNG']}")
        print(f"  - Miền NAM: {stats_by_mien['NAM']}")
        print(f"Bỏ qua (đã đúng): {skipped_count}")
        print(f"Không xác định được: {not_found_count}")
        
        # Hiển thị một số địa chỉ không xác định được
        if not_found_addresses:
            print("\n" + "="*60)
            print("MỘT SỐ ĐỊA CHỈ KHÔNG XÁC ĐỊNH ĐƯỢC VÙNG:")
            print("="*60)
            for i, (cust_id, addr) in enumerate(not_found_addresses[:20], 1):
                print(f"{i}. ID {cust_id}: {addr[:100]}...")
            
            if len(not_found_addresses) > 20:
                print(f"\n... và {len(not_found_addresses) - 20} địa chỉ khác")
        
        cur.close()
        conn.close()
        
        print("\n✓ Hoàn thành!")
        
    except Exception as e:
        print(f"✗ Lỗi: {e}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()


if __name__ == "__main__":
    print("="*60)
    print("SCRIPT CẬP NHẬT VÙNG MIỀN CHO KHÁCH HÀNG")
    print("="*60)
    print()
    
    # Hỏi xác nhận trước khi chạy
    confirm = input("Bạn có chắc chắn muốn cập nhật? (yes/no): ")
    
    if confirm.lower() in ['yes', 'y']:
        update_mien_for_customers()
    else:
        print("Đã hủy!")
