import asyncio
from datetime import datetime
import json
import re
from typing import List
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, requests
import httpx
from utils.security import check_token
from model.hoadon import lich_su_mua, bao_cao_theo_nguoi_ban, dong_bo_hoadon
import requests 
from starlette.requests import ClientDisconnect
router = APIRouter()


async def get_access_token():
    app_id = "cli_a74cebb0d1f89010"
    app_secret = "IOKQ6fsGdNq1NIEUZv26mbpIuGGQyjKn"
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

async def send_bot_message(token, chat_id, message_text):

    url = "https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8"
    }

    payload = {
        "receive_id": chat_id,
        "msg_type": "text",
        "content": json.dumps({
            "text": message_text
        })
    }

    response = requests.post(url, headers=headers, json=payload)
    data = response.json()
    # print(json.dumps(data, indent=4, ensure_ascii=False))
    return data


def format_number_with_comma(number):
    return f"{number:,.0f}".replace(",", ".")

# Gửi dữ liệu lên Google Sheet qua Apps Script (async)
async def up_sheet(data):
    url = "https://script.google.com/macros/s/AKfycbwx9OhimFMR9riwA53qyd2Xv2HXAoSxUyI8hzOTYGcIVmdTAkabyP6yXFU8xAZpeDDP/exec"
    async with httpx.AsyncClient() as client: 
        response = await client.post(url, json=data)
        print(f"📤 Gửi lên sheet: {response.status_code} | {response.text}")

async def parse_sms_body(body_text, sheet):
    print(body_text)
    lines = body_text.strip().split('\n')
    print(lines[0])
    ngan_hang = ''
    tk = ''
    so_tien = 0
    noi_dung = ''
    so_du = 0
    time = 0
    if 'OCB' in lines[0]:
        for line in lines:
            line = line.strip()
            if line.startswith('name:'):
                ngan_hang = line.split(':', 1)[1].strip()
            elif line.startswith('TK'):
                tk = line.split(' ')[1].strip()
            elif '(+)' in line or '(-)' in line:
                match = re.search(r'([\+\-]?\(?\)?\s?\d{1,3}(?:,\d{3})*)', line)
                if match:
                    raw_amount = match.group(1).replace('(', '').replace(')', '').replace(',', '').replace(' ', '')
                    so_tien = int(raw_amount)
                    
            elif line.startswith('N/dung:'):
                noi_dung = line.split(':', 1)[1].strip()
            elif line.startswith('So du:'):
                so_du_str = line.split(':', 1)[1].replace(',', '').strip().split(' ')[0]
                so_du = int(so_du_str)
            elif line.startswith('time:'):
                try:
                    time = int(line.split(':', 1)[1].strip())
                except:
                    time = 0
    elif 'MBBANK' in lines[0]:
        for line in lines:
            line = line.strip()
            if line.startswith('name:'):
                ngan_hang = line.split(':', 1)[1].strip()
            elif line.startswith("body:"):
                # Lấy số tài khoản
                match_tk = re.search(r'TK\s+(\S+)', line)
                if match_tk:
                    tk = match_tk.group(1)

                # Lấy số tiền
                match_tien = re.search(r'GD:\s*([+-]?\d[\d,]*)VND', line)
                if match_tien:
                    so_tien = int(match_tien.group(1).replace(',', ''))

                # Lấy số dư
                match_sodu = re.search(r'SD:\s*([\d,]*)VND', line)
                if match_sodu:
                    so_du = int(match_sodu.group(1).replace(',', ''))

                # Lấy nội dung
                match_nd = re.search(r'ND:\s*(.*)', line)
                if match_nd:
                    noi_dung = match_nd.group(1).strip()

            elif line.startswith("time:"):
                time = int(line.split(":", 1)[1].strip())
    # Format ngày tháng
    if time > 0:
        formatted_date = datetime.fromtimestamp(time).strftime('%d/%m/%Y %H:%M:%S')
    else:
        formatted_date = 'Không rõ thời gian'
    
    # Xây dựng thông báo
    message = "THÔNG BÁO GIAO DỊCH TIỀN VÀO\n" if so_tien > 0 else "THÔNG BÁO GIAO DỊCH TIỀN RA\n"
    message += f"Ngân hàng: {ngan_hang}\n"
    message += f"Số tài khoản: {tk}\n"
    message += f"Số tiền vào: +{format_number_with_comma(so_tien)} đ\n" if so_tien > 0 else f"Số tiền ra: -{format_number_with_comma(abs(so_tien))} đ\n"
    message += f'Nội dung giao dịch: "{noi_dung}"\n'
    message += f"Ngày giao dịch: {formatted_date}\n"
    if tk != '39xxx993':
        message += f"Số dư tài khoản: {format_number_with_comma(so_du)} đ\n"

    data = {
        "ngan_hang": ngan_hang,
        "tai_khoan": tk,
        "noi_dung": noi_dung,
        "so_du": so_du,
        "so_tien": so_tien,
        "thoi_gian": formatted_date,
        "phan_loai": "Tiền vào" if so_tien > 0 else "Tiền ra",
        "full_thong_tin": body_text,
        "sheet": sheet
    }

    await up_sheet(data)
    return message

