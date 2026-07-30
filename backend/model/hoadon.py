
import asyncio
import subprocess
import json
import mimetypes
import os
import pprint
import re
import sys
import traceback
from typing import Dict, List, Optional
import pandas as pd
import pytz
from requests_toolbelt.multipart.encoder import MultipartEncoder
import requests
import qrcode
from model.createQR import make_zalo_qr

from urllib.parse import urlencode
from database import conn
from database import conn_fm
from psycopg import sql
from utils.security import get_google_sheet
from datetime import date, datetime, time, timedelta
from tabulate import tabulate
import gspread
from oauth2client.service_account import ServiceAccountCredentials
import matplotlib.pyplot as plt
import matplotlib.ticker as mtick
import numpy as np
import os
from sockets import sio, NAMESPACE_INVOICE
import httpx



base_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
file_path1 = os.path.join(base_dir, "testns01-9a804bc591cc.json")
file_path2 = os.path.join(base_dir, "hoadon-461206-23b8550fd085.json")

# ===== CACHING SYSTEM =====
class SheetCache:
    """Cache for Google Sheets data with expiration"""
    def __init__(self, ttl_seconds=3600):
        self.cache = {}
        self.ttl = ttl_seconds
        self.timestamps = {}
    
    def get(self, key):
        if key in self.cache:
            elapsed = (datetime.now() - self.timestamps[key]).total_seconds()
            if elapsed < self.ttl:
                return self.cache[key]
        return None
    
    def set(self, key, value):
        self.cache[key] = value
        self.timestamps[key] = datetime.now()
    
    def clear_expired(self):
        expired_keys = [k for k, ts in self.timestamps.items() 
                       if (datetime.now() - ts).total_seconds() >= self.ttl]
        for key in expired_keys:
            del self.cache[key]
            del self.timestamps[key]

sheet_cache = SheetCache(ttl_seconds=3600)  # 1 hour cache

async def async_sleep(seconds):
    """Async sleep to add delay between API calls"""
    await asyncio.sleep(seconds)

def get_google_sheet1(sheet_name, namesheet):
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    keyapi = ServiceAccountCredentials.from_json_keyfile_name(file_path1, scope)
    client = gspread.authorize(keyapi)
    sheet = client.open(sheet_name).worksheet(namesheet)
    return sheet

def get_google_sheet2(sheet_name, namesheet):
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    keyapi = ServiceAccountCredentials.from_json_keyfile_name(file_path2, scope)
    client = gspread.authorize(keyapi)
    sheet = client.open(sheet_name).worksheet(namesheet)
    return sheet

async def get_sheet_data_with_retry(sheet, range_str, max_retries=3, initial_delay=2):
    """
    Get data from sheet with retry logic and exponential backoff
    """
    import time
    delay = initial_delay
    for attempt in range(max_retries):
        try:
            data = sheet.get(range_str)
            return data
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"⚠️  Lỗi lấy {range_str}, thử lại trong {delay}s... (Lần {attempt + 1}/{max_retries})")
                await async_sleep(delay)
                delay *= 2  # Exponential backoff
            else:
                print(f"❌ Lỗi khi lấy {range_str}: {str(e)}")
                return []

async def load_sheet_data_batchwise(sheet_name, operations):
    """
    Load multiple ranges from a sheet with delays between operations
    operations: list of (sheet_obj, range_str, key_name) tuples
    Returns: dict with key_name as keys
    """
    results = {}
    for i, (sheet_obj, range_str, key_name) in enumerate(operations):
        # Add delay between requests (except first one)
        if i > 0:
            await async_sleep(0.5)
        
        cache_key = f"{sheet_name}_{key_name}"
        cached_data = sheet_cache.get(cache_key)
        
        if cached_data:
            print(f"✅ Lấy từ cache: {key_name}")
            results[key_name] = cached_data
        else:
            data = await get_sheet_data_with_retry(sheet_obj, range_str)
            sheet_cache.set(cache_key, data)
            results[key_name] = data
    
    return results

# ===== LAZY LOADING SYSTEM =====
# Initialize as None - will be loaded on first use
_sheet_data = {
    'shop': None,
    'marketing': None,
    'maqt': None,
    'giaqt': None,
    'tenqt': None,
    'tiktok_shop_nguondon': None,
    'tiktok_shop_ma_hoadon': None,
    'tiktok_shop_sdt': None,
    'tiktok_shop_tinh': None,
    'tiktok_shop_diachi': None,
    'tiktok_shop_tenkh': None,
    'tiktok_shop_nguondon_t5': None,
    'tiktok_shop_ma_hoadon_t5': None,
    'tiktok_shop_sdt_t5': None,
    'tiktok_shop_tinh_t5': None,
    'tiktok_shop_diachi_t5': None,
    'tiktok_shop_tenkh_t5': None,
    'dealsoc': None,
    'sheet_hoadon_best': None,
    'data_sanpham': None,
}

_load_lock = asyncio.Lock()

async def init_sheet_data():
    """Initialize all sheet data on first use"""
    global _sheet_data
    
    async with _load_lock:
        # Check if already loaded
        if _sheet_data['shop'] is not None:
            return
        
        print("📥 Đang tải dữ liệu từ Google Sheets...")
        
        try:
            # Get sheets
            sheet_thuong_shop = get_google_sheet1("Đầu vào Bảng thưởng", "Bảng thưởng cho Sàn/Shop")
            sheet_quatang = get_google_sheet1("Đầu vào Bảng thưởng", "Quà tặng")
            sheet_dealsoc = get_google_sheet1("Đầu vào Bảng thưởng", "Deal sốc")
            sheet_tiktok_shop = get_google_sheet1("Đầu vào Bảng thưởng", "TikokShop_T12")
            sheet_tiktok_shop_t5 = get_google_sheet1("Đầu vào Bảng thưởng", "TikokShop_T11")
            sheet_sanpham = get_google_sheet1("Đầu vào Bảng thưởng", "Danh sách SKU chính sách mới")
            
            # Load data with batching and delays
            print("📤 Tải Bảng thưởng cho Sàn/Shop...")
            _sheet_data['shop'] = sheet_thuong_shop.get("B3:F")
            await async_sleep(0.5)
            
            print("📤 Tải Bảng thưởng cho MARKETING/CSKH...")
            sheet_thuong_marketing = get_google_sheet1("Đầu vào Bảng thưởng", "Bảng thưởng cho MARKETING/CSKH")
            _sheet_data['marketing'] = sheet_thuong_marketing.get("B3:H")
            await async_sleep(0.5)
            
            print("📤 Tải Quà tặng...")
            _sheet_data['maqt'] = sheet_quatang.get("A1:A")
            await async_sleep(0.3)
            _sheet_data['giaqt'] = sheet_quatang.get("D1:D")
            await async_sleep(0.3)
            _sheet_data['tenqt'] = sheet_quatang.get("B1:B")
            await async_sleep(0.5)
            
            print("📤 Tải Deal sốc...")
            _sheet_data['dealsoc'] = sheet_dealsoc.get("B2:M")
            await async_sleep(0.5)
            
            # Load TikTok Shop T12
            try:
                print("📤 Tải TikTok Shop T12...")
                tiktok_shop = sheet_tiktok_shop.get("A4:AS")
                _sheet_data['tiktok_shop_nguondon'] = [row[0] for row in tiktok_shop] if tiktok_shop else []
                _sheet_data['tiktok_shop_ma_hoadon'] = [row[1] for row in tiktok_shop] if tiktok_shop else []
                _sheet_data['tiktok_shop_sdt'] = [row[40] for row in tiktok_shop if len(row) > 40] if tiktok_shop else []
                _sheet_data['tiktok_shop_tinh'] = [row[41] for row in tiktok_shop if len(row) > 41] if tiktok_shop else []
                _sheet_data['tiktok_shop_diachi'] = [row[43] if len(row) > 43 else "" for row in tiktok_shop] if tiktok_shop else []
                _sheet_data['tiktok_shop_tenkh'] = [row[44] if len(row) > 44 else "" for row in tiktok_shop] if tiktok_shop else []
            except Exception as e:
                print(f"⚠️  Warning: Không thể tải dữ liệu TikokShop_T12: {str(e)}")
                _sheet_data['tiktok_shop_nguondon'] = []
                _sheet_data['tiktok_shop_ma_hoadon'] = []
                _sheet_data['tiktok_shop_sdt'] = []
                _sheet_data['tiktok_shop_tinh'] = []
                _sheet_data['tiktok_shop_diachi'] = []
                _sheet_data['tiktok_shop_tenkh'] = []
            
            await async_sleep(0.5)
            
            # Load TikTok Shop T11
            try:
                print("📤 Tải TikTok Shop T11...")
                tiktok_shop_t5 = sheet_tiktok_shop_t5.get("A4:AS")
                _sheet_data['tiktok_shop_nguondon_t5'] = [row[0] for row in tiktok_shop_t5] if tiktok_shop_t5 else []
                _sheet_data['tiktok_shop_ma_hoadon_t5'] = [row[1] for row in tiktok_shop_t5] if tiktok_shop_t5 else []
                _sheet_data['tiktok_shop_sdt_t5'] = [row[40] for row in tiktok_shop_t5 if len(row) > 40] if tiktok_shop_t5 else []
                _sheet_data['tiktok_shop_tinh_t5'] = [row[41] for row in tiktok_shop_t5 if len(row) > 41] if tiktok_shop_t5 else []
                _sheet_data['tiktok_shop_diachi_t5'] = [row[43] if len(row) > 43 else "" for row in tiktok_shop_t5] if tiktok_shop_t5 else []
                _sheet_data['tiktok_shop_tenkh_t5'] = [row[44] if len(row) > 44 else "" for row in tiktok_shop_t5] if tiktok_shop_t5 else []
            except Exception as e:
                print(f"⚠️  Warning: Không thể tải dữ liệu TikokShop_T11: {str(e)}")
                _sheet_data['tiktok_shop_nguondon_t5'] = []
                _sheet_data['tiktok_shop_ma_hoadon_t5'] = []
                _sheet_data['tiktok_shop_sdt_t5'] = []
                _sheet_data['tiktok_shop_tinh_t5'] = []
                _sheet_data['tiktok_shop_diachi_t5'] = []
                _sheet_data['tiktok_shop_tenkh_t5'] = []
            
            await async_sleep(0.5)
            
            # Load Sheet Hóa Đơn
            try:
                print("📤 Tải Sheet Đơn Hoàn...")
                _sheet_data['sheet_hoadon_best'] = get_google_sheet2("Đơn Hoàn", "ĐH hoàn")
            except Exception as e:
                print(f"⚠️  Warning: Không thể tải dữ liệu Đơn Hoàn: {str(e)}")
                _sheet_data['sheet_hoadon_best'] = None
            
            await async_sleep(0.5)
            
            # Load Sản phẩm
            try:
                print("📤 Tải Danh sách SKU...")
                _sheet_data['data_sanpham'] = sheet_sanpham.get_all_values()[1:]
            except Exception as e:
                print(f"⚠️  Warning: Không thể tải dữ liệu Danh sách SKU: {str(e)}")
                _sheet_data['data_sanpham'] = []
        
        except Exception as e:
            print(f"❌ Lỗi khi tải dữ liệu: {str(e)}")

# Create getter functions for lazy loading
def get_shop():
    if _sheet_data['shop'] is None:
        asyncio.run(init_sheet_data())
    return _sheet_data['shop'] or []

def get_marketing():
    if _sheet_data['marketing'] is None:
        asyncio.run(init_sheet_data())
    return _sheet_data['marketing'] or []

def get_maqt():
    if _sheet_data['maqt'] is None:
        asyncio.run(init_sheet_data())
    return _sheet_data['maqt'] or []

def get_giaqt():
    if _sheet_data['giaqt'] is None:
        asyncio.run(init_sheet_data())
    return _sheet_data['giaqt'] or []

def get_tenqt():
    if _sheet_data['tenqt'] is None:
        asyncio.run(init_sheet_data())
    return _sheet_data['tenqt'] or []

def get_tiktok_shop_data():
    if _sheet_data['tiktok_shop_nguondon'] is None:
        asyncio.run(init_sheet_data())
    return {
        'nguondon': _sheet_data['tiktok_shop_nguondon'] or [],
        'ma_hoadon': _sheet_data['tiktok_shop_ma_hoadon'] or [],
        'sdt': _sheet_data['tiktok_shop_sdt'] or [],
        'tinh': _sheet_data['tiktok_shop_tinh'] or [],
        'diachi': _sheet_data['tiktok_shop_diachi'] or [],
        'tenkh': _sheet_data['tiktok_shop_tenkh'] or [],
    }

def get_tiktok_shop_data_t5():
    if _sheet_data['tiktok_shop_nguondon_t5'] is None:
        asyncio.run(init_sheet_data())
    return {
        'nguondon': _sheet_data['tiktok_shop_nguondon_t5'] or [],
        'ma_hoadon': _sheet_data['tiktok_shop_ma_hoadon_t5'] or [],
        'sdt': _sheet_data['tiktok_shop_sdt_t5'] or [],
        'tinh': _sheet_data['tiktok_shop_tinh_t5'] or [],
        'diachi': _sheet_data['tiktok_shop_diachi_t5'] or [],
        'tenkh': _sheet_data['tiktok_shop_tenkh_t5'] or [],
    }

def get_dealsoc():
    if _sheet_data['dealsoc'] is None:
        asyncio.run(init_sheet_data())
    return _sheet_data['dealsoc'] or []

def get_sheet_hoadon_best():
    if _sheet_data['sheet_hoadon_best'] is None:
        asyncio.run(init_sheet_data())
    return _sheet_data['sheet_hoadon_best']

def get_data_sanpham():
    if _sheet_data['data_sanpham'] is None:
        asyncio.run(init_sheet_data())
    return _sheet_data['data_sanpham'] or []

# Lazy loading wrapper class for list-like objects
class _LazyVar:
    def __init__(self, key):
        self.key = key
    
    def __iter__(self):
        return iter(self._get_data())
    
    def __len__(self):
        data = self._get_data()
        return len(data) if data else 0
    
    def __getitem__(self, index):
        return self._get_data()[index]
    
    def __contains__(self, item):
        data = self._get_data()
        return data and item in data
    
    def _get_data(self):
        if _sheet_data[self.key] is None:
            try:
                asyncio.run(init_sheet_data())
            except RuntimeError:
                pass  # Event loop already running
        return _sheet_data[self.key] or []

# Module-level lazy variables
shop = _LazyVar('shop')
marketing = _LazyVar('marketing')
maqt = _LazyVar('maqt')
giaqt = _LazyVar('giaqt')
tenqt = _LazyVar('tenqt')
tiktok_shop_nguondon = _LazyVar('tiktok_shop_nguondon')
tiktok_shop_ma_hoadon = _LazyVar('tiktok_shop_ma_hoadon')
tiktok_shop_sdt = _LazyVar('tiktok_shop_sdt')
tiktok_shop_tinh = _LazyVar('tiktok_shop_tinh')
tiktok_shop_diachi = _LazyVar('tiktok_shop_diachi')
tiktok_shop_tenkh = _LazyVar('tiktok_shop_tenkh')
tiktok_shop_nguondon_t5 = _LazyVar('tiktok_shop_nguondon_t5')
tiktok_shop_ma_hoadon_t5 = _LazyVar('tiktok_shop_ma_hoadon_t5')
tiktok_shop_sdt_t5 = _LazyVar('tiktok_shop_sdt_t5')
tiktok_shop_tinh_t5 = _LazyVar('tiktok_shop_tinh_t5')
tiktok_shop_diachi_t5 = _LazyVar('tiktok_shop_diachi_t5')
tiktok_shop_tenkh_t5 = _LazyVar('tiktok_shop_tenkh_t5')
dealsoc = _LazyVar('dealsoc')
data_sanpham = _LazyVar('data_sanpham')

# Special lazy wrapper for sheet object
class _LazySheet:
    def _get_sheet(self):
        if _sheet_data['sheet_hoadon_best'] is None:
            try:
                asyncio.run(init_sheet_data())
            except RuntimeError:
                return None
        return _sheet_data['sheet_hoadon_best']
    
    def __getattr__(self, name):
        sheet = self._get_sheet()
        if sheet is None:
            raise ValueError("Sheet 'sheet_hoadon_best' not loaded")
        return getattr(sheet, name)

sheet_hoadon_best = _LazySheet()


# xử lí lấy hóa đơn trên gg sheet để đối soát
# sheet_hoadon_best = get_google_sheet2("ĐỐI SOÁT ĐƠN HÀNG BEST", "Hóa đơn best")

# async def update_hoadon_best(hoadon_vao):
#     hoa_don_sheet = sheet_hoadon_best.get("A2:L")
#     hoadon_values = [row for row in hoa_don_sheet if row]  # Bỏ dòng rỗng

#     # Tạo dict: ma_hd -> (index, row)
#     mahd_dict = {
#         row[2]: (i, row) for i, row in enumerate(hoadon_values, start=2)
#         if len(row) > 2
#     }

#     try:
#         ma_hd = hoadon_vao[2]  # Lấy ma_hd từ cột thứ 3 trong hoadon_vao (index 2)

#         if ma_hd in mahd_dict:
#             row_index = mahd_dict[ma_hd][0]
#             print(f"♻️ Cập nhật hóa đơn tại dòng {row_index}")
#             # update yêu cầu một danh sách 2D
#             sheet_hoadon_best.update(f"A{row_index}:L{row_index}", [hoadon_vao], value_input_option="USER_ENTERED")
#         else:
#             print("➕ Thêm hóa đơn mới vào sheet")
#             # append_rows cũng cần danh sách 2D
#             sheet_hoadon_best.append_rows([hoadon_vao], value_input_option="USER_ENTERED")

#     except Exception as e:
#         print(f"❌ Lỗi khi xử lý hóa đơn {ma_hd}: {e}")

async def update_hoadon_hoan(hoadon_vao):
    hoa_don_sheet = sheet_hoadon_best.get("B2:I")
    hoadon_values = [row for row in hoa_don_sheet if row]  # Bỏ dòng rỗng

    # Tạo dict: ma_hd -> (index, row)
    mahd_dict = {
        row[0]: (i, row) for i, row in enumerate(hoadon_values, start=2)
        if len(row) > 2
    }

    try:
        ma_hd = hoadon_vao[2]  # Lấy ma_hd từ cột thứ 3 trong hoadon_vao (index 2)

        if ma_hd in mahd_dict:
            row_index = mahd_dict[ma_hd][0]
            print(f"♻️ Cập nhật hóa đơn tại dòng {row_index}")
            # update yêu cầu một danh sách 2D
            sheet_hoadon_best.update(f"B{row_index}:I{row_index}", [hoadon_vao], value_input_option="USER_ENTERED")
        else:
            print("➕ Thêm hóa đơn mới vào sheet")
            last_row_index = len(sheet_hoadon_best.get_all_values()) + 1
            stt = last_row_index - 1
            row_data = [stt] + hoadon_vao
            sheet_hoadon_best.update(f"A{last_row_index}:I{last_row_index}", [row_data], value_input_option="USER_ENTERED")

    except Exception as e:
        print(f"❌ Lỗi khi xử lý hóa đơn {ma_hd}: {e}")

# get token kiotviet
async def gettoken():
    login_url = "https://api-man1.kiotviet.vn/api/account/login?quan-ly=true"
    payload = {
        "FingerPrintKey": "211d1f5bb8cc08a94863d2291f1c866d_Chrome_Desktop_Máy tính Windows",
        "IsManageSide": True,
        "model": {
            "RememberMe": True,
            "ShowCaptcha": False,
            "UserName": "Canhan_0941871593",
            "Password": "TraDuocVN@2025"
        },
        "Language": "vi-VN",
        "LatestBranchId": 287170
    }

    headers = {
        "content-Type": "application/json",
        'retailer': 'trafvietnam',
    }

    # Gửi request đăng nhập
    response = requests.post(login_url, json=payload, headers=headers)

    if response.status_code == 200:
        token_data = response.json()
        access_token ="Bearer "+ token_data.get("token")  # Kiểm tra key token trong response thực tế
        # print("Access Token:", access_token)
        # # đọc file data
        # with open("datagd.json", "r") as file:
        #     data = json.load(file)
        # data["datatoken"]["token"] = access_token
        # # Ghi lại dữ liệu đã cập nhật vào tệp JSON
        # with open("datagd.json", "w") as file:
        #     json.dump(data, file, indent=4)  # Ghi với format đẹp (indent=4)
        return access_token
    else:
        print("Lỗi khi đăng nhập:", response.text)

async def time_giao_hang(id):
    token = await gettoken()
    # id = 194785875
    url = f"https://api-man1.kiotviet.vn/api/deliverytracking?InvoiceId={id}&format=json&%24inlinecount=allpages"

    headers = {
        "Retailer": "trafvietnam",
        "Authorization": f"{token}",
        "Content-Type": "application/json",
    }
    response = requests.get(url, headers=headers)

    data = response.json()
    # print(json.dumps(data, indent=4, ensure_ascii=False))
    if data.get("Data", []):
        for node in data.get("Data", []):
            if node["StatusValue"] == "Đã lấy hàng":
                thoi_gian_capnhat = node["CreatedDate"]
                thoi_gian_capnhat = thoi_gian_capnhat.replace("T", " ").split(".")[0]
                thoi_gian_capnhat = datetime.strptime(thoi_gian_capnhat, "%Y-%m-%d %H:%M:%S")
                # print(thoi_gian_capnhat)
                return thoi_gian_capnhat.strftime("%Y-%m-%d %H:%M:%S")

