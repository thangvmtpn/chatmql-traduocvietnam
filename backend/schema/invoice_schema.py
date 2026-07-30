from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel
from typing import List, Optional

class InvoiceDetail(BaseModel):
    """Chi tiết sản phẩm trong hóa đơn"""
    code_invoice: Optional[str] = None
    id_product: int
    code_product: str
    name_product: str
    sub_code_product: Optional[str] = None
    sub_name_code_product: Optional[str] = None
    quantity: int
    sub_price: Decimal = Decimal('0')  # Giá trước chiết khấu
    discount_price: Decimal = Decimal('0')  # Số tiền chiết khấu
    price: Decimal  # Giá sau chiết khấu
    total: Decimal  # Thành tiền = price * quantity
    type_product: Optional[str] = None

class DeliveryInformation(BaseModel):
    """Thông tin giao hàng"""
    time_create: Optional[datetime] = None
    time_update: Optional[datetime] = None
    code_delivery: Optional[str] = None
    id_partner_delivery: Optional[int] = None
    partner_delivery: Optional[str] = None
    code_invoice: Optional[str] = None
    height: int
    width: int
    length: int
    weight: int
    codfee: Decimal = Decimal('0')
    fee_delivery: Decimal = Decimal('0')
    receiver: Optional[str] = None
    contact_number: Optional[str] = None
    prov: Optional[str] = None  # Tỉnh/Thành phố
    city: Optional[str] = None  # Thành phố (nếu có)
    area: Optional[str] = None  # Phường/Xã
    address: Optional[str] = None  # Địa chỉ chi tiết
    id_status: Optional[int] = None
    description: Optional[str] = None

class Invoice(BaseModel):
    """Thông tin hóa đơn chính"""
    code_invoice: Optional[str] = None
    time_create: datetime
    time_update: datetime
    time_start_hoan: Optional[datetime] = None 

    id_creator: int
    code_creator: str
    name_creator: str

    id_seller: int
    code_seller: str
    name_seller: str

    id_customer: int
    code_customer: str
    name_customer: str
    phone_number: str

    id_salechannel: int
    name_salechannel: str

    subtotal: Decimal  # Tổng tiền hàng
    gift_amount: Decimal = Decimal('0')  # Tiền quà tặng
    discount: Decimal = Decimal('0')  # Chiết khấu
    total_amount: Decimal  # Tổng tiền phải trả
    fee_delivery: Decimal = Decimal('0')  # Phí vận chuyển
    type_fee_delivery: Optional[str] = None  # Loại phí ship (CC_CASH/PP_CASH)
    shipping_method: Optional[str] = None  # Phương thức vận chuyển (self/provider)
    cod_need_payment: Decimal = Decimal('0')  # Số tiền COD cần thu

    description: Optional[str] = None
    send_zns: bool = False
    id_status: int = 1
    status_value: str = "Chờ xử lý"
    id_subchannel: Optional[int] = None
    subchannel: Optional[str] = None
    type_channel: Optional[str] = None
    fee_platform: Decimal = Decimal('0')
    is_doi_hang: bool = False


class CreateInvoicePayload(BaseModel):
    """Payload để tạo hóa đơn từ frontend"""
    invoice: Invoice
    invoice_details: List[InvoiceDetail]
    delivery_info: Optional[DeliveryInformation] = None

class UpdateInvoicePayload(BaseModel):
    """Payload để cập nhật hóa đơn"""
    status_value: Optional[str] = None  # Trạng thái
    description: Optional[str] = None  # Ghi chú
    receiver: Optional[str] = None  # Người nhận
    contact_number: Optional[str] = None  # SĐT người nhận
    address: Optional[str] = None  # Địa chỉ
    prov: Optional[str] = None  # Tỉnh/Thành phố
    area: Optional[str] = None  # Phường/Xã
    note_delivery: Optional[str] = None  # Ghi chú giao hàng
    fee_delivery: Optional[float] = None  # Chi phí giao hàng (chấp nhận số hoặc string)
    name_customer: Optional[str] = None  # Tên khách hàng
    id_seller: Optional[int] = None
    code_seller: Optional[str] = None
    name_seller: Optional[str] = None
    id_creator: Optional[int] = None
    code_creator: Optional[str] = None
    name_creator: Optional[str] = None
    id_salechannel: Optional[int] = None
    name_salechannel: Optional[str] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "status_value": "Đang xử lý",
                "receiver": "Nguyễn Văn A",
                "contact_number": "0912345678",
                "address": "123 Đường ABC, TP HCM",
                "prov": "TP Hồ Chí Minh",
                "area": "Quận 1",
                "fee_delivery": 50000,
                "note_delivery": "Giao vào buổi tối"
            }
        }
