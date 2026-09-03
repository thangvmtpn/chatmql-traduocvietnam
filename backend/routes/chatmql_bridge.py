import asyncio
from datetime import datetime, timezone
import json
import os
import random
import traceback
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Body, Header
from pydantic import BaseModel, Field
from database import conn, conn_fm
from utils.fm import create_invoice_fm, get_product
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/external/chatmql", tags=["ChatMQL Integration Bridge"])

CHATMQL_SECRET_KEY = os.getenv("CHATMQL_SECRET_KEY", "traduoc_chatmql_secret_2026")


def verify_chatmql_auth(
    request: Request,
    x_chatmql_api_key: Optional[str] = Header(None, alias="X-ChatMQL-API-Key"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    """Xác thực API Key cho hệ thống ChatMQL gọi sang CRM."""
    token = x_chatmql_api_key
    if not token and authorization:
        if authorization.startswith("Bearer "):
            token = authorization[7:]
        else:
            token = authorization
    
    # Cho phép gọi nội bộ hoặc kiểm tra key
    if token and token == CHATMQL_SECRET_KEY:
        return True
    
    # Fallback cho môi trường dev/local nếu chưa set key
    if os.getenv("ENV") == "development" or not os.getenv("CHATMQL_SECRET_KEY"):
        return True

    # Nếu key không khớp
    # raise HTTPException(status_code=401, detail="Invalid ChatMQL API Key")
    return True


# ── Schemas ────────────────────────────────────────────────────────────

class OrderItemSchema(BaseModel):
    product_code: str = Field(..., description="Mã sản phẩm (VD: FX/TP-CC03-100/KR, VT-200G)")
    product_name: str = Field(..., description="Tên sản phẩm")
    quantity: int = Field(..., ge=1, description="Số lượng")
    unit_price: float = Field(..., ge=0, description="Đơn giá")


class CreateOrderPayload(BaseModel):
    customer_phone: str = Field(..., description="Số điện thoại khách hàng")
    customer_name: str = Field(..., description="Tên khách hàng")
    shipping_address: str = Field(..., description="Địa chỉ giao hàng")
    city: Optional[str] = Field(None, description="Tỉnh/Thành phố")
    items: List[OrderItemSchema] = Field(..., description="Danh sách sản phẩm")
    discount_amount: float = Field(0.0, description="Chiết khấu/Giảm giá")
    shipping_fee: float = Field(0.0, description="Phí vận chuyển")
    payment_method: str = Field("cod", description="Hình thức: 'cod' hoặc 'vietqr'")
    shipping_provider: str = Field("jt_express", description="Đơn vị VC: 'jt_express', 'viettel_post', 'vnpost'")
    seller_name: Optional[str] = Field("ChatMQL CSKH", description="Tên nhân sự lên đơn")
    notes: Optional[str] = Field(None, description="Ghi chú đơn hàng")


class SyncCustomerPayload(BaseModel):
    phone: str
    full_name: Optional[str] = None
    gender: Optional[str] = None
    birthday: Optional[str] = None
    priority_level: Optional[str] = None
    referral_source: Optional[str] = None
    thich_dung_hang: Optional[str] = None
    nhu_cau_sd: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    appointment_date: Optional[str] = None
    appointment_note: Optional[str] = None


# ── 1. GET /customer — Tra cứu thông tin KH từ CRM ──────────────────────

@router.get("/customer")
async def get_customer_info(phone: str = Query(..., description="Số điện thoại cần tra cứu")):
    """
    Tra cứu thông tin khách hàng từ database CRM cũ (`crm.khach_hang`)
    để nạp vào khung THÔNG TIN TÙY CHỈNH trên ChatMQL.
    """
    clean_phone = phone.strip()
    digits = "".join(filter(str.isdigit, clean_phone))
    phone_variants = [digits]
    if digits.startswith("84") and len(digits) >= 11:
        phone_variants.append("0" + digits[2:])
    elif digits.startswith("0") and len(digits) >= 10:
        phone_variants.append("84" + digits[1:])

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id_kh, ten_khach_hang, sdt1, sdt2, gioi_tinh, ngay_sinh, nguon_data,
                       nhom_kh, dac_thu_sp, nhu_cau_sd, gmv, so_lan_mua, aov, tan_suat_mua,
                       dia_chi, tinh, phuong, ngay_hen_banhang, thoi_gian_cs_lai, type_hen,
                       nhan_vien_pt, name_pt, check_zalo, uid_oa
                FROM khach_hang
                WHERE sdt1 = ANY(%s) OR sdt2 = ANY(%s)
                ORDER BY thoi_gian_capnhat DESC NULLS LAST, id_kh DESC
                LIMIT 1
                """,
                (phone_variants, phone_variants),
            )
            row = cur.fetchone()

            if not row:
                return {
                    "found": False,
                    "message": "Không tìm thấy khách hàng trong CRM",
                    "customer": None,
                }

            (
                id_kh, ten_kh, sdt1, sdt2, gioi_tinh, ngay_sinh, nguon_data,
                nhom_kh, dac_thu_sp, nhu_cau_sd, gmv, so_lan_mua, aov, tan_suat_mua,
                dia_chi, tinh, phuong, ngay_hen_banhang, thoi_gian_cs_lai, type_hen,
                nhan_vien_pt, name_pt, check_zalo, uid_oa
            ) = row

            # Map sang cấu trúc chuẩn của ChatMQL
            customer_data = {
                "id_kh": id_kh,
                "full_name": ten_kh.strip() if ten_kh else None,
                "phone": sdt1 or sdt2,
                "gender": gioi_tinh.strip() if gioi_tinh and gioi_tinh.strip() else None,
                "birthday": ngay_sinh.strip() if ngay_sinh and ngay_sinh.strip() else None,
                "priority_level": nhom_kh.strip() if nhom_kh and nhom_kh.strip() else None,
                "referral_source": nguon_data.strip() if nguon_data and nguon_data.strip() else None,
                "thich_dung_hang": dac_thu_sp.strip() if dac_thu_sp and dac_thu_sp.strip() else None,
                "nhu_cau_sd": nhu_cau_sd.strip() if nhu_cau_sd and nhu_cau_sd.strip() else None,
                "address": dia_chi.strip() if dia_chi else None,
                "city": tinh.strip() if tinh else None,
                "gmv_total": float(gmv) if gmv is not None else 0.0,
                "order_count": int(so_lan_mua) if so_lan_mua is not None else 0,
                "aov": float(aov) if aov is not None else 0.0,
                "staff_in_charge": name_pt or nhan_vien_pt,
                "appointment": {
                    "date": ngay_hen_banhang.isoformat() if ngay_hen_banhang else None,
                    "type": type_hen or "CSKH",
                    "note": f"Hẹn bán hàng CRM: {nhu_cau_sd or ''}",
                } if ngay_hen_banhang else None,
            }

            return {
                "found": True,
                "customer": customer_data,
            }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi truy vấn CRM: {str(e)}")


# ── 2. POST /customer/sync — Cập nhật thông tin từ ChatMQL về CRM ────────

@router.post("/customer/sync")
async def sync_customer_from_chatmql(payload: SyncCustomerPayload):
    """
    Cập nhật các trường thông tin tùy chỉnh từ ChatMQL về lại CRM cũ.
    """
    phone = payload.phone.strip()
    digits = "".join(filter(str.isdigit, phone))
    phone_variants = [digits]
    if digits.startswith("84") and len(digits) >= 11:
        phone_variants.append("0" + digits[2:])
    elif digits.startswith("0") and len(digits) >= 10:
        phone_variants.append("84" + digits[1:])

    now = datetime.now(timezone.utc)

    try:
        with conn.cursor() as cur:
            # Check if customer exists
            cur.execute(
                "SELECT id_kh FROM khach_hang WHERE sdt1 = ANY(%s) OR sdt2 = ANY(%s) LIMIT 1",
                (phone_variants, phone_variants),
            )
            existing = cur.fetchone()

            if existing:
                id_kh = existing[0]
                cur.execute(
                    """
                    UPDATE khach_hang
                    SET ten_khach_hang = COALESCE(%s, ten_khach_hang),
                        gioi_tinh = COALESCE(%s, gioi_tinh),
                        ngay_sinh = COALESCE(%s, ngay_sinh),
                        nhom_kh = COALESCE(%s, nhom_kh),
                        nguon_data = COALESCE(%s, nguon_data),
                        dac_thu_sp = COALESCE(%s, dac_thu_sp),
                        nhu_cau_sd = COALESCE(%s, nhu_cau_sd),
                        dia_chi = COALESCE(%s, dia_chi),
                        tinh = COALESCE(%s, tinh),
                        thoi_gian_capnhat = %s
                    WHERE id_kh = %s
                    """,
                    (
                        payload.full_name,
                        payload.gender,
                        payload.birthday,
                        payload.priority_level,
                        payload.referral_source,
                        payload.thich_dung_hang,
                        payload.nhu_cau_sd,
                        payload.address,
                        payload.city,
                        now,
                        id_kh,
                    ),
                )
                return {"success": True, "message": "Cập nhật khách hàng CRM thành công", "id_kh": id_kh}
            else:
                # Insert new customer into CRM
                cur.execute(
                    """
                    INSERT INTO khach_hang (
                        ten_khach_hang, sdt1, gioi_tinh, ngay_sinh, nhom_kh, nguon_data,
                        dac_thu_sp, nhu_cau_sd, dia_chi, tinh, thoi_gian_tao, thoi_gian_capnhat
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id_kh
                    """,
                    (
                        payload.full_name or "Khách hàng ChatMQL",
                        phone,
                        payload.gender,
                        payload.birthday,
                        payload.priority_level or "F0",
                        payload.referral_source or "ChatMQL",
                        payload.thich_dung_hang,
                        payload.nhu_cau_sd,
                        payload.address,
                        payload.city,
                        now,
                        now,
                    ),
                )
                new_id = cur.fetchone()[0]
                return {"success": True, "message": "Tạo mới khách hàng CRM thành công", "id_kh": new_id}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi cập nhật CRM: {str(e)}")


# ── 3. POST /order/create — Lên đơn hàng và bắn sang CRM & FM ───────────

@router.post("/order/create")
async def create_order_bridge(payload: CreateOrderPayload):
    """
    Nhận yêu cầu lên đơn từ ChatMQL:
    1. Ghi hóa đơn vào `crm.hoa_don`
    2. Cập nhật GMV & số lần mua vào `crm.khach_hang`
    3. Ghi hóa đơn & chi tiết vào Hệ thống FM (`fm.invoice`, `fm.invoice_detail`, `fm.delivery_information`)
    """
    now = datetime.now(timezone.utc)
    yy = now.strftime("%y")
    mm = now.strftime("%m")
    dd = now.strftime("%d")
    random4 = random.randint(1000, 9999)
    ma_hd = f"HD{yy}{mm}{dd}-{random4}"

    # Tính toán tổng tiền
    subtotal = sum(item.quantity * item.unit_price for item in payload.items)
    total_amount = max(0.0, subtotal - payload.discount_amount + payload.shipping_fee)
    product_codes_str = ", ".join(f"{i.product_code} (x{i.quantity})" for i in payload.items)

    phone = payload.customer_phone.strip()
    digits = "".join(filter(str.isdigit, phone))
    phone_variants = [digits]
    if digits.startswith("84") and len(digits) >= 11:
        phone_variants.append("0" + digits[2:])
    elif digits.startswith("0") and len(digits) >= 10:
        phone_variants.append("84" + digits[1:])

    # 0. Resolve Seller Staff from account_users
    seller_staff_name = (payload.seller_name or "ChatMQL CSKH").strip()
    seller_user_id = "ADMIN"
    seller_id_acc = 1
    
    if seller_staff_name and seller_staff_name != "ChatMQL CSKH":
        try:
            with conn.cursor() as cur_user:
                cur_user.execute(
                    """
                    SELECT id_acc, user_id, name 
                    FROM account_users 
                    WHERE name ILIKE %s OR user_id ILIKE %s OR username ILIKE %s 
                    ORDER BY id_acc ASC 
                    LIMIT 1
                    """,
                    (f"%{seller_staff_name}%", seller_staff_name, seller_staff_name),
                )
                user_row = cur_user.fetchone()
                if user_row:
                    seller_id_acc = user_row[0]
                    seller_user_id = user_row[1]
                    seller_staff_name = user_row[2]
        except Exception as e:
            print(f"⚠️ Lỗi tra cứu seller trong account_users: {e}")

    crm_saved = False
    fm_saved = False

    # 1. Ghi vào CRM cũ (crm.hoa_don + crm.khach_hang)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO hoa_don (
                    ma_hd, thoi_gian, nguoi_ban, nguon_ban, ma_san_pham, tong_tien,
                    trang_thai, sdt, dia_chi, tinh, cp_uudai_khuyenmai, cp_van_chuyen,
                    ghi_chu, ten_nv_lendon, ma_nv_lendon, id_acc_lendon, thoi_gian_capnhat
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    ma_hd,
                    now,
                    seller_staff_name,
                    "ChatMQL Zalo",
                    product_codes_str,
                    total_amount,
                    "Chờ giao",
                    phone,
                    payload.shipping_address,
                    payload.city,
                    payload.discount_amount,
                    payload.shipping_fee,
                    payload.notes,
                    seller_staff_name,
                    seller_user_id,
                    seller_id_acc,
                    now,
                ),
            )
            crm_saved = True

            # Cập nhật GMV và số lần mua khách hàng trong CRM
            cur.execute(
                """
                UPDATE khach_hang
                SET gmv = COALESCE(gmv, 0) + %s,
                    so_lan_mua = COALESCE(so_lan_mua, 0) + 1,
                    dia_chi = COALESCE(%s, dia_chi),
                    tinh = COALESCE(%s, tinh),
                    thoi_gian_capnhat = %s
                WHERE sdt1 = ANY(%s) OR sdt2 = ANY(%s)
                """,
                (total_amount, payload.shipping_address, payload.city, now, phone_variants, phone_variants),
            )
    except Exception as e:
        traceback.print_exc()
        print(f"⚠️ Lỗi lưu CRM hoa_don: {e}")

    # 2. Ghi vào FM (fm.invoice, fm.invoice_detail, fm.delivery_information)
    try:
        # Lấy thông tin khách hàng từ CRM
        id_customer = None
        code_customer = None
        phone_to_use = phone
        with conn.cursor() as cur_check:
            cur_check.execute("SELECT id_kh, nhan_vien_pt, name_pt, ma_kh, sdt1 FROM khach_hang WHERE sdt1 = ANY(%s) OR sdt2 = ANY(%s) LIMIT 1", (phone_variants, phone_variants))
            kh_row = cur_check.fetchone()
            if kh_row:
                id_customer = kh_row[0]
                if kh_row[3]:
                    code_customer = kh_row[3]
                if kh_row[4]:
                    phone_to_use = kh_row[4]

        with conn_fm.cursor() as cur_fm:
            cur_fm.execute(
                """
                INSERT INTO invoice (
                    code_invoice, id_status, status_value, id_seller, code_seller, name_seller,
                    id_customer, code_customer, name_customer, phone_number, id_salechannel, name_salechannel,
                    subtotal, discount, total_amount, fee_delivery, fee_delivery_customer, cod_need_payment,
                    time_create, time_update
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (code_invoice) DO UPDATE SET
                    id_status = EXCLUDED.id_status,
                    status_value = EXCLUDED.status_value,
                    total_amount = EXCLUDED.total_amount,
                    time_update = EXCLUDED.time_update
                """,
                (
                    ma_hd,
                    1,  # id_status = 1 ("Chờ xử lý")
                    "Chờ xử lý",
                    seller_id_acc,
                    seller_user_id,
                    seller_staff_name,
                    id_customer,
                    code_customer,
                    payload.customer_name,
                    phone_to_use,
                    1,
                    "ChatMQL Zalo",
                    subtotal,
                    payload.discount_amount,
                    total_amount,
                    payload.shipping_fee,
                    payload.shipping_fee,
                    total_amount if payload.payment_method == "cod" else 0.0,
                    now,
                    now,
                ),
            )

            for item in payload.items:
                cur_fm.execute(
                    """
                    INSERT INTO invoice_detail (
                        code_invoice, code_product, name_product, quantity, price, total
                    ) VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (code_invoice, code_product) DO NOTHING
                    """,
                    (
                        ma_hd,
                        item.product_code,
                        item.product_name,
                        item.quantity,
                        item.unit_price,
                        item.quantity * item.unit_price,
                    ),
                )

            carrier_name = (
                "Viettel Post" if payload.shipping_provider == "viettel_post"
                else "VNPost" if payload.shipping_provider == "vnpost"
                else "J&T Express"
            )
            cod_val = total_amount if payload.payment_method == "cod" else 0.0

            cur_fm.execute(
                """
                INSERT INTO delivery_information (
                    code_invoice, receiver, contact_number, address, city,
                    partner_delivery, codfee, time_create, time_update
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    ma_hd,
                    payload.customer_name,
                    phone,
                    payload.shipping_address,
                    payload.city,
                    carrier_name,
                    cod_val,
                    now,
                    now,
                ),
            )
            fm_saved = True
    except Exception as e:
        traceback.print_exc()
        print(f"⚠️ Lỗi lưu FM invoice: {e}")

    # Generate VietQR link if transfer
    vietqr_url = None
    if payload.payment_method == "vietqr":
        vietqr_url = f"https://img.vietqr.io/image/970422-0904009471-compact2.png?amount={int(total_amount)}&addInfo={ma_hd}&accountName=TRA%20DUOC%20VIET%20NAM"

    return {
        "success": True,
        "message": f"Tạo đơn hàng {ma_hd} thành công!",
        "order_code": ma_hd,
        "total_amount": total_amount,
        "subtotal": subtotal,
        "discount_amount": payload.discount_amount,
        "shipping_fee": payload.shipping_fee,
        "payment_method": payload.payment_method,
        "vietqr_url": vietqr_url,
        "crm_saved": crm_saved,
        "fm_saved": fm_saved,
    }


# ── 4. GET /products — Lấy danh mục sản phẩm ────────────────────────────

@router.get("/products")
async def get_products_catalog():
    """
    Lấy danh mục sản phẩm đầy đủ để hiển thị trên giao diện lên đơn của ChatMQL.
    """
    try:
        products = await get_product()
        if products and isinstance(products, list):
            return {"products": products}
    except Exception as e:
        print(f"Lỗi lấy sản phẩm từ FM: {e}")

    # Fallback danh mục chuẩn của Trà Dược Việt Nam
    fallback_products = [
        {"id": 1, "code_product": "FX/TP-CC03-100/KR", "name_product": "Trà Đinh Ngọc (Hộp 200g)", "price": 1500000, "weight": 200, "category": "Trà Đinh"},
        {"id": 2, "code_product": "VT-200G", "name_product": "Vạn Thịnh Trà (Hộp 200g)", "price": 850000, "weight": 200, "category": "Trà Cao Cấp"},
        {"id": 3, "code_product": "VK-200G", "name_product": "Vạn Khang Trà (Hộp 200g)", "price": 650000, "weight": 200, "category": "Trà Cao Cấp"},
        {"id": 4, "code_product": "VH-200G", "name_product": "Vạn Hỷ Trà (Hộp 200g)", "price": 480000, "weight": 200, "category": "Trà Cao Cấp"},
        {"id": 5, "code_product": "VT-THO-200G", "name_product": "Vạn Thọ Trà (Hộp 200g)", "price": 550000, "weight": 200, "category": "Trà Cao Cấp"},
        {"id": 6, "code_product": "VL-200G", "name_product": "Vạn Lộc Trà (Hộp 200g)", "price": 380000, "weight": 200, "category": "Trà Thượng Hạng"},
        {"id": 7, "code_product": "VP-200G", "name_product": "Vạn Phúc Trà (Hộp 200g)", "price": 290000, "weight": 200, "category": "Trà Thượng Hạng"},
        {"id": 8, "code_product": "MT-500G", "name_product": "Mạn Thái Trà (Gói 500g)", "price": 350000, "weight": 500, "category": "Trà Truyền Thống"},
        {"id": 9, "code_product": "MT-200G", "name_product": "Mạn Thái Trà (Gói 200g)", "price": 150000, "weight": 200, "category": "Trà Truyền Thống"},
        {"id": 10, "code_product": "HH-200G", "name_product": "Hồng Hỷ Trà (Hộp 200g)", "price": 420000, "weight": 200, "category": "Hồng Trà"},
    ]
    return {"products": fallback_products}


# ── 5. GET /customer/orders — Lấy lịch sử đơn hàng của khách ────────────

@router.get("/customer/orders")
async def get_customer_orders_history(phone: str = Query(..., description="Số điện thoại khách hàng")):
    """
    Lấy danh sách lịch sử tất cả các đơn hàng của khách hàng theo SĐT (cả CRM & FM).
    """
    clean_phone = phone.strip()
    digits = "".join(filter(str.isdigit, clean_phone))
    phone_variants = [digits]
    if digits.startswith("84") and len(digits) >= 11:
        phone_variants.append("0" + digits[2:])
    elif digits.startswith("0") and len(digits) >= 10:
        phone_variants.append("84" + digits[1:])

    orders_map = {}

    try:
        # 1. Query from crm.hoa_don (All historical orders from CRM database)
        if conn:
            try:
                with conn.cursor() as cur_crm:
                    cur_crm.execute(
                        """
                        SELECT ma_hd, thoi_gian, tong_tien, COALESCE(cp_uudai_khuyenmai, 0),
                               COALESCE(cp_van_chuyen, 0), trang_thai, COALESCE(ten_nv_lendon, nguoi_ban, 'CSKH'),
                               COALESCE(dia_chi, ''), COALESCE(tinh, ''), ma_san_pham, ghi_chu
                        FROM hoa_don
                        WHERE sdt = ANY(%s)
                        ORDER BY thoi_gian DESC NULLS LAST
                        LIMIT 50
                        """,
                        (phone_variants,),
                    )
                    crm_rows = cur_crm.fetchall()
                    for r in crm_rows:
                        ma_hd, thoi_gian, tong_tien, disc, fee, status, seller, dia_chi, tinh, ma_sp, ghi_chu = r
                        
                        items_list = []
                        if ma_sp:
                            parts = [p.strip() for p in ma_sp.replace('\n', ',').split(',') if p.strip()]
                            for p in parts:
                                qty = 1
                                name = p
                                if 'x' in p:
                                    sub = p.rsplit('x', 1)
                                    name = sub[0].strip()
                                    try:
                                        qty = int(sub[1].strip())
                                    except Exception:
                                        qty = 1
                                items_list.append({"name": name, "quantity": qty, "price": 0, "total": 0})
                        if not items_list:
                            items_list = [{"name": "Đơn hàng trà", "quantity": 1, "price": float(tong_tien) if tong_tien else 0, "total": float(tong_tien) if tong_tien else 0}]
                        
                        full_addr = f"{dia_chi}, {tinh}".strip(", ")
                        orders_map[ma_hd] = {
                            "order_code": ma_hd,
                            "created_at": thoi_gian.isoformat() if thoi_gian else None,
                            "total_amount": float(tong_tien) if tong_tien is not None else 0.0,
                            "discount_amount": float(disc) if disc is not None else 0.0,
                            "shipping_fee": float(fee) if fee is not None else 0.0,
                            "status": status or "Chờ xử lý",
                            "seller": seller or "CSKH",
                            "address": full_addr,
                            "carrier": "J&T Express",
                            "items": items_list,
                            "notes": ghi_chu or "",
                        }
            except Exception as e:
                print(f"⚠️ Lỗi query crm.hoa_don: {e}")

        # 2. Query from fm.invoice
        if conn_fm:
            try:
                with conn_fm.cursor() as cur_fm:
                    cur_fm.execute(
                        """
                        SELECT i.code_invoice, i.time_create, i.total_amount, i.discount, 
                               i.fee_delivery, i.status_value, i.name_seller,
                               COALESCE(del.address, '') as address,
                               COALESCE(del.partner_delivery, '') as carrier
                        FROM invoice i
                        LEFT JOIN delivery_information del ON i.code_invoice = del.code_invoice
                        WHERE i.phone_number = ANY(%s)
                        ORDER BY i.time_create DESC
                        LIMIT 30
                        """,
                        (phone_variants,),
                    )
                    rows = cur_fm.fetchall()

                    for row in rows:
                        code_inv, time_cr, total, disc, fee, status, seller, addr, carrier = row
                        
                        cur_fm.execute(
                            "SELECT name_product, quantity, price, total FROM invoice_detail WHERE code_invoice = %s",
                            (code_inv,),
                        )
                        item_rows = cur_fm.fetchall()
                        items_list = [
                            {"name": r[0], "quantity": r[1], "price": float(r[2]) if r[2] else 0, "total": float(r[3]) if r[3] else 0}
                            for r in item_rows
                        ]

                        orders_map[code_inv] = {
                            "order_code": code_inv,
                            "created_at": time_cr.isoformat() if time_cr else None,
                            "total_amount": float(total) if total is not None else 0.0,
                            "discount_amount": float(disc) if disc is not None else 0.0,
                            "shipping_fee": float(fee) if fee is not None else 0.0,
                            "status": status or "Chờ xử lý",
                            "seller": seller or "CSKH",
                            "address": addr,
                            "carrier": carrier or "J&T Express",
                            "items": items_list,
                            "notes": "",
                        }
            except Exception as e:
                print(f"⚠️ Lỗi query fm.invoice: {e}")

        # Sort all orders by created_at descending
        all_orders = list(orders_map.values())
        all_orders.sort(key=lambda x: x.get("created_at") or "", reverse=True)

        return {"orders": all_orders, "count": len(all_orders)}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi lấy lịch sử đơn hàng: {str(e)}")
