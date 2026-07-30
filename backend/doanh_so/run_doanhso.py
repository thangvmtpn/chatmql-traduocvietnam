# /www/wwwroot/lead_traf/backend/run_doanhso.py

import asyncio
from datetime import date, datetime, timedelta
import json
import os
import re
import sys
import threading
import time
import traceback

import psycopg2
import requests
from requests_toolbelt import MultipartEncoder
import matplotlib.pyplot as plt
import matplotlib.ticker as mtick
from matplotlib.patches import Patch
import numpy as np
from playwright.sync_api import sync_playwright
from playwright.async_api import async_playwright




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

async def send_bot_message(token, chat_id, data):
    ty_le_tong = data["doanh_so_thuc_te"] / data["doanh_so_muc_tieu"] * 100 if data["doanh_so_muc_tieu"] else 0
    ty_le_ssdt = (data["doanh_so_thuc_te_shop"] + data["doanh_so_thuc_te_sale"]) / data["doanh_so_muc_tieu_ssdata"] * 100 if data["doanh_so_muc_tieu_ssdata"] else 0
    ty_le_cskh = data["doanh_so_thuc_te_cskh"] / data["doanh_so_muc_tieu_cskh"] * 100 if data["doanh_so_muc_tieu_cskh"] else 0
    message = (
        "📊 TỈ LỆ HOÀN THÀNH MỤC TIÊU NGÀY\n"
        f"- TỈ TRỌNG HOÀN THÀNH DOANH SỐ/NGÀY: {ty_le_tong:.2f}%\n"
        f"- TỈ TRỌNG HOÀN THÀNH NHÓM (SÀN+SHOP+DATA MỚI)/NGÀY: {ty_le_ssdt:.2f}%\n"
        f"- TỈ TRỌNG HOÀN THÀNH NHÓM CSKH/NGÀY: {ty_le_cskh:.2f}%"
    )
    # === Cấu hình API ===
    url = "https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id"
    headers_json = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8"
    }

    # === Xác định đường dẫn ảnh ===
    current_dir = os.path.dirname(os.path.abspath(__file__))
    image_path = os.path.join(current_dir, "bieudo_doanhso.png")
    if not os.path.exists(image_path):
        print("❌ File ảnh không tồn tại:", image_path)
        return

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

    image_key = upload_json["data"]["image_key"]
    print("✅ Upload thành công - image_key:", image_key)

    # === Tạo interactive card gửi ảnh + text ===
    today = datetime.now()
    payload_card = {
        "receive_id": chat_id,
        "msg_type": "interactive",
        "content": json.dumps({  # ✅ KHÔNG cần card ở đây nữa
            "config": {
                "wide_screen_mode": True
            },
            "header": {
                "title": {
                    "tag": "plain_text",
                    "content": f"🔔 THÔNG BÁO DOANH SỐ {today.day}/{today.month}/{today.year}"
                }
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "tag": "plain_text",
                        "content": message
                    }
                },
                {
                    "tag": "img",
                    "img_key": image_key,
                    "alt": {
                        "tag": "plain_text",
                        "content": "Biểu đồ doanh số"
                    }
                }
            ]
        })
    }

    response = requests.post(url, headers=headers_json, json=payload_card)
    print("🖼 Tin nhắn interactive response:", response.status_code, response.text)

    try:
        return response.json()
    except Exception:
        return {"error": "Lỗi không đọc được JSON trả về"}