# get token hrm
async def get_token():
    url = "https://test.traduocvietnam.com/api/login"
    payload = {"username": "supleader", "password": "123"}

    headers = {
        "content-Type": "application/json",
        "server": "uvicorn",
    }

    response = requests.post(url, headers=headers, json=payload)

    if response.status_code == 200:
        data = response.json()

        if "access_token" in data:
            token = data["token_type"] + " " + data["access_token"]
            # print(token)
            return token

        else:
            print("Không tìm thấy khóa 'token' trong phản hồi:", data)
            return None
    else:
        print("Lỗi đăng nhập:", response.status_code, response.text)
        return None

async def put_lichsu_dt(data):
    print(data)
    # token = await get_token()
    # url = "https://75380fb40aa7.ngrok-free.app/api/deal_soc"
    url = "https://hrm.traduocvietnam.com/api/deal_soc"

    # heders = {
    #     "Authorization": token,

    # }

    # data = {
    #     "nguoi_ban": "Trịnh Ngọc Dương",
    #     "nguoi_ban_f0": "Nhung",
    #     "ma_hoa_don": "text",
    #     "loai_gd": 1,
    #     "trang_thai": 'Lên đơn',
    #     "ngay_giao_dich_dt": datetime.now().isoformat(),
    #     "ngay_cap_nhat_gd_dt": datetime.now().isoformat(),
    #     "thuong_san_shop": 1000,
    #     "thuong_marketing": 1000,
    #     "thuong_nguoi_ban_f0": 1000,
    #     "thuong_nguoi_ban": 1000,
    #     "nguon_don_f0": "jhduhsi",
    #     "tong_tien": "int",
    #     "kenh_ban": "test",
    # }


    response = requests.post(url, json=data)
    data_get = response.json()
    # # print(data_get)

async def sua_masp(masp):
    if "/VP" in masp:
        return masp.replace("/VP", "/TP")
    elif "FX-" in masp:
        return masp.replace("FX-", "FX/TP-")
    else:
        return masp


async def lich_su_mua(sdt):
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM hoa_don WHERE sdt = %s ORDER BY thoi_gian DESC", (sdt,))
            hoadon = cur.fetchall()
            # Chuyển đổi thành danh sách dictionary
            if not hoadon:  # Kiểm tra nếu kết quả rỗng
                return {"message": "Không có dữ liệu khách hàng"}
            columns = [desc[0] for desc in cur.description]
            hoadon_list = [dict(zip(columns, row)) for row in hoadon]
            # print(hoadon_list)
            return hoadon_list  # Trả về danh sách thay vì set
    except Exception as e:
        print(f"❌ Lỗi khi lấy dữ liệu hóa đơn: {str(e)}")

# nhìn không ổn
async def bao_cao_theo_nguoi_ban(thoi_gian_tao):
    try:
        from_time, to_time = thoi_gian_tao[0], thoi_gian_tao[1]
        with conn.cursor() as cur:

            sql = """
                WITH kh_nhansu AS (
                    SELECT 
                        id_acc,
                        COUNT(DISTINCT sdt1) AS tong_kh
                    FROM khach_hang
                    WHERE thoi_gian_tao <= %s AND nhom_kh ILIKE '%%FT%%'
                    GROUP BY id_acc
                ),
                kh_rank_aov AS (
                    SELECT 
                        kh.*,
                        NTILE(5) OVER (PARTITION BY kh.id_acc ORDER BY kh.tan_suat_mua ASC NULLS LAST) AS percentile_tile1
                    FROM khach_hang kh
                    WHERE tan_suat_mua IS NOT NULL AND tan_suat_mua <> 0.0
                ),
                kh_rank_tsm AS (
                    SELECT 
                        kh.*,
                        NTILE(5) OVER (PARTITION BY kh.id_acc ORDER BY kh.tan_suat_mua ASC NULLS LAST) AS percentile_tile1
                    FROM khach_hang kh
                    WHERE tan_suat_mua IS NOT NULL AND tan_suat_mua <> 0.0
                ),
                ft_co_don AS (
                    SELECT
                        kh.id_acc,
                        COUNT(DISTINCT kh.sdt1) AS kh_co_don,
                        ARRAY_AGG(kh.sdt1) AS danh_sach_kh_co_don,
                        COUNT(*) FILTER (WHERE kh.gioi_tinh ILIKE 'nam') AS so_nam,
                        COUNT(*) FILTER (WHERE kh.gioi_tinh ILIKE 'nữ') AS so_nu,
                        COUNT(*) FILTER (WHERE kh.gioi_tinh NOT ILIKE 'nam' AND kh.gioi_tinh NOT ILIKE 'nữ') AS so_khac,
                        COUNT(*) FILTER (WHERE kh.nhom_kh ILIKE '%%A%%') AS nhomA,
                        COUNT(*) FILTER (WHERE kh.nhom_kh ILIKE '%%B%%') AS nhomB
                        
                    FROM (
                        SELECT DISTINCT 
                            kh.id_acc, 
                            kh.sdt1, 
                            kh.gioi_tinh, 
                            kh.nhom_kh
                            
                        FROM khach_hang kh
                        JOIN hoa_don hd ON (hd.sdt = kh.sdt1 OR NULLIF(kh.sdt2, '') = hd.sdt)
                        WHERE hd.thoi_gian BETWEEN %s AND %s
                        AND (hd.id_acc = kh.id_acc OR kh.id_acc = 10)
                        -- AND kh.nhom_kh ILIKE '%%FT%%'
                        AND hd.nguon_ban IN ('CSKH')
                        AND hd.trang_thai NOT IN ('Đã hủy', 'Đã chuyển hoàn', 'Đang chuyển hoàn')
                    ) kh
                    GROUP BY kh.id_acc
                ),

                hoa_don_agg AS (
                    SELECT 
                        hd.id_acc,
                        hd.nguoi_ban_format,
                        COUNT(*) AS tong_hoa_don,
                        SUM(hd.tong_tien) AS gmv,
                        ROUND(SUM(hd.tong_tien) / NULLIF(COUNT(*), 0), 0) AS aov

                    FROM hoa_don hd
                    JOIN khach_hang kh ON (kh.sdt1 = hd.sdt OR (kh.sdt2 <> '' AND kh.sdt2 = hd.sdt)) AND (hd.id_acc = kh.id_acc OR kh.id_acc = 10)
                    WHERE hd.thoi_gian BETWEEN %s AND %s
                    AND hd.trang_thai NOT IN ('Đã hủy', 'Đã chuyển hoàn', 'Đang chuyển hoàn')
                    AND hd.nguon_ban IN ('CSKH')
                    GROUP BY hd.id_acc, hd.nguoi_ban_format
                ),

                don_hang_ngoai AS (
                    SELECT 
                        hd.id_acc,
                        COUNT(*) AS so_don_ngoai,
                        SUM(hd.tong_tien) AS gmv,
                        ARRAY_AGG(CONCAT(hd.ma_hd, ' - ', hd.sdt)) AS danh_sach_ma_hd
                    FROM hoa_don hd
                    LEFT JOIN khach_hang kh 
                        ON (kh.sdt1 = hd.sdt OR kh.sdt2 = hd.sdt) 
                        AND (hd.id_acc = kh.id_acc OR kh.id_acc = 10)
                    WHERE hd.thoi_gian BETWEEN %s AND %s
                    AND hd.trang_thai NOT IN ('Đã hủy', 'Đã chuyển hoàn', 'Đang chuyển hoàn')
                    AND hd.nguon_ban IN ('CSKH')
                    AND kh.id_acc IS NULL  -- ← CHỈ LẤY HÓA ĐƠN KHÔNG GHÉP ĐƯỢC KHÁCH
                    GROUP BY hd.id_acc
                )

                SELECT 
                    hda.nguoi_ban_format,
                    hda.id_acc,
                    hda.tong_hoa_don,
                    COALESCE(hda.tong_hoa_don, 0) + COALESCE(dhn.so_don_ngoai, 0) AS tong_hoa_don_all,
                    hda.gmv,
                    hda.aov,
                    COALESCE(hda.gmv, 0) + COALESCE(dhn.gmv, 0) AS tong_gmv,
                    ROUND(
                        (COALESCE(hda.gmv, 0) + COALESCE(dhn.gmv, 0)) / 
                        NULLIF(COALESCE(hda.tong_hoa_don, 0) + COALESCE(dhn.so_don_ngoai, 0), 0)
                    ) AS tong_aov,
                    COALESCE(kfa.tong_kh, 0) AS tong_kh,
                    COALESCE(kfcd.kh_co_don, 0) AS kh_co_don,
                    ROUND(
                        COALESCE(kfcd.kh_co_don, 0) * 100.0 / NULLIF(COALESCE(kfa.tong_kh, 0), 0),
                        2
                    ) AS ti_le_chuyen_doi,
                    COALESCE(dhn.so_don_ngoai, 0) AS so_don_ngoai,
                    COALESCE(dhn.danh_sach_ma_hd, ARRAY[]::text[]) AS danh_sach_ma_hd,
                    COALESCE(kfcd.danh_sach_kh_co_don, ARRAY[]::text[]) AS danh_sach_kh_co_don,
                    kfcd.so_nam,
                    kfcd.so_nu,
                    kfcd.so_khac,
                    kfcd.nhomA,
                    kfcd.nhomB
                FROM hoa_don_agg hda
                LEFT JOIN kh_nhansu kfa ON kfa.id_acc = hda.id_acc
                LEFT JOIN ft_co_don kfcd ON kfcd.id_acc = hda.id_acc
                LEFT JOIN don_hang_ngoai dhn ON dhn.id_acc = hda.id_acc
            """
            cur.execute(sql, (from_time, from_time, to_time, from_time, to_time, from_time, to_time))
            rows1 = cur.fetchall()
            if not rows1:
                return []

            columns = [desc[0] for desc in cur.description]
            ket_qua = [dict(zip(columns, row)) for row in rows1]
    
            san_pham = await bao_cao_sanpham_cskh(from_time, to_time)
            kh = await bao_cao_kh_cskh(from_time, to_time)
            return {
                "tong_theo_nhan_su": ket_qua,
                "san_pham": san_pham,
                "khach_hang": kh
            }
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi truy vấn báo cáo theo người bán: {str(e)}")

async def bao_cao_sanpham_cskh(from_time, to_time):
    try:
        
        with conn.cursor() as cur:
            sql = """
                WITH hoa_don_loc AS (
                    SELECT *
                    FROM hoa_don_tinh_thuong hd
                    WHERE hd.thoi_gian BETWEEN %s AND %s
                    AND hd.nguon_ban NOT IN ('FACEBOOK', 'TIKTOK LANDING', 'HOTLINE-TIKTOK LANDING', 'FACEBOOK - PANCAKE', 'WEBSITE', 'GỬI BÙ', 'Đổi Hàng')
                    AND hd.nguon_ban NOT ILIKE '%%TIKTOK%%'
                    AND hd.nguon_ban NOT ILIKE '%%Mộc Tâm Trà%%'
                    AND hd.nguon_ban NOT ILIKE '%%TRAF OFFICIAL - TRÀ VIỆT NAM%%'
                    AND hd.nguon_ban NOT ILIKE '%%ZALO OA%%'
                    AND hd.trang_thai NOT IN ('Đã hủy', 'Đã chuyển hoàn', 'Đang chuyển hoàn')
                ),

                sp_tach AS (
                    SELECT 
                        hd.ma_hd,
                        hd.sdt,
                        hd.ma_sanpham,
                        hd.ten_sanpham,
                        hd.so_luong,
                        hd.tong_tien,
                        
                        -- Tách mã sản phẩm chuẩn (bỏ x5 nếu có)
                        CASE 
                            WHEN POSITION('x' IN hd.ma_sanpham) > 0 THEN 
                                LEFT(hd.ma_sanpham, POSITION('x' IN hd.ma_sanpham) - 1)
                            ELSE hd.ma_sanpham
                        END AS ten_san_pham_rut_gon,

                        -- Tách hệ số nhân
                        CASE 
                            WHEN POSITION('x' IN hd.ma_sanpham) > 0 THEN 
                                CAST(SUBSTRING(hd.ma_sanpham FROM POSITION('x' IN hd.ma_sanpham) + 1) AS INTEGER)
                            ELSE 1
                        END AS he_so_nhan
                    FROM hoa_don_loc hd
                ),

                sp_tinh_toan AS (
                    SELECT
                        ten_san_pham_rut_gon AS ma_san_pham,
                        ten_sanpham,
                        sdt,
                        so_luong * he_so_nhan AS tong_so_luong,
                        tong_tien
                    FROM sp_tach
                )

                SELECT
                    ma_san_pham,
                    ten_sanpham,
                    COUNT(DISTINCT sdt) AS so_khach_mua,
                    SUM(tong_so_luong) AS tong_san_pham_ban,
                    SUM(tong_tien) AS tong_doanh_thu
                FROM sp_tinh_toan
                GROUP BY ma_san_pham, ten_sanpham
                ORDER BY tong_doanh_thu DESC;

            """
            cur.execute(sql, (from_time, to_time))
            rows1 = cur.fetchall()
            if not rows1:
                return []

            columns = [desc[0] for desc in cur.description]
            ket_qua = [dict(zip(columns, row)) for row in rows1]
            return ket_qua
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi truy vấn báo cáo theo sản phẩm: {str(e)}")
    

async def bao_cao_kh_cskh(from_time, to_time):
    try:
        
        with conn.cursor() as cur:
            sql = """
                SELECT 
                    split_part(hd.tinh, ' - ', 1) AS ten_tinh,
                    COUNT(DISTINCT hd.sdt) AS so_kh
                FROM hoa_don hd
                WHERE hd.thoi_gian BETWEEN %s AND %s
                AND hd.nguon_ban NOT IN ('FACEBOOK', 'TIKTOK LANDING', 'HOTLINE-TIKTOK LANDING', 'FACEBOOK - PANCAKE', 'WEBSITE', 'GỬI BÙ', 'Đổi Hàng')
                AND hd.nguon_ban NOT ILIKE '%%TIKTOK%%'
                AND hd.nguon_ban NOT ILIKE '%%Mộc Tâm Trà%%'
                AND hd.nguon_ban NOT ILIKE '%%TRAF OFFICIAL - TRÀ VIỆT NAM%%'
                AND hd.nguon_ban NOT ILIKE '%%ZALO OA%%'
                AND hd.nguon_ban NOT ILIKE '%%TRAF - TRÀ VIỆT NAM%%'
                AND hd.trang_thai NOT IN ('Đã hủy', 'Đã chuyển hoàn', 'Đang chuyển hoàn')
                GROUP BY ten_tinh
                ORDER BY so_kh DESC;

            """
            cur.execute(sql, (from_time, to_time))
            rows1 = cur.fetchall()
            if not rows1:
                return []

            columns = [desc[0] for desc in cur.description]
            ket_qua = [dict(zip(columns, row)) for row in rows1]
            return ket_qua
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi truy vấn báo cáo theo khách hàng: {str(e)}")

# thoi_gian_tao = ['2025-05-01 00:00:00', '2025-05-16 23:59:59']
# bao_cao_theo_nguoi_ban(thoi_gian_tao)

async def get_hoadon_thuong(ngay):
    try:
        with conn.cursor() as cur:
            sql = """
                SELECT * FROM hoa_don_tinh_thuong WHERE DATE(thoi_gian) = %s AND trang_thai NOT IN ('Đã hủy', 'Đã chuyển hoàn', 'Đang chuyển hoàn')
            """
            cur.execute(sql, (ngay,))
            rows = cur.fetchall()
            if not rows:
                return {"message": "Không có hóa đơn trong ngày này"}

            columns = [desc[0] for desc in cur.description]
            hoadon = [dict(zip(columns, row)) for row in rows]

            
    except Exception as e:
        print(f"❌ Lỗi khi truy vấn: {str(e)}")


async def send_lark_message(data):
    # url = "https://open.larksuite.com/open-apis/bot/v2/hook/b8315135-cc23-4414-8186-4f254578650e" # bot test
    url = "https://open.larksuite.com/open-apis/bot/v2/hook/84322862-0573-477e-bb82-e45b8bbd4cd7"   #bot that
     
    USER_A_ID = "ou_9ecb1e27b71ddc04a01b9da1ad66ba6d"  # ID anh phương
    USER_B_ID = "ou_6d761d8d04d9df74276a441d67498475"  # ID chị thủy
    USER_C_ID = "ou_9c6d1c89985cde6113b38e0950a4accd"

    body_text = (
        f"**{data['don_hang_moi']}**\n"
        f"**- Kênh:** {data['kenh']}\n"
        f"**- Người bán:** {data['nguoi_ban']}\n"
        f"**- Sản phẩm:** \n{data['san_pham']}\n"
        f"**- Số hóa đơn:** {data['ma_hoa_don']}\n"
        f"**- Trạng thái:** {data['trang_thai']}"
    )
    tag_ten = ()
    # ✅ Chỉ tag khi có chữ "ghi chú" trong trạng thái
    if "Ghi chú" in data["trang_thai"] or data["trang_thai"] == "Đã hủy":
        tag_ten = (
            f"\n<at id=\"{USER_A_ID}\">Anh Phương</at> "
            f"<at id=\"{USER_B_ID}\">Chị Thủy</at>"
            f"<at id=\"{USER_C_ID}\">ADMIN</at>"
        )
    
    # build phần "elements" cho card
    elements = [
        {
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": body_text
            }
        }
    ]

    # chỉ thêm block mention nếu có
    if tag_ten:
        elements.append({
            "tag": "div",
            "text": {
                "tag": "lark_md",
                "content": tag_ten
            }
        })

    card_payload = {
        "config": {
            "wide_screen_mode": True
        },
        "header": {
            "title": {
                "tag": "plain_text",
                "content": "THÔNG BÁO ĐƠN HÀNG MỚI"
            }
        },
        "elements": elements
    }

    message = {
        "msg_type": "interactive",
        "card": card_payload
    }
    response = requests.post(url, data=json.dumps(message), headers={'Content-Type': 'application/json'})
    if response.status_code == 200:
        print("Gửi thành công!")
    else:
        print(f"Lỗi: {response.status_code}, {response.text}")

