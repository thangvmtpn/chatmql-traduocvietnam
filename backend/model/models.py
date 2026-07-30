
import json
import pprint
from typing import Dict, List, Optional
from database import conn
from psycopg import sql
from utils.security import get_google_sheet
from datetime import datetime
# Chưa sử dụng SQLAlchemy ORM mà dùng psycopg trực tiếp
# Nếu muốn dùng ORM, ta có thể dùng SQLAlchemy với declarative_base()







# print(get_customer_list([5], 1, 30, 'thoi_gian_capnhat', 'ASC', {'nhan_vien_pt': 'AK0023'}))

async def get_data(id_acc):
    try:
        with conn.cursor() as cur:
            sql = """
            WITH RECURSIVE subordinates AS (
                SELECT id_acc FROM account_users WHERE id_acc = %s
                UNION
                SELECT u.id_acc FROM account_users u
                INNER JOIN subordinates s ON u.maneger_id = s.id_acc
            )
            SELECT kh.* FROM khach_hang kh
            JOIN subordinates sub ON kh.id_acc = sub.id_acc;

            """
            cur.execute(sql, (id_acc,))
            lead = cur.fetchall()
            if not lead:  # Kiểm tra nếu kết quả rỗng
                return {"message": "Không có dữ liệu khách hàng"}
            # Chuyển đổi thành danh sách dictionary
            columns = [desc[0] for desc in cur.description]
            lead_list = [dict(zip(columns, row)) for row in lead]
            # print(lead_list[0])
            return lead_list  # Trả về danh sách thay vì set
    except Exception as e:
        print(f"❌ Lỗi khi lấy data khách hàng: {str(e)}")



# thong_tin_chi_tiet(8116)


    


# def get_all_user()


#
# print(tim_kiem_user("AK0027", "user_id")[0]["id_acc"])


# assignments = {
#     "ADMIN": [2992, 2993] # Người có id_acc = 123 phụ trách khách hàng 1, 2,
# }
# result = update_phu_trach(assignments)
# print(result)

async def get_F0():
    try:
        with conn.cursor() as cur:
            sql = "SELECT * FROM account_users WHERE chuc_vu ILIKE '%SALE%'"
            cur.execute(sql)
            users = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            users_data = [dict(zip(columns, row)) for row in users]
            id_acc_list = []
            # print(users_data)
            for node in users_data:
                id_acc_list.append(int(node["id_acc"]))

            print(id_acc_list)


            id_acc_placeholder = ", ".join(["%s"] * len(id_acc_list))
            query = f"""
                SELECT * FROM khach_hang 
                WHERE id_acc IN ({id_acc_placeholder}) 
                AND (nhom_kh LIKE '%%A%%' OR nhom_kh LIKE '%%B%%')
            """

            cur.execute(query, tuple(id_acc_list))
            lead = cur.fetchall()

            if not lead:  # Kiểm tra nếu kết quả rỗng
                return {"message": "Không tìm thấy tài khoản nhân sự"}
            columns = [desc[0] for desc in cur.description]
            lead_data = [dict(zip(columns, row)) for row in lead]  # Chuyển tuple thành dictionary

            return lead_data  # Trả về dict thay vì list
    except Exception as e:
        print(f"❌ Lỗi khi tìm tài khoản nhân sự: {str(e)}")
        return {"error": str(e)}

# id_acc_list = [14,15]
# # get_F0()
# print(len(get_F0()))



# def get_thong_bao(ma_nv):
#     try:
#         with conn.cursor() as cur:
#             cur.execute("SELECT * FROM hoa_don WHERE sdt = %s ORDER BY thoi_gian DESC", (sdt,))
#             hoadon = cur.fetchall()
#             # Chuyển đổi thành danh sách dictionary
#             if not hoadon:  # Kiểm tra nếu kết quả rỗng
#                 return {"message": "Không có dữ liệu khách hàng"}
#             columns = [desc[0] for desc in cur.description]
#             hoadon_list = [dict(zip(columns, row)) for row in hoadon]
#             # print(hoadon_list)
#             return hoadon_list  # Trả về danh sách thay vì set
#     except Exception as e:
#         print(f"❌ Lỗi khi lấy dữ liệu hóa đơn: {str(e)}")

async def data_trung(ngay_trung, data):
    if ngay_trung == True:
        print("Xử lí data trùng lớn hơn 30 ngày")

    else:
        print("Xử lí data trùng nhỏ hơn 30 ngày")




    

# print(thong_bao([1], {}))




# get_sdt(1)






# get_quyen_canhan(1)













#------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------


