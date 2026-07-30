import asyncio
import hashlib
import base64
import json
import os
import traceback
import httpx
import time
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL_FM = os.getenv("DATABASE_URL_FM")


async def get_fm_token():
    try:
        # Get credentials from database
        conn_fm = psycopg.connect(DATABASE_URL_FM)
        cursor = conn_fm.cursor()
        cursor.execute("SELECT username, password FROM account_users WHERE id_acc = 2")
        result = cursor.fetchone()
        cursor.close()
        conn_fm.close()
        
        if not result:
            print("No account found with id_acc = 2")
            return None
        
        username, password = result
        
        url = "https://apifm.traduoc.vn/api/auth/login"
        payload = {
            "username": username,
            "password": password
        }
        headers = {
            "Content-Type": "application/json"
        }
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(url, json=payload, headers=headers)
            if not response.content:
                print(f"FM login returned empty response, status: {response.status_code}")
                return None
            result = response.json()
            token = result.get("access_token")
            # print(f"FM Token: {token}")
            return token
    except Exception as e:
        traceback.print_exc()
        print(f"Error fetching FM token: {e}")
        return None

async def get_product():
    try:
        token = await get_fm_token()
        url = f"https://apifm.traduoc.vn/api/products/get_all"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        }
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(url, headers=headers)
            if not response.content:
                print(f"FM get_product returned empty response, status: {response.status_code}")
                return None
            result = response.json()
            # print(f"Product data for: \n", json.dumps(result, indent=4, ensure_ascii=False))
            return result
    except Exception as e:
        traceback.print_exc()
        print(f"Error fetching product data: {e}")
        return None
    

async def create_invoice_fm(payload):
    try:
        token = await get_fm_token()
        url = f"https://apifm.traduoc.vn/api/invoice/create"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        }
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(url, json=payload, headers=headers)
            result = response.json()
            print(f"Create invoice fm: \n", json.dumps(result, indent=4, ensure_ascii=False))
            return result
    except Exception as e:
        traceback.print_exc()
        print(f"Error creating invoice: {e}")
        return None
# asyncio.run(get_product("FX/TP-CC03-100/KR")) 

# asyncio.run(get_product()) 


