import asyncio
from utils.tiktok import download_tiktok_shipping_document, get_package_id, get_access_token_by_refresh_token, SHOP_CIPHER, APP_KEY, APP_SECRET, generate_sign
import time
import httpx
import sys

async def test():
    order_id = "583738286879835622"
    print(f"Testing with order_id: {order_id}")
    
    package_id = await get_package_id(order_id)
    if not package_id:
        print("No package_id")
        return
        
    access_token = await get_access_token_by_refresh_token()
    if not access_token:
        print("No access token")
        return

    url = f"https://open-api.tiktokglobalshop.com/fulfillment/202309/packages/{package_id}/shipping_documents"
    
    # Try different document_type values
    for doc_type in ["SLITTING_LABEL", "PICK_LIST", "PACKING_SLIP", "SHIPPING_LABEL"]:
        params = {
            "shop_cipher": SHOP_CIPHER,
            "document_type": doc_type,
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
            response = await client.get(url, params=params, headers=headers)
            result = response.json()
            if result.get("code") == 0:
                print(f"SUCCESS with {doc_type}: doc_url = {result.get('data', {}).get('doc_url')}")
            else:
                print(f"FAILED with {doc_type}: {result}")

asyncio.run(test())
