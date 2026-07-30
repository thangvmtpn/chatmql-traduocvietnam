import asyncio
from database import conn

async def test():
    with conn.cursor() as cur:
        cur.execute("SELECT id_kh, gmv, aov FROM khach_hang WHERE ma_kh = 'KH040091'")
        res = cur.fetchone()
        print("KHACH_HANG:", res)

asyncio.run(test())