async def tinh_thuong_sp(hoadon):
    # kết nối với các sheet
    ma_dealsoc = [row[0] for row in dealsoc if len(row) > 0] # cột B
    thuong = [row[9] for row in dealsoc if len(row) > 9] # cột K

    # lấy dữ liệu từ sheet shop sàn
    
    ma_shop = [row[0] for row in shop]  # Cột B
    truc_tiep = [row[3] for row in shop]  # Cột E
    gian_tiep = [row[4] for row in shop]  # Cột F

    # lấy dữ liệu từ các sheet sale & marketing
    
    ma_marketing_sale_cskh = [row[0] for row in marketing]  # Cột B
    
    f0_sale_marketing = [row[3] for row in marketing]  # Cột E
    f14_sale_marketing = [row[4] for row in marketing]  # Cột F
    f14_cskh = [row[5] for row in marketing]  # Cột E
    f5n_cskh = [row[6] for row in marketing]  # Cột F

    # lấy dữ liệu tiktok shop
    
    

    dem1 = 0
    dem2 = 0
    
    phanloai_kh = []
    a = True
    thuong_shop = 0
    thuong_marketing = 0
    thuong_sale = 0
    thuong_cskh = 0
    # Khai báo các biến cần dùng
    ma_hoadon = hoadon["ma_hd"]
    sdt_kh = hoadon["sdt"]
    nguoi_ban = hoadon["nguoi_ban"]
    kenh_ban = hoadon["nguon_ban"]
    trang_thai = hoadon["trang_thai"]
    ma_sanpham = hoadon["ma_san_pham"]
    so_luong = hoadon["so_luong"]
    
    thu_khac = hoadon["van_chuyen"]
    pl_khach_hang = hoadon["f_khach_hang"]
    sale_f0 = hoadon["sale_f0"]
    nguondon_f0 = hoadon["nguon_don_f0"]
    check_trung = hoadon["check_trung"]


    #tính thưởng deal sốc
    thuong_value = 0
    for v, ma_ds in enumerate(ma_dealsoc, start=0):
        if ma_hoadon == ma_ds:
            thuong_value = int(thuong[v])
            break
        
    
    if a == True:
        pl_khach_hang = int(pl_khach_hang[1:])
        ma_sanpham = await sua_masp(ma_sanpham)
        match = re.search(r"x(\d+)", ma_sanpham)
        if match:
            so_luong = int(so_luong) * int(match.group(1))
            ma_sanpham = ma_sanpham.split("x", 1)[0]
    
        # tính cho shop, sàn (trực tiếp)
        if kenh_ban == "TRAF OFFICIAL - TRÀ VIỆT NAM":
            for j, roww in enumerate(ma_shop, start=0):
                if roww in ma_sanpham:
                    # tính cho deal sốc
                    if ma_hoadon in ma_dealsoc:
                        thuong_shop = thuong_value
                    # tính thường
                    else:
                        thuong_shop = int(so_luong) * int(truc_tiep[j])
                    break
        elif "TIKTOK SHOP" in kenh_ban or kenh_ban == "TRAF - TRÀ VIỆT NAM":
            for j, roww in enumerate(ma_shop, start=0):
                if roww in ma_sanpham:
                    # tính cho deal sốc
                    if ma_hoadon in ma_dealsoc:
                        thuong_shop = thuong_value
                    # tính thường
                    else:
                        thuong_shop = int(so_luong) * int(truc_tiep[j])
                    break
            
        # tính thưởng cho cskh
        elif kenh_ban == "CSKH":
            for j, roww in enumerate(ma_marketing_sale_cskh, start=0):
                if roww in ma_sanpham:
                    # tính cho deal sốc
                    if ma_hoadon in ma_dealsoc:
                        if sdt_kh in tiktok_shop_sdt: 
                            thuong_shop = thuong_value * 10/100
                            thuong_cskh = thuong_value * 90/100
                        else:
                            if pl_khach_hang == 0 or pl_khach_hang >= 5:
                                thuong_cskh = thuong_value
                                if int(thu_khac) == 20000:
                                    thuong_cskh += 4000
                            elif 1 <= pl_khach_hang <= 4:
                                if nguondon_f0 != "CSKH" and nguondon_f0 != "":
                                    thuong_marketing = thuong_value * 10/100
                                    thuong_sale = thuong_marketing
                                    thuong_cskh = thuong_value * 80/100
                                else:
                                    thuong_cskh = thuong_value
                                if int(thu_khac) == 20000:
                                    thuong_cskh += 5000
                    # tính thường
                    else:
                        if 0 <= pl_khach_hang <= 4:
                            # print(f'{row} - {truc_tiep[j]}')
                            thuong_cskh = int(so_luong) * int(f14_cskh[j])
                            if nguondon_f0 == "FACEBOOK" or nguondon_f0 == "HOTLINE-TIKTOK LANDING" or nguondon_f0 == "TIKTOK LANDING" or nguondon_f0 == "YOUTUBE":
                                thuong_marketing = int(so_luong) * int(f14_sale_marketing[j])
                                thuong_sale = thuong_marketing
                            elif sale_f0 != "" and nguondon_f0 != "" and "TIKTOK SHOP" not in nguondon_f0 and nguondon_f0 != "WEBSITE":
                                thuong_sale = int(so_luong) * int(f14_sale_marketing[j])
                                print(thuong_sale)
                            if int(thu_khac) == 20000:
                                thuong_cskh += 4000
                        elif pl_khach_hang >= 5:
                            thuong_cskh = int(so_luong) * int(f5n_cskh[j])
                            if int(thu_khac) == 20000:
                                thuong_cskh += 5000
                        
                        

                        if check_trung is not None and check_trung <= 30:
                            thuong_marketing += thuong_cskh / 2
                            thuong_cskh = thuong_cskh / 2

                        if "TIKTOK SHOP" in nguondon_f0:
                            for z, roww in enumerate(ma_shop, start=0):
                                if roww in ma_sanpham:
                                    thuong_shop = int(so_luong) * int(gian_tiep[z])
                    break
        # tính thưởng cho cskh - sàn
        elif kenh_ban == "Tiktok Shop - CSKH" or kenh_ban == "Shopee Mall TRAF - CSKH":     
            for j, roww in enumerate(ma_shop, start=0):
                if roww in ma_sanpham:
                    #tính thưởng deal sốc
                    if ma_hoadon in ma_dealsoc:
                        if nguoi_ban == "Nguyễn Duy Thắng - MKT": # tính thưởng trực tiếp cho shop
                            thuong_shop = thuong_value
                        else:
                            thuong_shop = thuong_value * 10/100
                            thuong_cskh = thuong_value * 90/100
                    # tính thường
                    else:
                        if nguoi_ban == "Nguyễn Duy Thắng - MKT": # tính thưởng trực tiếp cho shop
                            thuong_shop = int(so_luong) * int(truc_tiep[j])
                        else:
                            thuong_shop = int(so_luong) * int(gian_tiep[j])
                            for k, row1  in enumerate(ma_marketing_sale_cskh, start=0):
                                if row1 in ma_sanpham:
                                    if 0 <= pl_khach_hang <= 4:
                                    # print(f'{row} - {truc_tiep[j]}')
                                        thuong_cskh = int(so_luong) * int(f14_cskh[k])
                                    elif pl_khach_hang >= 5:
                                        thuong_cskh = int(so_luong) * int(f5n_cskh[k])
                                    # print(f'{row} - {thuong_cskh}')
                    break
        # tính thưởng cho sale và marketing
        elif kenh_ban == "FACEBOOK" or kenh_ban == "GOOGLE" or kenh_ban == "HOTLINE-TIKTOK LANDING" or kenh_ban == "TIKTOK LANDING" or kenh_ban == "ZALO OA" or kenh_ban == "YOUTUBE":
            for j, roww in enumerate(ma_marketing_sale_cskh, start=0):
                if roww in ma_sanpham:
                    #tính thưởng deal sốc
                    if ma_hoadon in ma_dealsoc:
                        thuong_marketing = thuong_value/2
                        thuong_sale = thuong_marketing
                        if int(thu_khac) == 20000 and int(pl_khach_hang) == 0:
                            thuong_marketing += 3000
                            thuong_sale += 3000
                    #tính thường
                    else:
                        if pl_khach_hang == 0:

                            thuong_marketing = int(so_luong) * int(f0_sale_marketing[j])
                            thuong_sale = thuong_marketing
                            # print(f'{row} - {truc_tiep[j]}')
                            if int(thu_khac) == 20000:
                                thuong_marketing += 3000
                                thuong_sale += 3000
                        else:
                            thuong_marketing = int(so_luong) * int(f14_sale_marketing[j])
                            thuong_sale = thuong_marketing
                    break
        
        # tính thưởng cho tiktok live
        elif kenh_ban == "TIKTOK LIVE":
            for j, roww in enumerate(ma_marketing_sale_cskh, start=0):
                if roww in ma_sanpham:
                    #tính thưởng deal sốc
                    if ma_hoadon in ma_dealsoc:
                        thuong_sale = thuong_value/2
                        thuong_shop = thuong_sale
                    #tính thường
                    else:
                        if int(pl_khach_hang) > 0:
                            thuong_sale = int(so_luong) * int(f14_sale_marketing[j])
                        else:
                            thuong_sale = int(so_luong) * int(f0_sale_marketing[j])

                        for k, roww in enumerate(ma_shop, start=0):
                            if roww in ma_sanpham:
                                thuong_shop = int(so_luong) * int(gian_tiep[k])
                                break
                    break
        # tính thưởng cho những nguồn khác.
        elif kenh_ban == "THƯƠNG HIỆU" or kenh_ban == "Bán trực tiếp" or kenh_ban == "KHÁCH GIỚI THIỆU":
            if nguoi_ban != "Đồng Trang - 0344686862" and nguoi_ban != "Admin" and nguoi_ban != "Mrs. Hằng LTB":
                for j, roww in enumerate(ma_marketing_sale_cskh, start=0):
                    if roww in ma_sanpham:
                        if pl_khach_hang == 0:
                            if int(thu_khac) == 20000:
                                thuong_sale += 3000
                            thuong_sale = int(so_luong) * int(f0_sale_marketing[j])
                        elif 1 <= pl_khach_hang <= 4:
                            if nguondon_f0 == "FACEBOOK" or nguondon_f0 == "HOTLINE-TIKTOK LANDING" or nguondon_f0 == "TIKTOK LANDING":
                                thuong_sale = int(so_luong) * int(f14_sale_marketing[j])
                                thuong_marketing = thuong_sale
                            if int(thu_khac) == 20000:
                                thuong_cskh += 4000
                            thuong_cskh = int(so_luong) * int(f14_cskh[j])
                        elif pl_khach_hang >= 5:
                            if int(thu_khac) == 20000:
                                thuong_cskh += 5000
                            thuong_cskh = int(so_luong) * int(f5n_cskh[j])
                        break

    thuong_dict = {
        "thuong_shop": thuong_shop, 
        "thuong_marketing": thuong_marketing, 
        "thuong_sale": thuong_sale, 
        "thuong_cskh": thuong_cskh
    }
    print(thuong_dict)
    return thuong_dict


async def update_status_miniapp(orderId, status, sdt):
    try:
        url = "https://traduocvietnam.com/v1/be-mini-app/webhook/update-order"
        with conn.cursor() as cur:
            sql = """SELECT COALESCE(SUM(tong_tien), 0) FROM hoa_don 
            WHERE sdt = %s 
            AND trang_thai NOT ILIKE '%%hủy%%'
            AND trang_thai NOT ILIKE '%%hoàn%%'
            """

            cur.execute(sql, (sdt,))
            tong_tien = cur.fetchone()[0]

        response = requests.post(
            url = url,
            headers={"Content-Type":"application/json"},
            json = {
                "order_id": orderId,
                "order_status": status,
                "purchase_total": tong_tien if tong_tien else 0
            }
        )
    except Exception as e:
        traceback.print_exc()
        conn.rollback()
        print(f"❌ Lỗi khi truy vấn: {str(e)}")

async def checkFollow(phone):
    api_key = "1418451931194267012:EY9kwBeBhRB3t3Q3gk7kfHzlQ2QnjM7R"

    token = "Bearer " + api_key

    baseUrl = "https://api.etelecom.vn/v1/shop" 
    oaId = "1225934657594830147"
    response = requests.post(
        f"{baseUrl}.Zalo/ListFollowers",
        headers={"Content-Type":"application/json", "Authorization": f"{token}"},
        data=json.dumps({
        "filter": {
            # "assigned_user_id": "text",
            # "date_from": "2025-01-01T12:01:29.286Z",
            # "date_to": "2025-10-29T12:01:29.286Z",
            "gender": "unknown",
            # "has_conversation": True,
            # "name": "text",
            "oa_id": oaId,
            "phone": phone,
            "state": "follow",
            # "tags": [
            #   "text"
            # ],
            # "zl_user_id": "text",
            # "zl_user_ids": [
            #   "text"
            # ]
        }
        #   "paging": {
        #     "after": "text",
        #     "before": "text",
        #     "limit": 1,
        #     "sort": "text"
        #   }
        })
    )
    data = response.json()
    followers = data.get("followers", [])

    # ✅ Nếu có ít nhất 1 follower thì lấy zl_user_id của người đầu tiên
    if followers and "zl_user_id" in followers[0]:
        return followers[0]["zl_user_id"]

    # 🔁 Nếu không có trong API thì kiểm tra DB
    with conn.cursor() as cur:
        cur.execute("""
            SELECT uid_oa 
            FROM khach_hang 
            WHERE sdt1 = %s OR sdt2 = %s
        """, (phone, phone))
        uidZalo = cur.fetchone()

        if uidZalo and uidZalo[0]:
            return uidZalo[0]

    # ❌ Không tìm thấy ở đâu cả
    return ""
    
    
async def sendByZNS(phone, data, tempId):
    api_key = "1418451931194267012:EY9kwBeBhRB3t3Q3gk7kfHzlQ2QnjM7R"

    token = "Bearer " + api_key

    baseUrl = "https://api.etelecom.vn/v1/shop" 
    oaId = "1225934657594830147"
    try:
        response = requests.post(
            f"{baseUrl}.Zalo/SendZNS",
            headers={"Content-Type":"application/json", "Authorization": f"{token}"},
            data=json.dumps({
            "mode": "unknown",
            "oa_id": oaId,
            "phone": phone,
            "sending_mode": "default",
            "template_data": data,
            "template_id": tempId,
            "tracking_id": "text"
            })
        )
    
        # response = requests.post(url, headers=headers, json=payload, timeout=15)
        response.raise_for_status()  # ném lỗi nếu status != 200
        result = response.json()
        
    except requests.exceptions.RequestException as e:
        result = {"error": str(e)}
        
    except ValueError:
        result = {"error": "Invalid JSON response"}
        
    return result


