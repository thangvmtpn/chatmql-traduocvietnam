import asyncio
import os
import sys
import threading
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Body
from fastapi.responses import Response
from utils.shopee import create_shipping_document, download_shipping_document, auto_arrange_shipment
from utils.tiktok import download_tiktok_shipping_document, auto_arrange_tiktok_shipment
from doanh_so.run_doanhso import bien_dong_doanhso_v3
from utils.security import check_token
from utils.lark import send_lark_message
from database import conn_fm
from datetime import datetime, date, timedelta
from pydantic import BaseModel
from typing import List
import traceback
import random
import string
from schema.invoice_schema import Invoice, InvoiceDetail, DeliveryInformation, CreateInvoicePayload, UpdateInvoicePayload
import pytz
import requests
import re
import json
import httpx

router = APIRouter()


# ==================== HELPERS ====================

async def get_active_deal_shock_today():
    """
    Lấy thông tin deal shock đang active cho ngày hôm nay (kiểm tra cả start_time và end_time)
    """
    try:
        vietnam_tz = pytz.timezone('Asia/Ho_Chi_Minh')
        now_vn = datetime.now(vietnam_tz)
        today = now_vn.date()
        current_time = now_vn.time()
        
        with conn_fm.cursor() as cur:
            cur.execute(
                """
                SELECT id, type, title, config_data, created_by, created_by_name, start_time, end_time
                FROM gami_individual_posts
                WHERE type = 'DEAL_SHOCK'
                  AND apply_date = %s
                  AND start_date <= %s
                  AND end_date >= %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (today, today, today)
            )
            result = cur.fetchone()
            
            if result:
                start_time = result[6]  # start_time
                end_time = result[7]    # end_time
                
                # Kiểm tra thời gian: nếu có start_time và end_time, phải nằm trong khoảng cho phép
                if start_time or end_time:
                    # Convert time objects to comparable format
                    start_time_obj = start_time if isinstance(start_time, datetime.time) else None
                    end_time_obj = end_time if isinstance(end_time, datetime.time) else None
                    
                    # Nếu cả start_time và end_time đều có, kiểm tra current_time có nằm trong khoảng không
                    if start_time_obj and end_time_obj:
                        if not (start_time_obj <= current_time <= end_time_obj):
                            print(f"ℹ️ Deal shock không trong khoảng thời gian cho phép (from {start_time_obj} to {end_time_obj})")
                            return None
                    # Nếu chỉ có start_time
                    elif start_time_obj:
                        if current_time < start_time_obj:
                            print(f"ℹ️ Deal shock chưa bắt đầu (từ {start_time_obj})")
                            return None
                    # Nếu chỉ có end_time
                    elif end_time_obj:
                        if current_time > end_time_obj:
                            print(f"ℹ️ Deal shock đã kết thúc (đến {end_time_obj})")
                            return None
                
                deal_shock = {
                    'id': result[0],
                    'type': result[1],
                    'title': result[2],
                    'config_data': json.loads(result[3]) if isinstance(result[3], str) else result[3],
                    'created_by': result[4],
                    'created_by_name': result[5],
                    'start_time': start_time,
                    'end_time': end_time
                }
                print(f"✅ Tìm thấy deal shock hôm nay: {deal_shock['title']}")
                return deal_shock
            else:
                print(f"ℹ️ Không có deal shock cho ngày {today}")
                return None
                
    except Exception as e:
        print(f"⚠️ Lỗi khi lấy thông tin deal shock: {str(e)}")
        traceback.print_exc()
        return None


async def check_product_deal_shock(product_code: str, quantity: int, deal_shock_config):
    """
    Kiểm tra sản phẩm có phải là deal shock và đủ điều kiện không
    Trả về: (is_deal_shock: bool, deal_info: dict hoặc None)
    """
    if not deal_shock_config:
        return False, None
    
    try:
        products = deal_shock_config.get('products', [])
        
        for product in products:
            if product['code'] == product_code:
                # Kiểm tra số lượng tối thiểu
                if quantity < product.get('min_order_quantity', 1):
                    print(f"⚠️ Sản phẩm {product_code} không đủ số lượng tối thiểu: {quantity} < {product.get('min_order_quantity', 1)}")
                    return False, None
                
                # Kiểm tra deal_limit
                if product.get('deal_limit', 0) <= 0:
                    print(f"⚠️ Sản phẩm {product_code} đã hết deal_limit")
                    return False, None
                
                print(f"✅ Sản phẩm {product_code} là deal shock hợp lệ")
                return True, product
        
        return False, None
        
    except Exception as e:
        print(f"⚠️ Lỗi khi kiểm tra deal shock: {str(e)}")
        traceback.print_exc()
        return False, None


async def insert_deal_soc(invoice_item_id: int, quantity: int, deal_shock_id: int, product_code: str, reward_amount: float) -> bool:
    """
    Lưu thông tin deal shock vào bảng deal_soc
    """
    try:
        with conn_fm.cursor() as cur:
            sql = """
                INSERT INTO deal_soc (
                    invoice_item_id, quantity, deal_shock_config_id, 
                    product_code, reward_amount, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            """
            now = datetime.now()
            cur.execute(sql, (
                invoice_item_id, 
                quantity, 
                deal_shock_id, 
                product_code,
                reward_amount,
                now,
                now
            ))
            conn_fm.commit()
            print(f"✅ Lưu deal shock thành công: product={product_code}, quantity={quantity}")
            return True
            
    except Exception as e:
        conn_fm.rollback()
        print(f"❌ Lỗi khi lưu deal shock: {str(e)}")
        traceback.print_exc()
        return False


async def update_deal_limit(deal_shock_id: int, product_code: str, quantity_sold: int) -> bool:
    """
    Update deal_limit trong config_data của gami_individual_posts
    Giảm deal_limit đi số lượng đã bán
    """
    try:
        with conn_fm.cursor() as cur:
            # Lấy config_data hiện tại
            cur.execute(
                "SELECT config_data FROM gami_individual_posts WHERE id = %s",
                (deal_shock_id,)
            )
            result = cur.fetchone()
            
            if not result:
                print(f"⚠️ Không tìm thấy deal shock với id={deal_shock_id}")
                return False
            
            config_data = json.loads(result[0]) if isinstance(result[0], str) else result[0]
            products = config_data.get('products', [])
            
            # Tìm và update deal_limit cho sản phẩm
            updated = False
            for product in products:
                if product['code'] == product_code:
                    old_limit = product.get('deal_limit', 0)
                    new_limit = max(0, old_limit - quantity_sold)
                    product['deal_limit'] = new_limit
                    updated = True
                    print(f"📊 Update deal_limit cho {product_code}: {old_limit} -> {new_limit}")
                    break
            
            if not updated:
                print(f"⚠️ Không tìm thấy sản phẩm {product_code} trong config_data")
                return False
            
            # Update lại config_data
            config_data['products'] = products
            cur.execute(
                """
                UPDATE gami_individual_posts 
                SET config_data = %s, updated_at = %s 
                WHERE id = %s
                """,
                (json.dumps(config_data), datetime.now(), deal_shock_id)
            )
            conn_fm.commit()
            print(f"✅ Update deal_limit thành công")
            return True
            
    except Exception as e:
        conn_fm.rollback()
        print(f"❌ Lỗi khi update deal_limit: {str(e)}")
        traceback.print_exc()
        return False


async def process_deal_shock_for_invoice(invoice_details: List[InvoiceDetail], code_invoice: str):
    """
    Xử lý deal shock cho tất cả sản phẩm trong đơn hàng
    Kiểm tra start_time và end_time để đảm bảo deal shock còn hiệu lực
    """
    try:
        # Lấy thông tin deal shock hôm nay (đã kiểm tra start_time và end_time)
        deal_shock = await get_active_deal_shock_today()
        
        if not deal_shock:
            print("ℹ️ Không có deal shock hôm nay hoặc deal shock không trong khoảng thời gian cho phép, bỏ qua xử lý")
            return
        
        deal_shock_config = deal_shock.get('config_data')
        deal_shock_id = deal_shock.get('id')
        
        # Lấy thông tin invoice để gửi thông báo Lark
        with conn_fm.cursor() as cur:
            cur.execute(
                """
                SELECT name_seller, name_salechannel
                FROM invoice
                WHERE code_invoice = %s
                """,
                (code_invoice,)
            )
            invoice_info = cur.fetchone()
            seller_name = invoice_info[0] if invoice_info else "N/A"
            sale_channel = invoice_info[1] if invoice_info else "N/A"
        
        # Lấy danh sách invoice_detail_id đã insert
        with conn_fm.cursor() as cur:
            cur.execute(
                """
                SELECT id_invoice_detail, code_product, name_product, quantity 
                FROM invoice_detail 
                WHERE code_invoice = %s
                """,
                (code_invoice,)
            )
            invoice_items = cur.fetchall()
        
        # Xử lý từng sản phẩm
        for item in invoice_items:
            invoice_item_id = item[0]
            product_code = item[1]
            product_name = item[2]
            quantity = item[3]
            
            # Kiểm tra xem có phải deal shock không
            is_deal_shock, deal_info = await check_product_deal_shock(
                product_code, 
                quantity, 
                deal_shock_config
            )
            
            if is_deal_shock and deal_info:
                # Tính số lượng deal shock có thể áp dụng (không vượt quá deal_limit)
                max_deal_quantity = min(quantity, deal_info.get('deal_limit', 0))
                
                if max_deal_quantity > 0:
                    # Tính reward amount
                    reward_amount = deal_info.get('reward_per_deal', 0) * max_deal_quantity
                    
                    # Lưu vào bảng deal_soc
                    save_success = await insert_deal_soc(
                        invoice_item_id,
                        max_deal_quantity,
                        deal_shock_id,
                        product_code,
                        reward_amount
                    )
                    
                    # Update deal_limit
                    if save_success:
                        await update_deal_limit(
                            deal_shock_id,
                            product_code,
                            max_deal_quantity
                        )
                        
                        # Gửi thông báo lên Lark
                        try:
                            deal_shock_data = {
                                'code_invoice': code_invoice,
                                'seller_name': seller_name,
                                'product_name': product_name,
                                'quantity': max_deal_quantity,
                                'sale_channel': sale_channel,
                                'reward_amount': reward_amount
                            }
                            await send_deal_shock_notification_to_lark(deal_shock_data)
                        except Exception as lark_error:
                            print(f"⚠️ Lỗi gửi thông báo Lark cho deal shock: {str(lark_error)}")
                            traceback.print_exc()
        
        print(f"✅ Hoàn thành xử lý deal shock cho đơn hàng {code_invoice}")
        
    except Exception as e:
        print(f"⚠️ Lỗi khi xử lý deal shock: {str(e)}")
        traceback.print_exc()


async def send_deal_shock_notification_to_lark(deal_shock_data: dict):
    """
    Gửi thông báo deal shock lên Lark webhook
    """
    print("📤 Gửi thông báo deal shock lên Lark:", deal_shock_data)
    webhook_url = "https://open.larksuite.com/open-apis/bot/v2/hook/dd0c7fb8-0d15-4c82-b3eb-19ae6a78f19e"
    
    try:
        vietnam_tz = pytz.timezone('Asia/Ho_Chi_Minh')
        current_time = datetime.now(vietnam_tz)
        
        # Format message theo Lark card format
        message = {
            "msg_type": "interactive",
            "card": {
                "header": {
                    "title": {
                        "tag": "plain_text",
                        "content": "🎉 DEAL SHOCK - ĐƠN HÀNG MỚI"
                    },
                    "template": "red"
                },
                "elements": [
                    {
                        "tag": "div",
                        "fields": [
                            {
                                "is_short": True,
                                "text": {
                                    "tag": "lark_md",
                                    "content": f"**📋 Mã hóa đơn:**\n{deal_shock_data['code_invoice']}"
                                }
                            },
                            {
                                "is_short": True,
                                "text": {
                                    "tag": "lark_md",
                                    "content": f"**🕐 Thời gian:**\n{current_time.strftime('%H:%M %d/%m/%Y')}"
                                }
                            }
                        ]
                    },
                    {
                        "tag": "div",
                        "fields": [
                            {
                                "is_short": True,
                                "text": {
                                    "tag": "lark_md",
                                    "content": f"**👤 Nhân viên:**\n{deal_shock_data['seller_name']}"
                                }
                            },
                            {
                                "is_short": True,
                                "text": {
                                    "tag": "lark_md",
                                    "content": f"**📱 Kênh bán:**\n{deal_shock_data['sale_channel']}"
                                }
                            }
                        ]
                    },
                    {
                        "tag": "div",
                        "fields": [
                            {
                                "is_short": True,
                                "text": {
                                    "tag": "lark_md",
                                    "content": f"**📦 Sản phẩm:**\n{deal_shock_data['product_name']}"
                                }
                            },
                            {
                                "is_short": True,
                                "text": {
                                    "tag": "lark_md",
                                    "content": f"**🔢 Số lượng:**\n{deal_shock_data['quantity']}"
                                }
                            }
                        ]
                    },
                    {
                        "tag": "div",
                        "fields": [
                            {
                                "is_short": False,
                                "text": {
                                    "tag": "lark_md",
                                    "content": f"**💰 Tiền thưởng:**\n{deal_shock_data['reward_amount']:,.0f} VNĐ"
                                }
                            }
                        ]
                    },
                    {
                        "tag": "hr"
                    },
                    {
                        "tag": "note",
                        "elements": [
                            {
                                "tag": "plain_text",
                                "content": "Hệ thống CRM - Trà Dược Việt Nam"
                            }
                        ]
                    }
                ]
            }
        }
        
        response = requests.post(webhook_url, json=message, timeout=10)
        response.raise_for_status()
        print(f"✅ Gửi thông báo deal shock lên Lark thành công")
        return True
        
    except Exception as e:
        print(f"⚠️ Lỗi gửi thông báo deal shock lên Lark: {str(e)}")
        traceback.print_exc()
        return False


async def put_lichsu_dt(data):
    """
    Gửi thông tin deal sốc sang HRM
    """
    print("📤 Gửi thông tin deal sốc sang HRM:", data)
    url = "https://hrm.traduocvietnam.com/api/deal_soc"
    
    try:
        response = requests.post(url, json=data, timeout=10)
        data_get = response.json()
        print(f"✅ Gửi deal sốc thành công: {data_get}")
        return data_get
    except Exception as e:
        print(f"⚠️ Lỗi gửi deal sốc sang HRM: {str(e)}")
        traceback.print_exc()
        return None


# ==================== TẠO HÓA ĐƠN ====================

async def get_account_id_by_code(code_creator: str) -> Optional[int]:
    """Lấy id_acc từ bảng account_users thông qua code_creator"""
    try:
        with conn_fm.cursor() as cur:
            cur.execute(
                "SELECT id_acc FROM account_users WHERE code_user = %s LIMIT 1",
                (code_creator,)
            )
            result = cur.fetchone()
            if result:
                print(f"✅ Tìm thấy id_acc cho code_creator '{code_creator}': {result[0]}")
                return result[0]
            else:
                print(f"⚠️ Không tìm thấy id_acc cho code_creator '{code_creator}'")
                return None
    except Exception as e:
        traceback.print_exc()
        print(f"❌ Lỗi query id_acc: {str(e)}")
        return None


async def generate_invoice_code() -> str:
    """Tạo mã hóa đơn unique: HD_ + 6 số + 2 chữ cái (vị trí ngẫu nhiên)"""
    max_attempts = 1000
    for _ in range(max_attempts):
        digits = [random.choice(string.digits) for _ in range(6)]
        letters = [random.choice(string.ascii_uppercase) for _ in range(2)]
        parts = digits + letters
        random.shuffle(parts)
        code_invoice = "HD_" + "".join(parts)

        # Kiểm tra trùng
        with conn_fm.cursor() as cur:
            cur.execute("SELECT code_invoice FROM invoice WHERE code_invoice = %s", (code_invoice,))
            if not cur.fetchone():
                print(f"✅ Tạo mã hóa đơn: {code_invoice}")
                return code_invoice
    
    raise Exception("Không thể tạo mã hóa đơn sau nhiều lần thử")


async def insert_invoice(invoice: Invoice, code_invoice: str) -> bool:
    """Insert hóa đơn vào bảng invoice"""
    try:
        with conn_fm.cursor() as cur:
            sql = """
                INSERT INTO invoice (
                    code_invoice, time_create, time_update, time_start_hoan, 
                    id_creator, code_creator, name_creator, 
                    id_seller, code_seller, name_seller, 
                    id_customer, code_customer, name_customer, phone_number,
                    id_salechannel, name_salechannel, 
                    subtotal, gift_amount, discount, total_amount, 
                    fee_delivery, type_fee_delivery, shipping_method, cod_need_payment,
                    description, send_zns, id_status, status_value, fee_platform,
                    is_doi_hang
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
            """
            values = (
                code_invoice,
                invoice.time_create,
                invoice.time_update,
                invoice.time_start_hoan,
                invoice.id_creator,
                invoice.code_creator,
                invoice.name_creator,
                invoice.id_seller,
                invoice.code_seller,
                invoice.name_seller,
                invoice.id_customer,
                invoice.code_customer,
                invoice.name_customer,
                invoice.phone_number,
                invoice.id_salechannel,
                invoice.name_salechannel,
                float(invoice.subtotal),
                float(invoice.gift_amount),
                float(invoice.discount),
                float(invoice.total_amount),
                float(invoice.fee_delivery),
                invoice.type_fee_delivery,
                invoice.shipping_method,
                float(invoice.cod_need_payment),
                invoice.description,
                invoice.send_zns,
                1,  # id_status mặc định = 1
                'Chờ xử lý',  # status_value mặc định
                float(invoice.fee_platform),
                invoice.is_doi_hang,
            )
            cur.execute(sql, values)
            conn_fm.commit()
            print(f"✅ Insert invoice thành công: {code_invoice}")
            return True
    except Exception as e:
        conn_fm.rollback()
        traceback.print_exc()
        print(f"❌ Lỗi insert invoice: {str(e)}")
        return False



async def insert_invoice_details(invoice_details: List[InvoiceDetail], code_invoice: str) -> bool:
    """Insert chi tiết sản phẩm vào bảng invoice_detail"""
    try:
        with conn_fm.cursor() as cur:
            sql = """
                INSERT INTO invoice_detail (
                    code_invoice, id_product, code_product, name_product, 
                    sub_code_product, sub_name_code_product, quantity, 
                    sub_price, discount_price, price, total, type_product
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            for detail in invoice_details:
                values = (
                    code_invoice,
                    detail.id_product,
                    detail.code_product,
                    detail.name_product,
                    detail.sub_code_product,
                    detail.sub_name_code_product,
                    detail.quantity,
                    float(detail.sub_price),
                    float(detail.discount_price),
                    float(detail.price),
                    float(detail.total),
                    detail.type_product
                )
                cur.execute(sql, values)
            conn_fm.commit()
            print(f"✅ Insert {len(invoice_details)} chi tiết sản phẩm thành công")
            return True
    except Exception as e:
        conn_fm.rollback()
        traceback.print_exc()
        print(f"❌ Lỗi insert invoice_details: {str(e)}")
        return False


async def insert_delivery_info(delivery_info: DeliveryInformation, code_invoice: str) -> bool:
    """Insert thông tin giao hàng vào bảng delivery_information"""
    try:
        with conn_fm.cursor() as cur:
            sql = """
                INSERT INTO delivery_information (
                    time_create, time_update, code_delivery, 
                    id_partner_delivery, partner_delivery, code_invoice,
                    height, width, length, weight, 
                    codfee, fee_delivery, receiver, contact_number,
                    prov, city, area, address, id_status, description
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            values = (
                delivery_info.time_create or datetime.now(),
                delivery_info.time_update or datetime.now(),
                delivery_info.code_delivery,
                delivery_info.id_partner_delivery,
                delivery_info.partner_delivery,
                code_invoice,
                delivery_info.height,
                delivery_info.width,
                delivery_info.length,
                delivery_info.weight,
                float(delivery_info.codfee),
                float(delivery_info.fee_delivery),
                delivery_info.receiver,
                delivery_info.contact_number,
                delivery_info.prov,
                delivery_info.city,
                delivery_info.area,
                delivery_info.address,
                delivery_info.id_status or 1,
                delivery_info.description
            )
            cur.execute(sql, values)
            conn_fm.commit()
            print(f"✅ Insert delivery_information thành công")
            return True
    except Exception as e:
        conn_fm.rollback()
        traceback.print_exc()
        print(f"❌ Lỗi insert delivery_information: {str(e)}")
        return False


async def get_invoice_number_today(code_invoice: str) -> int:
    """
    Lấy số thứ tự đơn hàng trong ngày hôm nay từ bảng invoice
    Ví dụ: nếu hôm nay đã có 5 đơn HD_ thì đơn mới sẽ là số 6
    Chỉ count những hóa đơn có code_invoice bắt đầu đúng là HD_
    """
    try:
        with conn_fm.cursor() as cur:
            # Giờ Việt Nam
            vietnam_tz = pytz.timezone("Asia/Ho_Chi_Minh")
            now_vn = datetime.now(vietnam_tz)

            # Khoảng thời gian đầu ngày → cuối ngày (VN)
            start_day = now_vn.replace(hour=0, minute=0, second=0, microsecond=0)
            end_day = start_day + timedelta(days=1)

            cur.execute(
                """
                SELECT COUNT(*)
                FROM invoice
                WHERE time_create >= %s
                  AND time_create < %s
                  AND code_invoice ~ '^HD_'
                """,
                (start_day, end_day)
            )

            result = cur.fetchone()
            order_number = result[0] if result else 0

            print(f"📊 Số đơn HD_ hôm nay: {order_number}")
            return order_number

    except Exception as e:
        traceback.print_exc()
        print(f"❌ Lỗi query số đơn hàng: {str(e)}")
        conn_fm.rollback()
        return 0


async def format_product_list(invoice_details: List[InvoiceDetail]) -> tuple:
    """Format danh sách sản phẩm và quà tặng cho Lark message
    Trả về: (sản phẩm bình thường, quà tặng)
    """
    products = []
    gifts = []
    
    for detail in invoice_details:
        product_text = f"• {detail.name_product} x{detail.quantity}"
        
        if detail.type_product == "gift":
            gifts.append(product_text)
        else:
            products.append(product_text)
    
    products_str = "\n".join(products) if products else ""
    gifts_str = "\n".join(gifts) if gifts else ""
    
    return products_str, gifts_str


@router.get("/invoices/search")
async def search_invoices(
    code_invoice: Optional[str] = Query(None, description="Tìm kiếm theo mã hoá đơn"),
    page: int = Query(1, ge=1, description="Số trang"),
    limit: int = Query(20, ge=1, le=100, description="Số lượng mỗi trang"),
    token: dict = Depends(check_token)
):
    """
    Tìm kiếm hoá đơn theo mã:
    - Role 1, 2: Tìm tất cả hoá đơn
    - Role 4 (member): Chỉ tìm hoá đơn của chính nhân viên đó
    """
    try:
        role_id = token.get("role_id")
        code_seller = token.get("code_seller") or token.get("user_id")

        if not code_seller:
            raise HTTPException(status_code=401, detail="Không tìm thấy thông tin nhân viên")

        offset = (page - 1) * limit

        # Build WHERE clause dựa theo role
        where_conditions = []
        params = []

        # Role 4 chỉ xem được đơn của mình
        if role_id not in (1, 2):
            where_conditions.append("code_seller = %s")
            params.append(code_seller)

        if code_invoice:
            search_term = code_invoice.strip()
            phone_search_term = search_term[1:] if search_term.startswith('0') and search_term.isdigit() else search_term
            where_conditions.append("(code_invoice ILIKE %s OR phone_number LIKE %s)")
            params.extend([f"%{search_term}%", f"%{phone_search_term}%"])

        where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"

        with conn_fm.cursor() as cur:
            count_query = f"SELECT COUNT(*) FROM invoice WHERE {where_clause}"
            cur.execute(count_query, params)
            total = cur.fetchone()[0]

            query = f"""
                SELECT 
                    id_invoice, code_invoice, time_create, time_update,
                    time_start_hoan, id_creator, code_creator, name_creator,
                    id_seller, code_seller, name_seller, id_customer,
                    code_customer, phone_number, id_salechannel, name_salechannel,
                    subtotal, gift_amount, discount, total_amount,
                    fee_delivery, type_fee_delivery, cod_need_payment, description,
                    send_zns, id_status, status_value, name_customer,
                    id_subchannel, subchannel, type_channel, fee_platform
                FROM invoice
                WHERE {where_clause}
                ORDER BY time_create DESC
                LIMIT %s OFFSET %s
            """
            cur.execute(query, params + [limit, offset])
            rows = cur.fetchall()

            columns = [
                "id_invoice", "code_invoice", "time_create", "time_update",
                "time_start_hoan", "id_creator", "code_creator", "name_creator",
                "id_seller", "code_seller", "name_seller", "id_customer",
                "code_customer", "phone_number", "id_salechannel", "name_salechannel",
                "subtotal", "gift_amount", "discount", "total_amount",
                "fee_delivery", "type_fee_delivery", "cod_need_payment", "description",
                "send_zns", "id_status", "status_value", "name_customer",
                "id_subchannel", "subchannel", "type_channel", "fee_platform"
            ]

            invoices = []
            for row in rows:
                invoice_dict = {}
                for idx, col in enumerate(columns):
                    value = row[idx]
                    if isinstance(value, datetime):
                        invoice_dict[col] = value.isoformat()
                    elif isinstance(value, date):
                        invoice_dict[col] = value.isoformat()
                    else:
                        invoice_dict[col] = value
                invoices.append(invoice_dict)

            return {
                "success": True,
                "data": invoices,
                "pagination": {
                    "total": total,
                    "page": page,
                    "limit": limit,
                    "total_pages": (total + limit - 1) // limit
                }
            }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.post("/invoice/create")
async def create_invoice_endpoint(
    payload: CreateInvoicePayload,
    token: dict = Depends(check_token)
):
    """
    API tạo hóa đơn mới vào database fm_tdvn
    """
    try:
        print("📝 Nhận yêu cầu tạo hóa đơn từ CRM")
        # print("\n========== PAYLOAD TỪ FRONTEND ==========")
        # print(f"Invoice: {payload.invoice.model_dump()}")
        # print(f"\nInvoice Details: {[detail.model_dump() for detail in payload.invoice_details]}")
        # print(f"\nDelivery Info: {payload.delivery_info.model_dump() if payload.delivery_info else None}")
        # print("==========================================\n")
        
        # 1. Lấy id_acc từ code_creator, nếu không có thì dùng id_creator từ payload
        id_creator = payload.invoice.id_creator
        id_seller = payload.invoice.id_seller
        
        if payload.invoice.code_creator:
            account_id = await get_account_id_by_code(payload.invoice.code_creator)
            if account_id:
                id_creator = account_id
                id_seller = account_id
                print(f"📌 Sử dụng id_acc từ account_users: {account_id}")
            else:
                print(f"⚠️ Không tìm thấy id_acc, sử dụng id từ payload: {id_creator}")
        
        # Cập nhật invoice object với id_creator và id_seller đã lấy được
        payload.invoice.id_creator = id_creator
        payload.invoice.id_seller = id_seller
        
        # 2. Tạo mã hóa đơn
        code_invoice = await generate_invoice_code()
        
        # 3. Insert hóa đơn
        invoice_created = await insert_invoice(payload.invoice, code_invoice)
        if not invoice_created:
            raise HTTPException(status_code=500, detail="Tạo hóa đơn thất bại")
        
        # 4. Insert chi tiết sản phẩm
        details_created = await insert_invoice_details(payload.invoice_details, code_invoice)
        if not details_created:
            raise HTTPException(status_code=500, detail="Tạo chi tiết hóa đơn thất bại")
        
        # 5. Insert thông tin giao hàng (nếu có)
        if payload.delivery_info:
            delivery_created = await insert_delivery_info(payload.delivery_info, code_invoice)
            if not delivery_created:
                raise HTTPException(status_code=500, detail="Tạo thông tin giao hàng thất bại")
        
        # 5.5. Xử lý deal shock (nếu có)
        try:
            await process_deal_shock_for_invoice(payload.invoice_details, code_invoice)
        except Exception as deal_error:
            # Log lỗi nhưng không block việc tạo đơn hàng
            print(f"⚠️ Lỗi xử lý deal shock: {str(deal_error)}")
            traceback.print_exc()
        
        # 6. Gửi thông báo Lark
        try:
            # Format sản phẩm và quà tặng
            sanpham, qua_tang = await format_product_list(payload.invoice_details)
            ghi_chu = payload.invoice.description if payload.invoice.description else ""
            
            # Chuẩn bị dữ liệu gửi Lark
            # Chuyển đổi time_create sang múi giờ Việt Nam (UTC+7)
            time_create = datetime.fromisoformat(payload.invoice.time_create) if isinstance(payload.invoice.time_create, str) else payload.invoice.time_create
            
            # Nếu time_create có timezone, chuyển sang Vietnam time
            if time_create.tzinfo is not None:
                vietnam_tz = pytz.timezone('Asia/Ho_Chi_Minh')
                time_create = time_create.astimezone(vietnam_tz)
            else:
                # Nếu không có timezone, giả sử là UTC và chuyển sang Vietnam time
                vietnam_tz = pytz.timezone('Asia/Ho_Chi_Minh')
                time_create = time_create.replace(tzinfo=pytz.UTC).astimezone(vietnam_tz)
            
            # Lấy số thứ tự đơn hàng trong ngày
            order_number = await get_invoice_number_today(code_invoice)
            
            # Xây dựng mục sản phẩm
            san_pham_text = sanpham
            if qua_tang:
                san_pham_text += f"\n**- Quà tặng (Nếu có):**\n{qua_tang}"
            
            data_lark = {
                "don_hang_moi": f"{time_create.strftime('%H:%M %d/%m/%Y')}, HD: {order_number}",
                "kenh": payload.invoice.name_salechannel, 
                "nguoi_ban": f"{payload.invoice.code_seller} - {payload.invoice.name_seller}",
                "san_pham": san_pham_text,
                "ma_hoa_don": code_invoice,
                "trang_thai": "Tạo đơn thành công" + (f"\n**- Ghi chú: {ghi_chu}**" if ghi_chu else "")
            }
            await send_lark_message(data_lark)
            
            def run_in_thread():
                """Hàm này tạo một môi trường riêng biệt cho Playwright"""
                # QUAN TRỌNG: Phải set Policy TRƯỚC khi gọi new_event_loop()
                if sys.platform == 'win32':
                    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
                
                # Bây giờ mới tạo loop - lúc này nó sẽ là ProactorEventLoop
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                
                try:
                    # Chạy hàm xử lý doanh số
                    new_loop.run_until_complete(bien_dong_doanhso_v3())
                except Exception as e:
                    print(f"❌ Lỗi trong luồng doanh số: {e}")
                finally:
                    new_loop.close()

            # Tạo và chạy Thread với daemon=True để không làm treo ứng dụng chính
            task_thread = threading.Thread(target=run_in_thread, daemon=True)
            task_thread.start()
            # ----------------------------------------------
                
        except Exception as lark_error:
            # Log lỗi nhưng không block việc tạo đơn hàng
            print(f"⚠️ Lỗi gửi Lark message: {str(lark_error)}")
            traceback.print_exc()
        
        print(f"✅ Tạo hóa đơn thành công: {code_invoice}")
        return {
            "success": True,
            "message": "Tạo hóa đơn thành công",
            "code_invoice": code_invoice
        }
        
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        print(f"❌ Lỗi tạo hóa đơn: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


# ==================== LẤY DANH SÁCH HÓA ĐƠN ====================

@router.get("/invoices")
async def get_all_invoices(
    page: int = Query(1, ge=1, description="Số trang"),
    limit: int = Query(20, ge=1, le=100, description="Số lượng mỗi trang"),
    status_value: Optional[str] = Query(None, description="Lọc theo trạng thái (có thể nhiều, phân cách bằng dấu phẩy)"),
    id_salechannel: Optional[int] = Query(None, description="Lọc theo kênh bán (đơn)"),
    id_salechannel_list: Optional[str] = Query(None, description="Lọc theo nhiều kênh bán (phân cách bằng dấu phẩy)"),
    code_invoice: Optional[str] = Query(None, description="Tìm kiếm theo mã hoá đơn"),
    from_date: Optional[str] = Query(None, description="Từ ngày (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Đến ngày (YYYY-MM-DD)"),
    token: dict = Depends(check_token)
):
    """
    Lấy danh sách tất cả hoá đơn (admin xem tất cả, nhân viên chỉ xem của mình)
    """
    conn_fm.rollback()  # Rollback any failed transaction
    
    try:
        role_id = token.get("role_id")
        id_acc = token.get("id_acc")
        code_acc = token.get("code_seller") or token.get("user_id")

        offset = (page - 1) * limit

        where_conditions = []
        params_list = []

        # Nhân viên (không phải admin/manager và không phải id_acc 34) chỉ thấy đơn của mình
        if role_id not in (1, 2) and id_acc != 34:
            if not code_acc:
                raise HTTPException(status_code=401, detail="Không tìm thấy thông tin nhân viên")
            where_conditions.append("invoice.code_seller = %s")
            params_list.append(code_acc)

        # Lọc theo trạng thái (hỗ trợ nhiều giá trị, phân cách bằng dấu phẩy)
        if status_value:
            status_values = [s.strip() for s in status_value.split(",") if s.strip()]
            if len(status_values) == 1:
                where_conditions.append("invoice.status_value = %s")
                params_list.append(status_values[0])
            elif len(status_values) > 1:
                placeholders = ", ".join(["%s"] * len(status_values))
                where_conditions.append(f"invoice.status_value IN ({placeholders})")
                params_list.extend(status_values)

        # Lọc theo kênh bán (hỗ trợ nhiều giá trị qua id_salechannel_list)
        if id_salechannel_list:
            try:
                channel_ids = [int(i.strip()) for i in id_salechannel_list.split(",") if i.strip()]
                if len(channel_ids) == 1:
                    where_conditions.append("invoice.id_salechannel = %s")
                    params_list.append(channel_ids[0])
                elif len(channel_ids) > 1:
                    placeholders = ", ".join(["%s"] * len(channel_ids))
                    where_conditions.append(f"invoice.id_salechannel IN ({placeholders})")
                    params_list.extend(channel_ids)
            except ValueError:
                pass
        elif id_salechannel is not None and id_salechannel > 0:
            where_conditions.append("invoice.id_salechannel = %s")
            params_list.append(id_salechannel)

        if code_invoice:
            search_term = code_invoice.strip()
            phone_search_term = search_term[1:] if search_term.startswith('0') and search_term.isdigit() else search_term
            where_conditions.append("(invoice.code_invoice ILIKE %s OR invoice.phone_number LIKE %s)")
            params_list.extend([f"%{search_term}%", f"%{phone_search_term}%"])

        if from_date:
            where_conditions.append("DATE(invoice.time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') >= %s")
            params_list.append(from_date)

        if to_date:
            where_conditions.append("DATE(invoice.time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') <= %s")
            params_list.append(to_date)

        where_clause = (" WHERE " + " AND ".join(where_conditions)) if where_conditions else ""

        columns = [
            "id_invoice", "code_invoice", "time_create", "time_update",
            "time_start_hoan", "id_creator", "code_creator", "name_creator",
            "id_seller", "code_seller", "name_seller", "id_customer",
            "code_customer", "phone_number", "id_salechannel", "name_salechannel",
            "subtotal", "gift_amount", "discount", "total_amount",
            "fee_delivery", "type_fee_delivery", "cod_need_payment", "description",
            "send_zns", "id_status", "status_value", "name_customer",
            "id_subchannel", "subchannel", "type_channel", "fee_platform",
            "shipping_method", "code_delivery"
        ]

        select_cols = ", ".join([f"invoice.{col}" for col in columns if col != "code_delivery"])
        select_cols += ", delivery_information.code_delivery"

        with conn_fm.cursor() as cur:
            # Get total count
            count_query = f"SELECT COUNT(*) FROM invoice{where_clause}"
            cur.execute(count_query, params_list)
            total = cur.fetchone()[0]

            # Get paginated data
            query = f"""
                SELECT {select_cols}
                FROM invoice
                LEFT JOIN delivery_information ON invoice.code_invoice = delivery_information.code_invoice
                {where_clause}
                ORDER BY invoice.time_create DESC
                LIMIT %s OFFSET %s
            """
            cur.execute(query, params_list + [limit, offset])
            rows = cur.fetchall()

            invoices = []
            for row in rows:
                invoice_dict = {}
                for idx, col in enumerate(columns):
                    value = row[idx]
                    if isinstance(value, datetime):
                        invoice_dict[col] = value.isoformat()
                    elif isinstance(value, date):
                        invoice_dict[col] = value.isoformat()
                    else:
                        invoice_dict[col] = value
                invoices.append(invoice_dict)

            return {
                "success": True,
                "data": invoices,
                "pagination": {
                    "total": total,
                    "page": page,
                    "limit": limit,
                    "total_pages": (total + limit - 1) // limit
                }
            }

    except HTTPException:
        raise
    except Exception as e:
        conn_fm.rollback()
        traceback.print_exc()
        print(f"❌ Lỗi lấy danh sách hoá đơn: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/invoices/my-orders")
async def get_my_orders(
    page: int = Query(1, ge=1, description="Số trang"),
    limit: int = Query(20, ge=1, le=100, description="Số lượng mỗi trang"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái"),
    code_invoice: Optional[str] = Query(None, description="Tìm kiếm theo mã đơn hàng"),
    from_date: Optional[str] = Query(None, description="Từ ngày (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Đến ngày (YYYY-MM-DD)"),
    token: dict = Depends(check_token)
):
    """
    Lấy danh sách đơn hàng của nhân viên theo code_seller
    """
    try:
        # Lấy code_seller từ token (mã nhân viên bán hàng)
        code_seller = token.get("code_seller") or token.get("user_id")
        
        if not code_seller:
            raise HTTPException(status_code=401, detail="Không tìm thấy thông tin nhân viên")

        offset = (page - 1) * limit

        # Build WHERE clause
        where_conditions = ["i.code_seller = %s"]
        params = [code_seller]

        if status:
            status_values = [s.strip() for s in status.split(",") if s.strip()]
            if len(status_values) == 1:
                where_conditions.append("i.status_value = %s")
                params.append(status_values[0])
            elif len(status_values) > 1:
                placeholders = ", ".join(["%s"] * len(status_values))
                where_conditions.append(f"i.status_value IN ({placeholders})")
                params.extend(status_values)

        if code_invoice:
            search_term = code_invoice.strip()
            phone_search_term = search_term[1:] if search_term.startswith('0') and search_term.isdigit() else search_term
            where_conditions.append("(i.code_invoice ILIKE %s OR i.phone_number LIKE %s)")
            params.extend([f"%{search_term}%", f"%{phone_search_term}%"])

        if from_date:
            where_conditions.append("DATE(i.time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') >= %s")
            params.append(from_date)

        if to_date:
            where_conditions.append("DATE(i.time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') <= %s")
            params.append(to_date)

        where_clause = " AND ".join(where_conditions)

        with conn_fm.cursor() as cur:
            # Đếm tổng số đơn hàng
            count_query = f"""
                SELECT COUNT(*) 
                FROM invoice i
                WHERE {where_clause}
            """
            cur.execute(count_query, params)
            total = cur.fetchone()[0]

            # Lấy danh sách đơn hàng với phân trang
            query = f"""
                SELECT 
                    i.id_invoice,
                    i.code_invoice,
                    i.time_create,
                    i.time_update,
                    i.time_start_hoan,
                    i.id_creator,
                    i.code_creator,
                    i.name_creator,
                    i.id_seller,
                    i.code_seller,
                    i.name_seller,
                    i.id_customer,
                    i.code_customer,
                    i.phone_number,
                    i.id_salechannel,
                    i.name_salechannel,
                    i.subtotal,
                    i.gift_amount,
                    i.discount,
                    i.total_amount,
                    i.fee_delivery,
                    i.type_fee_delivery,
                    i.cod_need_payment,
                    i.description,
                    i.send_zns,
                    i.id_status,
                    i.status_value,
                    i.name_customer,
                    i.id_subchannel,
                    i.subchannel,
                    i.type_channel,
                    i.fee_platform,
                    di.address
                FROM invoice i
                LEFT JOIN delivery_information di ON i.code_invoice = di.code_invoice
                WHERE {where_clause}
                ORDER BY i.time_create DESC
                LIMIT %s OFFSET %s
            """
            
            params.extend([limit, offset])
            cur.execute(query, params)
            rows = cur.fetchall()

            # Chuyển đổi kết quả sang dict
            columns = [
                "id_invoice", "code_invoice", "time_create", "time_update",
                "time_start_hoan", "id_creator", "code_creator", "name_creator",
                "id_seller", "code_seller", "name_seller", "id_customer",
                "code_customer", "phone_number", "id_salechannel", "name_salechannel",
                "subtotal", "gift_amount", "discount", "total_amount",
                "fee_delivery", "type_fee_delivery", "cod_need_payment", "description",
                "send_zns", "id_status", "status_value", "name_customer",
                "id_subchannel", "subchannel", "type_channel", "fee_platform",
                "address"
            ]

            invoices = []
            for row in rows:
                invoice_dict = {}
                for idx, col in enumerate(columns):
                    value = row[idx]
                    # Convert datetime to string
                    if isinstance(value, datetime):
                        invoice_dict[col] = value.isoformat()
                    elif isinstance(value, date):
                        invoice_dict[col] = value.isoformat()
                    else:
                        invoice_dict[col] = value
                invoices.append(invoice_dict)

            return {
                "success": True,
                "data": invoices,
                "pagination": {
                    "total": total,
                    "page": page,
                    "limit": limit,
                    "total_pages": (total + limit - 1) // limit
                }
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/invoices/my-orders/stats")
async def get_my_orders_stats(
    from_date: Optional[str] = Query(None, description="Từ ngày (YYYY-MM-DD)"),
    to_date: Optional[str] = Query(None, description="Đến ngày (YYYY-MM-DD)"),
    status: Optional[str] = Query(None, description="Lọc theo trạng thái"),
    token: dict = Depends(check_token)
):
    """
    Lấy thống kê đơn hàng của nhân viên theo date filter
    """
    try:
        from database import conn_fm
        code_seller = token.get("code_seller") or token.get("user_id")
        
        if not code_seller:
            raise HTTPException(status_code=401, detail="Không tìm thấy thông tin nhân viên")

        # Build WHERE clause
        where_conditions = ["code_seller = %s"]
        params = [code_seller]

        if from_date:
            where_conditions.append("DATE(time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') >= %s")
            params.append(from_date)

        if to_date:
            where_conditions.append("DATE(time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') <= %s")
            params.append(to_date)

        if status:
            status_values = [s.strip() for s in status.split(",") if s.strip()]
            if len(status_values) == 1:
                where_conditions.append("status_value = %s")
                params.append(status_values[0])
            elif len(status_values) > 1:
                placeholders = ", ".join(["%s"] * len(status_values))
                where_conditions.append(f"status_value IN ({placeholders})")
                params.extend(status_values)

        # Loại trừ các đơn hàng đã huỷ
        where_conditions.append("id_status != 12")
        where_conditions.append("status_value NOT IN ('Đã huỷ', 'Đã hủy', 'Hủy đơn')")

        where_clause = " AND ".join(where_conditions)

        # Lấy số đơn hàng và tổng doanh thu từ bảng invoice (không tính đơn huỷ)
        with conn_fm.cursor() as cur:
            cur.execute(
                f"""
                SELECT 
                    COUNT(*) as total_orders,
                    COALESCE(SUM(subtotal), 0) as total_revenue,
                    COALESCE(SUM(gift_amount), 0) as total_gift_amount
                FROM invoice
                WHERE {where_clause}
                """,
                params
            )
            result = cur.fetchone()
            total_orders = result[0] if result and result[0] else 0
            total_revenue = float(result[1]) if result and result[1] else 0
            total_gift_amount = float(result[2]) if result and result[2] else 0

        return {
            "success": True,
            "data": {
                "total_orders": total_orders,
                "total_revenue": total_revenue,
                "total_gift_amount": total_gift_amount
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/invoices/detail/{code_invoice}")
async def get_invoice_detail(
    code_invoice: str,
    token: dict = Depends(check_token)
):
    """
    Lấy chi tiết đơn hàng bao gồm thông tin invoice và danh sách sản phẩm
    """
    try:
        with conn_fm.cursor() as cur:
            # Lấy thông tin invoice
            invoice_query = """
                SELECT 
                    id_invoice,
                    code_invoice,
                    time_create,
                    time_update,
                    time_start_hoan,
                    id_creator,
                    code_creator,
                    name_creator,
                    id_seller,
                    code_seller,
                    name_seller,
                    id_customer,
                    code_customer,
                    phone_number,
                    id_salechannel,
                    name_salechannel,
                    subtotal,
                    gift_amount,
                    discount,
                    total_amount,
                    fee_delivery,
                    type_fee_delivery,
                    cod_need_payment,
                    description,
                    send_zns,
                    id_status,
                    status_value,
                    name_customer,
                    id_subchannel,
                    subchannel,
                    type_channel,
                    fee_platform
                FROM invoice
                WHERE code_invoice = %s
            """
            
            cur.execute(invoice_query, (code_invoice,))
            invoice_row = cur.fetchone()
            
            if not invoice_row:
                raise HTTPException(status_code=404, detail="Không tìm thấy đơn hàng")
            
            # Chuyển đổi invoice sang dict
            invoice_columns = [
                "id_invoice", "code_invoice", "time_create", "time_update",
                "time_start_hoan", "id_creator", "code_creator", "name_creator",
                "id_seller", "code_seller", "name_seller", "id_customer",
                "code_customer", "phone_number", "id_salechannel", "name_salechannel",
                "subtotal", "gift_amount", "discount", "total_amount",
                "fee_delivery", "type_fee_delivery", "cod_need_payment", "description",
                "send_zns", "id_status", "status_value", "name_customer",
                "id_subchannel", "subchannel", "type_channel", "fee_platform"
            ]
            
            invoice_dict = {}
            for idx, col in enumerate(invoice_columns):
                value = invoice_row[idx]
                if isinstance(value, datetime):
                    invoice_dict[col] = value.isoformat()
                elif isinstance(value, date):
                    invoice_dict[col] = value.isoformat()
                else:
                    invoice_dict[col] = value
            
            # Lấy danh sách sản phẩm
            detail_query = """
                SELECT 
                    id_invoice_detail,
                    code_invoice,
                    id_product,
                    code_product,
                    name_product,
                    sub_code_product,
                    sub_name_code_product,
                    quantity,
                    sub_price,
                    discount_price,
                    price,
                    total,
                    type_product
                FROM invoice_detail
                WHERE code_invoice = %s
                ORDER BY type_product, id_invoice_detail
            """
            
            cur.execute(detail_query, (code_invoice,))
            detail_rows = cur.fetchall()
            
            detail_columns = [
                "id_invoice_detail", "code_invoice", "id_product", "code_product",
                "name_product", "sub_code_product", "sub_name_code_product",
                "quantity", "sub_price", "discount_price", "price", "total", "type_product"
            ]
            
            products = []
            for row in detail_rows:
                product_dict = {}
                for idx, col in enumerate(detail_columns):
                    product_dict[col] = row[idx]
                products.append(product_dict)
            
            # Lấy thông tin giao hàng
            delivery_query = """
                SELECT 
                    d.id_delivery,
                    d.code_delivery,
                    d.id_partner_delivery,
                    d.partner_delivery,
                    d.height,
                    d.width,
                    d.length,
                    d.weight,
                    d.codfee,
                    d.fee_delivery,
                    d.receiver,
                    d.contact_number,
                    d.prov,
                    (SELECT DISTINCT id_prov FROM note_address WHERE prov = d.prov LIMIT 1) as id_prov,
                    d.area,
                    (SELECT id_ward FROM note_address WHERE ward = d.area AND prov = d.prov LIMIT 1) as id_ward,
                    d.address,
                    d.description as note_delivery,
                    d.time_create,
                    d.time_update
                FROM delivery_information d
                WHERE d.code_invoice = %s
                LIMIT 1
            """
            
            cur.execute(delivery_query, (code_invoice,))
            delivery_row = cur.fetchone()
            
            delivery_info = None
            if delivery_row:
                delivery_columns = [
                    "id_delivery", "code_delivery", "id_partner_delivery",
                    "partner_delivery", "height", "width", "length", "weight",
                    "codfee", "fee_delivery", "receiver", "contact_number",
                    "prov", "id_prov", "area", "id_ward", "address", "note_delivery", 
                    "time_create", "time_update"
                ]
                delivery_info = {}
                for idx, col in enumerate(delivery_columns):
                    value = delivery_row[idx]
                    if isinstance(value, datetime):
                        delivery_info[col] = value.isoformat()
                    elif isinstance(value, date):
                        delivery_info[col] = value.isoformat()
                    else:
                        delivery_info[col] = value
                
                if delivery_info.get("id_partner_delivery") == 8:
                    vtp_query = """
                        SELECT creator, note 
                        FROM vtp_tracking_history 
                        WHERE code_delivery = %s 
                        AND creator IS NOT NULL AND creator != ''
                        AND (note ILIKE '%%bưu tá%%' OR note ILIKE '%%phát%%' OR note ILIKE '%%nhận%%')
                        ORDER BY created_at DESC LIMIT 1
                    """
                    cur.execute(vtp_query, (delivery_info["code_delivery"],))
                    vtp_row = cur.fetchone()
                    if vtp_row:
                        import re
                        creator, note = vtp_row
                        delivery_info["postman_name"] = creator
                        
                        po_match = re.search(r'Tại:\s*[^,]+,\s*[^,]+,\s*(.*?),\s*(\d{10,11}),', note)
                        if po_match:
                            delivery_info["post_office_name"] = po_match.group(1)
                            delivery_info["postman_phone"] = po_match.group(2)
                            delivery_info["post_office_phone"] = ""
                        else:
                            phone_match = re.search(r'\b0\d{9,10}\b', note)
                            if phone_match:
                                delivery_info["postman_phone"] = phone_match.group(0)
                            else:
                                delivery_info["postman_phone"] = ""
                            delivery_info["post_office_phone"] = ""
            
            return {
                "success": True,
                "data": {
                    "invoice": invoice_dict,
                    "products": products,
                    "delivery_info": delivery_info
                }
            }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


# ===== Pydantic Models cho tạo đơn hàng =====
class Invoice(BaseModel):
    time_create: str
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
    subtotal: float
    gift_amount: float
    discount: float
    total_amount: float
    fee_delivery: float
    type_fee_delivery: str
    cod_need_payment: float
    description: str = ""
    send_zns: bool = False
    id_status: int
    status_value: str
    id_subchannel: int = None
    subchannel: str = None
    type_channel: str = None
    fee_platform: float = 0


class InvoiceDetail(BaseModel):
    code_invoice: str
    name_product: str
    id_product: str
    code_product: str
    quantity: int
    price: float
    discount: float
    total_amount: float
    is_gift: bool
    weight: float
    length: float
    width: float
    height: float


class DeliveryInformation(BaseModel):
    code_invoice: str
    receiver: str
    contact_number: str
    prov: str
    area: str
    address: str
    note_delivery: str = ""
    id_partner: int = None
    name_partner: str = None
    partner_service: str = None
    time_expected_delivery: str = None
    fee_delivery: float
    fee_insurance: float
    fee_cod: float
    total_fee: float
    fee_discount: float
    cod_need_payment: float
    weight: float
    length: float
    width: float
    height: float


class CreateInvoiceRequest(BaseModel):
    invoice: Invoice
    invoice_details: List[InvoiceDetail]
    delivery_info: DeliveryInformation


# ===== API Endpoints mới =====
@router.get("/invoice/sale_channels")
async def get_sale_channels(token: dict = Depends(check_token)):
    """
    Lấy danh sách kênh bán hàng (chỉ những kênh được phép hiển thị)
    """
    conn_fm.rollback()
    
    # Danh sách kênh bán được phép hiển thị với custom labels
    allowed_channels = {
        1: "UPSELL",
        4: "TIKTOK SHOP SPARK",
        5: "TIKTOK LIVE (PHƯƠNG ANH)",
        6: "TIKTOK LIVE (HẢI HÀ)",
        8: "FACEBOOK DATA",
        10: "Google/Website",
        12: "ZALO LIVE",
        13: "ZALO ADS",
        15: "Bán trực tiếp",
        17: "B2B (SỈ)",
        19: None,  # Giữ nguyên label từ DB
    }
    
    try:
        with conn_fm.cursor() as cur:
            placeholders = ",".join(["%s"] * len(allowed_channels))
            query = f"""
                SELECT id_salechannel, name_salechannel
                FROM sale_channel
                WHERE id_salechannel IN ({placeholders})
                ORDER BY id_salechannel
            """
            cur.execute(query, list(allowed_channels.keys()))
            rows = cur.fetchall()
            
            channels = []
            for row in rows:
                id_channel = row[0]
                custom_label = allowed_channels.get(id_channel)
                # Nếu custom_label là None, dùng label từ DB
                name = custom_label if custom_label else row[1]
                
                channels.append({
                    "id_salechannel": id_channel,
                    "name_salechannel": name,
                    "type": None,
                    "icon": None
                })
            
            return channels
    except Exception as e:
        conn_fm.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.get("/invoice/delivery_partners")
async def get_delivery_partners(token: dict = Depends(check_token)):
    """
    Lấy danh sách đối tác vận chuyển
    """
    conn_fm.rollback()
    
    try:
        with conn_fm.cursor() as cur:
            query = """
                SELECT id_partner, name_partner, code_partner, is_active
                FROM delivery_partner
                WHERE is_active = 1
                ORDER BY name_partner
            """
            cur.execute(query)
            rows = cur.fetchall()
            
            partners = []
            for row in rows:
                partners.append({
                    "id_partner": row[0],
                    "name_partner": row[1],
                    "code_partner": row[2],
                    "is_active": bool(row[3])
                })
            
            return partners
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.post("/invoice/create")
async def create_invoice(
    request: CreateInvoiceRequest,
    token: dict = Depends(check_token)
):
    """
    Tạo đơn hàng mới
    """
    try:
        invoice_data = request.invoice
        details_data = request.invoice_details
        delivery_data = request.delivery_info
        
        # Generate code_invoice
        now = datetime.now()
        code_invoice = f"CRM{now.strftime('%Y%m%d%H%M%S')}"
        
        with conn_fm.cursor() as cur:
            # 1. Insert invoice
            insert_invoice_query = """
                INSERT INTO invoice (
                    code_invoice, time_create, time_update,
                    id_creator, code_creator, name_creator,
                    id_seller, code_seller, name_seller,
                    id_customer, code_customer, name_customer, phone_number,
                    id_salechannel, name_salechannel,
                    subtotal, gift_amount, discount, total_amount,
                    fee_delivery, type_fee_delivery, shipping_method, cod_need_payment,
                    description, send_zns, id_status, status_value,
                    id_subchannel, subchannel, type_channel, fee_platform
                ) VALUES (
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s
                )
            """
            
            cur.execute(insert_invoice_query, (
                code_invoice, invoice_data.time_create, datetime.now(),
                invoice_data.id_creator, invoice_data.code_creator, invoice_data.name_creator,
                invoice_data.id_seller, invoice_data.code_seller, invoice_data.name_seller,
                invoice_data.id_customer, invoice_data.code_customer, 
                invoice_data.name_customer, invoice_data.phone_number,
                invoice_data.id_salechannel, invoice_data.name_salechannel,
                invoice_data.subtotal, invoice_data.gift_amount, 
                invoice_data.discount, invoice_data.total_amount,
                invoice_data.fee_delivery, invoice_data.type_fee_delivery,
                invoice_data.shipping_method,
                invoice_data.cod_need_payment,
                invoice_data.description, invoice_data.send_zns, 
                invoice_data.id_status, invoice_data.status_value,
                invoice_data.id_subchannel, invoice_data.subchannel, 
                invoice_data.type_channel, invoice_data.fee_platform
            ))
            
            # 2. Insert invoice details
            for detail in details_data:
                insert_detail_query = """
                    INSERT INTO invoice_detail (
                        code_invoice, name_product, id_product, code_product,
                        quantity, price, discount_price, total, type_product
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s
                    )
                """
                
                cur.execute(insert_detail_query, (
                    code_invoice,
                    detail.name_product,
                    detail.id_product,
                    detail.code_product,
                    detail.quantity,
                    detail.price,
                    detail.discount,
                    detail.total_amount,
                    "gift" if detail.is_gift else "product"
                ))
            
            # 3. Insert delivery information
            insert_delivery_query = """
                INSERT INTO delivery_information (
                    time_create, time_update, code_delivery, 
                    id_partner_delivery, partner_delivery, code_invoice,
                    height, width, length, weight, 
                    codfee, fee_delivery, receiver, contact_number,
                    prov, city, area, address, id_status, description
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            
            cur.execute(insert_delivery_query, (
                delivery_data.time_create or datetime.now(),
                delivery_data.time_update or datetime.now(),
                delivery_data.code_delivery,
                delivery_data.id_partner_delivery,
                delivery_data.partner_delivery,
                code_invoice,
                delivery_data.height,
                delivery_data.width,
                delivery_data.length,
                delivery_data.weight,
                float(delivery_data.codfee),
                float(delivery_data.fee_delivery),
                delivery_data.receiver,
                delivery_data.contact_number,
                delivery_data.prov,
                delivery_data.city,
                delivery_data.area,
                delivery_data.address,
                delivery_data.id_status or 1,
                delivery_data.description
            ))
            
            conn_fm.commit()
            
            return {
                "message": "Tạo đơn hàng thành công",
                "code_invoice": code_invoice
            }
            
    except Exception as e:
        conn_fm.rollback()
        raise HTTPException(status_code=500, detail=f"Lỗi khi tạo đơn hàng: {str(e)}")


@router.put("/invoices/{code_invoice}/update")
async def update_invoice(
    code_invoice: str,
    request: UpdateInvoicePayload,
    token: dict = Depends(check_token)
):
    """
    Cập nhật thông tin đơn hàng
    """
    try:
        # Lấy id_acc thực tế từ bảng account_users của fm_tdvn
        if request.code_seller:
            fm_account_id = await get_account_id_by_code(request.code_seller)
            if fm_account_id:
                request.id_seller = fm_account_id
                request.id_creator = fm_account_id

        with conn_fm.cursor() as cur:
            updates = []
            values = []
            
            STATUS_MAPPING = {
                "Chờ xử lý": 1,
                "Đang lấy hàng": 2,
                "Chờ lấy lại": 3,
                "Đã lấy hàng": 4,
                "Đang giao hàng": 5,
                "Chờ giao lại": 6,
                "Giao thành công": 7,
                "Chờ chuyển hoàn": 8,
                "Đang chuyển hoàn": 9,
                "Chờ chuyển hoàn lại": 10,
                "Đã chuyển hoàn": 11,
                "Đã hủy": 12,
            }
            
            # Cập nhật thông tin hóa đơn chính
            if request.status_value is not None:
                updates.append("status_value = %s")
                values.append(request.status_value)
                
                if request.status_value in STATUS_MAPPING:
                    updates.append("id_status = %s")
                    values.append(STATUS_MAPPING[request.status_value])
            
            if request.description is not None:
                updates.append("description = %s")
                values.append(request.description)
            
            if request.fee_delivery is not None:
                updates.append("fee_delivery = %s")
                values.append(float(request.fee_delivery))
            
            if request.receiver is not None:
                updates.append("name_customer = %s")
                values.append(request.receiver)
                
            if request.id_seller is not None:
                updates.append("id_seller = %s")
                values.append(request.id_seller)
            if request.code_seller is not None:
                updates.append("code_seller = %s")
                values.append(request.code_seller)
            if request.name_seller is not None:
                updates.append("name_seller = %s")
                values.append(request.name_seller)
                
            if request.id_creator is not None:
                updates.append("id_creator = %s")
                values.append(request.id_creator)
            if request.code_creator is not None:
                updates.append("code_creator = %s")
                values.append(request.code_creator)
            if request.name_creator is not None:
                updates.append("name_creator = %s")
                values.append(request.name_creator)
                
            if request.id_salechannel is not None:
                updates.append("id_salechannel = %s")
                values.append(request.id_salechannel)
            if request.name_salechannel is not None:
                updates.append("name_salechannel = %s")
                values.append(request.name_salechannel)
            
            # Thêm time_update
            updates.append("time_update = %s")
            values.append(datetime.now())
            
            if updates:
                values.append(code_invoice)
                update_invoice_query = f"""
                    UPDATE invoice
                    SET {', '.join(updates)}
                    WHERE code_invoice = %s
                """
                cur.execute(update_invoice_query, values)
            
            # Cập nhật thông tin giao hàng
            delivery_updates = []
            delivery_values = []
            
            if request.status_value is not None and request.status_value in STATUS_MAPPING:
                delivery_updates.append("id_status = %s")
                delivery_values.append(STATUS_MAPPING[request.status_value])
            
            if request.receiver is not None:
                delivery_updates.append("receiver = %s")
                delivery_values.append(request.receiver)
            
            if request.contact_number is not None:
                delivery_updates.append("contact_number = %s")
                delivery_values.append(request.contact_number)
            
            if request.address is not None:
                delivery_updates.append("address = %s")
                delivery_values.append(request.address)
            
            if request.prov is not None:
                delivery_updates.append("prov = %s")
                delivery_values.append(request.prov)
            
            if request.area is not None:
                delivery_updates.append("area = %s")
                delivery_values.append(request.area)
            
            if request.note_delivery is not None:
                delivery_updates.append("description = %s")
                delivery_values.append(request.note_delivery)
            
            if request.fee_delivery is not None:
                delivery_updates.append("fee_delivery = %s")
                delivery_values.append(request.fee_delivery)
            
            if delivery_updates:
                delivery_values.append(code_invoice)
                update_delivery_query = f"""
                    UPDATE delivery_information
                    SET {', '.join(delivery_updates)}
                    WHERE code_invoice = %s
                """
                cur.execute(update_delivery_query, delivery_values)
            
            conn_fm.commit()
            
            # Gửi thông báo Lark nếu trạng thái là Đã hủy
            if request.status_value == "Đã hủy":
                try:
                    cur.execute("""
                        SELECT time_create, name_salechannel, code_seller, name_seller, description
                        FROM invoice WHERE code_invoice = %s
                    """, (code_invoice,))
                    inv_row = cur.fetchone()
                    
                    if inv_row:
                        time_create, name_salechannel, code_seller, name_seller, description = inv_row
                        
                        cur.execute("""
                            SELECT name_product, quantity, type_product
                            FROM invoice_detail WHERE code_invoice = %s
                        """, (code_invoice,))
                        details = cur.fetchall()
                        
                        products = []
                        gifts = []
                        for d_row in details:
                            p_name, p_qty, p_type = d_row
                            p_text = f"• {p_name} x{p_qty}"
                            if p_type == "gift":
                                gifts.append(p_text)
                            else:
                                products.append(p_text)
                        
                        san_pham_text = "\n".join(products)
                        qua_tang_text = "\n".join(gifts)
                        if qua_tang_text:
                            san_pham_text += f"\n**- Quà tặng (Nếu có):**\n{qua_tang_text}"
                        
                        order_number = await get_invoice_number_today(code_invoice)
                        
                        ghi_chu = request.description if request.description is not None else description
                        ghi_chu = ghi_chu if ghi_chu else ""
                        
                        if isinstance(time_create, str):
                            time_create = datetime.fromisoformat(time_create)
                        if time_create.tzinfo is not None:
                            vietnam_tz = pytz.timezone('Asia/Ho_Chi_Minh')
                            time_create = time_create.astimezone(vietnam_tz)
                        else:
                            vietnam_tz = pytz.timezone('Asia/Ho_Chi_Minh')
                            time_create = time_create.replace(tzinfo=pytz.UTC).astimezone(vietnam_tz)
                        
                        data_lark = {
                            "don_hang_moi": f"{time_create.strftime('%H:%M %d/%m/%Y')}, HD: {order_number}",
                            "kenh": name_salechannel, 
                            "nguoi_ban": f"{code_seller} - {name_seller}",
                            "san_pham": san_pham_text,
                            "ma_hoa_don": code_invoice,
                            "trang_thai": "Đã huỷ" + (f"\n**- Ghi chú: {ghi_chu}**" if ghi_chu else "")
                        }
                        await send_lark_message(data_lark)
                except Exception as lark_error:
                    print(f"⚠️ Lỗi gửi Lark message khi hủy đơn: {str(lark_error)}")
                    traceback.print_exc()
            
            return {
                "message": "Cập nhật đơn hàng thành công",
                "code_invoice": code_invoice
            }
            
    except Exception as e:
        conn_fm.rollback()
        print(f"❌ Lỗi khi cập nhật đơn hàng: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi khi cập nhật đơn hàng: {str(e)}")


# ==================== LỊCH SỬ GIAO HÀNG ====================

VNPOST_URL_BASE = os.getenv("VNPOST_URL_BASE", "https://connect-my.vnpost.vn")
VNPOST_USERNAME = os.getenv("VNPOST_USERNAME", "")
VNPOST_PASSWORD = os.getenv("VNPOST_PASSWORD", "")
VNPOST_CUSTOMER_CODE = os.getenv("VNPOST_CUSTOMER_CODE", "")

_vnpost_token_cache = {"token": None, "expires_at": 0}


async def get_vnpost_token() -> str | None:
    import time as _time
    now = _time.time()
    if _vnpost_token_cache["token"] and now < _vnpost_token_cache["expires_at"]:
        return _vnpost_token_cache["token"]

    url = f"{VNPOST_URL_BASE}/customer-partner/GetAccessToken"
    payload = {
        "username": VNPOST_USERNAME,
        "password": VNPOST_PASSWORD,
        "customerCode": VNPOST_CUSTOMER_CODE,
    }
    try:
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                print(f"❌ VNPost login thất bại ({resp.status_code}): {resp.text}")
                return None
            data = resp.json()
            token = data.get("token")
            if not token:
                print(f"❌ Không lấy được token VNPost: {data}")
                return None
            _vnpost_token_cache["token"] = token
            _vnpost_token_cache["expires_at"] = now + 3500  # ~1 giờ
            return token
    except Exception as e:
        print(f"❌ Lỗi lấy token VNPost: {e}")
        traceback.print_exc()
        return None


async def api_vnpost_get_history(code_delivery: str) -> list:
    token = await get_vnpost_token()
    if not token:
        return []

    url = f"{VNPOST_URL_BASE}/customer-partner/GetStatusHistoryOrder"
    headers = {"token": token}
    params = {"code": code_delivery, "type": 1}

    async with httpx.AsyncClient(timeout=30, verify=False) as client:
        try:
            response = await client.get(url, headers=headers, params=params)
            if response.status_code != 200:
                print(f"VNPost API Error ({response.status_code}): {response.text}")
                return []

            res_json = response.json()
            data_raw = res_json.get("data")
            data_block = {}
            if isinstance(data_raw, list):
                data_block = data_raw[0] if data_raw else {}
            elif isinstance(data_raw, dict):
                data_block = data_raw
            else:
                return []

            status_history = data_block.get("statusHistory") or data_block.get("statusHistory ") or []

            result_list = []
            for event in status_history:
                date_str = event.get("createdDate", "")
                time_str = event.get("createHour") or event.get("createdHour") or event.get("time") or ""
                time_display = f"{time_str} {date_str}".strip()

                raw_status = event.get("statusName", "")
                location = event.get("locateName") or event.get("LocateName")
                detail_info = f"{location} - {raw_status}" if location else raw_status

                result_list.append({
                    "time": time_display,
                    "trackingCode": code_delivery,
                    "partner": "VNPost",
                    "status": raw_status,
                    "statusText": raw_status,
                    "detail": detail_info,
                    "creator": "VNPost System",
                })
            return result_list

        except Exception as e:
            print(f"Lỗi Handler VNPost: {e}")
            traceback.print_exc()
            return []


async def api_vtp_get_history(code_delivery: str) -> list:
    """Lấy lịch sử vận chuyển ViettelPost từ bảng vtp_tracking_history"""
    try:
        query = """
            SELECT time_delivery, id_status, status_value, note, creator
            FROM vtp_tracking_history
            WHERE code_delivery = %s
            ORDER BY created_at DESC, id DESC
        """
        with conn_fm.cursor() as cur:
            cur.execute(query, (str(code_delivery),))
            rows = cur.fetchall()

        result_list = []
        for row in rows:
            time_delivery, id_status, status_value, note, creator = row
            full_text = note if note else status_value
            if isinstance(time_delivery, datetime):
                time_str = time_delivery.strftime("%H:%M:%S %d/%m/%Y")
            else:
                time_str = str(time_delivery) if time_delivery else ""

            result_list.append({
                "time": time_str,
                "trackingCode": str(code_delivery),
                "partner": "Viettel Post",
                "status": full_text,
                "statusText": full_text,
                "detail": note,
                "creator": creator,
            })
        return result_list
    except Exception as e:
        print(f"❌ Lỗi Select lịch sử VTP: {e}")
        traceback.print_exc()
        return []


async def get_delivery_history_handler(code_delivery: str, partner_id: int = None) -> list:
    if not code_delivery or code_delivery in ("null", "undefined"):
        return []

    if partner_id == 8:
        return await api_vtp_get_history(code_delivery)

    if partner_id == 7:
        return await api_vnpost_get_history(code_delivery)

    if code_delivery.isdigit() and len(code_delivery) > 10:
        return await api_vtp_get_history(code_delivery)

    return await api_vnpost_get_history(code_delivery)



@router.get("/invoices/history/{code_delivery}")
async def get_invoice_history_api(
    code_delivery: str,
    partner_id: int = Query(None),
    token: dict = Depends(check_token)
):
    try:
        if not code_delivery or code_delivery in ("null", "undefined"):
            return []
        result = await get_delivery_history_handler(code_delivery, partner_id)
        return result
    except Exception as e:
        print(f"Error api history: {str(e)}")
        traceback.print_exc()
        return []

@router.post("/invoice/shopee/print")
async def print_shopee_waybill(
    order_sn_list: List[str] = Body(..., embed=True),
    token: dict = Depends(check_token)
):
    """
    Tạo và tải phiếu in đơn giao hàng Shopee
    """
    try:
        if not order_sn_list:
            raise HTTPException(status_code=400, detail="Không có order_sn")

        import io
        from pypdf import PdfReader, PdfWriter
        import json
        
        writer = PdfWriter()
        errors = []

        # Bước 1: Yêu cầu Shopee chuẩn bị file cho TẤT CẢ các đơn
        create_res = await create_shipping_document(order_sn_list)
        
        # KIỂM TRA LỖI VÀ TỰ ĐỘNG CHUẨN BỊ HÀNG NẾU CẦN
        needs_recreate = False
        if create_res and create_res.get("response") and create_res["response"].get("result_list"):
            for res_item in create_res["response"]["result_list"]:
                fail_error = res_item.get("fail_error")
                # Nếu có lỗi (thường là do đơn chưa chuẩn bị hàng) và không phải lỗi "đã tạo phiếu rồi"
                if fail_error and "already_exists" not in fail_error:
                    order_sn = res_item.get("order_sn")
                    if order_sn:
                        print(f"Đơn {order_sn} báo lỗi tạo phiếu ({fail_error}). Thử tự động chuẩn bị hàng...")
                        success, err_msg = await auto_arrange_shipment(order_sn)
                        if success:
                            needs_recreate = True
                        else:
                            errors.append(f"Đơn {order_sn}: {err_msg}")
                            
        elif create_res and create_res.get("error"):
            # Lỗi ở cấp cao nhất
            error_code = create_res.get("error", "")
            if "already_exists" not in error_code:
                print(f"Lỗi tạo phiếu ({error_code}). Thử tự động chuẩn bị hàng cho tất cả đơn...")
                for order_sn in order_sn_list:
                    success, err_msg = await auto_arrange_shipment(order_sn)
                    if success:
                        needs_recreate = True
                    else:
                        errors.append(f"Đơn {order_sn}: {err_msg}")
                        
        if needs_recreate:
            print("Đã tự động chuẩn bị hàng. Chờ 2s và gọi lại hàm tạo phiếu in...")
            await asyncio.sleep(2)
            create_res = await create_shipping_document(order_sn_list)

        # Bước 2: Tải file cho TỪNG ĐƠN HÀNG và gộp lại
        # Điều này giúp mỗi phiếu in sẽ nằm trên 1 trang riêng biệt thay vì Shopee gộp chung 4 phiếu/trang
        for order_sn in order_sn_list:
            max_retries = 5
            pdf_content = None
            doc_error = None
            is_fallback = False
            
            for attempt in range(max_retries):
                # Download từng đơn
                res_content = await download_shipping_document([order_sn])
                
                # Nếu tải thành công và là file PDF
                if res_content and not isinstance(res_content, dict):
                    pdf_content = res_content
                    break
                    
                # Nếu lỗi bắt buộc in A4 (do đã tạo A4 từ trước)
                if isinstance(res_content, dict) and res_content.get("error") == "logistics.shipping_document_should_print_first":
                    print(f"Đơn {order_sn}: Thử fallback sang NORMAL_AIR_WAYBILL...")
                    res_content_fb = await download_shipping_document([order_sn], doc_type="NORMAL_AIR_WAYBILL")
                    if res_content_fb and not isinstance(res_content_fb, dict):
                        pdf_content = res_content_fb
                        is_fallback = True
                        break
                
                # Nếu hết số lần thử
                if attempt == max_retries - 1:
                    if isinstance(res_content, dict):
                        doc_error = res_content.get("message") or res_content.get("error") or str(res_content)
                else:
                    await asyncio.sleep(2)
            
            # Gộp trang PDF
            if pdf_content:
                try:
                    reader = PdfReader(io.BytesIO(pdf_content))
                    for page in reader.pages:
                        if is_fallback:
                            # Cắt lấy góc trên bên trái (kích thước A6) của trang A4
                            width = float(page.mediabox.width)
                            height = float(page.mediabox.height)
                            page.mediabox.lower_left = (0, height / 2)
                            page.mediabox.upper_right = (width / 2, height)
                        writer.add_page(page)
                except Exception as e:
                    errors.append(f"Đơn {order_sn}: Lỗi đọc file PDF ({str(e)})")
            else:
                errors.append(f"Đơn {order_sn}: Không tải được phiếu in ({doc_error})")

        # Kiểm tra nếu không có trang nào được tải thành công
        if len(writer.pages) == 0:
            error_msg = "\n".join(errors)
            return Response(
                content=json.dumps({
                    "error": "Không thể tải phiếu in cho các đơn đã chọn", 
                    "detail": error_msg or "Vui lòng đảm bảo đơn hàng đã được 'Chuẩn bị hàng'"
                }).encode(),
                media_type="application/json",
                status_code=400
            )

        # Xuất file PDF đã gộp
        merged_pdf_stream = io.BytesIO()
        writer.write(merged_pdf_stream)
        merged_pdf_bytes = merged_pdf_stream.getvalue()

        return Response(content=merged_pdf_bytes, media_type="application/pdf")
        
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/invoice/tiktok/print")
async def print_tiktok_waybill(
    order_id_list: List[str] = Body(..., embed=True),
    token: dict = Depends(check_token)
):
    """
    Tải phiếu in đơn giao hàng TikTok
    """
    try:
        if not order_id_list:
            raise HTTPException(status_code=400, detail="Không có order_id")

        import io
        from pypdf import PdfReader, PdfWriter
        import json
        
        writer = PdfWriter()
        errors = []

        for order_id in order_id_list:
            pdf_content = await download_tiktok_shipping_document(order_id)
            if isinstance(pdf_content, dict) and "error" in pdf_content:
                error_detail = pdf_content["error"]
                print(f"Lỗi tải phiếu in TikTok ({error_detail}) cho đơn {order_id}. Thử tự động chuẩn bị hàng...")
                
                # Tự động chuẩn bị hàng
                success, err_msg = await auto_arrange_tiktok_shipment(order_id)
                if success:
                    print(f"Chuẩn bị hàng thành công cho đơn {order_id}, thử tải lại phiếu in...")
                    # Đợi một chút để hệ thống TikTok cập nhật trạng thái
                    await asyncio.sleep(2)
                    pdf_content = await download_tiktok_shipping_document(order_id)
                    if isinstance(pdf_content, dict) and "error" in pdf_content:
                        errors.append(f"Đơn {order_id}: {pdf_content['error']} (Lưu ý: Đã chuẩn bị hàng thành công nhưng tải phiếu in vẫn lỗi)")
                        continue
                else:
                    errors.append(f"Đơn {order_id}: {error_detail} (Lỗi khi tự động chuẩn bị hàng: {err_msg})")
                    continue
            
            if pdf_content and not isinstance(pdf_content, dict):
                try:
                    reader = PdfReader(io.BytesIO(pdf_content))
                    for page in reader.pages:
                        writer.add_page(page)
                except Exception as e:
                    errors.append(f"Đơn {order_id}: Lỗi đọc file PDF ({str(e)})")
            else:
                errors.append(f"Đơn {order_id}: Không nhận được nội dung PDF")

        if len(writer.pages) == 0:
            error_msg = "\n".join(errors)
            return Response(
                content=json.dumps({
                    "error": "Không thể tải phiếu in cho các đơn đã chọn", 
                    "detail": error_msg
                }).encode(),
                media_type="application/json",
                status_code=400
            )

        merged_pdf_stream = io.BytesIO()
        writer.write(merged_pdf_stream)
        merged_pdf_bytes = merged_pdf_stream.getvalue()

        return Response(content=merged_pdf_bytes, media_type="application/pdf")
        
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
