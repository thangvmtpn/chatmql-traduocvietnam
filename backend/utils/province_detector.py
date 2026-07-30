"""
Utility để phát hiện tỉnh thành và vùng miền từ địa chỉ
"""

import re
from typing import Optional

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


def detect_mien_from_address(dia_chi: str) -> Optional[str]:
    """
    Phát hiện vùng miền từ địa chỉ
    Returns: 'BẮC', 'TRUNG', 'NAM' hoặc None nếu không xác định được
    """
    tinh = detect_tinh_from_address(dia_chi)
    if tinh:
        return get_mien_from_tinh(tinh)
    return None
