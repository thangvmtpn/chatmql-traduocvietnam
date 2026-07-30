import asyncio
from utils.shopee import get_access_token_by_refresh_token, get_tracking_number, SHOP_ID, PARTNER_ID, KEY_SHOPEE
import time
import httpx
import hmac
import hashlib

async def test():
    access_token = await get_access_token_by_refresh_token()
    timest = int(time.time())
    url = "https://partner.shopeemobile.com/api/v2/logistics/get_shipping_document_result"
    path = "/api/v2/logistics/get_shipping_document_result"
    
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
    
    order_sn = "260428180A3DN7"
    track_num = await get_tracking_number(order_sn)
    
    body = {
        "order_list": [{"order_sn": order_sn, "tracking_number": track_num}],
        "shipping_document_type": "THERMAL_AIR_WAYBILL"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, params=params, json=body)
        print(response.json())

asyncio.run(test())
