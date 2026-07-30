import asyncio
import json
import time
import hmac  
import hashlib 
import traceback
from urllib.parse import urlparse
import os
import httpx
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

APP_KEY       = os.getenv("APP_KEY")
APP_SECRET    = os.getenv("APP_SECRET")
SHOP_CIPHER   = os.getenv("SHOP_CIPHER")

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
        logger.error(f"Lỗi cập nhật .env file: {e}")

async def generate_sign(request_option, app_secret):
    params = request_option.get('qs', {})
    exclude_keys = ["access_token", "sign"]
    sorted_params = sorted([k for k in params.keys() if k not in exclude_keys])
    param_string = ''.join(f"{k}{params[k]}" for k in sorted_params)
    
    body = request_option.get('body', '')
    if isinstance(body, dict):
        body_string = json.dumps(body, separators=(',', ':'))
    elif isinstance(body, str):
        body_string = body
    else:
        body_string = ''
        
    param_string += body_string

    uri = request_option.get('uri', '')
    pathname = urlparse(uri).path
    sign_string = pathname + param_string

    wrapped = f"{app_secret}{sign_string}{app_secret}"
    sign = hmac.new(app_secret.encode(), wrapped.encode(), hashlib.sha256).hexdigest()

    return sign

async def get_access_token_by_refresh_token():
    url = "https://auth.tiktok-shops.com/api/v2/token/refresh"
    REFRESH_TOKEN = os.getenv("REFRESH_TOKEN")
    param = {
        "app_key": APP_KEY,
        "app_secret": APP_SECRET,
        "refresh_token": REFRESH_TOKEN,
        "grant_type": "refresh_token"
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            response = await client.get(url, params=param)
            result = response.json()

            if result.get("code") != 0:
                logger.error(f"TikTok API error: {result}")
                return None
            
            access_token = result.get("data").get("access_token")
            refresh_token = result.get("data").get("refresh_token")
            await update_env_file("REFRESH_TOKEN", refresh_token)
            return access_token

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error: {e.response.status_code} - {e.response.text}")
        except Exception as e:
            logger.error(f"Lỗi không xác định khi gọi TikTok: {e}")

async def get_package_id(order_id: str):
    """Lấy package_id từ order_id"""
    url = "https://open-api.tiktokglobalshop.com/order/202507/orders"
    timestamp = str(int(time.time()))
    access_token = await get_access_token_by_refresh_token()
    if not access_token: return None

    params = {
        "shop_cipher": SHOP_CIPHER,
        "ids": order_id,
        "timestamp": timestamp,
        "app_key": APP_KEY
    }

    request_option = {
        'uri': url,
        'qs': params,
        'headers': {
            'x-tts-access-token': access_token,
            'content-type': 'application/json'
        },
        'body': None
    }

    signature = await generate_sign(request_option, APP_SECRET)
    params["sign"] = signature

    headers = {
        "x-tts-access-token": access_token,
        "content-type": "application/json"
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        try:
            response = await client.get(url, params=params, headers=headers)
            result = response.json()
            if result.get("code") == 0 and result.get("data") and result["data"].get("orders"):
                order = result["data"]["orders"][0]
                packages = order.get("packages", [])
                if packages:
                    return packages[0].get("id")
            return None
        except Exception as e:
            logger.error(f"Lỗi get_package_id cho {order_id}: {e}")
            return None

async def download_tiktok_shipping_document(order_id: str):
    """Lấy phiếu in giao hàng (PDF) cho order_id"""
    package_id = await get_package_id(order_id)
    if not package_id:
        return {"error": f"Không tìm thấy package_id cho đơn {order_id}"}
        
    access_token = await get_access_token_by_refresh_token()
    if not access_token:
        return {"error": "Lỗi xác thực TikTok"}

    url = f"https://open-api.tiktokglobalshop.com/fulfillment/202309/packages/{package_id}/shipping_documents"
    params = {
        "shop_cipher": SHOP_CIPHER,
        "document_type": "SHIPPING_LABEL_AND_PACKING_SLIP",
        "document_size": "A6",
        "timestamp": str(int(time.time())),
        "app_key": APP_KEY
    }
    
    request_option = {
        'uri': url,
        'qs': params,
        'headers': {
            'x-tts-access-token': access_token,
            'content-type': 'application/json'
        },
        'body': None
    }
    
    signature = await generate_sign(request_option, APP_SECRET)
    params["sign"] = signature
    headers = {
        "x-tts-access-token": access_token,
        "content-type": "application/json"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(url, params=params, headers=headers)
            result = response.json()
            
            if result.get("code") == 0 and result.get("data"):
                doc_url = result["data"].get("doc_url")
                if doc_url:
                    # Download PDF từ doc_url
                    pdf_res = await client.get(doc_url)
                    if pdf_res.status_code == 200:
                        return pdf_res.content
            return {"error": result.get("message", "Lỗi lấy phiếu in")}
        except Exception as e:
            traceback.print_exc()
            return {"error": str(e)}

async def auto_arrange_tiktok_shipment(order_id: str):
    """Tự động kiểm tra và chuẩn bị hàng (ưu tiên DROP_OFF). Trả về (success, error_message)"""
    package_id = await get_package_id(order_id)
    if not package_id:
        return False, f"Không tìm thấy package_id cho đơn {order_id}"

    access_token = await get_access_token_by_refresh_token()
    if not access_token:
        return False, "Lỗi xác thực TikTok"

    url = f"https://open-api.tiktokglobalshop.com/fulfillment/202309/packages/{package_id}/ship"
    timestamp = str(int(time.time()))

    params = {
        "shop_cipher": SHOP_CIPHER,
        "app_key": APP_KEY,
        "timestamp": timestamp
    }
    
    body = {
        "handover_method": "PICKUP"
    }

    request_option = {
        'uri': url,
        'qs': params,
        'headers': {
            'x-tts-access-token': access_token,
            'content-type': 'application/json'
        },
        'body': body
    }

    signature = await generate_sign(request_option, APP_SECRET)
    params["sign"] = signature

    headers = {
        "x-tts-access-token": access_token,
        "content-type": "application/json"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Tiktok yêu cầu body phải là raw JSON string khớp chính xác với signature
            body_string = json.dumps(body, separators=(',', ':'))
            response = await client.post(url, params=params, headers=headers, content=body_string)
            result = response.json()
            
            if result.get("code") == 0:
                print(f"Chuẩn bị hàng TikTok (PICKUP) thành công cho đơn {order_id}")
                return True, ""
            else:
                err = result.get("message", "Lỗi không xác định")
                print(f"Chuẩn bị hàng TikTok (PICKUP) thất bại: {result}")
                
                # Nếu không hỗ trợ PICKUP hoặc yêu cầu thông tin thêm, thử DROP_OFF
                print("Thử lại với DROP_OFF...")
                body["handover_method"] = "DROP_OFF"
                request_option['body'] = body
                signature = await generate_sign(request_option, APP_SECRET)
                params["sign"] = signature
                body_string2 = json.dumps(body, separators=(',', ':'))
                response2 = await client.post(url, params=params, headers=headers, content=body_string2)
                result2 = response2.json()
                if result2.get("code") == 0:
                    print(f"Chuẩn bị hàng TikTok (DROP_OFF) thành công cho đơn {order_id}")
                    return True, ""
                err = result2.get("message", "Lỗi DROP_OFF")

                return False, f"Lỗi gọi API Ship TikTok: {err}"
                
        except Exception as e:
            traceback.print_exc()
            return False, f"Lỗi gọi API Ship TikTok: {str(e)}"
