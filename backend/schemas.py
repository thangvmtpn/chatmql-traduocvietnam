from datetime import datetime
from pydantic import BaseModel

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict = None  # Thông tin user (id, username, role_id, etc.)

class NhanVienRequest(BaseModel):
    user_id: str
    name: str
    chuc_vu: str
    username: str
    password: str
    role_id: int
    department_id: int
    maneger_id: int

class NhanVienResponse(BaseModel):
    id_acc: int
    user_id: str
    name: str
    chuc_vu: str
    username: str
    password: str
    role_id: int
    department_id: int
    maneger_id: int

class KhachHangRequest(BaseModel):
    id_acc: int
    nhan_vien_pt: str
    nhom_kh: str
    ten_khach_hang: str
    sdt: str
    gioi_tinh: str
    dia_chi: str
    ngay_sinh: str
    nghe_nghiep: str
    diem_khach_hang: int
    ghi_chu: str
    dac_thu_sp: str
    nhu_cau_sd: str
    thoi_gian_tao: datetime
    nguon_data: str
    
class KhachHangResponse(BaseModel):
    id_acc: int
    ma_kh: int
    nhan_vien_pt: str
    nhom_kh: str
    ten_khach_hang: str
    sdt: str
    gioi_tinh: str
    dia_chi: str
    ngay_sinh: str
    nghe_nghiep: str
    diem_khach_hang: int
    ghi_chu: str
    thoi_gian_cs_lai: datetime
    dac_thu_sp: str
    nhu_cau_sd: str
    nguon_data: str

class SearchTemplateRequest(BaseModel):
    name: str
    filter_data: dict