# def xuat_base_lark():

    

#OCB
@router.post("/bdsd/BDSD_BỂ BƠI_THU_CHI_99991888")
async def history_hoadon(request: Request):
    try:
        raw = await request.body()
        body_text = raw.decode("utf-8")  # chuyển bytes thành chuỗi
        # print(body_text)
        # body_text1 = """name: OCB
        # body: OCB 27/06 20:26
        # TK 99991888
        # (-) 100,000 VND
        # N/dung: TRINH NGOC DUONG chuyen tien
        # So du: 96,718,843 VND
        # time: 1751030782"""
        sheet = "BDSD_BỂ BƠI_THU_CHI_99991888"          # cần sửa ở đây ========================================
        message = await parse_sms_body(body_text, sheet)  # cần sửa ở đây ========================================

        # print(message)
        token = await get_access_token()
        chat_list = await get_chat_list(token)
        chat_id = ""
        for node in chat_list["data"].get("items", []):
            if node["name"] == "BDSD_BỂ BƠI_THU_CHI_99991888": # cần sửa ở đây ========================================
                chat_id = node["chat_id"]
                break
        await send_bot_message(token, chat_id, message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")
    
@router.post("/bdsd/BDSD_CỘT CỜ_THU_CHI_886693") # cần sửa ở đây =======================================================================================================
async def history_hoadon(request: Request):
    try:
        raw = await request.body()
        body_text = raw.decode("utf-8")  # chuyển bytes thành chuỗi
        # print(body_text)
       
        sheet = "BDSD_CỘT CỜ_THU_CHI_886693"  # cần sửa ở đây ============================================================================================================
        message = await parse_sms_body(body_text, sheet)  

        # print(message)
        token = await get_access_token()
        chat_list = await get_chat_list(token)
        chat_id = ""
        for node in chat_list["data"].get("items", []):
            if node["name"] == "BDSD_CỘT CỜ_THU_CHI_886693": # cần sửa ở đây ===========================================================================================
                chat_id = node["chat_id"]
                break
        await send_bot_message(token, chat_id, message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")
    
@router.post("/bdsd/BĐSD_KH THANH TOÁN_39927199993") # cần sửa ở đây =======================================================================================================
async def history_hoadon(request: Request):
    try:
        raw = await request.body()
        body_text = raw.decode("utf-8")  # chuyển bytes thành chuỗi
        # print(body_text)
        # body_text1 = """name: MBBANK
        # body: TK 39xxx993 GD: +100,000VND 27/06/25 23:58  SD: 83,409,221VND ND: duong test
        # time: 1751043527"""
        sheet = "BĐSD_KH THANH TOÁN_39927199993"  # cần sửa ở đây ============================================================================================================
        message = await parse_sms_body(body_text, sheet)  

        print(message)
        token = await get_access_token()
        chat_list = await get_chat_list(token)
        chat_id = ""
        for node in chat_list["data"].get("items", []):
            if node["name"] == "BĐSD_KH THANH TOÁN_39927199993": # cần sửa ở đây ===========================================================================================
                chat_id = node["chat_id"]
                break
        await send_bot_message(token, chat_id, message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")
    
@router.post("/bdsd/BĐSD_KTCC_0963950262_NGUYEN_THI_NGOC_QUYEN") # cần sửa ở đây =======================================================================================================
async def history_hoadon(request: Request):
    try:
        raw = await request.body()
        body_text = raw.decode("utf-8")  # chuyển bytes thành chuỗi
        # print(body_text)
        # body_text1 = """name: MBBANK
        # body: TK 39xxx993 GD: +100,000VND 27/06/25 23:58  SD: 83,409,221VND ND: duong test
        # time: 1751043527"""
        sheet = "BĐSD_KTCC_0963950262_NGUYEN_THI_NGOC_QUYEN"  # cần sửa ở đây ============================================================================================================
        message = await parse_sms_body(body_text, sheet)  

        print(message)
        token = await get_access_token()
        chat_list = await get_chat_list(token)
        chat_id = ""
        for node in chat_list["data"].get("items", []):
            if node["name"] == "BĐSD_KTCC_0963950262_NGUYEN_THI_NGOC_QUYEN": # cần sửa ở đây ===========================================================================================
                chat_id = node["chat_id"]
                break
        await send_bot_message(token, chat_id, message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")
    
@router.post("/bdsd/BĐSD_CHI VĂN PHÒNG_0369421261") # cần sửa ở đây =======================================================================================================
async def history_hoadon(request: Request):
    try:
        raw = await request.body()
        body_text = raw.decode("utf-8")  # chuyển bytes thành chuỗi
        # print(body_text)
        # body_text1 = """name: MBBANK
        # body: TK 39xxx993 GD: +100,000VND 27/06/25 23:58  SD: 83,409,221VND ND: duong test
        # time: 1751043527"""
        sheet = "BĐSD_CHI VĂN PHÒNG_0369421261"  # cần sửa ở đây ============================================================================================================
        message = await parse_sms_body(body_text, sheet)  

        print(message)
        token = await get_access_token()
        chat_list = await get_chat_list(token)
        chat_id = ""
        for node in chat_list["data"].get("items", []):
            if node["name"] == "BĐSD_CHI VĂN PHÒNG_0369421261": # cần sửa ở đây ===========================================================================================
                chat_id = node["chat_id"]
                break
        await send_bot_message(token, chat_id, message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")

@router.post("/bdsd/BĐSD_TỔNG&COD_0979157333") # cần sửa ở đây =======================================================================================================
async def history_hoadon(request: Request):
    try:
        raw = await request.body()
        body_text = raw.decode("utf-8")  # chuyển bytes thành chuỗi
        # print(body_text)
        # body_text1 = """name: MBBANK
        # body: TK 39xxx993 GD: +100,000VND 27/06/25 23:58  SD: 83,409,221VND ND: duong test
        # time: 1751043527"""
        sheet = "BĐSD_TỔNG&COD_0979157333"  # cần sửa ở đây ============================================================================================================
        message = await parse_sms_body(body_text, sheet)  

        print(message)
        token = await get_access_token()
        chat_list = await get_chat_list(token)
        chat_id = ""
        for node in chat_list["data"].get("items", []):
            if node["name"] == "BĐSD_TỔNG&COD_0979157333": # cần sửa ở đây ===========================================================================================
                chat_id = node["chat_id"]
                break
        await send_bot_message(token, chat_id, message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")

@router.post("/bdsd/BĐSD_BểBơi_0162100028759008_Ha_Manh_Tam") # cần sửa ở đây =======================================================================================================
async def history_hoadon(request: Request):
    try:
        raw = await request.body()
        body_text = raw.decode("utf-8")  # chuyển bytes thành chuỗi
        # print(body_text)
        # body_text1 = """name: MBBANK
        # body: TK 39xxx993 GD: +100,000VND 27/06/25 23:58  SD: 83,409,221VND ND: duong test
        # time: 1751043527"""
        sheet = "BĐSD_Bể Bơi _ 0162100028759008_Ha_Manh_Tam"  # cần sửa ở đây ============================================================================================================
        message = await parse_sms_body(body_text, sheet)  

        print(message)
        token = await get_access_token()
        chat_list = await get_chat_list(token)
        chat_id = ""
        for node in chat_list["data"].get("items", []):
            if node["name"] == "BĐSD_Bể Bơi _ 0162100028759008_Ha_Manh_Tam": # cần sửa ở đây ===========================================================================================
                chat_id = node["chat_id"]
                break
        await send_bot_message(token, chat_id, message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")

@router.post("/bdsd/BĐSD_CHI MARKETING_0398932329") # cần sửa ở đây =======================================================================================================
async def history_hoadon(request: Request):
    try:
        raw = await request.body()
        body_text = raw.decode("utf-8")  # chuyển bytes thành chuỗi
        # print(body_text)
        # body_text1 = """name: MBBANK
        # body: TK 39xxx993 GD: +100,000VND 27/06/25 23:58  SD: 83,409,221VND ND: duong test
        # time: 1751043527"""
        sheet = "BĐSD_CHI MARKETING_0398932329"  # cần sửa ở đây ============================================================================================================
        message = await parse_sms_body(body_text, sheet)  

        print(message)
        token = await get_access_token()
        chat_list = await get_chat_list(token)
        chat_id = ""
        for node in chat_list["data"].get("items", []):
            if node["name"] == "BĐSD_CHI MARKETING_0398932329": # cần sửa ở đây ===========================================================================================
                chat_id = node["chat_id"]
                break
        await send_bot_message(token, chat_id, message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")


@router.post("/bdsd/BĐSD_OCB DOANH NGHIỆP_938989") # cần sửa ở đây =======================================================================================================
async def history_hoadon(request: Request):
    try:
        raw = await request.body()
        body_text = raw.decode("utf-8")  # chuyển bytes thành chuỗi
        # print(body_text)
        # body_text1 = """name: MBBANK
        # body: TK 39xxx993 GD: +100,000VND 27/06/25 23:58  SD: 83,409,221VND ND: duong test
        # time: 1751043527"""
        sheet = "BĐSD_OCB DOANH NGHIỆP_938989"  # cần sửa ở đây ============================================================================================================
        message = await parse_sms_body(body_text, sheet)  

        print(message)
        token = await get_access_token()
        chat_list = await get_chat_list(token)
        chat_id = ""
        for node in chat_list["data"].get("items", []):
            if node["name"] == "BĐSD_OCB DOANH NGHIỆP_938989": # cần sửa ở đây ===========================================================================================
                chat_id = node["chat_id"]
                break
        await send_bot_message(token, chat_id, message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")

@router.post("/bdsd/BĐSD_THANH TOÁN NCC_295010") # cần sửa ở đây =======================================================================================================
async def history_hoadon(request: Request):
    try:
        raw = await request.body()
        body_text = raw.decode("utf-8")  # chuyển bytes thành chuỗi
        # print(body_text)
        # body_text1 = """name: MBBANK
        # body: TK 39xxx993 GD: +100,000VND 27/06/25 23:58  SD: 83,409,221VND ND: duong test
        # time: 1751043527"""
        sheet = "BĐSD_THANH TOÁN NCC_295010"  # cần sửa ở đây ============================================================================================================
        message = await parse_sms_body(body_text, sheet)  

        print(message)
        token = await get_access_token()
        chat_list = await get_chat_list(token)
        chat_id = ""
        for node in chat_list["data"].get("items", []):
            if node["name"] == "BĐSD_THANH TOÁN NCC_295010": # cần sửa ở đây ===========================================================================================
                chat_id = node["chat_id"]
                break
        await send_bot_message(token, chat_id, message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")
    
@router.post("/bdsd/BĐSD_CHI LƯƠNG_0967700900") # cần sửa ở đây =======================================================================================================
async def history_hoadon(request: Request):
    try:
        raw = await request.body()
        body_text = raw.decode("utf-8")  # chuyển bytes thành chuỗi
        # print(body_text)
        # body_text1 = """name: MBBANK
        # body: TK 39xxx993 GD: +100,000VND 27/06/25 23:58  SD: 83,409,221VND ND: duong test
        # time: 1751043527"""
        sheet = "BĐSD_CHI LƯƠNG_0967700900"  # cần sửa ở đây ============================================================================================================
        message = await parse_sms_body(body_text, sheet)  

        print(message)
        token = await get_access_token()
        chat_list = await get_chat_list(token)
        chat_id = ""
        for node in chat_list["data"].get("items", []):
            if node["name"] == "BĐSD_CHI LƯƠNG_0967700900": # cần sửa ở đây ===========================================================================================
                chat_id = node["chat_id"]
                break
        await send_bot_message(token, chat_id, message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")

# chưa sử dụngh
@router.post("/bdsd/BĐSD_CCF_050505028888_NGUYEN_THI_HUNG") # cần sửa ở đây =======================================================================================================
async def history_hoadon(request: Request):
    try:
        raw = await request.body()
        body_text = raw.decode("utf-8")  # chuyển bytes thành chuỗi
        # print(body_text)
        # body_text1 = """name: MBBANK
        # body: TK 39xxx993 GD: +100,000VND 27/06/25 23:58  SD: 83,409,221VND ND: duong test
        # time: 1751043527"""
        sheet = "BĐSD_CCF_050505028888_NGUYEN_THI_HUNG"  # cần sửa ở đây ============================================================================================================
        message = await parse_sms_body(body_text, sheet)  

        print(message)
        token = await get_access_token()
        chat_list = await get_chat_list(token)
        chat_id = ""
        for node in chat_list["data"].get("items", []):
            if node["name"] == "BĐSD_CCF_050505028888_NGUYEN_THI_HUNG": # cần sửa ở đây ===========================================================================================
                chat_id = node["chat_id"]
                break
        await send_bot_message(token, chat_id, message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")

@router.post("/bdsd/BĐSD_CCF_0962511432_NGUYEN_THI_HUNG") # cần sửa ở đây =======================================================================================================
async def history_hoadon(request: Request):
    try:
        raw = await request.body()
        body_text = raw.decode("utf-8")  # chuyển bytes thành chuỗi
        # print(body_text)
        # body_text1 = """name: MBBANK
        # body: TK 39xxx993 GD: +100,000VND 27/06/25 23:58  SD: 83,409,221VND ND: duong test
        # time: 1751043527"""
        sheet = "BĐSD_CCF_0962511432_NGUYEN_THI_HUNG"  # cần sửa ở đây ============================================================================================================
        message = await parse_sms_body(body_text, sheet)  

        print(message)
        token = await get_access_token()
        chat_list = await get_chat_list(token)
        chat_id = ""
        for node in chat_list["data"].get("items", []):
            if node["name"] == "BĐSD_CCF_0962511432_NGUYEN_THI_HUNG": # cần sửa ở đây ===========================================================================================
                chat_id = node["chat_id"]
                break
        await send_bot_message(token, chat_id, message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")

@router.post("/bdsd/BĐSD_0393363229_Hoang_Lan_Huong") # cần sửa ở đây =======================================================================================================
async def history_hoadon(request: Request):
    try:
        raw = await request.body()
        body_text = raw.decode("utf-8")  # chuyển bytes thành chuỗi
        # print(body_text)
        # body_text1 = """name: MBBANK
        # body: TK 39xxx993 GD: +100,000VND 27/06/25 23:58  SD: 83,409,221VND ND: duong test
        # time: 1751043527"""
        sheet = "BĐSD_0393363229_Hoang_Lan_Huong"  # cần sửa ở đây ============================================================================================================
        message = await parse_sms_body(body_text, sheet)  

        print(message)
        token = await get_access_token()
        chat_list = await get_chat_list(token)
        chat_id = ""
        for node in chat_list["data"].get("items", []):
            if node["name"] == "BĐSD_0393363229_Hoang_Lan_Huong": # cần sửa ở đây ===========================================================================================
                chat_id = node["chat_id"]
                break
        await send_bot_message(token, chat_id, message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")
    
@router.post("/bdsd/BĐSD_TD_0162100393363229_HOANG_LAN_HUONG") # cần sửa ở đây =======================================================================================================
async def history_hoadon(request: Request):
    try:
        raw = await request.body()
        body_text = raw.decode("utf-8")  # chuyển bytes thành chuỗi
        # print(body_text)
        # body_text1 = """name: MBBANK
        # body: TK 39xxx993 GD: +100,000VND 27/06/25 23:58  SD: 83,409,221VND ND: duong test
        # time: 1751043527"""
        sheet = "BĐSD_TD_0162100393363229_HOANG_LAN_HUONG"  # cần sửa ở đây ============================================================================================================
        message = await parse_sms_body(body_text, sheet)  

        print(message)
        token = await get_access_token()
        chat_list = await get_chat_list(token)
        chat_id = ""
        for node in chat_list["data"].get("items", []):
            if node["name"] == "BĐSD_TD_0162100393363229_HOANG_LAN_HUONG": # cần sửa ở đây ===========================================================================================
                chat_id = node["chat_id"]
                break
        await send_bot_message(token, chat_id, message)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")
