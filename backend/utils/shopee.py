import asyncio
import json
import time
import hmac  
import hashlib 
import traceback
import os
import httpx
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

SHOP_ID = int(os.getenv("SHOP_ID", "0"))
PARTNER_ID = int(os.getenv("PARTNER_ID", "0"))
KEY_SHOPEE = os.getenv("KEY_SHOPEE", "")

async def update_env_file(key: str, value: str):
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    try:
        with open(env_path, 'r') as file:
            lines = file.readlines()
        
        with open(env_path, 'w') as file:
            key_found = False
            for line in lines:
                if line.startswith(f"{key}="):
                    file.write(f'{key}="{value}"\n')
                    key_found = True
                else:
                    file.write(line)
            
            if not key_found:
                file.write(f'{key}="{value}"\n')
        
        os.environ[key] = value
    except Exception as e:
        print(f"Lỗi cập nhật .env file: {e}")

async def get_access_token_by_refresh_token():
    timest = int(time.time())
    host = "https://partner.shopeemobile.com"
    path = "/api/v2/auth/access_token/get"
    refresh_token = os.getenv("REFRESH_TOKEN_SHOPEE")
    body = {"shop_id": SHOP_ID, "refresh_token": refresh_token,"partner_id":PARTNER_ID}
    tmp_base_string = "%s%s%s" % (PARTNER_ID, path, timest)
    base_string = tmp_base_string.encode()
    partner_key = KEY_SHOPEE.encode()
    sign = hmac.new(partner_key, base_string, hashlib.sha256).hexdigest()
    url = host + path + "?partner_id=%s&timestamp=%s&sign=%s" % (PARTNER_ID, timest, sign)
    headers = {"Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            response = await client.post(url, json=body, headers=headers)
            result = response.json()
            if result.get("error") != "":
                print(f"SHOPEE API error: {result}")
                return None
         
            access_token = result.get("access_token")
            new_refresh_token = result.get("refresh_token")
            await update_env_file("REFRESH_TOKEN_SHOPEE", new_refresh_token)
            return access_token
        except httpx.HTTPStatusError as e:
            print(f"HTTP error: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            print("Lỗi không xác định khi gọi Shopee", e)

async def get_tracking_number(order_sn: str):
    """
    Lấy mã vận đơn (tracking_number) của một đơn hàng, cần thiết để truyền vào API tạo phiếu in.
    """
    try:
        access_token = await get_access_token_by_refresh_token()
        timest = int(time.time())
        path = "/api/v2/logistics/get_tracking_number"
        tmp_base_string = "%s%s%s%s%s" % (PARTNER_ID, path, timest, access_token, SHOP_ID)
        partner_key = KEY_SHOPEE.encode()
        sign = hmac.new(partner_key, tmp_base_string.encode(), hashlib.sha256).hexdigest()
        
        url = "https://partner.shopeemobile.com" + path
        params = {
            "access_token": access_token,
            "partner_id": PARTNER_ID,
            "shop_id": SHOP_ID,
            "timestamp": timest,
            "sign": sign,
            "order_sn": order_sn
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params)
            result = response.json()
            if not result.get("error"):
                return result.get("response", {}).get("tracking_number", "")
            return ""
    except Exception as e:
        logger.error(f"Error getting tracking number for {order_sn}: {e}")
        return ""

async def get_shipping_parameter(order_sn: str):
    """Lấy các thông số giao hàng (pickup/dropoff) của đơn hàng"""
    try:
        access_token = await get_access_token_by_refresh_token()
        if not access_token: return None

        timest = int(time.time())
        path = "/api/v2/logistics/get_shipping_parameter"
        tmp_base_string = "%s%s%s%s%s" % (PARTNER_ID, path, timest, access_token, SHOP_ID)
        partner_key = KEY_SHOPEE.encode()
        sign = hmac.new(partner_key, tmp_base_string.encode(), hashlib.sha256).hexdigest()
        
        url = "https://partner.shopeemobile.com" + path
        params = {
            "access_token": access_token,
            "partner_id": PARTNER_ID,
            "shop_id": SHOP_ID,
            "timestamp": timest,
            "sign": sign,
            "order_sn": order_sn
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params)
            return response.json()
    except Exception as e:
        logger.error(f"Error get_shipping_parameter for {order_sn}: {e}")
        return None

async def get_order_detail(order_sn: str):
    """Lấy thông tin chi tiết của đơn hàng"""
    try:
        access_token = await get_access_token_by_refresh_token()
        if not access_token: return None

        timest = int(time.time())
        path = "/api/v2/order/get_order_detail"
        tmp_base_string = "%s%s%s%s%s" % (PARTNER_ID, path, timest, access_token, SHOP_ID)
        partner_key = KEY_SHOPEE.encode()
        sign = hmac.new(partner_key, tmp_base_string.encode(), hashlib.sha256).hexdigest()
        
        url = "https://partner.shopeemobile.com" + path
        params = {
            "access_token": access_token,
            "partner_id": PARTNER_ID,
            "shop_id": SHOP_ID,
            "timestamp": timest,
            "sign": sign,
            "order_sn_list": order_sn,
            "response_optional_fields": "order_status"
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params)
            return response.json()
    except Exception as e:
        logger.error(f"Error get_order_detail for {order_sn}: {e}")
        return None

async def ship_order(order_sn: str, pickup_data: dict = None, dropoff_data: dict = None):
    """Xác nhận chuẩn bị hàng cho đơn hàng"""
    try:
        access_token = await get_access_token_by_refresh_token()
        if not access_token: return None

        timest = int(time.time())
        path = "/api/v2/logistics/ship_order"
        tmp_base_string = "%s%s%s%s%s" % (PARTNER_ID, path, timest, access_token, SHOP_ID)
        partner_key = KEY_SHOPEE.encode()
        sign = hmac.new(partner_key, tmp_base_string.encode(), hashlib.sha256).hexdigest()
        
        url = "https://partner.shopeemobile.com" + path
        params = {
            "access_token": access_token,
            "partner_id": PARTNER_ID,
            "shop_id": SHOP_ID,
            "timestamp": timest,
            "sign": sign,
        }
        
        body = {"order_sn": order_sn}
        if pickup_data is not None:
            body["pickup"] = pickup_data
        elif dropoff_data is not None:
            body["dropoff"] = dropoff_data

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, params=params, json=body)
            return response.json()
    except Exception as e:
        logger.error(f"Error ship_order for {order_sn}: {e}")
        return None

async def auto_arrange_shipment(order_sn: str):
    """Tự động kiểm tra và chuẩn bị hàng (ưu tiên pickup). Trả về (success, error_message)"""
    
    order_detail = await get_order_detail(order_sn)
    if order_detail and not order_detail.get("error"):
        order_list = order_detail.get("response", {}).get("order_list", [])
        if order_list:
            order_status = order_list[0].get("order_status")
            if order_status != "READY_TO_SHIP":
                print(f"Không thể chuẩn bị hàng. Đơn {order_sn} có trạng thái: {order_status}")
                return False, f"Đơn hàng đang ở trạng thái {order_status} trên hệ thống Shopee. Chỉ hỗ trợ chuẩn bị hàng cho đơn READY_TO_SHIP (Chờ lấy hàng)."
                
    param_res = await get_shipping_parameter(order_sn)
    if not param_res or param_res.get("error"):
        print(f"Lấy shipping parameter thất bại: {param_res}")
        return False, f"Lấy thông số chuẩn bị hàng thất bại: {param_res.get('message') if param_res else 'Không xác định'}"
        
    response_data = param_res.get("response", {})
    pickup_info = response_data.get("pickup")
    dropoff_info = response_data.get("dropoff")
    
    # Ưu tiên pickup
    if pickup_info and "address_list" in pickup_info and len(pickup_info["address_list"]) > 0:
        address_id = pickup_info["address_list"][0].get("address_id")
        pickup_data = {"address_id": address_id}
        
        # Thêm pickup_time_id nếu bắt buộc
        info_needed = response_data.get("info_needed", {})
        if "pickup_time_id" in info_needed.get("pickup", []):
            time_slot_list = pickup_info["address_list"][0].get("time_slot_list", [])
            if time_slot_list:
                pickup_data["pickup_time_id"] = time_slot_list[0].get("pickup_time_id")
                
        ship_res = await ship_order(order_sn, pickup_data=pickup_data)
        if ship_res and not ship_res.get("error"):
            print(f"Chuẩn bị hàng (Pickup) thành công cho đơn {order_sn}")
            return True, ""
        else:
            err = ship_res.get("message") if ship_res else "Lỗi không xác định"
            print(f"Chuẩn bị hàng (Pickup) thất bại: {ship_res}")
            return False, f"Lỗi gọi API Pickup Shopee: {err}"
            
    # Fallback sang dropoff nếu hỗ trợ
    elif dropoff_info is not None:
        ship_res = await ship_order(order_sn, dropoff_data={})
        if ship_res and not ship_res.get("error"):
            print(f"Chuẩn bị hàng (Dropoff) thành công cho đơn {order_sn}")
            return True, ""
        else:
            err = ship_res.get("message") if ship_res else "Lỗi không xác định"
            print(f"Chuẩn bị hàng (Dropoff) thất bại: {ship_res}")
            return False, f"Lỗi gọi API Dropoff Shopee: {err}"
            
    return False, "Shopee không trả về thông tin Pickup hoặc Dropoff hợp lệ"

async def create_shipping_document(order_sn_list: list, doc_type: str = "THERMAL_AIR_WAYBILL"):
    access_token = await get_access_token_by_refresh_token()
    if not access_token:
        print("Không lấy được access token Shopee")
        return None

    timest = int(time.time())
    url = "https://partner.shopeemobile.com/api/v2/logistics/create_shipping_document"
    path = "/api/v2/logistics/create_shipping_document"

    tmp_base_string = "%s%s%s%s%s" % (PARTNER_ID, path, timest, access_token, SHOP_ID)
    base_string = tmp_base_string.encode()
    partner_key = KEY_SHOPEE.encode()

    params = {
        "access_token": access_token,
        "partner_id": PARTNER_ID,
        "shop_id": SHOP_ID,
        "timestamp": timest,
        "sign": hmac.new(partner_key, base_string, hashlib.sha256).hexdigest(),
    }
    
    # Lấy tracking_number cho từng đơn hàng (vì Shopee yêu cầu truyền vào nếu đã có)
    order_list = []
    for sn in order_sn_list:
        track_num = await get_tracking_number(sn)
        item = {"order_sn": sn}
        if track_num:
            item["tracking_number"] = track_num
        order_list.append(item)
        
    body = {
        "order_list": order_list,
        "shipping_document_type": doc_type
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url, params=params, json=body)
            result = response.json()
            return result
        except Exception as e:
            traceback.print_exc()
            print("Lỗi khi create_shipping_document:", e)
            return None

async def download_shipping_document(order_sn_list: list, doc_type: str = "THERMAL_AIR_WAYBILL"):
    access_token = await get_access_token_by_refresh_token()
    if not access_token:
        print("Không lấy được access token Shopee")
        return None

    timest = int(time.time())
    url = "https://partner.shopeemobile.com/api/v2/logistics/download_shipping_document"
    path = "/api/v2/logistics/download_shipping_document"

    tmp_base_string = "%s%s%s%s%s" % (PARTNER_ID, path, timest, access_token, SHOP_ID)
    base_string = tmp_base_string.encode()
    partner_key = KEY_SHOPEE.encode()

    params = {
        "access_token": access_token,
        "partner_id": PARTNER_ID,
        "shop_id": SHOP_ID,
        "timestamp": timest,
        "sign": hmac.new(partner_key, base_string, hashlib.sha256).hexdigest(),
    }
    
    # Lấy tracking_number cho từng đơn hàng
    order_list = []
    for sn in order_sn_list:
        track_num = await get_tracking_number(sn)
        item = {"order_sn": sn}
        if track_num:
            item["tracking_number"] = track_num
        order_list.append(item)
        
    body = {
        "order_list": order_list,
        "shipping_document_type": doc_type
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url, params=params, json=body)
            if response.headers.get("Content-Type") == "application/pdf":
                return response.content
            else:
                try:
                    return response.json()
                except:
                    return None
        except Exception as e:
            traceback.print_exc()
            print("Lỗi khi download_shipping_document:", e)
            return None
