from datetime import datetime, timedelta
import os
import re
import sys
import gspread
from oauth2client.service_account import ServiceAccountCredentials
import psycopg

base_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))

def get_google_sheet(sheet_name, namesheet):
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    path = os.path.join(base_dir, "tacvu1356-1c8559c32013.json")
    keyapi = ServiceAccountCredentials.from_json_keyfile_name(path, scope)
    client = gspread.authorize(keyapi)
    # sheet = client.open(sheet_name).sheet1
    sheet = client.open(sheet_name).worksheet(namesheet)
    return sheet

def edit_nguoi_pt(sdt, id_acc, nhan_vien_pt, nhom_kh, nguon_data):
    conn = psycopg.connect("postgresql://postgres:duong1356@localhost:5432/he_thong_lead_traf")
    try:
        with conn.cursor() as cur:
            # print(sdt)
            sql = "UPDATE khach_hang SET id_acc = %s, nhan_vien_pt = %s, nhom_kh = %s, nguon_data = %s WHERE sdt1 = %s AND id_acc != 18"
            cur.execute(sql, (id_acc, nhan_vien_pt, nhom_kh, nguon_data, sdt))
            conn.commit()
            if cur.rowcount > 0:  # Kiểm tra số dòng bị ảnh hưởng
                print(f"✅ Cập nhật thành công!{nhan_vien_pt}" )
            else:
                print(f"⚠️ Không tìm thấy số điện thoại {sdt} để cập nhật.")
    except Exception as e:
        print(f"❌ Lỗi khi tìm tài khoản nhân sự: {str(e)}")
        return {"error": str(e)}
# lấy all data khách hàng
def lay_data():
    conn = psycopg.connect("postgresql://postgres:duong1356@localhost:5432/he_thong_lead_traf")
    try:
        with conn.cursor() as cur:
            sql = "SELECT sdt1 FROM khach_hang"
            cur.execute(sql)
            khac_hang = cur.fetchall()

            hoadon_data = [row[0] for row in khac_hang]
            return hoadon_data
    except Exception as e:
        print(f"❌ Lỗi khi tìm tài khoản nhân sự: {str(e)}")
        return {"error": str(e)}
# lấy data nhân sự
def lay_data_ns():
    conn = psycopg.connect("postgresql://postgres:duong1356@localhost:5432/he_thong_lead_traf")
    try:
        with conn.cursor() as cur:
            sql = "SELECT sdt1 FROM khach_hang WHERE id_acc = 3"
            cur.execute(sql)
            khac_hang = cur.fetchall()

            hoadon_data = [row[0] for row in khac_hang]
            return hoadon_data
    except Exception as e:
        print(f"❌ Lỗi khi tìm tài khoản nhân sự: {str(e)}")
        return {"error": str(e)}
    

def chuyen_datA():
    sheet_khach_hang = get_google_sheet("F1 - GIAO THÁNG 3", "LỆ TRANG")
    data = sheet_khach_hang.get_all_values()[1:]
    database = lay_data()
    dem = 0
    data_hang = lay_data_ns()
    conn = psycopg.connect("postgresql://postgres:duong1356@localhost:5432/he_thong_lead_traf")
    for row in data:
        
        sdt = row[5]
        # print(sdt)

        sdt = f"84{''.join(filter(str.isdigit, sdt))[-9:]}"
        if sdt in database:
            with conn.cursor() as cur:
                sql = "SELECT nhom_kh FROM khach_hang WHERE sdt1 = %s"
                cur.execute(sql, (sdt,))
                nhom_kh = cur.fetchone()[0]
            nhom_kh_old = re.sub(r"^F(KT|T)?", "", nhom_kh)
            nhom_kh_new = "FT" + nhom_kh_old
            
                # if sdt in data_hanh:
                #     print(sdt)
            # print(f"SĐT = {sdt} - NHÓM KH = {nhom_kh_new}")
            dem+=1
            edit_nguoi_pt(sdt, 4, "AA0014", nhom_kh_new, row[7])
        
        else:
            data_lead = {
                "nhom_kh": "FT",
                "ten_khach_hang": row[4],
                "sdt": sdt,
                "gioi_tinh": "",
                "dia_chi": row[6],
                "ngay_sinh": "",
                "nghe_nghiep": "",
                "diem_khach_hang": 0,
                "ghi_chu": "",
                "dac_thu_sp": "",
                "nhu_cau_sd": "",
                "thoi_gian_tao": row[2],
                "nguon_data": row[7]
            }
            with conn.cursor() as cur:
                cur.execute("SELECT MAX(ma_kh) FROM khach_hang")
                result = cur.fetchone()
            max_ma_kh = result[0] if result and result[0] else "KH000000"

            # Tăng lên 1
            so_moi = int(max_ma_kh[2:]) + 1  # Bỏ "KH" rồi ép kiểu số
            new_ma_kh = f"KH{so_moi:06d}"
            

            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO khach_hang (id_acc, nhan_vien_pt, ma_kh, nhom_kh, ten_khach_hang, sdt1, gioi_tinh, dia_chi, ngay_sinh, nghe_nghiep, diem_khach_hang, ghi_chu, dac_thu_sp, nhu_cau_sd, thoi_gian_tao, thoi_gian_capnhat, nguon_data, GMV) 
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_kh
                """, (
                    4, "AA0014", new_ma_kh, data_lead["nhom_kh"],
                    data_lead["ten_khach_hang"], data_lead["sdt"], data_lead["gioi_tinh"], data_lead["dia_chi"],
                    data_lead["ngay_sinh"], data_lead["nghe_nghiep"], data_lead["diem_khach_hang"], data_lead["ghi_chu"],
                    data_lead["dac_thu_sp"], data_lead["nhu_cau_sd"], data_lead["thoi_gian_tao"], "2025-04-25 12:00:00.752991+07", data_lead["nguon_data"], 0
                ))
               
                new_kd = cur.fetchone()[0]
                conn.commit()
               
                
            print(f"SĐT không có trong hệ thống {sdt}")
    print(f"dem = {dem}")
        
# 84938809171
chuyen_datA()