async def luu_anh(data):
    

    labels = ['Tổng', 'Phòng Truyền thông', 'Phòng Kinh doanh']
    x = np.arange(len(labels)) * 1.3
    width = 0.3

    # Dữ liệu
    data_values = [
        # Tổng
        [float(data["doanh_so_muc_tieu_ngay"]), float(data["doanh_so_thuc_te"])],
        # Phòng truyền thông
        [float(data["doanh_so_muc_tieu_tt"]), float(data["doanh_so_tt_phong_tt"])],
        # Phòng kinh doanh: Mục tiêu, Sale, CSKH (Sale + CSKH sẽ chồng lên nhau)
        [float(data["doanh_so_muc_tieu_kd"]), float(data["doanh_so_thuc_te_sale"]), float(data["doanh_so_thuc_te_cskh"])]
    ]

    color_groups = [
        ['#00a65a', '#ff4c4c'],               # Tổng
        ['#007bff', '#ff9500'],               # Truyền thông
        ['#00e5ff', '#f4c20d', '#e53935']     # Kinh doanh
    ]

    bar_all = []

    for i, (group_x, values) in enumerate(zip(x, data_values)):
        if i < 2:
            # Tổng và Phòng TT: vẽ từng cột riêng
            for j, value in enumerate(values):
                offset = (j - (len(values) - 1) / 2) * (width + 0.1)
                bar = plt.bar(group_x + offset, value, width=width, color=color_groups[i][j])
                bar_all.extend(bar)
        else:
            # Phòng Kinh doanh:
            muc_tieu = values[0]
            sale = values[1]
            cskh = values[2]

            offset = width / 2 + 0.05
            x_muc_tieu = group_x - offset
            x_thuc_te = group_x + offset


            # Cột mục tiêu
            bar = plt.bar(x_muc_tieu, muc_tieu, width=width, color=color_groups[i][0])
            bar_all.extend(bar)

            # Cột SALE
            bar_sale = plt.bar(x_thuc_te, sale, width=width, color=color_groups[i][1])
            # bar_all.extend(bar_sale)

            # Hiển thị nhãn và số tiền cho phần SALE
            # plt.text(x_thuc_te, sale / 2 + 3, 'SALE', ha='center', va='center',
            #         fontsize=10, fontweight='bold', color='white')
            plt.text(x_thuc_te, sale / 2 + 3, f'{sale/1e6:.1f}M', ha='center', va='center',
                    fontsize=10, fontweight='bold', color='white')

            # Cột CSKH chồng lên SALE
            bar_cskh = plt.bar(x_thuc_te, cskh, width=width, bottom=sale, color=color_groups[i][2])
            # bar_all.extend(bar_cskh)

            # Hiển thị nhãn và số tiền cho phần CSKH
            # plt.text(x_thuc_te, sale + cskh / 2 + 3, 'CSKH', ha='center', va='center',
            #         fontsize=10, fontweight='bold', color='white')
            plt.text(x_thuc_te, sale + cskh / 2 + 3, f'{cskh/1e6:.1f}M', ha='center', va='center',
                    fontsize=10, fontweight='bold', color='white')

            # Tổng SALE + CSKH hiển thị trên đỉnh
            tong = sale + cskh
            if tong >= 1e9:
                label = f'{tong/1e9:.1f}B'
            elif tong >= 1e6:
                label = f'{tong/1e6:.1f}M'
            else:
                label = f'{tong:,.0f}'
            plt.text(x_thuc_te, tong, label, ha='center', va='bottom',
                    fontsize=11, fontweight='bold')

    def add_labels(bars):
        for bar in bars:
            height = bar.get_height()
            if height >= 1e9:
                label = f'{height/1e9:.1f}B'
            elif height >= 1e6:
                label = f'{height/1e6:.1f}M'
            else:
                label = f'{height:,.0f}'
            plt.text(bar.get_x() + bar.get_width() / 2, bar.get_y() + height,
                     label, ha='center', va='bottom', fontsize=11, fontweight='bold')

    add_labels(bar_all)

    plt.ylabel('Doanh số (VND)', fontsize=12)
    max_value = max([v for group in data_values for v in group])
    plt.ylim(0, max_value * 1.3)
    plt.gca().yaxis.set_major_formatter(mtick.FuncFormatter(lambda x, _: f'{x/1e6:.0f}M'))
    plt.title('Biểu đồ doanh số thực tế vs mục tiêu', fontsize=14, fontweight='bold')
    plt.xticks(x, labels)
    plt.grid(True, axis='y', linestyle='--', alpha=0.4)
    # Tạo chú thích riêng cho phần SALE và CSKH (Phòng Kinh doanh)
    legend_elements = [
        Patch(facecolor=color_groups[2][1], label='SALE'),   # Màu vàng
        Patch(facecolor=color_groups[2][2], label='CSKH')    # Màu đỏ
    ]

    plt.legend(handles=legend_elements, loc='upper right')

    current_dir = os.path.dirname(os.path.abspath(__file__))
    image_path = os.path.join(current_dir, "bieudo_doanhso.png")
    plt.tight_layout()
    plt.savefig(image_path)
    plt.close()
    return os.path.abspath(image_path)


async def luu_anh_v2(data):
    labels = ['Tổng', 'Sàn/Shop/Data', 'CSKH']
    x = np.arange(len(labels)) * 1.3
    width = 0.3

    # Dữ liệu: mỗi nhóm CHỈ 2 cột [Mục tiêu, Thực tế]
    data_values = [
        # Tổng
        [float(data["doanh_so_muc_tieu"]), float(data["doanh_so_thuc_te"])],
        # Sàn/Shop/Data
        [float(data["doanh_so_muc_tieu_ssdata"]), float(data["doanh_so_thuc_te_shop"] + data["doanh_so_thuc_te_sale"])],
        # CSKH (ở đây bạn đang dùng đúng 'thực tế_cskh'; nếu muốn gộp SALE+CSKH thì đổi vế phải)
        [float(data["doanh_so_muc_tieu_cskh"]), float(data["doanh_so_thuc_te_cskh"])]
    ]

    # Mỗi nhóm cũng chỉ cần 2 màu: [mục tiêu, thực tế]
    color_groups = [
        ['#00a65a', '#ff4c4c'],    # Tổng
        ['#007bff', '#ff9500'],    # Sàn/Shop/Data
        ['#00e5ff', '#e53935']     # CSKH
    ]

    bar_all = []

    # Vẽ 2 cột cho MỌI nhóm, không có nhánh else đặc biệt
    for i, (group_x, values) in enumerate(zip(x, data_values)):
        n = len(values)  # phải = 2
        for j, value in enumerate(values):
            # canh giữa quanh group_x: j=0 lệch trái, j=1 lệch phải
            offset = (j - (n - 1) / 2) * (width + 0.1)
            bar = plt.bar(group_x + offset, value, width=width, color=color_groups[i][j])
            bar_all.extend(bar)

    # Gắn nhãn số trên đỉnh cột
    def add_labels(bars):
        for bar in bars:
            height = bar.get_height()
            if height >= 1e9:
                label = f'{height/1e9:.1f}B'
            elif height >= 1e6:
                label = f'{height/1e6:.1f}M'
            else:
                label = f'{height:,.0f}'
            plt.text(
                bar.get_x() + bar.get_width() / 2,
                bar.get_y() + height,
                label,
                ha='center', va='bottom',
                fontsize=11, fontweight='bold'
            )

    add_labels(bar_all)

    plt.ylabel('Doanh số (VND)', fontsize=12)

    # Xử lý trục Y an toàn
    max_value = max([v for group in data_values for v in group] + [0.0])
    plt.ylim(0, max_value * 1.3 if max_value > 0 else 1)

    plt.gca().yaxis.set_major_formatter(mtick.FuncFormatter(lambda x, _: f'{x/1e6:.0f}M'))
    plt.title('Biểu đồ doanh số thực tế vs mục tiêu', fontsize=14, fontweight='bold')
    plt.xticks(x, labels)
    plt.grid(True, axis='y', linestyle='--', alpha=0.4)

    # Legend CHỈ còn 2 mục: Mục tiêu / Thực tế
    # Lấy màu từ nhóm đầu (đồng bộ hiển thị)
    # legend_elements = [
    #     Patch(facecolor=color_groups[0][0], label='Mục tiêu'),
    #     Patch(facecolor=color_groups[0][1], label='Thực tế')
    # ]
    # plt.legend(handles=legend_elements, loc='upper right')

    current_dir = os.path.dirname(os.path.abspath(__file__))
    image_path = os.path.join(current_dir, "bieudo_doanhso.png")
    plt.tight_layout()
    plt.savefig(image_path)
    plt.close()
    return os.path.abspath(image_path)