async def dong_bo_hoadon(hoadon_vao):
    try:
        # 194787305
        # 194785875
        # global ten_sanpham
        print("hoa don vao ", hoadon_vao)

        print("Đồng bộ báo cáo")
        await sio.emit(
            "new_invoice",
            namespace=NAMESPACE_INVOICE,
            room="invoice"
        )
        ma_hoadon = hoadon_vao["code"]
        thoi_gian = hoadon_vao["purchaseDate"].replace("T", " ").split(".")[0]
        thoi_gian = datetime.strptime(thoi_gian, "%Y-%m-%d %H:%M:%S").replace(second=0, microsecond=0)
        thoi_gian_hien_thi = thoi_gian.strftime("%H:%M - %d/%m/%Y")

        nguoi_ban = hoadon_vao["soldByName"]
        nguon_ban = hoadon_vao.get("SaleChannel", {}).get("Name", "Bán trực tiếp")
        print(nguon_ban)
        
        
        if hoadon_vao.get("invoiceDelivery") and hoadon_vao.get("invoiceDelivery", {}).get('contactNumber') and "*" not in hoadon_vao.get("invoiceDelivery", {}).get('contactNumber'):
            sdt = f"84{''.join(filter(str.isdigit, hoadon_vao.get('invoiceDelivery', {}).get('contactNumber')))[-9:]}"
        else:
            sdt = ""

        dia_chi = hoadon_vao.get("invoiceDelivery", {}).get("address", "")
        tinh_day_du = hoadon_vao.get("invoiceDelivery", {}).get("locationName") or ""
        tinh_khong_tach = ["Bà Rịa - Vũng Tàu"]

        # Nếu bắt đầu bằng tỉnh đặc biệt thì lấy nguyên cụm đó
        for tinh_dac_biet in tinh_khong_tach:
            if tinh_day_du.startswith(tinh_dac_biet):
                tinh = tinh_dac_biet
                break
            else:
                tinh = tinh_day_du.split(" - ")[0]
        ten_kh = hoadon_vao.get("customerName", "")
        if thoi_gian.month == 12:
            if nguon_ban == "TRAF - TRÀ VIỆT NAM" or "TIKTOK SHOP (" in nguon_ban:
                for j, roww in enumerate(tiktok_shop_ma_hoadon, start=0):
                    if roww in ma_hoadon:
                        
                        if tiktok_shop_nguondon[j] == "SPARK ADS":
                            nguon_ban = "TIKTOK SHOP (SPARK ADS)"
                        elif tiktok_shop_nguondon[j] == "LIVESTREAM PHƯƠNG ANH":
                            nguon_ban = "TIKTOK SHOP (LIVESTREAM PHƯƠNG ANH)"
                        elif tiktok_shop_nguondon[j] == "LIVESTREAM HẢI HÀ":
                            nguon_ban = "TIKTOK SHOP (LIVESTREAM HẢI HÀ)"
                        if len(tiktok_shop_sdt[j]) == 10:
                            sdt = f"84{''.join(filter(str.isdigit, tiktok_shop_sdt[j]))[-9:]}"
                            print("SDT Lấy được từ TIKTOK SHOP: ", sdt)
                            dia_chi = tiktok_shop_diachi[j]
                            tinh = tiktok_shop_tinh[j] if tiktok_shop_tinh[j] else tinh
                            ten_kh = tiktok_shop_tenkh[j]
                        break
        elif thoi_gian.month == 11:
            if nguon_ban == "TRAF - TRÀ VIỆT NAM" or "TIKTOK SHOP (" in nguon_ban:
                for j, roww in enumerate(tiktok_shop_ma_hoadon_t5, start=0):
                    if roww in ma_hoadon:
                        if ma_hoadon == "HDTTS_580203047241352531":
                            print(f"Mã hóa đơn: {ma_hoadon}, Nguồn bán trước: {nguon_ban}")
                        if tiktok_shop_nguondon_t5[j] == "SPARK ADS":
                            nguon_ban = "TIKTOK SHOP (SPARK ADS)"
                        elif tiktok_shop_nguondon_t5[j] == "LIVESTREAM PHƯƠNG ANH":
                            nguon_ban = "TIKTOK SHOP (LIVESTREAM PHƯƠNG ANH)"
                        elif tiktok_shop_nguondon_t5[j] == "LIVESTREAM HẢI HÀ":
                            nguon_ban = "TIKTOK SHOP (LIVESTREAM HẢI HÀ)"
                        if len(tiktok_shop_sdt_t5[j]) == 10:
                            sdt = f"84{''.join(filter(str.isdigit, tiktok_shop_sdt_t5[j]))[-9:]}"
                            print("SDT Lấy được từ TIKTOK SHOP: ", sdt)
                            dia_chi = tiktok_shop_diachi_t5[j]
                            tinh = tiktok_shop_tinh_t5[j] if tiktok_shop_tinh_t5[j] else tinh
                            ten_kh = tiktok_shop_tenkh_t5[j]
                        break
            
        with conn.cursor() as cur:
            # xử lí nếu khách hàng chưa có trên crm
            check_sdt_crm = await check_sdt(sdt, nguon_ban, ten_kh, dia_chi, thoi_gian)
            

            ma_san_pham_tong = "\n".join(f"{sp['productCode']}x{sp['quantity']}" for sp in hoadon_vao['invoiceDetails'])
            ma_san_pham_hrm = "\n".join(
                f"{sp['productCode'].split('&')[0]}x{sp['quantity']}"
                for sp in hoadon_vao['invoiceDetails']
            )
            
            ten_sanpham_tong = ""
            for node in hoadon_vao["invoiceDetails"]:
                ma_sp_suaa = await sua_masp(node.get("productCode"))
                for row_sp in marketing:
                    if row_sp[0] in ma_sp_suaa:
                        print(f"Kiểm tra mã sản phẩm: {row_sp[0]} trong {ma_sp_suaa}")
                        print(f"Sản phẩm trùng: {row_sp[1]} x {node['quantity']}")
                        
                        ten_sanpham_tong += f"{row_sp[1]} x {node['quantity']}\n"
                        print("----", ten_sanpham_tong)

                if "QT" in ma_sp_suaa:
                    for index, maqt1 in enumerate(maqt, start=0):
                        # print(f"Kiểm tra mã sản phẩm: {maqt1} trong {ma_sp_suaa}")
                        if maqt1[0] in ma_sp_suaa:
                            ten_sanpham_tong += f"{tenqt[index][0]} x {node['quantity']}\n"
                            continue
            

            cur.execute("SELECT ma_kh FROM khach_hang WHERE sdt1 = %s OR sdt2 = %s", (sdt, sdt))
            row = cur.fetchone()
            if row:
                ma_kh = row[0]
            else:
                ma_kh = ""
            print("Chốt ----", ten_sanpham_tong)    
            # ten_sanpham_tong = "\n".join(f"{sp['productName']} x {sp['quantity']}" for sp in hoadon_vao['invoiceDetails'])

            kenhhhh = ""
            if nguon_ban in ("FACEBOOK", "GOOGLE", "HOTLINE-TIKTOK LANDING", "TIKTOK LANDING", "ZALO OA", "YOUTUBE", "KHÁCH GIỚI THIỆU"):
                kenhhhh = "B2C-F0"
            elif nguon_ban == "CSKH":
                kenhhhh = "B2C-Fn"
            elif nguon_ban == "Bán trực tiếp":
                kenhhhh = "Bán trực tiếp"
            elif nguon_ban == "B2B - Bán sỉ":
                kenhhhh = "B2B"
            elif nguon_ban == "Tiktok Shop - CSKH":
                if check_sdt_crm == True:
                    kenhhhh = "B2C-TT-Fn"
                else:
                    kenhhhh = "B2C-TT-F0"
            elif nguon_ban == "Shopee Mall TRAF - CSKH":
                if check_sdt_crm == True:
                    kenhhhh = "B2C-SP-Fn"
                else:
                    kenhhhh = "B2C-SP-F0"
            elif nguon_ban == "ZALO MINI APP":
                kenhhhh = "ZALO MINI APP"
            else:
                kenhhhh = nguon_ban

            ghi_chu_kiot = hoadon_vao.get('description','')    
            ns_ban = ""
            ma_nv_lendon = ""
            if nguoi_ban == "MÁY 06" or nguoi_ban == "MÁY 10":
                match = re.search(r"MNV\s*[:\-]?\s*([A-Za-z0-9]+)", ghi_chu_kiot)
                if match:
                    ma_nv_lendon = match.group(1).strip()
            
            # lấy ghi chú từ kiotviet
             

            trang_thai = hoadon_vao.get("invoiceDelivery", {}).get("statusValue", "")
            ban_deal_soc = {
                "ngay_dsoc": thoi_gian.isoformat() if thoi_gian else None,
                "ma_dsoc": ma_san_pham_hrm,
                "ma_nv": nguoi_ban if nguoi_ban not in ["MÁY 06", "MÁY 10"] else ma_nv_lendon,
                "trang_thai_dsoc": trang_thai,
                "ma_hoa_don": ma_hoadon,
                "kenh_ban_dsoc": kenhhhh
            }
            
            if nguon_ban == "ZALO MINI APP":
                await update_status_miniapp(ma_hoadon, trang_thai, sdt)
            if trang_thai == "" or 'hủy' in trang_thai:
                trang_thai = "Đã hủy"
                await put_lichsu_dt(ban_deal_soc)
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE hoa_don AS hd
                        SET trang_thai = %s
                        WHERE ma_hd = %s
                        RETURNING (
                            SELECT row_to_json(au)
                            FROM account_users au
                            WHERE au.id_acc = hd.id_acc
                        ) AS user_data
                    """, (trang_thai, ma_hoadon))
                    user_data = cur.fetchone()[0]
                    if nguoi_ban == "Nguyễn Duy Thắng - MKT":
                        ns_ban = "AK0029 - Nguyễn Duy Thắng"
                    else:
                        if nguoi_ban == "MÁY 06" or nguoi_ban == "MÁY 10":
                            ns_ban = nguoi_ban
                        else:
                            ns_ban = f"{user_data['user_id']} - {user_data['name']}"

                    

                    cur.execute("""
                        SELECT rn
                        FROM (
                        SELECT id_hd, ma_hd,
                                ROW_NUMBER() OVER (ORDER BY thoi_gian ASC, id_hd ASC) AS rn
                        FROM hoa_don
                        WHERE date(thoi_gian) = %s
                        AND nguon_ban not in ('TRAF OFFICIAL - TRÀ VIỆT NAM', 'TRAF - TRÀ VIỆT NAM', 'ZALO MINI APP')
                        and nguon_ban not ilike '%%TIKTOK SHOP (%%'
                        
                        ) t
                        WHERE ma_hd = %s
                    """, (datetime.now().date(), ma_hoadon))

                    row_stt = cur.fetchone()

                    if row_stt:
                        stt_hd = row_stt[0]
                    else:
                        stt_hd = 'NULL'
                    
                    thoi_gian_hien_thi += f", HD: {stt_hd}"

                    data_send_lark = {
                        "don_hang_moi": thoi_gian_hien_thi,
                        "kenh": kenhhhh,
                        "nguoi_ban": ns_ban,
                        "san_pham": ten_sanpham_tong,
                        "ma_hoa_don": ma_hoadon,
                        "trang_thai": trang_thai
                    }
                    if nguon_ban not in ("TRAF OFFICIAL - TRÀ VIỆT NAM", "TRAF - TRÀ VIỆT NAM", "ZALO MINI APP") and row_stt:
                        await send_lark_message(data_send_lark)
                    conn.commit()
                    cur.execute("UPDATE hoa_don_tinh_thuong SET trang_thai = %s WHERE ma_hd = %s", (trang_thai, ma_hoadon))
                    conn.commit()
                    url = "https://test.traduocvietnam.com/api/vi_cong_ty/huy-giao-dich-dt"
                    data = {
                        'ma_hoa_don': ma_hoadon,
                        'trang_thai': 'Đã hủy'
                    }
                    header = {
                        'Content-Type': 'application/json'
                    }
                    response = requests.post(url, headers=header, json=data)
                    
                return

            
            
            thoi_gian_capnhat = hoadon_vao.get("modifiedDate")
            ten_khach_hang = hoadon_vao.get("customerName", " ")
            # xử lí thời gian cập nhật
            if thoi_gian_capnhat:
                # Làm sạch và parse chuỗi datetime ISO 8601 từ KiotViet
                thoi_gian_capnhat = thoi_gian_capnhat.replace("T", " ").split(".")[0]
                thoi_gian_capnhat = datetime.strptime(thoi_gian_capnhat, "%Y-%m-%d %H:%M:%S")
            else:
                thoi_gian_capnhat = None

            # tính chi phí ưu đãi khuyến mại và chi phí vận chuyển
            chiphikmud = 0
            cp_vc = 0
            phi_vc = 0
            if nguon_ban != "Traf Vina - Vietnamese tea" and nguon_ban != "TRAF OFFICIAL - TRÀ VIỆT NAM" and nguon_ban != "TRAF - TRÀ VIỆT NAM" and nguon_ban != "Mộc Tâm Trà" and "TIKTOK SHOP (" not in nguon_ban:
                phi_vc = hoadon_vao.get("invoiceDelivery", {}).get("price", 0)

            thu_khac = 0
            if hoadon_vao.get("invoiceOrderSurcharges", []):
                thu_khac = sum(int(s.get("price", 0)) for s in hoadon_vao.get("invoiceOrderSurcharges", []))
                cp_vc = phi_vc - thu_khac
            else:
                cp_vc = phi_vc
            tong_tien = int(hoadon_vao["total"]) - thu_khac

            if hoadon_vao["id"] != -1:
                # tính chi phí khuyến mại và ưu đãi
                tong_tien_phu = 0
                for node1 in hoadon_vao["invoiceDetails"]:
                    ma_sp_sua = await sua_masp(node1.get("productCode"))
                    if ma_sp_sua == "QT-FREESHIP":
                        # phi_vc = 0
                        continue
                    for index, maqt1 in enumerate(maqt, start=0):
                        if maqt1[0] in ma_sp_sua:
                    
                            chiphikmud += float(giaqt[index][0])*node1.get("quantity")
                    for row_sp in marketing:
                        if row_sp[0] in ma_sp_sua:
                            soluong = int(node1["quantity"])
                            match = re.search(r"x(\d+)", ma_sp_sua)
                            if match:
                                soluong = int(soluong) * int(match.group(1))
                                ma_sp_sua = ma_sp_sua.split("x", 1)[0]
                            tong_tien_phu += float(row_sp[2])*soluong
                if tong_tien_phu > hoadon_vao.get("total"):
                      
                    if nguon_ban == "Traf Vina - Vietnamese tea" or nguon_ban == "TRAF - TRÀ VIỆT NAM" or nguon_ban == "TRAF OFFICIAL - TRÀ VIỆT NAM" or "TIKTOK SHOP (" in nguon_ban:
                        tong_tien += (tong_tien_phu-hoadon_vao.get("total")) 
                    else:
                        chiphikmud += (tong_tien_phu-hoadon_vao.get("total"))  
            # tính f khách hàng
            cur.execute(
                "SELECT COUNT(*) FROM hoa_don WHERE sdt = %s AND trang_thai IN (%s, %s) AND thoi_gian < %s AND nguon_ban NOT IN ('GỬI BÙ', 'Đổi Hàng')",
                (sdt, "Đã giao hàng", "Giao thành công", thoi_gian),
            )
            pl_khach_hang = cur.fetchone()[0]
            if sdt == "":
                pl_khach_hang = 0
            # print(f"mã kh: {ma_hoadon} - phân loại kh: {pl_khach_hang} - sdt: {sdt} - thu_khac: {thu_khac}")
            
            if pl_khach_hang == 0:
                f_khach_hang = "F0"
            else:
                f_khach_hang = "F"+str(pl_khach_hang)

            nguoi_ban_F0, nguon_ban_F0 = "", ""  # Giá trị mặc định nếu không có hóa đơn hợp lệ
            dem = 0
            nguon_trung = ""

            cur.execute(
                "SELECT * FROM hoa_don WHERE sdt = %s AND trang_thai IN (%s, %s) AND thoi_gian < %s AND nguon_ban NOT IN ('GỬI BÙ', 'Đổi Hàng') ORDER BY thoi_gian ASC LIMIT 1",
                (sdt, "Đã giao hàng", "Giao thành công", thoi_gian),
            )
            hoa_don_dau_tien = cur.fetchone()
            columns_hoadon = [desc[0] for desc in cur.description]
            # Chỉ cần zip một lần vì fetchone() trả về 1 dòng (tuple)
            hoadon_dict = dict(zip(columns_hoadon, hoa_don_dau_tien)) if hoa_don_dau_tien else None

            # print(hoadon_dict)
            if hoadon_dict and hoadon_dict["thoi_gian"].year == 2025 and sdt != "":
                nguoi_ban_F0 = hoadon_dict["nguoi_ban"]
                nguon_ban_F0 = hoadon_dict["nguon_ban"]
            # xử lí quà tặng đẩy vào chi phí ưu đãi khuyến mại
            matches = re.findall(r'(.+?)\s*[xX]\s*(\d+)', ghi_chu_kiot)
            for ten, sl in matches:
                for node in data_sanpham:
                    ten = ten.strip()
                    if ten == node[2]:
                        sl = int(sl)
                        node[3] = int(node[3])
                        chiphikmud += (node[3]*sl)
                        node[1] = "QT" + node[1][2:]
                        # ma_sanpham_sua = await sua_masp(ma_sanpham)
                        sql = """
                            SELECT * FROM hoa_don_tinh_thuong WHERE ma_hd = %s AND ma_sanpham = %s
                        """
                        
                        cur.execute(sql, (ma_hoadon, node[1]))
                        hoa_don_thuong = cur.fetchall()
                        if hoa_don_thuong:
                            # f_khach_hang = "F"+str(pl_khach_hang-1)
                            sql = """UPDATE hoa_don_tinh_thuong SET
                                thoi_gian = %s, 
                                ten_kh = %s, 
                                sdt = %s, 
                                nguoi_ban = %s, 
                                nguon_ban = %s, 
                                trang_thai = %s, 
                                ma_sanpham = %s, 
                                ten_sanpham = %s, 
                                so_luong = %s, 
                                van_chuyen = %s,
                                tong_tien = %s,
                                f_khach_hang = %s,
                                sale_f0 = %s,
                                nguon_don_f0 = %s,
                                thuong_san = %s,
                                thuong_marketing = %s,
                                thuong_sale = %s,
                                thuong_cskh = %s,
                                thoi_gian_capnhat = %s
                    
                                WHERE ma_hd = %s AND ma_sanpham ILIKE %s AND so_luong = %s
                            """
                            cur.execute(sql, (
                                thoi_gian,
                                ten_khach_hang,
                                sdt,
                                nguoi_ban, 
                                nguon_ban, 
                                trang_thai,
                                node[1], 
                                ten,
                                sl,
                                thu_khac,
                                node[3]*sl, 
                                f_khach_hang,
                                nguoi_ban_F0,
                                nguon_ban_F0,
                                0,
                                0,
                                0,
                                0,
                                thoi_gian_capnhat,
                                ma_hoadon,
                                f"%{node[1]}%",
                                sl
                            ))
                            conn.commit()
                        else:
                            cur.execute("""
                            INSERT INTO hoa_don_tinh_thuong (
                                ma_hd, 
                                thoi_gian, 
                                ten_kh, 
                                sdt, 
                                nguoi_ban, 
                                nguon_ban, 
                                trang_thai, 
                                ma_sanpham, 
                                ten_sanpham, 
                                so_luong, 
                                van_chuyen,
                                tong_tien,
                                f_khach_hang,
                                sale_f0,
                                nguon_don_f0,
                                thuong_san,
                                thuong_marketing,
                                thuong_sale,
                                thuong_cskh,
                                thoi_gian_capnhat
                            ) 
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """, (
                                ma_hoadon, 
                                thoi_gian,
                                ten_khach_hang,
                                sdt,
                                nguoi_ban, 
                                nguon_ban, 
                                trang_thai,
                                node[1], 
                                ten,
                                sl,
                                thu_khac,
                                node[3]*sl, 
                                f_khach_hang,
                                nguoi_ban_F0,
                                nguon_ban_F0,
                                0,
                                0,
                                0,
                                0,
                                thoi_gian_capnhat
                            ))
                            conn.commit()
                            print("Thêm hóa đơn thưởng thành công: "+ma_hoadon)
                        break


            
            if nguon_ban == "TRAF - TRÀ VIỆT NAM":
                cur.execute("SELECT nguon_ban FROM hoa_don WHERE ma_hd = %s", (ma_hoadon,))
                row = cur.fetchone()
                if row:
                    nguon_ban = row[0]
            
            
            
            
            sql = """
                SELECT * FROM hoa_don WHERE ma_hd = %s
            """
            cur.execute(sql, (ma_hoadon,))
            hoa_don_bt = cur.fetchall()
            # xứ lí cho bảng hoa_don


            thong_tin = {
                "ma_hd": ma_hoadon,
                "tong_tien": tong_tien + thu_khac,
                "ma_kh": ma_kh,
                "sdt": sdt if sdt else None,
                "nhan_vien_ban_hang": nguoi_ban,
                "nguon_ban": nguon_ban
            }
            await create_QR(thong_tin)
            
            if hoa_don_bt:
                columns_hoadon = [desc[0] for desc in cur.description]
                hoa_don_bt = dict(zip(columns_hoadon, hoa_don_bt[0]))
                if trang_thai == "Giao thành công" or 'hủy' in trang_thai or 'hoàn' in trang_thai:
                    base_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
                    file_path = os.path.join(os.path.dirname(os.path.dirname(base_dir)), "frontend", "image", "zalo_miniapp", f"{ma_hoadon}.PNG")
                    if os.path.exists(file_path):   # kiểm tra file có tồn tại không
                        os.remove(file_path)
                        print("Đã xoá:", file_path)
                    else:
                        print("File không tồn tại:", file_path)
                send_zns = hoa_don_bt["send_zns"]
                moc_thoi_gian = datetime.strptime("2025-11-08 00:00:00", "%Y-%m-%d %H:%M:%S")
                if trang_thai == "Giao thành công" and thoi_gian >= moc_thoi_gian and not hoa_don_bt["send_zns"]:
                    # sdt_miniapp = f"0{''.join(filter(str.isdigit, sdt))[-9:]}"
                    points = max(1, ((tong_tien + thu_khac) * 0.01) / 1000)
                    
                    sql = "SELECT * FROM lich_su_tichdiem WHERE ma_kh = %s AND sdt = %s AND sdt <> '' AND sdt IS NOT NULL ORDER BY thoi_gian DESC LIMIT 1"
                    cur.execute(sql, (ma_kh, sdt))
                    last_record = cur.fetchone()
                    if last_record:
                        colums_lstd = [desc[0] for desc in cur.description]
                        last_record = dict(zip(colums_lstd, last_record))
                        current_point_old = last_record.get("diem_hien_tai", 0)
                        points += float(last_record.get("diem_du", 0) or 0)
                        print("Point:", points)
                        integer_part = int(points)
                        fraction_part = points - integer_part
                        current_point = current_point_old + integer_part
                    else:
                        integer_part = int(points)
                        fraction_part = points - integer_part
                        current_point = integer_part

                    cur.execute("""
                        INSERT INTO lich_su_tichdiem (sdt, ma_hoadon, tong_tien, so_diem, diem_hien_tai, ma_kh, thoi_gian, diem_du)
                        VALUES (%s, %s, %s, %s, %s, %s, NOW(), %s)
                    """, (sdt, ma_hoadon, (tong_tien + thu_khac), points, current_point, ma_kh, fraction_part))
                    
                    conn.commit()
                    
                    data_sen_miniapp = {
                        "order_id": ma_hoadon,
                        "customer_name": ten_kh,
                        "phone_number": sdt,
                        "channel": kenhhhh,
                        "product": ten_sanpham_tong,
                        "total_price": tong_tien + thu_khac,
                        "ma_kh": ma_kh,
                        "points": integer_part,
                        "current_point": int(current_point)
                    }
                    print(json.dumps(data_sen_miniapp, indent=4, ensure_ascii=False))

                    # if nguon_ban == "ZALO MINI APP":
                    cur.execute("SELECT trang_thai FROM khach_hang_chuyen_khoan WHERE orderid = %s AND trang_thai IS NOT NULL", (ma_hoadon, ))
                    trang_thai_ck = cur.fetchone()

                    if trang_thai_ck:
                        print("✅ Đã bắn ZNS trước đó rồi, bỏ qua.")
                    else:
                        uidZalo = await checkFollow(sdt)
                        

                        if uidZalo:
                            data_send_zns = {
                                "ten_kh": ten_kh,
                                "ma_don_hang": ma_hoadon
                            }
                            sendzns = await sendByZNS(sdt, data_send_zns, 500248)
                            send_zns = "Đã gửi"
                            if ("error" in sendzns) or sendzns["error_code"] != 0:
                                send_zns = ""
                                print("❌ Lỗi chưa gửi được tin nhắn")
                        else:
                            data_send_zns = {
                                "ten_kh": ten_kh,
                                "ma_don_hang": f" {ma_hoadon}"
                            }
                            sendzns = await sendByZNS(sdt, data_send_zns, 500374)
                            send_zns = "Đã gửi"
                            if ("error" in sendzns) or sendzns["error_code"] != 0:
                                send_zns = ""
                                print("❌ Lỗi chưa gửi được tin nhắn")

                    await tich_diem(data_sen_miniapp)

                    
                    print(f"✅🎉 ĐƠN HÀNG {ma_hoadon} GIAO THÀNH CÔNG 🎉✅")

                sql = """UPDATE hoa_don SET 
                    nguoi_ban = %s, 
                    nguon_ban = %s, 
                    ma_san_pham = %s, 
                    tong_tien = %s, 
                    trang_thai = %s, 
                    sdt = %s,
                    van_chuyen = %s,
                    dia_chi = %s,
                    tinh = %s,
                    thoi_gian_capnhat = %s,
                    cp_uudai_khuyenmai = %s,
                    cp_van_chuyen = %s,
                    send_zns = %s,
                    ghi_chu = %s,
                    ma_nv_lendon = %s
                WHERE ma_hd = %s"""
                cur.execute(sql, (nguoi_ban, nguon_ban, ma_san_pham_tong, tong_tien,
                                  trang_thai,
                                  sdt,
                                  thu_khac,
                                  dia_chi,
                                  tinh,
                                  thoi_gian_capnhat, chiphikmud, cp_vc, send_zns, ghi_chu_kiot, ma_nv_lendon,
                                  ma_hoadon))
                conn.commit()
            else:
                
                # hóa đơn được tạo mới
                cur.execute("""
                    WITH ins AS (
                        INSERT INTO hoa_don (
                            ma_hd, thoi_gian, nguoi_ban, nguon_ban, ma_san_pham, tong_tien, 
                            trang_thai, sdt, van_chuyen, dia_chi, tinh, thoi_gian_capnhat, 
                            cp_uudai_khuyenmai, cp_van_chuyen, ghi_chu, ma_nv_lendon
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id_acc, ma_hd
                    )
                    SELECT row_to_json(au) AS user_data
                    FROM ins
                    LEFT JOIN account_users au ON au.id_acc = ins.id_acc;
                """, (
                    ma_hoadon, thoi_gian, nguoi_ban, nguon_ban, ma_san_pham_tong, tong_tien, trang_thai, sdt, thu_khac, dia_chi, tinh, thoi_gian_capnhat, chiphikmud, cp_vc, ghi_chu_kiot, ma_nv_lendon
                ))
                row1212 = cur.fetchone()

                user_data = row1212[0] if row1212 else None
                # data_send_lark = [f"{user_data['user_id']} - {user_data['name']}", ma_hoadon, trang_thai]
                if nguoi_ban == "Nguyễn Duy Thắng - MKT":
                    ns_ban = "AK0029 - Nguyễn Duy Thắng"
                else:
                    if nguoi_ban == "MÁY 06" or nguoi_ban == "MÁY 10":
                        ns_ban = nguoi_ban
                    else:
                        ns_ban = f"{user_data['user_id']} - {user_data['name']}"
                cur.execute("""
                    SELECT rn
                    FROM (
                    SELECT id_hd, ma_hd,
                            ROW_NUMBER() OVER (ORDER BY thoi_gian ASC, id_hd ASC) AS rn
                    FROM hoa_don
                    WHERE date(thoi_gian) = %s
                    AND nguon_ban not in ('TRAF OFFICIAL - TRÀ VIỆT NAM', 'TRAF - TRÀ VIỆT NAM', 'ZALO MINI APP')
                    and nguon_ban not ilike '%%TIKTOK SHOP (%%'
                    
                    ) t
                    WHERE ma_hd = %s
                """, (datetime.now().date(), ma_hoadon))

                row_stt = cur.fetchone()

                if row_stt:
                    stt_hd = row_stt[0]
                else:
                    stt_hd = 'NULL'
            
                thoi_gian_hien_thi += f", HD: {stt_hd}"
                if nguon_ban == "ZALO MINI APP":
                    uidZalo = await checkFollow(sdt)
                    data_send_zns = {
                        "ten_KH": ten_kh,
                        "ma_don_hang": ma_hoadon,
                        "dia_chi": dia_chi,
                        "sdt": sdt,
                        "ten_kh": ten_kh
                    }

                    if uidZalo:
                        sendzns = await sendByZNS(sdt, data_send_zns, 500381)

                        if ("error" in sendzns) or sendzns["error_code"] != 0:
                            print("❌ Lỗi chưa gửi được tin nhắn")
                    else:
                        sendzns = await sendByZNS(sdt, data_send_zns, 500381)
                        if ("error" in sendzns) or sendzns["error_code"] != 0:
                            print("❌ Lỗi chưa gửi được tin nhắn")

                data_send_lark = {
                    "don_hang_moi": thoi_gian_hien_thi,
                    "kenh": kenhhhh,
                    "nguoi_ban": ns_ban,
                    "san_pham": ten_sanpham_tong,
                    "ma_hoa_don": ma_hoadon,
                    "trang_thai": "Tạo đơn thành công" + (f"\n**- Ghi chú: {ghi_chu_kiot}**" if ghi_chu_kiot else "")
                }
                if nguon_ban not in ("TRAF OFFICIAL - TRÀ VIỆT NAM", "TRAF - TRÀ VIỆT NAM", "ZALO MINI APP"):
                    await send_lark_message(data_send_lark)

                conn.commit()
                print("Nhận hóa đơn mới: ", ma_hoadon)
                hd = {
                    "ma_hoadon":ma_hoadon,
                    "thoi_gian": thoi_gian,
                    "nguoi_ban": nguoi_ban,
                    "nguon_ban": nguon_ban
                    
                    
                }
                # tạo mã QR
                cur.execute("SELECT ma_kh FROM khach_hang WHERE sdt1 = %s OR sdt2 = %s", (sdt, sdt))
                row = cur.fetchone()
                ma_kh = row[0] if row else ""
                

                # if nguon_ban != "Traf Vina - Vietnamese tea" and nguon_ban != "TRAF OFFICIAL - TRÀ VIỆT NAM" and nguon_ban != "TRAF - TRÀ VIỆT NAM" and nguon_ban != "Tiktok Shop - CSKH" and nguon_ban != "Shopee Mall TRAF - CSKH" and nguon_ban != "TIKTOK LIVE" and "TIKTOK SHOP (" not in nguon_ban and nguon_ban != "Mộc Tâm Trà":
                #     await bien_dong_doanhso(hd)

                baocao = datetime.now().replace(hour=18, minute=0, microsecond=0)
                if datetime.now() > baocao:
                    subprocess.Popen(
                        ["/usr/bin/python3", "/www/wwwroot/thong_bao_doanhso/run_doanhso.py"]
                    )
            
#============= xử lí cho bảng hoa_don_tinh_thuong=====================================================================================================================================================================

            cur.execute(
                "SELECT check_trung FROM khach_hang WHERE sdt1 = %s OR sdt2 = %s",
                (sdt, sdt),
            )
            row = cur.fetchone()

            check_trung = row[0] if row else None
            
            

            # thuong_tong_shop = 0
            # thuong_tong_marketing = 0
            # thuong_tong_sale = 0
            # thuong_tong_cskh = 0


            
            for sanpham in hoadon_vao['invoiceDetails']:
                dem+=1
                if dem >= 2:
                    thu_khac = 0
                ma_sanpham = sanpham["productCode"]
                # if ma_sanpham.startswith("QT"):
                #     continue
                
                ma_sanpham_sua = await sua_masp(ma_sanpham)
                # print(ma_sanpham)
                ten_sanpham = sanpham["productName"]
                soluong = int(sanpham["quantity"])
                match = re.search(r"x(\d+)", ma_sanpham)
                if match:
                    soluong = int(soluong) * int(match.group(1))
                    ma_sanpham = ma_sanpham.split("x", 1)[0]
        

                tong_tien_sp = 0
                for row_sp in marketing:
                    if row_sp[0] in ma_sanpham_sua:
                        tong_tien_sp = soluong*int(row_sp[2])
             
                
                
                
                    
                hoadon = {
                    "ma_hd": ma_hoadon, 
                    "thoi_gian": thoi_gian, 
                    "ten_kh": ten_khach_hang, 
                    "sdt": sdt, 
                    "nguoi_ban": nguoi_ban, 
                    "nguon_ban": nguon_ban, 
                    "trang_thai": trang_thai, 
                    "ma_san_pham": ma_sanpham, 
                    "ten_san_pham": ten_sanpham, 
                    "so_luong": soluong, 
                    "van_chuyen": thu_khac,
                    "tong_tien": tong_tien_sp,
                    "f_khach_hang": f_khach_hang,
                    "sale_f0": nguoi_ban_F0,
                    "nguon_don_f0": nguon_ban_F0,
                    "check_trung":check_trung
                }
                # tính thưởng
                print(hoadon)
                # thuong = await tinh_thuong_sp(hoadon)
                # thuong_tong_shop += thuong["thuong_shop"]
                # thuong_tong_marketing += thuong["thuong_marketing"]
                # thuong_tong_sale += thuong["thuong_sale"]
                # thuong_tong_cskh += thuong["thuong_cskh"]
                # kiểm tra xem hóa đơn thưởng đã được tạo hay chưa
                sql = """
                    SELECT * FROM hoa_don_tinh_thuong WHERE ma_hd = %s AND (ma_sanpham = %s OR ma_sanpham = %s)
                """
                cur.execute(sql, (ma_hoadon, ma_sanpham, ma_sanpham_sua))
                hoa_don_thuong = cur.fetchall()
                if nguon_ban == "Mộc Tâm Trà":
                    tong_tien_sp = tong_tien
                
                if check_trung and check_trung <= 30:
                    sql = """
                        SELECT nguon_data FROM khach_hang WHERE sdt1 = %s OR sdt2 = %s
                    """
                    cur.execute(sql, (sdt, sdt))
                    nguon_trung = cur.fetchone()[0]
                    if nguon_trung == 'FACEBOOK - PANCAKE':
                        nguon_trung = "FACEBOOK"

                if hoa_don_thuong:
                    # f_khach_hang = "F"+str(pl_khach_hang-1)
                    sql = """UPDATE hoa_don_tinh_thuong SET
                        thoi_gian = %s, 
                        ten_kh = %s, 
                        sdt = %s, 
                        nguoi_ban = %s, 
                        nguon_ban = %s, 
                        trang_thai = %s, 
                        ma_sanpham = %s, 
                        ten_sanpham = %s, 
                        so_luong = %s, 
                        van_chuyen = %s,
                        tong_tien = %s,
                        f_khach_hang = %s,
                        sale_f0 = %s,
                        nguon_don_f0 = %s,
                        thuong_san = %s,
                        thuong_marketing = %s,
                        thuong_sale = %s,
                        thuong_cskh = %s,
                        thoi_gian_capnhat = %s
            
                        WHERE ma_hd = %s AND (ma_sanpham ILIKE %s OR ma_sanpham ILIKE %s) AND so_luong = %s
                    """
                    cur.execute(sql, (
                        thoi_gian,
                        ten_khach_hang,
                        sdt,
                        nguoi_ban, 
                        nguon_ban, 
                        trang_thai,
                        ma_sanpham_sua, 
                        ten_sanpham,
                        soluong,
                        thu_khac,
                        tong_tien_sp, 
                        f_khach_hang,
                        nguoi_ban_F0,
                        nguon_ban_F0,
                        0,
                        0,
                        0,
                        0,
                        thoi_gian_capnhat,

                        ma_hoadon,
                        f"%{ma_sanpham}%",
                        f"%{ma_sanpham_sua}%",
                        soluong
                    ))
                    conn.commit()
                else:
                    cur.execute("""
                    INSERT INTO hoa_don_tinh_thuong (
                        ma_hd, 
                        thoi_gian, 
                        ten_kh, 
                        sdt, 
                        nguoi_ban, 
                        nguon_ban, 
                        trang_thai, 
                        ma_sanpham, 
                        ten_sanpham, 
                        so_luong, 
                        van_chuyen,
                        tong_tien,
                        f_khach_hang,
                        sale_f0,
                        nguon_don_f0,
                        thuong_san,
                        thuong_marketing,
                        thuong_sale,
                        thuong_cskh,
                        thoi_gian_capnhat
                    ) 
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        ma_hoadon, 
                        thoi_gian,
                        ten_khach_hang,
                        sdt,
                        nguoi_ban, 
                        nguon_ban, 
                        trang_thai,
                        ma_sanpham, 
                        ten_sanpham,
                        soluong,
                        thu_khac,
                        tong_tien_sp, 
                        f_khach_hang,
                        nguoi_ban_F0,
                        nguon_ban_F0,
                        0,
                        0,
                        0,
                        0,
                        thoi_gian_capnhat
                    ))
                    conn.commit()
                    print("Thêm hóa đơn thưởng thành công: "+ma_hoadon)
            
            if nguoi_ban != "Nguyễn Duy Thắng - MKT" and nguoi_ban != "Admin" and nguoi_ban != "Nguyễn An Phi - MKT" and nguoi_ban != "Lê Doãn Phương - PSX":
                print("UPDATE hóa đơn hoàn")
                if trang_thai == "Chờ chuyển hoàn":
                    hoadon_hoan = [
                        ma_hoadon,
                        hoadon_vao.get("invoiceDelivery", {}).get("deliveryCode", ""),
                        thoi_gian.strftime("%Y-%m-%d %H:%M:%S"),
                        thoi_gian_capnhat.strftime("%Y-%m-%d %H:%M:%S") if thoi_gian_capnhat != None else "",
                        nguoi_ban,
                        tong_tien,
                        nguon_ban,
                        hoadon_vao.get("invoiceDelivery", {}).get("partnerDelivery", {}).get("name", "")
                    ]
                    await update_hoadon_hoan(hoadon_hoan)

            # if hoadon_vao.get("invoiceDelivery", {}).get("partnerDelivery", {}).get("name", "") == "BESTFW":
            #     hoadon_best = [
            #         thoi_gian.strftime("%Y-%m-%d %H:%M:%S"),
            #         thoi_gian_capnhat.strftime("%Y-%m-%d %H:%M:%S") if thoi_gian_capnhat != None else "",
            #         ma_hoadon,
            #         hoadon_vao.get("invoiceDelivery", {}).get("deliveryCode", ""),
            #         trang_thai,
            #         nguoi_ban, 
            #         nguon_ban, 
            #         ma_san_pham_tong,
            #         hoadon_vao.get("invoiceDelivery", {}).get("weight", 0),
            #         hoadon_vao.get("invoiceDelivery", {}).get("price", 0),
            #         int(hoadon_vao["total"]),
            #         await time_giao_hang(hoadon_vao["id"])
            #     ]
            #     await update_hoadon_best(hoadon_best)
            # sql = "SELE"
            
            
            await put_lichsu_dt(ban_deal_soc)
            


    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi lấy dữ liệu: {str(e)}")
        traceback.print_exc()
        return {"success": False, "message": f"Lỗi khi lấy dữ liệu: {str(e)}"}

