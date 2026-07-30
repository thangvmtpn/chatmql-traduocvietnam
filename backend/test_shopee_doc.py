import asyncio
from utils.shopee import download_shipping_document

async def test():
    order_sn = "260428180A3DN7"
    order_sn_list = [order_sn]
    
    print("Calling download_shipping_document...")
    download_res = await download_shipping_document(order_sn_list)
    if isinstance(download_res, dict):
        print("Download error res:", download_res)
    else:
        print("Download success, length:", len(download_res))

asyncio.run(test())