async def get_hoa_don(today):
    try:
        conn = psycopg2.connect("postgresql://postgres:duong1356@103.253.21.182:5432/he_thong_lead_traf")
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

async def gettoken():
    login_url = "https://api-man1.kiotviet.vn/api/account/login?quan-ly=true"
    payload = {
        "FingerPrintKey": "211d1f5bb8cc08a94863d2291f1c866d_Chrome_Desktop_Máy tính Windows",
        "IsManageSide": True,
        "model": {
            "RememberMe": True,
            "ShowCaptcha": False,
            "UserName": "Canhan_0941871593",
            "Password": "TraDuoc2025@"
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
        # print(json.dumps(token_data, indent=4, ensure_ascii=False))
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


async def get_hoadon_kiot_unprocessed(token):
    hom_nay = datetime.now()
    fromdate = hom_nay.replace(hour=0, minute=0, second=0, microsecond=0)
    todate = hom_nay.replace(hour=23, minute=59, second=59, microsecond=59)

    fromdate = int(fromdate.timestamp())
    todate = int(todate.timestamp())


    url = "https://kol.kiotonline.com/orders/get"
    headers = {
        "authorization": token,
        "content-type": "application/json"
        
    }
    payload = {
        "page": 1,
        "limit": 50,
        "searchType": "Order",
        "CreatedAtStart": fromdate,
        "CreatedAtEnd": todate,
        "IncludeLZD": True,
        "ShippingCarrier": None,
        "ShopIds": [1282000248, 200190990125, "7494567791858977153"],
        "canceledTabFilter": "all",
        "exact": True,
        "tab": "unprocessed"
    }
    try:
        response = requests.post(url=url, headers=headers, json=payload, timeout=10)
        response.raise_for_status()  # bắt lỗi HTTP như 4xx/5xx
        data = response.json()
        if data["orders"]:
            for node in data["orders"]:
                nguoi_ban = ""
                # print(json.dumps(node, indent=4, ensure_ascii=False))

                if node["ShopName"] == "TRAF OFFICIAL - TRÀ VIỆT NAM":
                    ma_hd = "HDSPE_"+node["OrderId"]
                    nguoi_ban = "Nguyễn Duy Thắng - MKT"
                    ma_san_pham = "\n".join(f"{sp['variation_sku']}x{sp['variation_quantity_purchased']}" for sp in node['Items'])
                    tong_tien = sum(float(sp["variation_discounted_price"])*float(sp["variation_quantity_purchased"]) for sp in node['Items'])
                elif node["ShopName"] == "TRAF - TRÀ VIỆT NAM":
                    ma_hd = "HDTTS_"+node["OrderId"]
                    nguoi_ban = "Nguyễn Duy Thắng - MKT"
                    ma_san_pham = "\n".join(f"{sp['seller_sku']}x{sp['quantity']}" for sp in node['Items'])
                    tong_tien = sum(float(sp["sku_original_price"] - sp["sku_seller_discount"])*float(sp["quantity"]) for sp in node['Items'])

                thoi_gian = datetime.fromtimestamp(node["CreatedAt"])

                conn = psycopg2.connect("postgresql://postgres:duong1356@103.253.21.182:5432/he_thong_lead_traf")
                # print(ma_san_pham)
                with conn.cursor() as cur:  
                    for sp_item in node['Items']:
                        # print(f"Sản phẩm: {sp_item['name']}, SKU: {sp_item.get('variation_sku', sp_item.get('seller_sku'))}, Số lượng: {sp_item['variation_quantity_purchased'] if 'variation_quantity_purchased' in sp_item else sp_item['quantity']}")
                        if node["ShopName"] == "TRAF OFFICIAL - TRÀ VIỆT NAM":
                            ma_sanpham = sp_item['variation_sku']
                            ten_sanpham = sp_item['item_name']
                            soluong = int(sp_item["variation_quantity_purchased"])
                            tien_sanpham = soluong * float(sp_item["variation_discounted_price"])
                        elif node["ShopName"] == "TRAF - TRÀ VIỆT NAM":
                            ma_sanpham = sp_item['seller_sku']
                            ten_sanpham = sp_item['product_name']
                            soluong = int(sp_item["quantity"])
                            tien_sanpham = soluong * float(sp_item["sku_original_price"] - sp_item["sku_seller_discount"])
                        match = re.search(r"x(\d+)", ma_sanpham)
                        if match:
                            soluong = int(soluong) * int(match.group(1))
                         
                        sql = """
                            SELECT * FROM hoa_don_tinh_thuong WHERE ma_hd = %s AND ma_sanpham = %s
                        """
                        cur.execute(sql, (ma_hd, ma_sanpham))
                        hoa_don_thuong = cur.fetchall()
                        if hoa_don_thuong:
                            sql = """UPDATE hoa_don_tinh_thuong SET 
                                thoi_gian = %s,
                                nguoi_ban = %s,
                                nguon_ban = %s,
                                trang_thai = %s,
                                ma_sanpham = %s, 
                                ten_sanpham = %s, 
                                so_luong = %s, 
                                tong_tien = %s
                            WHERE ma_hd = %s AND ma_sanpham = %s"""
                            cur.execute(sql, (thoi_gian, nguoi_ban, node["ShopName"], "Chờ xử lý", ma_sanpham, ten_sanpham, soluong, tien_sanpham, ma_hd, ma_sanpham))
                            conn.commit()
                        else:
                            cur.execute("""
                                INSERT INTO hoa_don_tinh_thuong (
                                        ma_hd, 
                                        thoi_gian,
                                        nguoi_ban,
                                        nguon_ban,
                                        trang_thai,
                                        ma_sanpham, 
                                        ten_sanpham, 
                                        so_luong, 
                                        tong_tien) 
                                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """, (
                                ma_hd, thoi_gian, nguoi_ban, node["ShopName"], "Chờ xử lý", ma_sanpham, ten_sanpham, soluong, tien_sanpham
                            ))
                            conn.commit()
                    
                    
                    # xử lí cho bảng hóa đơn
                    sql = """
                        SELECT * FROM hoa_don WHERE ma_hd = %s
                    """
                    cur.execute(sql, (ma_hd,))
                    hoa_don_bt = cur.fetchall()
                    if hoa_don_bt:
                        sql = """UPDATE hoa_don SET 
                            nguoi_ban = %s, 
                            nguon_ban = %s, 
                            ma_san_pham = %s, 
                            tong_tien = %s, 
                            trang_thai = %s
                        WHERE ma_hd = %s"""
                        cur.execute(sql, (nguoi_ban, node["ShopName"], ma_san_pham, tong_tien, 'Chờ xử lý', ma_hd))
                        conn.commit()
                    else:
                        cur.execute("""
                            INSERT INTO hoa_don (ma_hd, thoi_gian, nguoi_ban, nguon_ban, ma_san_pham, tong_tien, trang_thai) 
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """, (
                            ma_hd, thoi_gian, nguoi_ban, node["ShopName"], ma_san_pham, tong_tien, "Chờ xử lý"
                        ))
                        conn.commit()
                        # print("Nhận hóa đơn mới: ", ma_hd)
    except Exception as e:
        
        print(f"⚠️ Bỏ qua lỗi khi gọi API Kiot: {e}")
        traceback.print_exc()

async def get_hoadon_kiot_cancel(token):
    hom_nay = datetime.now()
    fromdate = (hom_nay - timedelta(days=5)).replace(hour=0, minute=0, second=0, microsecond=0)
    todate = hom_nay.replace(hour=23, minute=59, second=59, microsecond=59)

    fromdate = int(fromdate.timestamp())
    todate = int(todate.timestamp())

    
    url = "https://kol.kiotonline.com/orders/get"
    headers = {
        "authorization": token,
        "content-type": "application/json"
        
    }
    payload = {
        "page": 1,
        "limit": 50,
        "searchType": "Order",
        "CreatedAtStart": fromdate,
        "CreatedAtEnd": todate,
        "IncludeLZD": True,
        "ShippingCarrier": None,
        "ShopIds": [1282000248, 200190990125, "7494567791858977153"],
        "canceledTabFilter": "all",
        "exact": True,
        "tab": "to-cancel"
    }
    try:
        response = requests.post(url=url, headers=headers, json=payload, timeout=10)
        response.raise_for_status()  # bắt lỗi HTTP như 4xx/5xx
        data = response.json()
        if data["orders"]:
            for node in data["orders"]:
                nguoi_ban = ""

                if node["ShopName"] == "TRAF OFFICIAL - TRÀ VIỆT NAM":
                    ma_hd = "HDSPE_"+node["OrderId"]
                    nguoi_ban = "Nguyễn Duy Thắng - MKT"
                    ma_san_pham = "\n".join(f"{sp['variation_sku']}x{sp['variation_quantity_purchased']}" for sp in node['Items'])
                    tong_tien = sum(float(sp["variation_discounted_price"])*float(sp["variation_quantity_purchased"]) for sp in node['Items'])
                elif node["ShopName"] == "TRAF - TRÀ VIỆT NAM":
                    ma_hd = "HDTTS_"+node["OrderId"]
                    nguoi_ban = "Nguyễn Duy Thắng - MKT"
                    ma_san_pham = "\n".join(f"{sp['seller_sku']}x{sp['quantity']}" for sp in node['Items'])
                    tong_tien = sum(float(sp["sku_original_price"] - sp["sku_seller_discount"])*float(sp["quantity"]) for sp in node['Items'])

                thoi_gian = datetime.fromtimestamp(node["CreatedAt"])

                conn = psycopg2.connect("postgresql://postgres:duong1356@103.253.21.182:5432/he_thong_lead_traf")
                with conn.cursor() as cur:
                    # print(ma_san_pham)
                    if node["CancelBy"].lower() == 'buyer':
                        trang_thai = "Đã hủy"
                        sql = "UPDATE hoa_don_tinh_thuong SET trang_thai = %s WHERE ma_hd = %s"
                        cur.execute(sql, (trang_thai, ma_hd))
                        conn.commit()

                    else:
                        continue
                    hoa_don = {
                        "ma_hd": ma_hd,
                        "thoi_gian": thoi_gian,
                        "nguoi_ban": nguoi_ban,
                        "nguon_ban": node["ShopName"],
                        "ma_san_pham": ma_san_pham,
                        "tong_tien": tong_tien
                    }
                    
                    sql = """
                        SELECT * FROM hoa_don WHERE ma_hd = %s
                    """
                    cur.execute(sql, (ma_hd,))
                    hoa_don_bt = cur.fetchall()
                    if hoa_don_bt:
                        sql = """UPDATE hoa_don SET 
                            nguoi_ban = %s, 
                            nguon_ban = %s, 
                            ma_san_pham = %s, 
                            tong_tien = %s, 
                            trang_thai = %s
                        WHERE ma_hd = %s"""
                        cur.execute(sql, (nguoi_ban, node["ShopName"], ma_san_pham, tong_tien, trang_thai, ma_hd))
                        conn.commit()
                    else:
                        cur.execute("""
                            INSERT INTO hoa_don (ma_hd, thoi_gian, nguoi_ban, nguon_ban, ma_san_pham, tong_tien, trang_thai) 
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """, (
                            ma_hd, thoi_gian, nguoi_ban, node["ShopName"], ma_san_pham, tong_tien, trang_thai
                        ))
                        conn.commit()
                        print("Nhận hóa đơn mới: ", ma_hd)
    except Exception as e:
        
        print(f"⚠️ Bỏ qua lỗi khi gọi API Kiot: {e}")
        traceback.print_exc()

async def bien_dong_doanhso():
    token_kiot = await gettoken()
    so_ngay = await so_ngay_tru_chu_nhat_trong_thang_hien_tai()
    await get_hoadon_kiot_unprocessed(token_kiot)
    await get_hoadon_kiot_cancel(token_kiot)
    # Lấy thư mục hiện tại của file script
    base_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
    # Đường dẫn tương đối tới data.txt
    file_path = os.path.join(base_dir, "doanhso.json")
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    hom_nay = date.today()

    doanh_so_muc_tieu_thang = data.get("doanhso_muctieu_thang")
    doanh_so_muc_tieu_thang_pkd = data.get("doanhso_muctieu_thang_pkd")
    doanh_so_muc_tieu_thang_ptt = data.get("doanhso_muctieu_thang_ptt")

    doanh_so_muc_tieu_tuan = data.get("doanhso_muctieu_tuan")
    doanh_so_muc_tieu_tuan_pkd = data.get("doanhso_muctieu_tuan_pkd")
    doanh_so_muc_tieu_tuan_ptt = data.get("doanhso_muctieu_tuan_ptt")
    # Duyệt qua các ngày để lấy tổng doanh số đã có
    tong_cn = 0
    tong_khac = 0
    for key, value in data.items():
        if key.startswith("doanhso_muctieu_"):
            continue
        elif value is not None:
            # Tách ngày và tháng

            day = key
            date_str = f"2025-{hom_nay.month}-{day}"  # Giả sử năm là 2025
            date_obj = datetime.strptime(date_str, "%Y-%m-%d")
            if date_obj.weekday() == 6:  # 6 nghĩa là Chủ nhật
                tong_cn += value
            else:
                tong_khac += value
        
    print("✅ Tổng doanh số Chủ nhật:", tong_cn)
    print("✅ Tổng doanh số các ngày khác:", tong_khac)
    
    so_ngay = (date(hom_nay.year, hom_nay.month + 1, 1) - timedelta(days=1)) if hom_nay.month != 12 else date(hom_nay.year, 12, 31)
    # print("Số ngày:", so_ngay)
    # Tính số ngày làm việc còn lại trong tháng (không tính Chủ nhật)
    ngay_lam_viec_con_lai = sum(
        1 for i in range((so_ngay - hom_nay).days + 1)
        if (hom_nay + timedelta(days=i)).weekday() != 6  # 6 = Sunday
    )
    ngay_chu_nhat_con_lai = sum(
        1 for i in range((so_ngay - hom_nay).days + 1)
        if (hom_nay + timedelta(days=i)).weekday() == 6 
    )
    print("Ngày làm việc còn lại: ", ngay_lam_viec_con_lai)
    print("Ngày chủ nhật: ", ngay_chu_nhat_con_lai)
    if hom_nay.weekday() == 6:
        print("✅ Hôm nay là Chủ nhật")
        doanh_so_muc_tieu_ngay = int(round((doanh_so_muc_tieu_tuan - tong_cn) / ngay_chu_nhat_con_lai))
        print("Doanh số mục tiêu ngày: ", doanh_so_muc_tieu_ngay)

        doanh_so_muc_tieu_tt = int(round(doanh_so_muc_tieu_ngay * (doanh_so_muc_tieu_tuan_ptt / doanh_so_muc_tieu_tuan)))
        print("Doanh số mục tiêu ngày - Truyền thông: ", doanh_so_muc_tieu_tt)

        doanh_so_muc_tieu_kd = int(round(doanh_so_muc_tieu_ngay * (doanh_so_muc_tieu_tuan_pkd / doanh_so_muc_tieu_tuan)))
        print("Doanh số mục tiêu ngày - Kinh doanh: ", doanh_so_muc_tieu_kd)
        if doanh_so_muc_tieu_ngay <= 0:
            tong_khac += abs(tong_cn-doanh_so_muc_tieu_tuan)
            doanh_so_muc_tieu_ngay = int(round((doanh_so_muc_tieu_thang - tong_khac) / ngay_lam_viec_con_lai))
            print("Doanh số mục tiêu ngày: ", doanh_so_muc_tieu_ngay)

            doanh_so_muc_tieu_tt = int(round(doanh_so_muc_tieu_ngay * (doanh_so_muc_tieu_thang_ptt / doanh_so_muc_tieu_thang)))
            print("Doanh số mục tiêu ngày - Truyền thông: ", doanh_so_muc_tieu_tt)

            doanh_so_muc_tieu_kd = int(round(doanh_so_muc_tieu_ngay * (doanh_so_muc_tieu_thang_pkd / doanh_so_muc_tieu_thang)))
            print("Doanh số mục tiêu ngày - Kinh doanh: ", doanh_so_muc_tieu_kd)
    else:
        print("❌ Hôm nay không phải Chủ nhật")
        if ngay_chu_nhat_con_lai > 0:
            doanh_so_muc_tieu_ngay = int(round((doanh_so_muc_tieu_tuan - tong_cn) / ngay_chu_nhat_con_lai))
        else: 
            doanh_so_muc_tieu_ngay = int(round((doanh_so_muc_tieu_thang + doanh_so_muc_tieu_tuan - tong_cn - tong_khac) / ngay_lam_viec_con_lai))
        print("Doanh số mục tiêu ngày: ", doanh_so_muc_tieu_ngay)
        if doanh_so_muc_tieu_ngay <= 0:
            tong_khac += abs(tong_cn-doanh_so_muc_tieu_tuan)
            doanh_so_muc_tieu_ngay = int(round((doanh_so_muc_tieu_thang - tong_khac) / ngay_lam_viec_con_lai))
            print("Doanh số mục tiêu ngày: ", doanh_so_muc_tieu_ngay)

            doanh_so_muc_tieu_tt = int(round(doanh_so_muc_tieu_ngay * (doanh_so_muc_tieu_thang_ptt / doanh_so_muc_tieu_thang)))
            print("Doanh số mục tiêu ngày - Truyền thông: ", doanh_so_muc_tieu_tt)

            doanh_so_muc_tieu_kd = int(round(doanh_so_muc_tieu_ngay * (doanh_so_muc_tieu_thang_pkd / doanh_so_muc_tieu_thang)))
            print("Doanh số mục tiêu ngày - Kinh doanh: ", doanh_so_muc_tieu_kd)
        else:
            # Tính doanh số mục tiêu theo ngày làm việc còn lại
            if ngay_chu_nhat_con_lai > 0:
                doanh_so_muc_tieu_ngay = int(round((doanh_so_muc_tieu_thang - tong_khac) / ngay_lam_viec_con_lai))
            else:
                doanh_so_muc_tieu_ngay = int(round((doanh_so_muc_tieu_thang + doanh_so_muc_tieu_tuan - tong_cn - tong_khac) / ngay_lam_viec_con_lai))
            print("Doanh số mục tiêu ngày: ", doanh_so_muc_tieu_ngay)

            doanh_so_muc_tieu_tt = int(round(doanh_so_muc_tieu_ngay * (doanh_so_muc_tieu_thang_ptt / doanh_so_muc_tieu_thang)))
            print("Doanh số mục tiêu ngày - Truyền thông: ", doanh_so_muc_tieu_tt)

            doanh_so_muc_tieu_kd = int(round(doanh_so_muc_tieu_ngay * (doanh_so_muc_tieu_thang_pkd / doanh_so_muc_tieu_thang)))
            print("Doanh số mục tiêu ngày - Kinh doanh: ", doanh_so_muc_tieu_kd)

    # doanh_so_muc_tieu_ngay_data = int(round((doanh_so_muc_tieu_thang - tong_doanh_so)/(so_ngay-hom_nay.day+1)*(600000000*45/100/doanh_so_muc_tieu_thang)))
    # print("Doanh số mục tiêu ngày data: ", doanh_so_muc_tieu_ngay_data)
    # doanh_so_muc_tieu_ngay_shop = int(round((doanh_so_muc_tieu_thang - tong_doanh_so)/(so_ngay-hom_nay.day+1)*(600000000*55/100/doanh_so_muc_tieu_thang)))
    # print("Doanh số mục tiêu ngày shop: ", doanh_so_muc_tieu_ngay_shop)
    # doanh_so_muc_tieu_ngay_cskh = int(round((doanh_so_muc_tieu_thang - tong_doanh_so)/(so_ngay-hom_nay.day+1)*(1100000000/doanh_so_muc_tieu_thang)))
    # print("Doanh số mục tiêu ngày CSKH: ", doanh_so_muc_tieu_ngay_cskh)

    doanh_so_thuc_te = 0
    doanh_so_tt_phong_tt = 0
    doanh_so_tt_phong_kd = 0
    
    doanh_so_thuc_te_shop = 0
    doanh_so_thuc_te_sale = 0
    doanh_so_thuc_te_cskh = 0
    hoa_don_base = await get_hoa_don(hom_nay)
    # # print(hoa_don_base)
    for node in hoa_don_base:
        if ("hủy" not in node["trang_thai"]) and node["nguon_ban"] != "Đổi Hàng" and node["nguon_ban"] != "GỬI BÙ":
            sale_channel = node["nguon_ban"]
            tong_tien = node["tong_tien"]
            doanh_so_thuc_te += tong_tien
            if sale_channel == "Traf Vina - Vietnamese tea" or sale_channel == "TRAF OFFICIAL - TRÀ VIỆT NAM" or sale_channel == "TRAF - TRÀ VIỆT NAM" or sale_channel == "Tiktok Shop - CSKH" or sale_channel == "Shopee Mall TRAF - CSKH" or sale_channel == "TIKTOK LIVE" or "TIKTOK SHOP (" in sale_channel:
                doanh_so_tt_phong_tt += tong_tien
            elif "FACEBOOK" in sale_channel or sale_channel == "TIKTOK LANDING" or sale_channel == "HOTLINE-TIKTOK LANDING" or sale_channel == "YOUTUBE":
                doanh_so_tt_phong_tt += tong_tien
                
                if node["nguoi_ban"] != 'Nguyễn An Phi - MKT':
                    doanh_so_thuc_te_sale += tong_tien
                    doanh_so_tt_phong_kd += tong_tien
            elif sale_channel == "CSKH" or sale_channel == "KHÁCH GIỚI THIỆU" or sale_channel == "B2B - Bán sỉ":
                doanh_so_tt_phong_kd += tong_tien
                doanh_so_thuc_te_cskh += tong_tien
    

    data = {
        "doanh_so_thuc_te": doanh_so_thuc_te,
        "doanh_so_tt_phong_tt": doanh_so_tt_phong_tt,
        "doanh_so_tt_phong_kd": doanh_so_tt_phong_kd,
        "doanh_so_thuc_te_sale": doanh_so_thuc_te_sale,
        "doanh_so_thuc_te_cskh": doanh_so_thuc_te_cskh,
        "doanh_so_muc_tieu_ngay": doanh_so_muc_tieu_ngay,
        "doanh_so_muc_tieu_tt": doanh_so_muc_tieu_tt,
        "doanh_so_muc_tieu_kd": doanh_so_muc_tieu_kd

    }
    # print(data)
    await luu_anh(data)
   # ✅ Tính tỷ lệ hoàn thành (số % làm tròn 2 chữ số)
    

    # ✅ Format tin nhắn
    
    token = await get_access_token()
    chat_list = await get_chat_list(token)
    chat_id = ""
    for node in chat_list["data"].get("items", []):
        if node["name"] == "Doanh Nghiệp - 2.0": # cần sửa ở đây ===========================================================================================
            chat_id = node["chat_id"]
            break
        # if node["name"] == "test": # cần sửa ở đây ===========================================================================================
        #     chat_id = node["chat_id"]
        #     break
    await send_bot_message(token, chat_id, data)
    # await send_lark_message(data)

async def bien_dong_doanhso_v2():
    token_kiot = await gettoken()
    so_ngay = await so_ngay_tru_chu_nhat_trong_thang_hien_tai()
    await get_hoadon_kiot_unprocessed(token_kiot)
    await get_hoadon_kiot_cancel(token_kiot)
    # Lấy thư mục hiện tại của file script
    base_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
    # Đường dẫn tương đối tới data.txt
    file_path = os.path.join(base_dir, "doanhso.json")
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    hom_nay = date.today()

    doanh_so_muc_tieu = 60000000
    doanh_so_muc_tieu_ssdata = 15000000
    doanh_so_muc_tieu_cskh = 45000000


    doanh_so_thuc_te_ngay = 0
    doanh_so_thuc_te_shop = 0
    doanh_so_thuc_te_sale = 0
    doanh_so_thuc_te_cskh = 0

    hoa_don_base = await get_hoa_don(hom_nay)

    for node in hoa_don_base:
        if ("hủy" not in node["trang_thai"]) and node["nguon_ban"] != "Đổi Hàng" and node["nguon_ban"] != "GỬI BÙ":
            sale_channel = node["nguon_ban"]
            tong_tien = node["tong_tien"]
            doanh_so_thuc_te_ngay += tong_tien
            if sale_channel == "Traf Vina - Vietnamese tea" or sale_channel == "TRAF OFFICIAL - TRÀ VIỆT NAM" or sale_channel == "TRAF - TRÀ VIỆT NAM" or sale_channel == "Tiktok Shop - CSKH" or sale_channel == "Shopee Mall TRAF - CSKH" or sale_channel == "TIKTOK LIVE" or "TIKTOK SHOP (" in sale_channel:
                doanh_so_thuc_te_shop += tong_tien
            elif "FACEBOOK" in sale_channel or sale_channel == "TIKTOK LANDING" or sale_channel == "HOTLINE-TIKTOK LANDING" or sale_channel == "YOUTUBE":
                doanh_so_thuc_te_sale += tong_tien
            elif sale_channel == "CSKH" or sale_channel == "KHÁCH GIỚI THIỆU" or sale_channel == "B2B - Bán sỉ":
                doanh_so_thuc_te_cskh += tong_tien

    data = {
        "doanh_so_thuc_te": doanh_so_thuc_te_ngay,
        "doanh_so_thuc_te_shop": doanh_so_thuc_te_shop,
        "doanh_so_thuc_te_sale": doanh_so_thuc_te_sale,
        "doanh_so_thuc_te_cskh": doanh_so_thuc_te_cskh,
        "doanh_so_muc_tieu": doanh_so_muc_tieu,
        "doanh_so_muc_tieu_ssdata": doanh_so_muc_tieu_ssdata,
        "doanh_so_muc_tieu_cskh": doanh_so_muc_tieu_cskh

    }
    await luu_anh_v2(data)

    token = await get_access_token()
    chat_list = await get_chat_list(token)
    chat_id = ""
    for node in chat_list["data"].get("items", []):
        if node["name"] == "Doanh Nghiệp - 2.0": # cần sửa ở đây ===========================================================================================
            chat_id = node["chat_id"]
            break
        # if node["name"] == "test_code": # cần sửa ở đây ===========================================================================================
        #     chat_id = node["chat_id"]
        #     break
    await send_bot_message(token, chat_id, data)

# async def chup_baocao():
    
#     async with async_playwright() as p:
#         browser = await p.chromium.launch(
#             headless=True,
#             args=[
#                 "--no-sandbox",
#                 "--disable-setuid-sandbox",
#                 "--disable-dev-shm-usage",
#                 "--disable-gpu",
#                 "--window-size=1920,1080",
#             ]
            
#         )
        
#         base_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
#         page = await browser.new_page()
#         url = "https://crm.traduocvietnam.com/bao_cap_doanhso_muctieu.html"
#         await page.goto(url, wait_until="domcontentloaded", timeout=90000)

#         # nhập pass
#         input_pass = await page.wait_for_selector("xpath=//input[@type='password']", timeout=30000)
#         if input_pass:
#             await input_pass.fill("doanhsoPKD122#@s")   # nhập mật khẩu
#             await page.keyboard.press("Enter")   
#             print("Đã chụp xong")


#         # Chụp ảnh body
#         element = await page.query_selector("body")
#         await page.wait_for_timeout(5000)
#         save_path = os.path.join(base_dir, "bao_cao.png")
#         await element.screenshot(path=save_path)

#         await browser.close()
  
def chup_baocao():
    """Phiên bản Đồng bộ (Sync) để fix lỗi NotImplementedError trên Windows"""
    print("📸 Bắt đầu quá trình chụp ảnh báo cáo (Sync Mode)...")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--window-size=1920,1080",
            ]
        )
        
        try:
            base_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
            page = browser.new_page()
            url = "https://crm.traduocvietnam.com/bao_cap_doanhso_muctieu.html"
            
            # Lưu ý: Bản Sync không dùng 'await'
            page.goto(url, wait_until="domcontentloaded", timeout=90000)

            # Nhập pass
            input_pass = page.wait_for_selector("xpath=//input[@type='password']", timeout=30000)
            if input_pass:
                input_pass.fill("doanhsoPKD122#@s")
                page.keyboard.press("Enter")
                print("🔑 Đã nhập mật khẩu và Enter")

            # Đợi load dữ liệu sau khi login
            time.sleep(5) 
            
            # Chụp ảnh body
            element = page.query_selector("body")
            save_path = os.path.join(base_dir, "bao_cao.png")
            if element:
                element.screenshot(path=save_path)
                print(f"✅ Đã chụp xong và lưu tại: {save_path}")
            else:
                print("❌ Không tìm thấy element body để chụp ảnh")

        except Exception as e:
            print(f"❌ Lỗi trong quá trình chụp ảnh: {str(e)}")
        finally:
            browser.close()
            
            
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