async def check_sdt(sdt, nguon_ban, ten_kh, dia_chi, thoi_gian):
    with conn.cursor() as cur:
        # xử lí nếu khách hàng chưa có trên crm
        cur.execute("SELECT * FROM khach_hang WHERE sdt1 = %s OR sdt2 = %s", (sdt, sdt))
        existing_customer = cur.fetchall()
        if existing_customer:
            print(f"⚠️ Số điện thoại {sdt} đã tồn tại trong hệ thống. Bỏ qua thêm mới.")
            return True
        else:
            if 'TIKTOK SHOP (' in nguon_ban or nguon_ban == "Tiktok Shop - CSKH" or nguon_ban == "Shopee Mall TRAF - CSKH":
                cur.execute("SELECT MAX(ma_kh) FROM khach_hang")
                result = cur.fetchone()
                max_ma_kh = result[0] if result and result[0] else "KH000000"
                # Tăng lên 1
                so_moi = int(max_ma_kh[2:]) + 1  # Bỏ "KH" rồi ép kiểu số
                new_ma_kh = f"KH{so_moi:06d}"  # Định dạng lại thành KH000XXX

                sql = """
                SELECT COALESCE(SUM(tong_tien::numeric), 0)      AS gmv,
                        COUNT(*)                                   AS so_lan_mua,
                        COALESCE(AVG(tong_tien::numeric), 0)      AS aov
                FROM hoa_don
                WHERE trang_thai IN ('Đã giao hàng', 'Giao thành công')
                AND nguon_ban NOT IN ('Đổi Hàng', 'GỬI BÙ')
                AND sdt IS NOT NULL
                AND sdt = %s
                """
                cur.execute(sql, (sdt,))
                result = cur.fetchone()
                if result:
                    gmv, so_lan_mua, aov = result
                    if gmv >= 500000:
                        nhom_kh = f'F{so_lan_mua}A'
                    elif gmv < 500000 and gmv > 0:
                        nhom_kh = f'F{so_lan_mua}B'
                    else:
                        gmv, so_lan_mua, aov = 0, 0, 0
                        nhom_kh = 'F'
                cur.execute("INSERT INTO khach_hang (ma_kh, ten_khach_hang, nhom_kh, sdt1, dia_chi, nguon_data, thoi_gian_tao, id_acc, nhan_vien_pt, gmv, aov, so_lan_mua, ghi_chu) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                            (new_ma_kh, ten_kh, nhom_kh, sdt, dia_chi, nguon_ban, thoi_gian, 15, 'tiktok_shop', gmv, aov, so_lan_mua, ""))
                conn.commit()
            return False

async def them_hoadon_website(hoa_don):
    try:
        with conn.cursor() as cur:
            sql = "SELECT * FROM hoa_don WHERE ma_hd = %s"
            cur.execute(sql, (hoa_don["ma_hd"]))
            hoa_don_base = cur.fetchall()
            

    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi lấy dữ liệu: {str(e)}")
        traceback.print_exc()
        return {"success": False, "message": f"Lỗi khi lấy dữ liệu: {str(e)}"}
    print("ádfsad")

async def get_access_token():
    app_id = "cli_a8e2741fa178d010"
    app_secret = "HpBQ9OVXmxH45ueSVI0ewbGvJEh2YIxX"
    url = "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal"
    headers = {"Content-Type": "application/json"}
    payload = {
        "app_id": app_id,
        "app_secret": app_secret
    }

    response = requests.post(url, headers=headers, json=payload)
    data = response.json()
    print(json.dumps(data, indent=4, ensure_ascii=False))
    return data["tenant_access_token"]

async def get_chat_list(token):
    url = "https://open.larksuite.com/open-apis/im/v1/chats"
    headers = {
        "Authorization": f"Bearer {token}"
    }

    params = {
        "page_size": 20  # hoặc nhiều hơn nếu cần
    }

    response = requests.get(url, headers=headers, params=params)
    data = response.json()
    # print(json.dumps(data, indent=4, ensure_ascii=False))
    return data


async def upload_image_to_lark(image_path, token):
    
    # === Upload ảnh lên Lark ===
    with open(image_path, "rb") as f:
        m = MultipartEncoder(
            fields={
                "image_type": "message",  # 🔥 Quan trọng
                "image": (os.path.basename(image_path), f, "image/png")
            }
        )
        headers_upload = {
            "Authorization": f"Bearer {token}",
            "Content-Type": m.content_type
        }
        res_upload = requests.post(
            "https://open.larksuite.com/open-apis/im/v1/images",
            headers=headers_upload,
            data=m
        )

    try:
        upload_json = res_upload.json()
    except Exception as e:
        print("❌ Không thể parse JSON:", str(e))
        print("Phản hồi upload:", res_upload.text)
        return

    if res_upload.status_code != 200 or "data" not in upload_json:
        print("❌ Upload ảnh thất bại:", upload_json)
        return
    return upload_json["data"]["image_key"]

async def send_bot_message(token, chat_id, data):
    data = await ve_bang_nhansu()
   
    message = (
        # "📊 **THÔNG BÁO DOANH SỐ**\n"
        f"- DOANH SỐ MỤC TIÊU: {data.get('muc_tieu_tong', 0):,.0f}\n"
        f"- DOANH SỐ THỰC TẾ: {data.get('thuc_te_tong', 0):,.0f}\n"
        f"- TỈ TRỌNG HOÀN THÀNH: {data.get('ty_le_hoan_thanh_tong'):.2f}%\n\n"
    )
    # bc_nhansu = await bao_bao_theo_nhansu()
    
    # === Cấu hình API ===
    url = "https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id"
    headers_json = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8"
    }

    # === Xác định đường dẫn ảnh ===
    current_dir = os.path.dirname(os.path.abspath(__file__))
    image_path_bieudo_doanhso = os.path.join(current_dir, "bang_nhansu.png")
    if not os.path.exists(image_path_bieudo_doanhso):
        print("❌ File ảnh không tồn tại:", image_path_bieudo_doanhso)
        return

    anh_tong_quan = await upload_image_to_lark(image_path_bieudo_doanhso, token)
    
    print("Image upload: ", anh_tong_quan)
    

    # === Tạo interactive card gửi ảnh + text ===
    today = datetime.now()
    url_webhook = "https://open.larksuite.com/open-apis/bot/v2/hook/b8315135-cc23-4414-8186-4f254578650e"
    # payload_card = {
    #     "receive_id": chat_id,
    #     "msg_type": "interactive",
    #     "content": json.dumps({  # ✅ KHÔNG cần card ở đây nữa
    #         "config": {
    #             "wide_screen_mode": True
    #         },
    #         "header": {
    #             "title": {
    #                 "tag": "plain_text",
    #                 "content": f"🔔 THÔNG BÁO DOANH SỐ {today.day}/{today.month}/{today.year}"
    #             }
    #         },
    #         "elements": [
    #             {
    #                 "tag": "div",
    #                 "text": {
    #                     "tag": "lark_md",
    #                     "content": message
    #                 }
    #             },
    #             {
    #                 "tag": "img",
    #                 "img_key": anh_tong_quan,
    #                 "alt": {
    #                     "tag": "plain_text",
    #                     "content": "Báo cáo doanh số"
    #                 }
    #             }
    #         ]
            
    #     })
    # }
    payload_card = {
        "msg_type": "interactive",   # ← DÒNG QUAN TRỌNG NHẤT – BẮT BUỘC PHẢI CÓ!
        "card": {
            "config": {
                "wide_screen_mode": True
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "content": message,
                        "tag": "lark_md"
                    }
                },
                {
                    "tag": "img",
                    "img_key": anh_tong_quan,
                    "alt": {
                        "tag": "plain_text",
                        "content": "Báo cáo doanh số"
                    },
                    "mode": "fit_horizontal"
                }
            ],
            "header": {
                "template": "turquoise",
                "title": {
                    "content": f"THÔNG BÁO DOANH SỐ {today.day}/{today.month}/{today.year}",
                    "tag": "plain_text"
                }
            }
        }
    }

    # response = requests.post(url, headers=headers_json, json=payload_card)
    response = requests.post(url_webhook, data=json.dumps(payload_card), headers={'Content-Type': 'application/json'})
    print("🖼 Tin nhắn interactive response:", response.status_code, response.text)

    try:

        return response.json()
    except Exception:
        return {"error": "Lỗi không đọc được JSON trả về"}



async def luu_anh(data):
    

    labels = ['Tổng', 'SALE', 'CSKH']
    thuc_te = [
        float(data["doanh_so_thuc_te"]),
        float(data["doanh_so_thuc_te_sale"]),
        float(data["doanh_so_thuc_te_cskh"])
    ]
    muc_tieu = [
        float(data["doanh_so_muc_tieu_ngay"]),
        float(data["doanh_so_muc_tieu_ngay_sale"]),
        float(data["doanh_so_muc_tieu_ngay_cskh"])
    ]

    x = np.arange(len(labels)) * 1.5
    width = 0.3
    gap = 0.05
    # max_value = max(thuc_te + muc_tieu)
    # height_inch = min(max(max_value / 1e6 * 0.15, 6), 12)
    # plt.figure(figsize=(12, height_inch))
    # plt.ylim(0, max_value * 1)
    # Màu sắc cho từng loại cột
    # Màu nóng cho Thực tế
    colors_thuc_te = ['#ff4c4c', '#ff9500', '#d500f9']     # đỏ, cam, tím
    colors_muc_tieu = ['#00a65a', '#007bff', '#00e5ff']    # xanh lá, xanh dương, xanh cyan




    bar1 = []
    bar2 = []
    for i in range(len(labels)):
        b1 = plt.bar(x[i] - width/2 - gap/2, muc_tieu[i], width=width, color=colors_muc_tieu[i])  # Mục tiêu bên trái
        b2 = plt.bar(x[i] + width/2 + gap/2, thuc_te[i], width=width, color=colors_thuc_te[i])    # Thực tế bên phải

        
        bar1.extend(b1)
        bar2.extend(b2)

    def add_labels(bars):
        for bar in bars:
            height = bar.get_height()
            if height >= 1e9:
                label = f'{height/1e9:.1f}B'
            elif height >= 1e6:
                label = f'{height/1e6:.1f}M'
            else:
                label = f'{height:,.0f}'
            plt.text(bar.get_x() + bar.get_width()/2, height, label,
                     ha='center', va='bottom', fontsize=11, fontweight='bold')

    add_labels(bar1)
    add_labels(bar2)

    plt.ylabel('Doanh số (VND)', fontsize=12)
    max_value = max(thuc_te + muc_tieu)
    plt.ylim(0, max_value * 1.15)
    # tick_step = 20_000_000
    # yticks = np.arange(0, max_value * 1.1, tick_step)
    # plt.yticks(yticks, fontsize=14)
    plt.gca().yaxis.set_major_formatter(mtick.FuncFormatter(lambda x, _: f'{x/1e6:.0f}M'))
    plt.title('Biểu đồ doanh số thực tế vs mục tiêu', fontsize=14, fontweight='bold')
    plt.xticks(x, labels)
    # plt.yticks(fontsize=16)

    # Tạo chú thích thủ công
    # from matplotlib.patches import Patch
    # legend_elements = [
    #     Patch(facecolor='#ff4c4c', label='Tổng - Thực tế'),
    #     Patch(facecolor='#ff9500', label='P.Truyền thông - Thực tế'),
    #     Patch(facecolor='#d500f9', label='P.Kinh doanh - Thực tế'),
    #     Patch(facecolor='#00a65a', label='Tổng - Mục tiêu'),
    #     Patch(facecolor='#007bff', label='P.Truyền thông - Mục tiêu'),
    #     Patch(facecolor='#00e5ff', label='P.Kinh doanh - Mục tiêu'),
    # ]

    # plt.legend(
    #     handles=legend_elements,
    #     loc='upper center',
    #     bbox_to_anchor=(0.5, -0.15),
    #     ncol=2,
    #     frameon=False,
    #     fontsize=11
    # )
    plt.grid(True, axis='y', linestyle='--', alpha=0.4)

    current_dir = os.path.dirname(os.path.abspath(__file__))
    image_path = os.path.join(current_dir, "bieudo_doanhso.png")
    plt.tight_layout()
    plt.savefig(image_path)
    plt.close()
    return os.path.abspath(image_path)

async def get_hoa_don(today):
    try:
        # conn = psycopg.connect("postgresql://postgres:duong1356@localhost:5432/he_thong_lead_traf")
        with conn.cursor() as cur:
            sql = "SELECT * FROM hoa_don WHERE DATE(thoi_gian) = %s"
            cur.execute(sql, (today,))
            hoa_don_base = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            hoa_don_base = [dict(zip(columns, row)) for row in hoa_don_base]
            return hoa_don_base
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi lấy dữ liệu: {str(e)}")
        traceback.print_exc()
        return {"success": False, "message": f"Lỗi khi lấy dữ liệu: {str(e)}"}

