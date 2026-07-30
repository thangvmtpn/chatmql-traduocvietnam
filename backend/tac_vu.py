from datetime import datetime
import os
import sys
import gspread
from oauth2client.service_account import ServiceAccountCredentials
import requests
from database import conn
from psycopg import sql

base_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
        # Đường dẫn tương đối tới data.txt
file_path = os.path.join(base_dir, "tacvu1356-1c8559c32013.json")

def get_google_sheet(sheet_name, namesheet):
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    keyapi = ServiceAccountCredentials.from_json_keyfile_name(file_path, scope)
    client = gspread.authorize(keyapi)
    # sheet = client.open(sheet_name).sheet1
    sheet = client.open(sheet_name).worksheet(namesheet)
    return sheet

def tinh_khoang_ngay(thoi_gian_truoc) :
    
    hien_tai = datetime.now()

    nam = hien_tai.year - thoi_gian_truoc.year
    thang = hien_tai.month - thoi_gian_truoc.month
    ngay = hien_tai.day - thoi_gian_truoc.day

    if ngay < 0:
        thang -= 1
        # Tính số ngày của tháng trước đó
        thang_truoc = (hien_tai.month - 1) if hien_tai.month > 1 else 12
        nam_truoc = hien_tai.year if hien_tai.month > 1 else hien_tai.year - 1
        so_ngay_thang_truoc = (datetime(nam_truoc, thang_truoc + 1, 1) - datetime(nam_truoc, thang_truoc, 1)).days
        ngay += so_ngay_thang_truoc

    if thang < 0:
        nam -= 1
        thang += 12

    if nam > 0:
        return f"{nam} năm {thang} tháng {ngay} ngày"
    if thang > 0:
        return f"{thang} tháng {ngay} ngày"
    return f"{ngay} ngày"

def tanSuatMua(time_dau, time_cuoi, so_lan_mua):
    
    # Tính số ngày giữa hai mốc thời gian
    so_ngay = (time_dau - time_cuoi).days

    if so_ngay <= 0 or so_lan_mua <= 0:
        return "Không hợp lệ"

    tan_suat_tb = so_ngay // so_lan_mua

    nam = tan_suat_tb // 365
    thang = (tan_suat_tb % 365) // 30
    ngay = tan_suat_tb % 30

    if nam > 0:
        return f"{nam} năm {thang} tháng {ngay} ngày"
    if thang > 0:
        return f"{thang} tháng {ngay} ngày"
    return f"{ngay} ngày"

def get_thong_tin_khachhang():
    try:
        with conn.cursor() as cur:
            sql = "SELECT * FROM khach_hang WHERE nhom_kh ILIKE %s"
            cur.execute(sql, ("%FT%",))
            rows = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            lead_list = [dict(zip(columns, row)) for row in rows]
            # print(len(rows))
            return lead_list
    except Exception as e:
        print(f"❌ Lỗi khi lấy dữ liệu: {str(e)}")
        return {"success": False, "message": f"Lỗi khi lấy dữ liệu: {str(e)}"}
    
def clear_and_put_ggsheet():
    list_lead = get_thong_tin_khachhang()
    sheet_data_t = get_google_sheet("DATA T (CLEAR TẦN SUẤT)", "Tổng data T")

    lead_sheet = []
    

    for lead in list_lead:
        sdt = lead["sdt1"]
        aov = 0
        so_lan_mua = 0
        tham_nien = "Không có dữ liệu"
        tan_suat_mua = "Không hợp lệ"

        with conn.cursor() as cur:
            cur.execute("SELECT * FROM hoa_don WHERE sdt = %s ORDER BY thoi_gian DESC", (sdt,))
            hoadon = cur.fetchall()
            
            # Chuyển lịch sử mua hàng thành danh sách dictionary
            if hoadon:
                columns_hoadon = [desc[0] for desc in cur.description]
                hoadon_list = [dict(zip(columns_hoadon, row)) for row in hoadon]
                for hd in hoadon_list:
                    if hd["trang_thai"] == "Đã giao hàng" or hd["trang_thai"] == "Giao thành công":
                        so_lan_mua+=1
                if so_lan_mua > 0:
                    aov = float(lead["gmv"])/so_lan_mua
                
                tham_nien = tinh_khoang_ngay(hoadon_list[-1]["thoi_gian"])
                

                
                time_dau = hoadon_list[0]["thoi_gian"]
                time_cuoi = hoadon_list[-1]["thoi_gian"]
                so_lan_mua1 = len(hoadon_list) - 1
                tan_suat_mua = tanSuatMua(time_dau, time_cuoi, so_lan_mua1)

            else:
                hoadon_list = []
        
        lead_sheet.append([
            lead["ten_khach_hang"],
            lead["sdt1"],
            lead["gioi_tinh"],
            lead["ngay_sinh"],
            lead["dia_chi"],
            lead["nghe_nghiep"],
            lead["dac_thu_sp"],
            lead["nhu_cau_sd"],
            lead["name_pt"],
            float(lead["gmv"]),
            aov,
            so_lan_mua,
            tham_nien,
            tan_suat_mua,
            time_dau.strftime("%Y-%m-%d %H:%M:%S")
        ])

    # lead_sheet.sort(key=lambda x: (x[9], x[10], x[11]), reverse=True)
    # Bước 1: sắp xếp theo so_lan_mua (ít quan trọng nhất)
    lead_sheet.sort(key=lambda x: x[11], reverse=True)

    # Bước 2: sắp xếp theo aov
    lead_sheet.sort(key=lambda x: x[10], reverse=True)

    # Bước 3: sắp xếp theo gmv (quan trọng nhất)
    lead_sheet.sort(key=lambda x: x[9], reverse=True)

    sheet_data_t.update(range_name=f'B2:P{len(lead_sheet) + 1}', values=lead_sheet)
        

clear_and_put_ggsheet()