async def send_bot_message_v2(url_webhook):

    # === Cấu hình API ===
    # await chup_baocao()
    print("📤 Đang chuẩn bị gửi báo cáo...")
    
    thread = threading.Thread(target=chup_baocao)
    thread.start()
    
    print("✅ Đã khởi chạy tiến trình chụp ảnh độc lập.")
    thread.join()
    
    message = (
        "📊 **THÔNG BÁO DOANH SỐ**\n"
        # f"- DOANH SỐ MỤC TIÊU: {data.get('muc_tieu_tong', 0):,.0f}\n"
        # f"- DOANH SỐ THỰC TẾ: {data.get('thuc_te_tong', 0):,.0f}\n"
        # f"- TỈ TRỌNG HOÀN THÀNH: {data.get('ty_le_hoan_thanh_tong'):.2f}%\n\n"
    )
    # bc_nhansu = await bao_bao_theo_nhansu()
    

    # === Xác định đường dẫn ảnh ===
    current_dir = os.path.dirname(os.path.abspath(__file__))
    image_path_bieudo_doanhso = os.path.join(current_dir, "bao_cao.png")
    if not os.path.exists(image_path_bieudo_doanhso):
        print("❌ File ảnh không tồn tại:", image_path_bieudo_doanhso)
        return
    token = await get_access_token()
    print("TOKEN:", token)
    anh_tong_quan = await upload_image_to_lark(image_path_bieudo_doanhso, token)
    
    print("Image upload: ", anh_tong_quan)
    

    # === Tạo interactive card gửi ảnh + text ===
    today = datetime.now()
    

    payload_card = {
        "msg_type": "interactive",   # ← DÒNG QUAN TRỌNG NHẤT – BẮT BUỘC PHẢI CÓ!
        "card": {
            "config": {
                "wide_screen_mode": True
            },
            "elements": [
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


async def bien_dong_doanhso_v3():
    token_kiot = await gettoken()
    so_ngay = await so_ngay_tru_chu_nhat_trong_thang_hien_tai()
    await get_hoadon_kiot_unprocessed(token_kiot)
    await get_hoadon_kiot_cancel(token_kiot)

    url_webhook = "https://open.larksuite.com/open-apis/bot/v2/hook/191fd8cd-b539-42b1-a9d2-ec93ae319206" # bot chính
    # url_webhook = "https://open.larksuite.com/open-apis/bot/v2/hook/35fc2631-6d2e-41e3-84d1-ee45e0bcb2db" # bot test
    print("URL Webhook: chạy oke")
    await send_bot_message_v2(url_webhook)

# asyncio.run(bien_dong_doanhso_v3())
# chup_baocao()
# asyncio.run(chup_baocao())