async def so_ngay_tru_chu_nhat_trong_thang_hien_tai():
    hom_nay = date.today()
    nam = hom_nay.year
    thang = hom_nay.month

    # Tìm ngày đầu và cuối tháng
    ngay_dau = date(nam, thang, 1)
    if thang == 12:
        ngay_cuoi = date(nam + 1, 1, 1) - timedelta(days=1)
    else:
        ngay_cuoi = date(nam, thang + 1, 1) - timedelta(days=1)

    # Đếm số ngày không phải Chủ Nhật
    ngay_hien_tai = ngay_dau
    dem = 0
    while ngay_hien_tai <= ngay_cuoi:
        if ngay_hien_tai.weekday() != 6:  # 6 là Chủ Nhật
            dem += 1
        ngay_hien_tai += timedelta(days=1)

    return dem

async def bao_bao_theo_nhansu():
    hom_nay = date.today()
    # hom_nay = date.today().replace(day=30)
    sql1 = """
        SELECT 
        tg.id_seller AS id_acc,
        tg.name_seller AS name_pt,
        tg.input_customer AS dau_vao,
        COUNT(iv.id_invoice) AS so_don,
        COALESCE(SUM(iv.subtotal), 0) AS tong_tien,
        COALESCE(AVG(NULLIF(iv.subtotal,0)), 0) AS aov_thuc_te,
        -- tỷ lệ chuyển đổi: số đơn / đầu vào * 100, tránh chia cho 0
        CASE 
            WHEN tg.input_customer > 0 THEN ROUND( (COUNT(iv.id_invoice)::numeric / tg.input_customer) * 100.0, 2 )
            ELSE 0
        END AS ty_le_chuyen_doi,
        tg.target_gmv AS muc_tieu,
        -- tỷ lệ hoàn thành mục tiêu: tổng doanh thu / mục tiêu * 100, tránh chia cho 0
        CASE
            WHEN tg.target_gmv > 0 THEN ROUND( (COALESCE(SUM(iv.subtotal),0)::numeric / tg.target_gmv) * 100.0, 2 )
            ELSE 0
        END AS ty_le_hoan_thanh,
        COALESCE(
            SUM(
                iv.gift_amount
                +
                CASE 
                    WHEN iv.subtotal < 500000 AND iv.type_fee_delivery = 'CC_CASH'
                        THEN iv.fee_delivery
                    ELSE 0
                END
            ), 
        0) AS cp_uudai,

        ROUND(
            (
                COALESCE(
                    SUM(
                        iv.gift_amount
                        +
                        CASE 
                            WHEN iv.subtotal < 500000 AND iv.type_fee_delivery = 'CC_CASH'
                                THEN iv.fee_delivery
                            ELSE 0
                        END
                    ), 
                0)::numeric 
                / NULLIF(SUM(iv.subtotal), 0)
            ) * 100.0,
        2
        ) AS ty_le_cp_udkm
        FROM target tg
        LEFT JOIN invoice iv
        ON tg.id_seller = CASE 
                            WHEN iv.id_seller IN (SELECT id_seller FROM target) THEN iv.id_seller 
                            ELSE 0                                                   -- gộp hết về 0
                        END
        -- lấy theo ngày 2025-11-25 theo giờ Việt Nam (chỉnh nếu thoi_gian đã lưu tz khác)
        -- AND DATE(iv.time_create) >= '2025-12-08' 
        AND DATE(iv.time_create) = %s
        AND iv.id_status <> 12
        AND (iv.id_salechannel = 1 OR iv.id_seller = 18)
        WHERE tg.id_seller IS NOT NULL
        GROUP BY tg.id_seller, tg.name_seller, tg.input_customer, tg.target_gmv
        ORDER BY ty_le_hoan_thanh DESC;
    """

    sql2 = """
        WITH hoa_don_F0 AS (
            SELECT
                CASE
                    WHEN id_salechannel IN (5,6) THEN 'TIKTOK SHOP LIVE'
                    WHEN id_salechannel IN (19,20) THEN 'SHOPEE'
                    WHEN id_salechannel IN (4,7) THEN 'TIKTOK SHOP ADS'
                    WHEN id_salechannel IN (2,3) THEN 'TIKTOK DATA'
                    WHEN id_salechannel IN (10) THEN 'GG/YTB'
                    ELSE 'KHÁC'
                END AS kenh_ban,
                COUNT(*) AS so_don,
                SUM(subtotal) AS tong_tien,
                COALESCE(SUM(gift_amount), 0) AS cp_uudai
            FROM invoice
            WHERE DATE(time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') = %s
                -- AND DATE(time_create) >= '2025-12-15'
                AND id_status <> 12
                AND id_salechannel <> 1
            GROUP BY 1
        )

        SELECT
            tg.name_seller AS kenh,
            tg.target_gmv AS muc_tieu,
            COALESCE(hd.so_don, 0) AS so_don,
            COALESCE(hd.tong_tien, 0) AS doanh_thu,
            -- AOV chuẩn
            CASE 
                WHEN COALESCE(hd.so_don, 0) > 0 
                THEN ROUND(hd.tong_tien::numeric / hd.so_don, 0)
                ELSE 0 
            END AS aov_thuc_te,
            CASE 
                WHEN tg.target_gmv > 0 
                THEN ROUND((COALESCE(hd.tong_tien, 0)::numeric / tg.target_gmv) * 100, 2)
                ELSE 0 
            END AS ty_le_hoan_thanh,
            hd.cp_uudai,
            ROUND((COALESCE(hd.cp_uudai, 0)::numeric / hd.tong_tien) * 100, 2) AS ty_le_cp_udkm
        FROM target tg
        LEFT JOIN hoa_don_F0 hd ON hd.kenh_ban = tg.name_seller
        WHERE tg.id_seller IS NULL
        ORDER BY ty_le_hoan_thanh DESC;

    """
    try:
        with conn_fm.cursor() as cur:
            cur.execute(sql1, (hom_nay,))
            bc_nhansu = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            bc_nhansu = [dict(zip(columns, row)) for row in bc_nhansu]

            cur.execute(sql2, (hom_nay,))
            bc_kenh = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            bc_kenh = [dict(zip(columns, row)) for row in bc_kenh]

            # === TÍNH TỔNG SIÊU NHANH TỪ 2 LIST TRÊN ===
            muc_tieu_tong = sum(item.get('muc_tieu', 0) for item in bc_nhansu) + \
                            sum(item.get('muc_tieu', 0) for item in bc_kenh)

            thuc_te_tong = sum(item.get('tong_tien', 0) for item in bc_nhansu) + \
                        sum(item.get('doanh_thu', 0) for item in bc_kenh)

            ty_le_tong = round(thuc_te_tong / muc_tieu_tong * 100, 2) if muc_tieu_tong > 0 else 0

            return {
                "fn": bc_nhansu,
                "f0": bc_kenh,
                "muc_tieu_tong": muc_tieu_tong,
                "thuc_te_tong": thuc_te_tong,
                "ty_le_hoan_thanh_tong": ty_le_tong
            }
    except Exception as e:  
        traceback.print_exc()
        conn_fm.rollback()
        print(f"❌ Lỗi khi truy vấn: {str(e)}")
        return {"dauky": 0, "cuoiky": 0} 
        
async def thi_dua_ngay():
    sql = """
    SELECT 
    mt.id_acc,
    mt.name_pt,
    COUNT(hd.*) AS so_don,
    COALESCE(SUM(hd.tong_tien), 0) AS tong_tien,
    COALESCE(AVG(NULLIF(hd.tong_tien,0)), 0) AS aov_thuc_te
    FROM muc_tieu mt
    LEFT JOIN hoa_don hd 
    ON mt.id_acc = CASE 
                        WHEN hd.id_acc_lendon IN (SELECT id_acc FROM muc_tieu) THEN hd.id_acc_lendon 
                        ELSE 0                                                   -- gộp hết về 0
                    END
    -- lấy theo ngày 2025-11-25 theo giờ Việt Nam (chỉnh nếu thoi_gian đã lưu tz khác)
    -- AND DATE(hd.thoi_gian) >= '2025-12-15' 
    AND DATE(hd.thoi_gian) = %s
    
    AND hd.trang_thai NOT ILIKE '%%hủy%%'
    AND hd.trang_thai NOT ILIKE '%%hoàn%%'
    AND hd.nguon_ban = 'CSKH'
    WHERE mt.id_acc IS NOT NULL
    AND mt.name_pt <> 'Khác'
    GROUP BY mt.id_acc, mt.name_pt
    ORDER BY so_don DESC, aov_thuc_te DESC;

    """
    try:
        hom_nay = date.today()
        # hom_nay = date.today().replace(day=22)
        with conn.cursor() as cur:
            cur.execute(sql, (hom_nay,))
            bc_nhansu = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            bc_nhansu = [dict(zip(columns, row)) for row in bc_nhansu]
            # print(json.dumps(bc_nhansu, indent=4, ensure_ascii=False, default=str))
            return bc_nhansu
    except Exception as e:  
        traceback.print_exc()
        conn.rollback()
        print(f"❌ Lỗi khi truy vấn: {str(e)}")   
        
        
# === THAY TOÀN BỘ HÀM ve_bang_nhansu() BẰNG HÀM NÀY ===
async def ve_bang_nhansu(output_filename: str = "bang_nhansu.png"):
    import os
    import pandas as pd
    import matplotlib.pyplot as plt
    from datetime import date

    # Lấy dữ liệu
    data = await bao_bao_theo_nhansu()
    df_cskh = pd.DataFrame(data.get("fn", []))
    df_kenh = pd.DataFrame(data.get("f0", []))

    # ==================== CHUẨN BỊ BẢNG CSKH ====================
    if df_cskh.empty:
        disp_cskh = pd.DataFrame([{"Người bán": "KHÔNG CÓ DỮ LIỆU CSKH"}])
    else:
        rename_map = {
            'name_pt': 'Người bán', 'id_acc': 'ID', 'dau_vao': 'Đầu vào',
            'so_don': 'Tổng đơn', 'tong_tien': 'GMV', 'aov_thuc_te': 'AOV',
            'muc_tieu': 'Mục tiêu', 'ty_le_chuyen_doi': 'Tỷ lệ chuyển đổi',
            'ty_le_hoan_thanh': 'Tỷ lệ hoàn thành'
        }
        df_cskh = df_cskh.rename(columns=rename_map)

        for c in ['Đầu vào', 'Tổng đơn', 'GMV', 'AOV', 'Mục tiêu']:
            if c in df_cskh.columns:
                df_cskh[c] = pd.to_numeric(df_cskh[c], errors='coerce').fillna(0)

        if 'Người bán' not in df_cskh.columns and 'ID' in df_cskh.columns:
            df_cskh['Người bán'] = df_cskh['ID']

        cols = ['Người bán', 'Đầu vào', 'Tổng đơn', 'GMV', 'AOV', 'Mục tiêu', 'Tỷ lệ chuyển đổi', 'Tỷ lệ hoàn thành']
        disp_cskh = df_cskh[[c for c in cols if c in df_cskh.columns]].copy()

        # Format
        for c in ['GMV', 'Tổng đơn', 'Đầu vào', 'Mục tiêu', 'AOV']:
            if c in disp_cskh.columns:
                disp_cskh[c] = disp_cskh[c].apply(lambda x: f"{x:,.0f}" if pd.notna(x) else "0")
        for c in ['Tỷ lệ chuyển đổi', 'Tỷ lệ hoàn thành']:
            if c in disp_cskh.columns:
                disp_cskh[c] = disp_cskh[c].apply(lambda x: f"{x:.2f}%" if pd.notna(x) else "0.00%")

        # Dòng tổng
        total = {'Người bán': 'TỔNG FN'}
        num = df_cskh.select_dtypes(include='number').sum()

        total_gmv = num.get('GMV', 0)
        total_don = num.get('Tổng đơn', 0)
        total_dauvao = num.get('Đầu vào', 0)
        total_muctieu = num.get('Mục tiêu', 0)

        # Các cột cơ bản
        total['Đầu vào'] = f"{total_dauvao:,.0f}"
        total['Tổng đơn'] = f"{total_don:,.0f}"
        total['GMV'] = f"{total_gmv:,.0f}"
        total['Mục tiêu'] = f"{total_muctieu:,.0f}"

        # AOV tổng - đây là cái bạn cần!
        if total_don > 0:
            aov_tong = total_gmv / total_don
            total['AOV'] = f"{aov_tong:,.0f}"
        else:
            total['AOV'] = "0"

        # Tỷ lệ chuyển đổi tổng
        total['Tỷ lệ chuyển đổi'] = f"{(total_don / total_dauvao * 100 if total_dauvao > 0 else 0):.2f}%"

        # Tỷ lệ hoàn thành mục tiêu tổng
        total['Tỷ lệ hoàn thành'] = f"{(total_gmv / total_muctieu * 100 if total_muctieu > 0 else 0):.2f}%"

        # Thêm dòng tổng vào bảng
        disp_cskh = pd.concat([disp_cskh, pd.DataFrame([total])], ignore_index=True)

    # ==================== CHUẨN BỊ BẢNG KÊNH F0 ====================
    if df_kenh.empty:
        disp_kenh = pd.DataFrame([{"Kênh": "KHÔNG CÓ DỮ LIỆU KÊNH"}])
    else:
        rename_map = {
            'kenh': 'Kênh', 'so_don': 'Tổng đơn', 'doanh_thu': 'GMV',
            'aov_thuc_te': 'AOV', 'muc_tieu': 'Mục tiêu', 'ty_le_hoan_thanh': 'Tỷ lệ hoàn thành'
        }
        df_kenh = df_kenh.rename(columns=rename_map)

        for c in ['Tổng đơn', 'GMV', 'AOV', 'Mục tiêu']:
            if c in df_kenh.columns:
                df_kenh[c] = pd.to_numeric(df_kenh[c], errors='coerce').fillna(0)

        cols = ['Kênh', 'Tổng đơn', 'GMV', 'AOV', 'Mục tiêu', 'Tỷ lệ hoàn thành']
        disp_kenh = df_kenh[[c for c in cols if c in df_kenh.columns]].copy()

        # Format
        for c in ['GMV', 'Tổng đơn', 'Mục tiêu', 'AOV']:
            if c in disp_kenh.columns:
                disp_kenh[c] = disp_kenh[c].apply(lambda x: f"{x:,.0f}" if pd.notna(x) else "0")
        if 'Tỷ lệ hoàn thành' in disp_kenh.columns:
            disp_kenh['Tỷ lệ hoàn thành'] = disp_kenh['Tỷ lệ hoàn thành'].apply(lambda x: f"{x:.2f}%" if pd.notna(x) else "0.00%")

                # Dòng tổng F0 – ĐÃ BỔ SUNG AOV TỔNG
        total_f0 = {'Kênh': 'TỔNG F0'}
        
        # Tính tổng từ dữ liệu gốc (chưa format)
        num_f0 = df_kenh.select_dtypes(include='number').sum()
        
        total_don_f0 = num_f0.get('Tổng đơn', 0)
        total_gmv_f0 = num_f0.get('GMV', 0)
        total_muctieu_f0 = num_f0.get('Mục tiêu', 0)

        # Các cột cơ bản
        total_f0['Tổng đơn']   = f"{total_don_f0:,.0f}"
        total_f0['GMV']        = f"{total_gmv_f0:,.0f}"
        total_f0['Mục tiêu']   = f"{total_muctieu_f0:,.0f}"

        # AOV tổng của F0 (GMV / Tổng đơn)
        if total_don_f0 > 0:
            aov_f0 = total_gmv_f0 / total_don_f0
            total_f0['AOV'] = f"{aov_f0:,.0f}"
        else:
            total_f0['AOV'] = "0"

        # Tỷ lệ hoàn thành mục tiêu tổng
        total_f0['Tỷ lệ hoàn thành'] = (
            f"{(total_gmv_f0 / total_muctieu_f0 * 100):.2f}%" 
            if total_muctieu_f0 > 0 else "0.00%"
        )

        # Thêm dòng tổng vào bảng F0
        disp_kenh = pd.concat([disp_kenh, pd.DataFrame([total_f0])], ignore_index=True)

    # ==================== VẼ 2 BẢNG TRONG 1 ẢNH ====================
    height_per_row = 0.35
    total_rows = len(disp_cskh) + len(disp_kenh) + 4
    fig = plt.figure(figsize=(16, max(6, total_rows * height_per_row)))

    # Bảng CSKH (trên)
    ax1 = fig.add_subplot(2, 1, 1)
    ax1.axis('off')
    table1 = ax1.table(cellText=disp_cskh.values,
                       colLabels=disp_cskh.columns,
                       cellLoc='center',
                       loc='center')
    table1.auto_set_font_size(False)
    table1.set_fontsize(11)
    table1.scale(1, 2.5)

    # Bảng Kênh (dưới)
    ax2 = fig.add_subplot(2, 1, 2)
    ax2.axis('off')
    table2 = ax2.table(cellText=disp_kenh.values,
                       colLabels=disp_kenh.columns,
                       cellLoc='center',
                       loc='center')
    table2.auto_set_font_size(False)
    table2.set_fontsize(11)
    table2.scale(1, 2.5)

    # Định dạng chung cho cả 2 bảng
    for table in (table1, table2):
        for (row, col), cell in table.get_celld().items():
            cell.set_edgecolor('black')
            cell.set_linewidth(0.5)
            if row == 0:  # Header
                cell.set_facecolor('#2c3e50')
                cell.set_text_props(weight='bold', color='white')
            elif cell.get_text().get_text() in ['TỔNG FN', 'TỔNG F0']:
                cell.set_facecolor('#f39c12')
                cell.set_text_props(weight='bold')
            # Cột tên: căn trái
            if col == 0:
                cell.get_text().set_ha('left')

    # Tiêu đề
    today_str = date.today().strftime("%d/%m/%Y")
    fig.suptitle(f"BÁO CÁO DOANH SỐ NGÀY {today_str}", fontsize=18, fontweight='bold', y=0.98)
    ax1.set_title("KÊNH FN", fontsize=14, fontweight='bold', pad=45)
    ax2.set_title("KÊNH F0", fontsize=14, fontweight='bold', pad=35)

    # Lưu ảnh
    plt.tight_layout(rect=[0, 0, 1, 0.95])
    current_dir = os.path.dirname(os.path.abspath(__file__))
    image_path = os.path.join(current_dir, output_filename)
    plt.savefig(image_path, dpi=200, bbox_inches='tight')
    plt.close()

    return data



async def bien_dong_doanhso():

    token = await get_access_token()
    chat_list = await get_chat_list(token)
    chat_id = ""
    for node in chat_list["data"].get("items", []):
        # if node["name"] == "Doanh Nghiệp - 2.0": # cần sửa ở đây ===========================================================================================
        #     chat_id = node["chat_id"]
            # break
        if node["name"] == "THÔNG BÁO DOANH SỐ REALTIME": # cần sửa ở đây ===========================================================================================
            chat_id = node["chat_id"]
            break
        # if node["name"] == "test": # cần sửa ở đây ===========================================================================================
        #     chat_id = node["chat_id"]
        #     break
    await send_bot_message(token, chat_id, data)
   

