from database import conn
from psycopg import sql
import gspread
from oauth2client.service_account import ServiceAccountCredentials

def set_trangthai():
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM khach_hang")
        lead = cur.fetchall()
        columns = [desc[0] for desc in cur.description]
        lead_list = [dict(zip(columns, row)) for row in lead]

        data = []
        dem1 = 0
        dem2 = 0
        dem3 = 0
        for kh in lead_list:
            # print(user)

            cur.execute("SELECT * FROM hoa_don WHERE sdt = %s ORDER BY thoi_gian DESC", (kh["sdt1"], ))
            hoa_don = cur.fetchone()
            print(kh["sdt1"])
            if hoa_don:
                columns = [desc[0] for desc in cur.description]
                hoa_don_list = dict(zip(columns, hoa_don))
                if hoa_don_list["thoi_gian"].date() == kh["thoi_gian_tao"].date():
                    if hoa_don_list["trang_thai"] == "Giao thành công":
                        sql = "UPDATE khach_hang SET trang_thai = 'Đã chốt thành công' WHERE sdt1 = %s"
                    elif hoa_don_list["trang_thai"] != "Giao thành công" and "hoàn" not in hoa_don_list["trang_thai"]:
                        sql = "UPDATE khach_hang SET trang_thai = 'Đã chốt' WHERE sdt1 = %s"
                    elif hoa_don_list["trang_thai"] == "Đã chuyển hoàn" or hoa_don_list["trang_thai"] == "Đang chuyển hoàn":
                        sql = "UPDATE khach_hang SET trang_thai = 'Hoàn' WHERE sdt1 = %s"
                    dem1+=1
                else:
                    
                    if kh["thoi_gian_capnhat_ghichu"] and kh["thoi_gian_capnhat_ghichu"] > kh["thoi_gian_tao"]:
                        delta = kh["thoi_gian_capnhat_ghichu"] - kh["thoi_gian_tao"]
                        minutes = round(delta.total_seconds() / 60)
                        if minutes <= 4320:
                            sql = f"UPDATE khach_hang SET trang_thai = 'Gọi sau {minutes} phút' WHERE sdt1 = %s"
                        else:
                            sql = f"UPDATE khach_hang SET trang_thai = 'Chưa gọi' WHERE sdt1 = %s"
                    dem2+=1
            else:
                if kh["thoi_gian_capnhat_ghichu"] and kh["thoi_gian_capnhat_ghichu"] > kh["thoi_gian_tao"]:
                    delta = kh["thoi_gian_capnhat_ghichu"] - kh["thoi_gian_tao"]
                    minutes = round(delta.total_seconds() / 60)
                    sql = f"UPDATE khach_hang SET trang_thai = 'Gọi sau {minutes} phút' WHERE sdt1 = %s"
                else:
                    sql = f"UPDATE khach_hang SET trang_thai = 'Chưa gọi' WHERE sdt1 = %s"
                dem3+=1
            cur.execute(sql, (kh["sdt1"],))
            conn.commit()
            print(f"dem1 = {dem1} - dem2 = {dem2} - dem3 = {dem3}")

set_trangthai()


        