async def get_data_baocao():
    hom_nay = datetime.now().date()
    sql = """
        SELECT * 
        FROM hoa_don 
        WHERE DATE(thoi_gian) = %s 
        AND trang_thai NOT ILIKE '%%hủy%%' 
        AND trang_thai NOT ILIKE '%%hoàn%%'
        AND trang_thai <> ''
        AND nguon_ban NOT IN ('Đổi Hàng', 'GỬI BÙ')
    """
    with conn.cursor() as cur:
        cur.execute(sql, (hom_nay,))
        hoa_don_base = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        hoa_don_base = [dict(zip(columns, row)) for row in hoa_don_base]
        
        data_muctieu_thang = {
            "CSKH": 1360293222,
            "FACEBOOK": 60000000,
            "TIKTOK LANDING": 120000000,
            "YOUTUBE": 90000000,
            "TIKTOK SHOP": 180000000,
            "SHOPEE MALL": 120000000,
            # "KHÁC": 5000000,
        }
        
        today = datetime.now().day
        tile_cskh = 0.2 if today in (5, 12, 19, 26) else 3.67

        if today in (3, 4, 7, 10, 11, 14, 17, 18, 21, 24, 25, 28, 31):
            tile_data = 4
        elif today in (5, 12, 19, 26):
            tile_data = 1.5
        else:
            tile_data = 3

        if today in (9,11,16,24):
            tile_shop = 4
        elif today in (5, 12, 19):
            tile_shop = 2
        elif today in (10,15,25):
            tile_shop = 5
        else:
            tile_shop = 3

        from decimal import Decimal

        data_baocao = [
            {"name": "CSKH", "target": Decimal(str(data_muctieu_thang["CSKH"])) * Decimal(str(tile_cskh)) / Decimal("100"), "done": Decimal("0"), "over": Decimal("0")},
            {"name": "FACEBOOK", "target": Decimal(str(data_muctieu_thang["FACEBOOK"])) * Decimal(str(tile_data)) / Decimal("100"), "done": Decimal("0"), "over": Decimal("0")},
            {"name": "TIKTOK LANDING", "target": Decimal(str(data_muctieu_thang["TIKTOK LANDING"])) * Decimal(str(tile_data)) / Decimal("100"), "done": Decimal("0"), "over": Decimal("0")},
            {"name": "YOUTUBE", "target": Decimal(str(data_muctieu_thang["YOUTUBE"])) * Decimal(str(tile_data)) / Decimal("100"), "done": Decimal("0"), "over": Decimal("0")},
            {"name": "TIKTOK SHOP", "target": Decimal(str(data_muctieu_thang["TIKTOK SHOP"])) * Decimal(str(tile_shop)) / Decimal("100"), "done": Decimal("0"), "over": Decimal("0")},
            {"name": "SHOPEE MALL", "target": Decimal(str(data_muctieu_thang["SHOPEE MALL"])) * Decimal(str(tile_shop)) / Decimal("100"), "done": Decimal("0"), "over": Decimal("0")},
            {"name": "KHÁC", "target": Decimal("5000000"), "done": Decimal("0"), "over": Decimal("0")},
        ]


        data_baocao_nhansu = [
            {"name": "Lệ Trang - 0906023117", "target": round(data_muctieu_thang["CSKH"] * tile_cskh / 100 * 13.375 / 100), "actual": 0, "orders": 0},
            {"name": "Lộc Hạnh - 0839006862", "target": round(data_muctieu_thang["CSKH"] * tile_cskh / 100 * 13.375 / 100), "actual": 0, "orders": 0},
            {"name": "Ngô Ngân - 0353383100", "target": round(data_muctieu_thang["CSKH"] * tile_cskh / 100 * 13.375 / 100), "actual": 0, "orders": 0},
            {"name": "Vi Hậu - 0981385373", "target": round(data_muctieu_thang["CSKH"] * tile_cskh / 100 * 13.375 / 100), "actual": 0, "orders": 0},
            {"name": "Vân Anh - 0384586155", "target": round(data_muctieu_thang["CSKH"] * tile_cskh / 100 * 12.375 / 100), "actual": 0, "orders": 0},
            {"name": "Hoài Chang - 0325173345", "target": round(data_muctieu_thang["CSKH"] * tile_cskh / 100 * 11.375 / 100), "actual": 0, "orders": 0},
            {"name": "Thanh Hương - 0904273297", "target": round(data_muctieu_thang["CSKH"] * tile_cskh / 100 * 11.375 / 100), "actual": 0, "orders": 0},
            {"name": "Thu Trang - 0832184099", "target": round(data_muctieu_thang["CSKH"] * tile_cskh / 100 * 11.375 / 100), "actual": 0, "orders": 0},
        ]

        for node in hoa_don_base:
            if node["nguon_ban"] == "CSKH":
                data_baocao[0]["done"] += node["tong_tien"]
                if data_baocao[0]["done"] < data_baocao[0]["target"]:                 
                    data_baocao[0]["done"]
                else:
                    
                    data_baocao[0]["over"] = (data_baocao[0]["done"] - data_baocao[0]["target"])
                    data_baocao[0]["done"] = data_baocao[0]["target"]
            elif node["nguon_ban"] == "FACEBOOK":
                data_baocao[1]["done"] += node["tong_tien"]
                if data_baocao[1]["done"] < data_baocao[1]["target"]:                 
                    data_baocao[1]["done"]
                else:
                    
                    data_baocao[1]["over"] = (data_baocao[1]["done"] - data_baocao[1]["target"])
                    data_baocao[1]["done"] = data_baocao[1]["target"]
            elif node["nguon_ban"] == "TIKTOK LANDING" or node["nguon_ban"] == "HOTLINE-TIKTOK LANDING":
                data_baocao[2]["done"] += node["tong_tien"]
                if data_baocao[2]["done"] < data_baocao[2]["target"]:                 
                    data_baocao[2]["done"]
                else:
                    
                    data_baocao[2]["over"] = (data_baocao[2]["done"] - data_baocao[2]["target"])
                    data_baocao[2]["done"] = data_baocao[2]["target"]
            elif node["nguon_ban"] == "YOUTUBE":
                data_baocao[3]["done"] += node["tong_tien"]
                if data_baocao[3]["done"] < data_baocao[3]["target"]:                 
                    data_baocao[3]["done"]
                else:
                    
                    data_baocao[3]["over"] = (data_baocao[3]["done"] - data_baocao[3]["target"])
                    data_baocao[3]["done"] = data_baocao[3]["target"]
            elif "TIKTOK SHOP (" in node["nguon_ban"] or node["nguon_ban"] == "Tiktok Shop - CSKH" or node["nguon_ban"] == "TRAF - TRÀ VIỆT NAM":
                data_baocao[4]["done"] += node["tong_tien"]
                if data_baocao[4]["done"] < data_baocao[4]["target"]:                 
                    data_baocao[4]["done"]
                else:
                    
                    data_baocao[4]["over"] = (data_baocao[4]["done"] - data_baocao[4]["target"])
                    data_baocao[4]["done"] = data_baocao[4]["target"]
            elif node["nguon_ban"] == "TRAF OFFICIAL - TRÀ VIỆT NAM" or node["nguon_ban"] == "Shopee Mall TRAF - CSKH":
                data_baocao[5]["done"] += node["tong_tien"]
                if data_baocao[5]["done"] < data_baocao[5]["target"]:                 
                    data_baocao[5]["done"]
                else:
                    
                    data_baocao[5]["over"] = (data_baocao[5]["done"] - data_baocao[5]["target"])
                    data_baocao[5]["done"] = data_baocao[5]["target"]
            else:
                data_baocao[6]["done"] += node["tong_tien"]
                if data_baocao[6]["done"] < data_baocao[6]["target"]:                 
                    data_baocao[6]["done"]
                else:
                    
                    data_baocao[6]["over"] = (data_baocao[6]["done"] - data_baocao[6]["target"])
                    data_baocao[6]["done"] = data_baocao[6]["target"]


            for node_ns in data_baocao_nhansu:
                if node["nguoi_ban"] == node_ns["name"] and node["nguon_ban"] == "CSKH":
                    node_ns["actual"] += node["tong_tien"]
                    node_ns["orders"] += 1
                    break
        return {
            "success": True,
            "data": data_baocao,
            "data_nhansu": data_baocao_nhansu,
            "target": sum(item["target"] for item in data_baocao),
            "done": sum(item["done"] for item in data_baocao),
            "over": sum(item["over"] for item in data_baocao)
        }

async def create_QR(thong_tin):
    # https://zalo.me/s/1575573710529516487
    print("Tạo QR")
    link = "https://zalo.me/s/4505620871051668520"
    url = f"{link}?{urlencode(thong_tin, doseq=True)}"
    print(url)

    # Xác định thư mục gốc của script hoặc file thực thi
    base_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
    print("CWD:", base_dir)

    # Đường dẫn file QR
    output_path = os.path.join(
        os.path.dirname(os.path.dirname(base_dir)),
        "frontend", "image", "zalo_miniapp",
        f"{thong_tin['ma_hd']}.PNG"
    )

    # Kiểm tra nếu file chưa tồn tại thì mới tạo
    if not os.path.exists(output_path):
        print("🔹 Chưa có QR, tiến hành tạo...")
        make_zalo_qr(
            url,
            out_path=output_path,
            logo_path=os.path.join(base_dir, "zalo_logo.png"),  # hoặc None nếu không cần logo
            logo_ratio=0.18,
            pad_ratio=0.08,
            logo_round_ratio=0.05
        )
    else:
        print(f"✅ Đã có QR: {output_path}")
    
    
    
async def luu_kh_ck(data):
    try:
        with conn.cursor() as cur:
            sql = """
                INSERT INTO khach_hang_chuyen_khoan (
                    ten_kh,
                    orderid,
                    noi_dung_chuyen_khoan,
                    phuong_thuc_chuyen_khoan,
                    sdt,
                    tong_tien
                )
                VALUES (
                    %s,  -- ten_kh
                    %s,  -- orderId
                    %s,  -- noi_dung_chuyen_khoan
                    %s,  -- phuong_thuc_chuyen_khoan
                    %s,  -- sdt
                    %s   -- tong_tien
                );
            """ 
            sdt = f"84{''.join(filter(str.isdigit, data['PhoneNumber']))[-9:]}"
            cur.execute(sql, (data["CustomerName"], data["OrderID"], data["PaymentContent"], 
                            data["PaymentType"], sdt, data["TotalPrice"]))
            conn.commit()
    except Exception as e:
        print(f"❌ Lỗi khi truy vấn: {str(e)}")    

async def check_tt_chuyenkhoan(data):
    try:
        with conn.cursor() as cur:
            
            sql = """
                SELECT * FROM khach_hang_chuyen_khoan 
                WHERE tong_tien = %s
                AND %s ILIKE '%%' || noi_dung_chuyen_khoan || '%%'
                AND trang_thai IS NULL
            """ 
            
            cur.execute(sql, (float(data["amount"]), data["content"]))

            row = cur.fetchone()  # lấy 1 dòng nếu có
            

            if row:
                columns = [desc[0] for desc in cur.description]
                tt_chuyen_khoan = dict(zip(columns, row))
                print("✅ Nhận thanh toán thành công")
                
                cur.execute("""UPDATE khach_hang_chuyen_khoan SET trang_thai = 'Done' 
                            WHERE tong_tien = %s
                            AND %s ILIKE '%%' || noi_dung_chuyen_khoan || '%%'
                            AND trang_thai IS NULL
                            """, ((float(data["amount"]), data["content"])))
                conn.commit()
                url = "https://traduocvietnam.com/v1/be-mini-app/webhook/bank-transfer"
                payload = {
                    "crm_order_id": tt_chuyen_khoan["orderid"],
                    "status": "success" 
                }
                headers = {"Content-Type": "application/json"}
                response = requests.post(url, json=payload, headers=headers)
                print("🔁 Webhook gửi:", response.status_code, response.text)

                uidZalo = await checkFollow(tt_chuyen_khoan["sdt"])
                data_send_zns = {
                    "ten_kh": tt_chuyen_khoan["sdt"],
                    "ma_don_hang": tt_chuyen_khoan["orderid"]
                }

                if uidZalo:
                    sendzns = await sendByZNS(tt_chuyen_khoan["sdt"], data_send_zns, 500248)

                    if ("error" in sendzns) or sendzns["error_code"] != 0:
                        print("❌ Lỗi chưa gửi được tin nhắn")
                else:
                    sendzns = await sendByZNS(tt_chuyen_khoan["sdt"], data_send_zns, 500374)
                    if ("error" in sendzns) or sendzns["error_code"] != 0:
                        print("❌ Lỗi chưa gửi được tin nhắn")
                return True
            else:
                print("❌ Không tìm thấy thông tin thanh toán")
                return False
    except Exception as e:
        print(f"❌ Lỗi khi truy vấn: {str(e)}") 

async def tich_diem(data):
    url = "https://diemdanh.traduocvietnam.com/api/rewards/webhook/order"

    headers = {
        "Content-Type": "application/json"
    }

    payload = {
        "order_id": data["order_id"],
        "customer_name": data["customer_name"],
        "phone_number": data["phone_number"],
        "channel": data["channel"],
        "product": data["product"],
        "total_price": data["total_price"],
        "points": data["points"],
        "current_point": data.get("current_point", 0),
        "ma_kh": data["ma_kh"]
    }
    
    try:
        # Gửi request POST
        response = requests.post(url, json=payload, headers=headers)
        data_trave = response.json()
        if response.status_code == 200:
            diem_hien_tai = data.get("current_point", 0)
            diem_cong = data["points"]

            uidZalo = await checkFollow(data["phone_number"])
            

            if uidZalo:
                data_send_zns = {
                    "ten_kh": data["customer_name"],
                    "ma_kh": data["ma_kh"],
                    "tong_diem_hien_tai": str(diem_hien_tai),
                    "so": str(diem_cong),
                    "icon_la": " "
                }
                sendzns = await sendByZNS(data["phone_number"], data_send_zns, 500372)

            else:
                # data_send_zns = {
                #     "ten_KH": data["customer_name"],
                #     "so_diem": diem_cong,
                #     "ten_kh": data["customer_name"],
                #     "ma_khach_hang": ma_kh,
                #     "tong_diem": diem_hien_tai
                # }
                # dùng tạm form đã follow trước
                # sendzns = await sendByZNS(data["phone_number"], data_send_zns, 500378)
                data_send_zns = {
                    "ten_kh": data["customer_name"],
                    "ma_kh": data["ma_kh"],
                    "tong_diem_hien_tai": str(diem_hien_tai),
                    "so": str(diem_cong),
                    "icon_la": " "
                }
                sendzns = await sendByZNS(data["phone_number"], data_send_zns, 500372)
                
            if ("error" in sendzns) or sendzns["error_code"] != 0:
                print("❌ Lỗi chưa gửi được tin nhắn")
            print(json.dumps(sendzns, ensure_ascii=False))
        else:
            print("📤 Request sent to:", url)
            print("📦 Payload:", payload)
            print("🔁 Status code:", response.status_code)
            print("🧾 Response:", response.json())
    


        # In kết quả trả về
        


    except requests.exceptions.RequestException as e:
        print("❌ Lỗi khi gửi request:", str(e))




async def get_all_zns(from_date, to_date):
    tz = pytz.timezone("Asia/Ho_Chi_Minh")
    token = "Bearer " + "1418451931194267012:EY9kwBeBhRB3t3Q3gk7kfHzlQ2QnjM7R"
    BASE_URL = "https://api.etelecom.vn/v1/shop"   
    endpoint = f"{BASE_URL}.Zalo/ListMessages"
    all_items = []
    after = None
    limit = 100
    start_date = datetime.strptime(from_date, "%Y-%m-%d").date()
    end_date = datetime.strptime(to_date, "%Y-%m-%d").date()

    # 00:00:00
    date_from = tz.localize(
        datetime.combine(start_date, time.min)
    )

    # 23:59:59
    date_to = tz.localize(
        datetime.combine(end_date, time(23, 59, 59))
    )
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            payload = {
                "filter": {
                    "date_from": date_from.isoformat(),
                    "date_to": date_to.isoformat(),
                    "time_type": "request_time"
                },
                "paging": {
                    "limit": limit,
                    # "sort": "created_at:asc"
                }
            }

            if after:
                payload["paging"]["after"] = after

            
            res = await client.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": token
                },
                json=payload
            )

            result = res.json()

            items = result.get("messages", [])
            paging = result.get("paging", {})

            all_items.extend(items)

            after = paging.get("next")

            if not after or len(items) == 0:
                break

        sussess = 0
        error = 0

        for item in all_items:
            if item.get("error_code") == 0:
                sussess += 1
            else:
                error += 1

        print(f"Tổng tin nhắn: {len(all_items)} | Thành công: {sussess} | Lỗi: {error}")
        return {
            "total": len(all_items),
            "success": sussess,
            "error": error
        }

async def data_miniapp(from_date, to_date):
    start_total = datetime.now()
    try:
        with conn.cursor() as cur:
            sql1 = """
                SELECT nguon_app, COUNT(*)
                FROM khach_miniapp
                WHERE DATE(thoi_gian_join) >= %s AND DATE(thoi_gian_join) <= %s
                GROUP BY nguon_app
            """ 
            cur.execute(sql1, (from_date, to_date))
            traffic = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            traffic = [dict(zip(columns, row)) for row in traffic]
            traffic_map = {
                item["nguon_app"]: item.get("count", 0)
                for item in traffic
            }
            t1_end = datetime.now()

            sql2 = """
                SELECT COUNT(*)
                FROM khach_miniapp
                WHERE DATE(thoi_gian_join) >= %s AND DATE(thoi_gian_join) <= %s
                AND uid_user_oa IS NOT NULL
                AND uid_user_oa <> ''
            """
            cur.execute(sql2, (from_date, to_date))
            follow_oa = cur.fetchone()
            columns = [desc[0] for desc in cur.description]
            follow_oa = dict(zip(columns, follow_oa))
            t2_end = datetime.now()

            sql4 = """
                SELECT SUM(tong_tien)
                FROM lich_su_tichdiem
                WHERE DATE(thoi_gian) >= %s AND DATE(thoi_gian) <= %s
                AND phan_loai IS NOT NULL
            """
            cur.execute(sql4, (from_date, to_date))
            diem_tich_luy = cur.fetchone()[0] or 0
            t4_end = datetime.now()

        # SQL3 sử dụng fm_tdvn
        with conn_fm.cursor() as cur:
            sql3 = """
                SELECT COUNT(*), SUM(total_amount)
                FROM invoice
                WHERE DATE(time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') >= %s AND DATE(time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') <= %s
                AND status_value NOT ILIKE '%%hủy%%'
                AND name_salechannel = 'ZALO MINI APP'
            """
            cur.execute(sql3, (from_date, to_date))
            mini_app_orders = cur.fetchone()
            columns = [desc[0] for desc in cur.description]
            mini_app_orders = dict(zip(columns, mini_app_orders))
            t3_end = datetime.now()

        total_time = (datetime.now() - start_total).total_seconds()

        # print(f"""
        # ⏱️ data_miniapp timing:
        # - SQL1 traffic       : {(t1_end - start_total).total_seconds():.3f}s
        # - SQL2 follow_oa     : {(t2_end - t1_end).total_seconds():.3f}s
        # - SQL3 mini_app      : {(t3_end - t2_end).total_seconds():.3f}s
        # - SQL4 diem_tich_luy : {(t4_end - t3_end).total_seconds():.3f}s
        # - TOTAL              : {total_time:.3f}s
        # """)
        
        # data = {
        #     "traffic": traffic_map,
        #     "follow_oa": follow_oa,
        #     "mini_app_orders": mini_app_orders,
        #     "diem_tich_luy": diem_tich_luy
        # }
        # print("Data mini app:", json.dumps(data, ensure_ascii=False, indent=4))
        return {
            "traffic": traffic_map,
            "follow_oa": follow_oa,
            "mini_app_orders": mini_app_orders,
            "diem_tich_luy": diem_tich_luy
        }
            
            # return mini_app_orders
    except Exception as e:  
        traceback.print_exc()
        conn.rollback()
        print(f"❌ Lỗi khi truy vấn: {str(e)}")

async def bao_cao_zns(from_date, to_date):
    try:
        start_total = datetime.now()
        zns_report = await get_all_zns(from_date, to_date)
        t1_end = datetime.now()
        data_mini = await data_miniapp(from_date, to_date)
        t2_end = datetime.now()
        print(f"""
            ⏱️ data_miniapp timing:
            - SQL1 traffic       : {(t1_end - start_total).total_seconds():.3f}s
            - SQL2 follow_oa     : {(t2_end - t1_end).total_seconds():.3f}s
            
            """)
        return {
            "zns": [zns_report["total"], 0, 0],
            "success": [zns_report["success"], 0, 0],
            "rate_success": [zns_report["success"]/zns_report["total"]*100, 0, 0],
            "follow": [data_mini["follow_oa"].get("count", 0), 0, 0],
            "rate_follow": [data_mini["follow_oa"].get("count", 0)/zns_report["success"]*100, 0, 0],
            "app_point": [data_mini["traffic"].get("App tích điểm", 0), 0, 0],
            "rate_app_point": [data_mini["traffic"].get("App tích điểm", 0)/zns_report["success"]*100, 0, 0],
            "app_sale": [data_mini["traffic"].get("App bán hàng", 0), 0, 0],
            "rate_app_sale": [data_mini["traffic"].get("App bán hàng", 0)/zns_report["success"]*100, 0, 0],
            "orders": [data_mini["mini_app_orders"].get("count", 0), 0, 0],
            "rate_order": [data_mini["mini_app_orders"].get("count", 0)/zns_report["success"]*100, 0, 0],
            "revenue": [data_mini["mini_app_orders"].get("sum", 0), 0, 0],
            "gift": [data_mini["diem_tich_luy"], 0, 0]
        }
    except Exception as e:  
        traceback.print_exc()
        print(f"❌ Lỗi khi truy vấn: {str(e)}")


thong_tin = {
    "ma_hd": 'HD123456',
    "tong_tien": 1500000,
    "ma_kh": 'KH001',
    "sdt": '84909123456',
    "nhan_vien_ban_hang": 'Nguyen Van A',
}
data = {
    "don_hang_moi": datetime.now().strftime("%H:%M:%S %d-%m-%Y"),
    "kenh": "PTKH B2C (F0)",
    "nguoi_ban": "AK0039 - Lộc Thị Hạnh",
    "san_pham": "FX/TP-CC03-500/KRx2"+"\n"+"QT/TP-K03x1",
    "ma_hoa_don": "HD018963",
    "trang_thai": "Đã hủy"
}
# asyncio.run(data_miniapp('2025-12-05', '2025-12-05'))


# ===================== BÁO CÁO DOANH SỐ F0 =====================

MUC_TIEU_F0 = 0

# Cấu trúc nhóm kênh F0: (group_name, [danh sách kênh con])
# group_name = None nếu là kênh độc lập
GROUPS_F0 = [
    (None,          ["SHOPEE"]),
    ("TIKTOK",      ["TIKTOK DATA", "TIKTOK SHOP SPARK", "TIKTOK LIVE (PHƯƠNG ANH)", "TIKTOK LIVE (HẢI HÀ)"]),
    ("FACEBOOK",    ["FACEBOOK DATA", "FACEBOOK LIVE"]),
    ("ZALO",        ["ZALO ADS", "ZALO LIVE", "ZALO MINI APP"]),
    ("THƯƠNG HIỆU", ["Google/Website", "Tổng đài", "Bán trực tiếp", "B2B (SỈ)"]),
]


async def bao_cao_f0_ngay(from_date: str, to_date: str):
    """Báo cáo doanh số F0 theo kênh nhóm, lọc theo khoảng ngày."""
    sql = """
        WITH kenh_mapped AS (
            SELECT
                CASE
                    WHEN id_salechannel IN (19,20)              THEN 'SHOPEE'
                    WHEN id_salechannel IN (2,3)                THEN 'TIKTOK DATA'
                    WHEN id_salechannel = 4                     THEN 'TIKTOK SHOP SPARK'
                    WHEN id_salechannel = 5                     THEN 'TIKTOK LIVE (PHƯƠNG ANH)'
                    WHEN id_salechannel = 6                     THEN 'TIKTOK LIVE (HẢI HÀ)'
                    WHEN id_salechannel = 13                    THEN 'ZALO ADS'
                    WHEN id_salechannel = 12                    THEN 'ZALO MINI APP'
                    WHEN name_salechannel ILIKE '%%ZALO LIVE%%' THEN 'ZALO LIVE'
                    WHEN id_salechannel = 10                    THEN 'Google/Website'
                    WHEN id_salechannel = 15                    THEN 'Bán trực tiếp'
                    WHEN id_salechannel = 17                    THEN 'B2B (SỈ)'
                    WHEN name_salechannel ILIKE '%%FACEBOOK LIVE%%' THEN 'FACEBOOK LIVE'
                    WHEN name_salechannel ILIKE '%%FACEBOOK%%'  THEN 'FACEBOOK DATA'
                    WHEN name_salechannel ILIKE '%%Tổng đài%%'  THEN 'Tổng đài'
                    ELSE NULL
                END AS kenh_ban,
                subtotal
            FROM invoice
            WHERE DATE(time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') BETWEEN %s AND %s
              AND id_status <> 12
              AND id_salechannel <> 1
        )
        SELECT
            kenh_ban                                    AS kenh,
            COUNT(*)                                    AS so_don,
            COALESCE(SUM(subtotal), 0)                  AS doanh_thu,
            CASE
                WHEN COUNT(*) > 0
                THEN ROUND(SUM(subtotal)::numeric / COUNT(*), 0)
                ELSE 0
            END                                         AS aov
        FROM kenh_mapped
        WHERE kenh_ban IS NOT NULL
        GROUP BY kenh_ban
        ORDER BY doanh_thu DESC
    """
    try:
        with conn_fm.cursor() as cur:
            cur.execute(sql, (from_date, to_date))
            rows = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            data_raw = {row[0]: dict(zip(columns, row)) for row in rows}

        _labels = "abcdefghijklmnopqrstuvwxyz"
        result = []
        for group_name, sub_kenhs in GROUPS_F0:
            if group_name is None:
                # Kênh độc lập (không có nhóm cha)
                for sub_kenh in sub_kenhs:
                    raw = data_raw.get(sub_kenh, {})
                    result.append({
                        "kenh": sub_kenh,
                        "muc_tieu": MUC_TIEU_F0,
                        "so_don": int(raw.get("so_don", 0)),
                        "doanh_thu": float(raw.get("doanh_thu", 0)),
                        "aov": float(raw.get("aov", 0)),
                        "is_group": False,
                        "sub": []
                    })
            else:
                # Kênh nhóm: tính tổng từ các kênh con
                sub_data = []
                group_total_doanh = 0.0
                group_total_don = 0
                for idx, sub_kenh in enumerate(sub_kenhs):
                    raw = data_raw.get(sub_kenh, {})
                    sub_don = int(raw.get("so_don", 0))
                    sub_doanh = float(raw.get("doanh_thu", 0))
                    sub_aov = float(raw.get("aov", 0))
                    sub_data.append({
                        "kenh": sub_kenh,
                        "sub_label": _labels[idx],
                        "muc_tieu": MUC_TIEU_F0,
                        "so_don": sub_don,
                        "doanh_thu": sub_doanh,
                        "aov": sub_aov
                    })
                    group_total_doanh += sub_doanh
                    group_total_don += sub_don
                group_aov = round(group_total_doanh / group_total_don) if group_total_don > 0 else 0
                result.append({
                    "kenh": group_name,
                    "muc_tieu": MUC_TIEU_F0 * len(sub_kenhs),
                    "so_don": group_total_don,
                    "doanh_thu": group_total_doanh,
                    "aov": group_aov,
                    "is_group": True,
                    "sub": sub_data
                })

        # Thêm nhóm UPSELL từ dữ liệu FN
        fn_sellers = await bao_cao_fn_ngay(from_date, to_date)

        # Tính lịch bán hàng & số đơn từ lịch cho từng seller
        lich_dict = {}       # {id_seller: lich_ban_hang_count}
        don_tu_lich_dict = {}  # {id_seller: so_don_tu_lich}

        id_sellers_all = [s["id_seller"] for s in fn_sellers if s.get("id_seller")]
        if id_sellers_all:
            try:
                # Bước 0: Lấy code_seller cho TẤT CẢ sellers (không lọc theo ngày)
                # để tránh mất mapping với sellers chưa có đơn trong kỳ lọc
                seller_id_to_code: dict = {}
                with conn_fm.cursor() as cur_fm_cs:
                    placeholders_ids = ','.join(['%s'] * len(id_sellers_all))
                    cur_fm_cs.execute(
                        f"""
                        SELECT id_seller, MAX(code_seller) AS code_seller
                        FROM invoice
                        WHERE id_seller IN ({placeholders_ids})
                          AND code_seller IS NOT NULL
                          AND code_seller <> ''
                        GROUP BY id_seller
                        """,
                        id_sellers_all
                    )
                    for row in cur_fm_cs.fetchall():
                        seller_id_to_code[row[0]] = row[1]

                # Bước 1: Map code_seller (user_id) -> id_acc từ account_users
                code_sellers = list(seller_id_to_code.values())
                seller_code_to_id_acc = {}  # {code_seller: id_acc}
                if code_sellers:
                    with conn.cursor() as cur_crm:
                        placeholders_cs = ','.join(['%s'] * len(code_sellers))
                        cur_crm.execute(
                            f"""
                            SELECT user_id, id_acc
                            FROM account_users
                            WHERE user_id IN ({placeholders_cs})
                            """,
                            code_sellers
                        )
                        for row in cur_crm.fetchall():
                            seller_code_to_id_acc[row[0]] = row[1]

                # Build id_seller -> id_acc mapping
                seller_id_to_id_acc = {}
                for sid, code_sel in seller_id_to_code.items():
                    id_acc = seller_code_to_id_acc.get(code_sel)
                    if id_acc:
                        seller_id_to_id_acc[sid] = id_acc

                id_accs = list(set(seller_id_to_id_acc.values()))

                if id_accs:
                    # Bước 2: lấy (id_acc, ma_kh) của KH có lịch bán hàng trong khoảng ngày lọc
                    with conn.cursor() as cur_crm:
                        placeholders_acc = ','.join(['%s'] * len(id_accs))
                        cur_crm.execute(
                            f"""
                            SELECT id_acc, ma_kh
                            FROM khach_hang
                            WHERE id_acc IN ({placeholders_acc})
                              AND ngay_hen_banhang IS NOT NULL
                              AND DATE(ngay_hen_banhang) BETWEEN %s AND %s
                            """,
                            id_accs + [from_date, to_date]
                        )
                        kh_rows = cur_crm.fetchall()

                    # Gom nhóm ma_kh theo id_acc
                    id_acc_to_ma_kh: dict = {}
                    for id_acc, ma_kh in kh_rows:
                        if id_acc not in id_acc_to_ma_kh:
                            id_acc_to_ma_kh[id_acc] = []
                        id_acc_to_ma_kh[id_acc].append(ma_kh)

                    # Build lich_dict: id_seller -> count
                    for sid, id_acc in seller_id_to_id_acc.items():
                        kh_list = id_acc_to_ma_kh.get(id_acc, [])
                        lich_dict[sid] = len(kh_list)

                    # Bước 3: đếm số đơn FN trong kỳ thuộc KH có lịch bán hàng
                    all_ma_kh = [ma_kh for khs in id_acc_to_ma_kh.values() for ma_kh in khs]
                    if all_ma_kh:
                        with conn_fm.cursor() as cur_fm2:
                            placeholders_kh = ','.join(['%s'] * len(all_ma_kh))
                            cur_fm2.execute(
                                f"""
                                SELECT iv.id_seller, COUNT(*) AS so_don
                                FROM invoice iv
                                WHERE DATE(iv.time_create) BETWEEN %s AND %s
                                  AND iv.id_status <> 12
                                  AND (iv.id_salechannel = 1 OR iv.id_seller = 18)
                                  AND iv.code_customer IN ({placeholders_kh})
                                GROUP BY iv.id_seller
                                """,
                                [from_date, to_date] + all_ma_kh
                            )
                            for row in cur_fm2.fetchall():
                                don_tu_lich_dict[row[0]] = int(row[1])
            except Exception as e_lich:
                traceback.print_exc()
                print(f"⚠️ Lỗi tính lich_ban_hang UPSELL: {str(e_lich)}")

        upsell_sub = []
        upsell_total_doanh = 0.0
        upsell_total_don = 0
        upsell_total_cp = 0.0
        upsell_total_lich = 0
        upsell_total_don_tu_lich = 0
        for idx, seller in enumerate(fn_sellers):
            sub_don = int(seller.get("so_don", 0))
            sub_doanh = float(seller.get("doanh_thu", 0))
            sub_aov = float(seller.get("aov", 0))
            sub_fee_delivery = float(seller.get("sum_fee_delivery", 0))
            sub_gift_amount = float(seller.get("sum_gift_amount", 0))
            sub_cp = sub_fee_delivery + sub_gift_amount
            sub_cpbh = round(sub_cp / sub_doanh * 100, 2) if sub_doanh > 0 else 0
            sub_id = seller.get("id_seller")
            sub_lich = lich_dict.get(sub_id, 0)
            sub_don_tu_lich = don_tu_lich_dict.get(sub_id, 0)
            sub_ti_le = round(sub_don_tu_lich / sub_lich * 100, 2) if sub_lich > 0 else 0
            upsell_sub.append({
                "kenh": seller["name_seller"],
                "code_seller": seller.get("code_seller") or seller["name_seller"],
                "sub_label": _labels[idx % len(_labels)],
                "muc_tieu": 0,
                "so_don": sub_don,
                "doanh_thu": sub_doanh,
                "aov": sub_aov,
                "cpbh": sub_cpbh,
                "lich_ban_hang": sub_lich,
                "so_don_tu_lich": sub_don_tu_lich,
                "ti_le_chot": sub_ti_le,
                "is_fn": True
            })
            upsell_total_doanh += sub_doanh
            upsell_total_don += sub_don
            upsell_total_cp += sub_cp
            upsell_total_lich += sub_lich
            upsell_total_don_tu_lich += sub_don_tu_lich
        upsell_aov = round(upsell_total_doanh / upsell_total_don) if upsell_total_don > 0 else 0
        upsell_cpbh = round(upsell_total_cp / upsell_total_doanh * 100, 2) if upsell_total_doanh > 0 else 0
        upsell_ti_le = round(upsell_total_don_tu_lich / upsell_total_lich * 100, 2) if upsell_total_lich > 0 else 0
        result.append({
            "kenh": "UPSELL",
            "muc_tieu": 0,
            "so_don": upsell_total_don,
            "doanh_thu": upsell_total_doanh,
            "aov": upsell_aov,
            "cpbh": upsell_cpbh,
            "lich_ban_hang": upsell_total_lich,
            "so_don_tu_lich": upsell_total_don_tu_lich,
            "ti_le_chot": upsell_ti_le,
            "is_group": True,
            "is_upsell": True,
            "sub": upsell_sub
        })

        return result
    except Exception as e:
        traceback.print_exc()
        conn_fm.rollback()
        print(f"❌ Lỗi bao_cao_f0_ngay: {str(e)}")
        return []


async def chi_tiet_hoadon_theo_kenh(kenh: str, from_date: str, to_date: str):
    """Lấy danh sách hóa đơn chi tiết theo kênh F0 và khoảng ngày."""
    sql = """
        WITH kenh_mapped AS (
            SELECT
                CASE
                    WHEN id_salechannel IN (19,20)              THEN 'SHOPEE'
                    WHEN id_salechannel IN (2,3)                THEN 'TIKTOK DATA'
                    WHEN id_salechannel = 4                     THEN 'TIKTOK SHOP SPARK'
                    WHEN id_salechannel = 5                     THEN 'TIKTOK LIVE (PHƯƠNG ANH)'
                    WHEN id_salechannel = 6                     THEN 'TIKTOK LIVE (HẢI HÀ)'
                    WHEN id_salechannel = 13                    THEN 'ZALO ADS'
                    WHEN id_salechannel = 12                    THEN 'ZALO MINI APP'
                    WHEN name_salechannel ILIKE '%%ZALO LIVE%%' THEN 'ZALO LIVE'
                    WHEN id_salechannel = 10                    THEN 'Google/Website'
                    WHEN id_salechannel = 15                    THEN 'Bán trực tiếp'
                    WHEN id_salechannel = 17                    THEN 'B2B (SỈ)'
                    WHEN name_salechannel ILIKE '%%FACEBOOK LIVE%%' THEN 'FACEBOOK LIVE'
                    WHEN name_salechannel ILIKE '%%FACEBOOK%%'  THEN 'FACEBOOK DATA'
                    WHEN name_salechannel ILIKE '%%Tổng đài%%'  THEN 'Tổng đài'
                    ELSE NULL
                END AS kenh_ban,
                code_invoice,
                name_customer,
                phone_number,
                subtotal,
                time_create,
                status_value,
                name_seller,
                name_salechannel
            FROM invoice
            WHERE DATE(time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') BETWEEN %s AND %s
              AND id_status <> 12
              AND id_salechannel <> 1
        )
        SELECT
            code_invoice,
            name_customer,
            phone_number,
            subtotal,
            time_create,
            status_value,
            name_seller,
            name_salechannel,
            kenh_ban
        FROM kenh_mapped
        WHERE kenh_ban = %s
        ORDER BY time_create DESC
    """
    try:
        with conn_fm.cursor() as cur:
            cur.execute(sql, (from_date, to_date, kenh))
            rows = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            result = []
            for row in rows:
                item = dict(zip(columns, row))
                # Chuyển datetime sang string để JSON serializable
                if item.get("time_create"):
                    dt = item["time_create"]
                    import pytz
                    if dt.tzinfo is None:
                        dt = pytz.utc.localize(dt)
                    dt = dt.astimezone(pytz.timezone('Asia/Ho_Chi_Minh'))
                    item["time_create"] = dt.strftime("%Y-%m-%d %H:%M:%S")
                result.append(item)
            return result
    except Exception as e:
        traceback.print_exc()
        conn_fm.rollback()
        print(f"❌ Lỗi chi_tiet_hoadon_theo_kenh: {str(e)}")
        return []


# ===================== BÁO CÁO DOANH SỐ FN (NHÂN VIÊN) =====================

async def bao_cao_fn_ngay(from_date: str, to_date: str):
    """Báo cáo doanh số FN theo từng nhân viên (bao gồm cả người chưa có đơn), lọc theo khoảng ngày."""
    sql = """
        SELECT
            tg.id_seller,
            tg.name_seller,
            COALESCE(MAX(iv.code_seller), '') AS code_seller,
            COUNT(NULLIF(iv.id_invoice, 0)) AS so_don,
            COALESCE(SUM(iv.subtotal), 0) AS doanh_thu,
            CASE
                WHEN COUNT(NULLIF(iv.id_invoice, 0)) > 0
                THEN ROUND(SUM(iv.subtotal)::numeric / COUNT(NULLIF(iv.id_invoice, 0)), 0)
                ELSE 0
            END AS aov,
            COALESCE(SUM(iv.fee_delivery), 0) AS sum_fee_delivery,
            COALESCE(SUM(iv.gift_amount), 0) AS sum_gift_amount
        FROM target tg
        LEFT JOIN invoice iv
            ON tg.id_seller = CASE
                                  WHEN iv.id_seller IN (SELECT id_seller FROM target) THEN iv.id_seller
                                  ELSE 0
                              END
            AND DATE(iv.time_create) BETWEEN %s AND %s
            AND iv.id_status <> 12
            AND (iv.id_salechannel = 1 OR iv.id_seller = 18)
        WHERE tg.id_seller IS NOT NULL
        GROUP BY tg.id_seller, tg.name_seller
        ORDER BY doanh_thu DESC
    """
    try:
        with conn_fm.cursor() as cur:
            cur.execute(sql, (from_date, to_date))
            rows = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        traceback.print_exc()
        conn_fm.rollback()
        print(f"❌ Lỗi bao_cao_fn_ngay: {str(e)}")
        return []


async def chi_tiet_fn_theo_nhanvien(code_seller: str, from_date: str, to_date: str):
    """Lấy danh sách hóa đơn chi tiết của một nhân viên FN theo khoảng ngày."""
    sql = """
        SELECT
            code_invoice,
            name_customer,
            phone_number,
            subtotal,
            time_create,
            status_value,
            name_seller,
            name_salechannel
        FROM invoice
        WHERE DATE(time_create AT TIME ZONE 'Asia/Ho_Chi_Minh') BETWEEN %s AND %s
          AND id_status <> 12
          AND (id_salechannel = 1 OR id_seller = 18)
          AND code_seller = %s
        ORDER BY time_create DESC
    """
    try:
        with conn_fm.cursor() as cur:
            cur.execute(sql, (from_date, to_date, code_seller))
            rows = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            result = []
            for row in rows:
                item = dict(zip(columns, row))
                if item.get("time_create"):
                    dt = item["time_create"]
                    import pytz
                    if dt.tzinfo is None:
                        dt = pytz.utc.localize(dt)
                    dt = dt.astimezone(pytz.timezone('Asia/Ho_Chi_Minh'))
                    item["time_create"] = dt.strftime("%Y-%m-%d %H:%M:%S")
                result.append(item)
            return result
    except Exception as e:
        traceback.print_exc()
        conn_fm.rollback()
        print(f"❌ Lỗi chi_tiet_fn_theo_nhanvien: {str(e)}")
        return []


# ===================== PHÂN LOẠI KÊnh F0 =====================

CHANNEL_ASSIGN_MAP = {
    'SHOPEE':                   {'id_salechannel': 19, 'name_salechannel': 'SHOPEE MALL'},
    'TIKTOK DATA':              {'id_salechannel': 2,  'name_salechannel': 'TIKTOK DATA'},
    'TIKTOK SHOP SPARK':        {'id_salechannel': 4,  'name_salechannel': 'TIKTOK SHOP ADS'},
    'TIKTOK LIVE (PHƯƠNG ANH)': {'id_salechannel': 5,  'name_salechannel': 'TIKTOK LIVE (PHƯƠNG ANH)'},
    'TIKTOK LIVE (HẢI HÀ)':    {'id_salechannel': 6,  'name_salechannel': 'TIKTOK LIVE (HẢI HÀ)'},
    'ZALO ADS':                 {'id_salechannel': 13, 'name_salechannel': 'ZALO ADS'},
    'ZALO LIVE':                {'id_salechannel': 0, 'name_salechannel': 'ZALO LIVE'},
    'ZALO MINI APP':            {'id_salechannel': 12, 'name_salechannel': 'ZALO MINI APP'},
    'Google/Website':           {'id_salechannel': 10, 'name_salechannel': 'WEBSITE'},
    'Bán trực tiếp':            {'id_salechannel': 15, 'name_salechannel': 'Bán trực tiếp'},
    'B2B (SỈ)':                 {'id_salechannel': 17, 'name_salechannel': 'B2B (SỈ)'},
    # Nhóm Facebook & Tổng đài: dùng id=0 để khởi động name-based mapping trong SQL
    'FACEBOOK DATA':            {'id_salechannel': 0,  'name_salechannel': 'FACEBOOK'},
    'FACEBOOK LIVE':            {'id_salechannel': 0,  'name_salechannel': 'FACEBOOK LIVE'},
    'Tổng đài':                 {'id_salechannel': 0,  'name_salechannel': 'Tổng đài'},
}

# Các kênh trong cùng nhóm (dùng để validate frontend)
GROUPS_ASSIGN = {
    'TIKTOK':       ['TIKTOK DATA', 'TIKTOK SHOP SPARK', 'TIKTOK LIVE (PHƯƠNG ANH)', 'TIKTOK LIVE (HẢI HÀ)'],
    'FACEBOOK':     ['FACEBOOK DATA', 'FACEBOOK LIVE'],
    'ZALO':         ['ZALO ADS', 'ZALO LIVE', 'ZALO MINI APP'],
    'THƯƠNG HIỆU':  ['Google/Website', 'Tổng đài', 'Bán trực tiếp', 'B2B (SỈ)'],
}

def _get_group(kenh: str):
    for group, members in GROUPS_ASSIGN.items():
        if kenh in members:
            return group
    return None


async def assign_kenh_f0(code_invoice: str, source_kenh: str, target_kenh: str):
    """Chuyển đơn hàng sang kênh khác trong cùng nhóm."""
    if target_kenh not in CHANNEL_ASSIGN_MAP:
        raise ValueError(f"Kênh không hợp lệ: {target_kenh}")
    # Đảm bảo source và target cùng nhóm
    if _get_group(source_kenh) != _get_group(target_kenh) or _get_group(target_kenh) is None:
        raise ValueError(f"Không thể chuyển giữa 2 nhóm khác nhau: {source_kenh} → {target_kenh}")
    mapping = CHANNEL_ASSIGN_MAP[target_kenh]
    try:
        with conn_fm.cursor() as cur:
            cur.execute(
                """UPDATE invoice
                   SET id_salechannel = %s, name_salechannel = %s
                   WHERE code_invoice = %s""",
                (mapping['id_salechannel'], mapping['name_salechannel'], code_invoice)
            )
            updated = cur.rowcount
            conn_fm.commit()
            return {'success': True, 'updated': updated, 'target_kenh': target_kenh}
    except Exception as e:
        traceback.print_exc()
        conn_fm.rollback()
        raise




























