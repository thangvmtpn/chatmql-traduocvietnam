from datetime import datetime, timezone
import json
import random
import traceback
from typing import Dict, List, Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from schemas import KhachHangRequest, KhachHangResponse
from utils.security import check_token, get_google_sheet
from model.lead import add_quaythuong, them_khach_hang, them_nhieu_khach_hang, get_customer_list, get_lead_user, edit_lead, get_customer_details, get_soluong_lead, customer_new_miniapp, sd_diem, gmv_chuky
from model.lead import edit_lead_full, luu_log, get_full_thongtin_kh, bao_cao_sale, update_tt_sale, them_ghi_chu, phan_tich_khach_hang, thang_hang_tich_diem, update_ngay_hen_banhang, tong_quan_goi_y, get_top_customers_sorted, search_customers_advanced
from typing import Any
from model.users import tim_kiem_user, update_phu_trach, get_list_user
import requests

router = APIRouter()

@router.post("/lead/add")
async def add_lead(leadd: KhachHangRequest, token: dict = Depends(check_token)):
    try:

        new_lead_id = await them_khach_hang(leadd)
        print(new_lead_id)
        if not new_lead_id:
            raise HTTPException(status_code=400, detail="Lỗi khi thêm khách hàng!")
        
        if "error" in new_lead_id:
            raise HTTPException(status_code=400, detail=new_lead_id["error"])
        
        return new_lead_id
    except HTTPException as http_err:
        print(f"⚠️ Lỗi 400: {http_err.detail}")  # Debug lỗi cụ thể
        raise http_err  # Giữ nguyên lỗi 400, không bị chuyển thành 500

    except Exception as e:
        print(f"❌ Lỗi không mong muốn: {str(e)}")  # In lỗi ra để debug
        raise HTTPException(status_code=500, detail="Lỗi server khi thêm khách hàng!")
    

@router.post("/lead/add/import_google_sheet")
async def add_lead_sheet(sheet_url: str, token: dict = Depends(check_token)):
    try:
        print("✅ Đã nhận sheet_url:", sheet_url) 
        sheet = await get_google_sheet(sheet_url)
        data = sheet.get_all_values()
        # print(data)
        if len(data) < 2:
            return {"success": False, "message": "Không có dữ liệu khách hàng"}
        data_lead = []  # Lưu danh sách khách hàng cần thêm

        list_user_sale = await tim_kiem_user("SALE", "chuc_vu")
        # print(list_user_sale)
        if isinstance(list_user_sale, list) and list_user_sale:
            random.shuffle(list_user_sale)
            index_user_sale = 0 

        list_user_cskh = await tim_kiem_user("CSKH", "chuc_vu")
        if isinstance(list_user_cskh, list) and list_user_cskh:
            random.shuffle(list_user_cskh)
            index_user_cskh = 0 

        # print(data[1])
        for row in data[1:]:  # Bỏ qua header
            ip_nhom_kh = row[2] if row[2] not in ["#N/A", "", None] else "F"
            if row[2] == "F":
                if not row[1] and list_user_sale:
                    row[0] = list_user_sale[index_user_sale]["id_acc"]
                    row[1] = list_user_sale[index_user_sale]["user_id"]  # Gán nhân sự theo danh sách đã xáo trộn
                    index_user_sale = (index_user_sale + 1) % len(list_user_sale)
            elif "F0" in row[2]:
                if not row[1] and list_user_cskh:
                    row[0] = list_user_cskh[index_user_cskh]["id_acc"]
                    row[1] = list_user_cskh[index_user_cskh]["user_id"]  # Gán nhân sự theo danh sách đã xáo trộn
                    index_user_cskh = (index_user_cskh + 1) % len(list_user_cskh)

            if row[1] == "AK0025" or row[1] == "AK0035" or row[1] == "AK0034":
                row[1] = "AK0024"
                row[0] = 3
            
            row[0] = await tim_kiem_user(row[1], "user_id")[0]["id_acc"]
            print(ip_nhom_kh)
            lead = KhachHangRequest(
                id_acc=int(row[0]) if row[0] else 3,
                nhan_vien_pt=row[1],
                nhom_kh=ip_nhom_kh,
                ten_khach_hang=row[3] if row[3] else " ",
                sdt=row[4] if row[4] else " ",
                gioi_tinh=row[5] if row[5] else " ",
                dia_chi=row[6] if row[6] else " ",
                ngay_sinh=row[7] if row[7] else " ",
                nghe_nghiep=row[7] if row[7] else " ",
                diem_khach_hang=int(row[9]) if row[9] else 0,
                ghi_chu=row[10] if row[10] else " ",
                dac_thu_sp=row[11] if row[11] else " ",
                nhu_cau_sd=row[12] if row[12] else " ",
                thoi_gian_capnhat=datetime.now(timezone.utc),
                nguon_data=row[14] if row[14] else " ",
            )
            # print(lead)
            data_lead.append(lead)

        
        
        result = await them_nhieu_khach_hang(data_lead)

        return result
    except Exception as e:
        print(str(e))
        raise HTTPException(status_code=500, detail="Lỗi sever khi thêm khách hàng!")
    
@router.get("/lead/so_luong_ql/{id_acc}")
async def get_lead(id_acc: int, token: str = Depends(check_token)):
    try:
        data = await get_soluong_lead(id_acc)
        if not data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dữ liệu")
        return {"total_customers": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail = "Lỗi khi lấy dữ liệu khách hàng")


@router.get("/lead/load_all_lead", tags=["Lead"])
async def get_lead(
    id_acc_list: List[int] = Query(..., description="Danh sách ID nhân viên"),
    page: int = Query(1, ge=1),  # Mặc định page = 1, không nhỏ hơn 1
    limit: int = Query(50, ge=1, le=100000),  # Giới hạn limit trong khoảng 1 - 500
    sort_by: str = Query(..., description="Trường sắp xếp, ví dụ: 'aov', 'tan_suat_mua', 'thoi_gian_cs_lai'"),  # Chỉ cho phép sắp xếp theo 3 cột
    sort_order: str = Query("ASC", pattern="^(ASC|DESC)$"),  # Chỉ nhận ASC hoặc DESC
    search_conditions: Optional[str] = Query(None),
    token: str = Depends(check_token)  # Kiểm tra token
):
    
    try:
        if isinstance(search_conditions, str):  
            search_conditions = json.loads(search_conditions)
        # print(search_conditions)
        data = await get_customer_list(id_acc_list, page, limit, sort_by, sort_order, search_conditions)
        if not data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dữ liệu")
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi lấy dữ liệu khách hàng: {str(e)}")
    
@router.get("/lead/lead_canhan/{id_acc}")
async def get_lead(id_acc: int, token: str = Depends(check_token)):
    try:
        data = await get_lead_user(id_acc)
        if not data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dữ liệu")
        return {"customers": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail = "Lỗi khi lấy dữ liệu khách hàng")
    
@router.get("/lead/chitiet/{id_kh}")
async def chi_tiet_kh(id_kh: int, token: str = Depends(check_token)):
    try:
        data = await get_customer_details(id_kh)
        if not data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dữ liệu")
        return {"chi_tiet_kh": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail = "Lỗi khi lấy dữ liệu khách hàng")


@router.put("/lead/update")
async def get_lead(kh: dict = Body(...), token: str = Depends(check_token)):
    try:
        # print(kh)
        data = await edit_lead(kh)
        if not data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dữ liệu")
        if data.get("error"):
            return data
        return {"customers_edit": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail = "Lỗi khi lấy dữ liệu khách hàng")
    
@router.put("/lead/update_full")
async def get_lead_fsdf(kh: dict = Body(...), token: str = Depends(check_token)):
    try:
        print(f"📝 Received update request for customer id_kh: {kh.get('id_kh')}")
        print(f"📝 Update data: {kh}")
        data = await edit_lead_full(kh)
        print(f"✅ Update result: {data}")
        return data
    except Exception as e:
        print(f"❌ Error updating customer: {str(e)}")
        raise HTTPException(status_code=500, detail = f"Lỗi khi cập nhật khách hàng: {str(e)}")
    

@router.put("/lead/update-phu-trach")
async def api_update_phu_trach(
    data: dict = Body(...),
    time_update: str = Query(...),  # time_update từ URL query
    token: str = Depends(check_token)
):
    result = await update_phu_trach(data.get("assignments", {}), time_update)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.put("/add/ghi_chu")
async def them_ghi_chu_moi(sdt1: str, ghi_chu: str, token: str = Depends(check_token)):
    try:
        data = await them_ghi_chu(sdt1, ghi_chu)  # Gọi hàm cập nhật ghi chú
        
        if data is None:
            raise HTTPException(status_code=500, detail="Không thể cập nhật ghi chú")
        
        return {"success": True, "message": "Ghi chú đã được cập nhật", "ghi_chu": data}
    
    except HTTPException as http_ex:
        raise http_ex  # Trả về lỗi HTTP như đã định nghĩa
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi hệ thống: {str(e)}")
    
@router.post("/lead/get_full_kh")
async def get_full_kh(customer_ids: List[int], token: str = Depends(check_token)):
    danh_sach_kh = await get_full_thongtin_kh(customer_ids)
    return danh_sach_kh

@router.get("/lead/bao_cao_sale")
async def api_bao_cao_sale(
    thoi_gian_tao: List[str] = Query(..., description="Chuỗi thời gian ISO, 2 giá trị: [from, to]")
):
    bao_cao = await bao_cao_sale(thoi_gian_tao)
    return bao_cao

@router.put("/lead/update/trang_thai_sale")
async def get_lead(id_kh: int, trang_thai: str, token: str = Depends(check_token)):
    try:
        data = await update_tt_sale(id_kh, trang_thai)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail = "Lỗi khi lấy dữ liệu khách hàng")

@router.put("/customers/{customer_id}/next-contact-time")
async def update_next_contact_time(
    customer_id: int, 
    body: dict = Body(...),
    token: str = Depends(check_token)
):
    """Cập nhật thời gian chăm sóc lại cho khách hàng"""
    try:
        from database import conn
        thoi_gian_cs_lai = body.get("thoi_gian_cs_lai")
        
        if not thoi_gian_cs_lai:
            raise HTTPException(status_code=400, detail="Thiếu thoi_gian_cs_lai")
        
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE khach_hang SET thoi_gian_cs_lai = %s, da_goi = false WHERE id_kh = %s",
                (thoi_gian_cs_lai, customer_id)
            )
            conn.commit()
            
        return {"message": "Đã cập nhật thời gian chăm sóc lại"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi cập nhật: {str(e)}")

@router.put("/customers/{customer_id}/next-sales-time")
async def update_next_sales_time(
    customer_id: int, 
    body: dict = Body(...),
    token: str = Depends(check_token)
):
    """Cập nhật thời gian bán hàng kế tiếp cho khách hàng"""
    try:
        from database import conn
        ngay_hen_banhang = body.get("ngay_hen_banhang")
        
        if not ngay_hen_banhang:
            raise HTTPException(status_code=400, detail="Thiếu ngay_hen_banhang")
        
        with conn.cursor() as cur:
            cur.execute("SELECT ngay_hen_banhang FROM khach_hang WHERE id_kh = %s", (customer_id,))
            old_row = cur.fetchone()
            old_date = old_row[0] if old_row else None
            
            cur.execute(
                "UPDATE khach_hang SET ngay_hen_banhang = %s, da_goi = false WHERE id_kh = %s",
                (ngay_hen_banhang, customer_id)
            )
            
            if str(old_date) != str(ngay_hen_banhang) and ngay_hen_banhang and str(ngay_hen_banhang).lower() != "null":
                user_id = token.get("id_acc") or token.get("user_id") if isinstance(token, dict) else None
                cur.execute("""
                    INSERT INTO khach_hang_schedule_log (id_kh, old_ngay_hen_banhang, new_ngay_hen_banhang, updated_by)
                    VALUES (%s, %s, %s, %s)
                """, (customer_id, old_date, ngay_hen_banhang if ngay_hen_banhang else None, user_id))
                
            conn.commit()
            
        return {"message": "Đã cập nhật thời gian bán hàng kế tiếp"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi cập nhật: {str(e)}")

@router.put("/customers/{customer_id}/da-goi")
async def update_da_goi(
    customer_id: int, 
    body: dict = Body(...),
    token: str = Depends(check_token)
):
    """Cập nhật trạng thái đã gọi cho khách hàng"""
    try:
        from database import conn
        da_goi = body.get("da_goi")
        
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE khach_hang SET da_goi = %s WHERE id_kh = %s",
                (da_goi, customer_id)
            )
            conn.commit()
            
        return {"message": "Đã cập nhật trạng thái đã gọi"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi cập nhật: {str(e)}")

@router.post("/lead/website")
async def get_lead_website(request: Request):
    try:
        # body = await request.body()
        # print("📦 Raw body nhận được:", body.decode()) 

        data = await request.json()
        print("✅ Dữ liệu nhận:")
        print(json.dumps(data, indent=4, ensure_ascii=False))
        name = data["billing"].get("last_name") + " " + data["billing"].get("first_name")
        sdt = data["billing"].get("phone", "").strip()
        sdt = f"84{''.join(filter(str.isdigit, sdt))[-9:]}"

        line_items = data.get("line_items", [])
        sku_list = [item.get("sku", "") for item in line_items]
        sku_str = "\n".join(sku_list)


        khach_hang = {
            "id_acc": 21,
            "nhan_vien_pt": "website",
            "nhom_kh": "F",
            "ten_khach_hang": name,
            "sdt": sdt,
            "gioi_tinh": "Khác",
            "dia_chi":  data["billing"].get("address_1", ""),
            "ngay_sinh": "",
            "nghe_nghiep": "",
            "diem_khach_hang": 0,
            "ghi_chu": "",
            "dac_thu_sp": sku_str,
            "nhu_cau_sd": "",
            "thoi_gian_tao": datetime.now(),
            "nguon_data": "WEBSITE"
        }
        result = await them_khach_hang(khach_hang)
        print(result)
        if not result:
            raise HTTPException(status_code=400, detail="Lỗi khi thêm khách hàng!")
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        return result
    except Exception as e:
        print("❌ Lỗi khi xử lý webhook:")
        traceback.print_exc()  # In đầy đủ lỗi ra console
        return {"error": str(e)}


@router.post("/log/luu_log")
async def luuu_logg(
    id_acc: int = Body(...),
    key_tt: str = Body(...),
    action: str = Body(...),
    payload: Any = Body(...),  # hoặc Any nếu muốn
    token: str = Depends(check_token)
):
    try:
        await luu_log(id_acc, key_tt, action, payload)
        return {"message": "✅ Lưu log thành công"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"❌ Lỗi lưu log: {str(e)}")
    
@router.get("/lead/phan_tich_khach_hang")
async def pt_kh(
    thoi_gian_tao: List[str] = Query(..., description="Chuỗi thời gian ISO, 2 giá trị: [from, to]"),
    list_id_acc_str: str = Query(...),
    token: dict = Depends(check_token)
):
    try:
        list_id_acc = [int(i) for i in list_id_acc_str.split(',') if i.strip().isdigit()]
        bc = await phan_tich_khach_hang(thoi_gian_tao, list_id_acc)
        
        # Nếu bạn muốn kiểm tra có dữ liệu hay không:
        if bc is False:
            raise HTTPException(status_code=400, detail="Không có lịch sử mua hàng")
        
        return bc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")



@router.post("/lead/de_xuat_khach_hang")
async def pt_kh(
    payload: dict = Body(...),
    token: dict = Depends(check_token)
):
    try:
        # print("✅ Dữ liệu nhận:", payload)
        data = payload["data"]
        nguoi_gui = payload["nguoi_gui"]
        url = "https://open.larksuite.com/open-apis/bot/v2/hook/dba3ed24-6094-4cf3-95a4-f4675f9b117c"
        # test riêng 
        # url = "https://open.larksuite.com/open-apis/bot/v2/hook/96acfc42-f913-45ed-8dd2-437a983c94a3"
        if data["thoi_gian_capnhat_ghichu"]:
            check_trung = (datetime.now() - datetime.fromisoformat(data["thoi_gian_capnhat_ghichu"]).replace(tzinfo=None)).days
        else:
            check_trung = 9999
        text_trung = ""
        if check_trung <= 30:
            text_trung = "Dưới 30 ngày"
        elif 30 < check_trung:
            text_trung = "Trên 30 ngày"

        message = {
            "msg_type": "interactive",
            "card": {
                "elements": [{
                    "tag": "div",
                    "text": {
                        "content": f"- Nhân sự đề xuất: {nguoi_gui['user_id']} - {nguoi_gui['name']}\n"+\
                                    f"- Mã khách hàng: {data['ma_kh']}\n"+\
                                    f"- Data thuộc quyền quản lý của: {data['nhan_vien_pt']} - {data['name_pt']}\n" +\
                                    f"- Đánh giá: ***{text_trung}***\n"
                                    ,
                        "tag": "lark_md"
                    }
                }],
                "header": {
                    "title": {
                        "content": "ĐỀ XUẤT PHÁT - XỬ LÝ DATA TRÙNG LẶP TRÊN HỆ THỐNG:",
                        "tag": "plain_text"
                    }
                }
            }
        }
        
        response = requests.post(url, data=json.dumps(message), headers={'Content-Type': 'application/json'})
        if response.status_code == 200:
            print("Gửi thành công!")
        else:
            print(f"Lỗi: {response.status_code}, {response.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.post("/lead/de_xuat_them_lead")
async def de_xuat_themdata(
    payload: dict = Body(...),
    token: dict = Depends(check_token)
):
    try:
        from model.lead import tao_lead_de_xuat
        
        # print("✅ Dữ liệu nhận:", payload)
        data = payload["data"]
        nguoi_gui = payload["nguoi_gui"]
        
        # Lấy id_acc từ token
        id_acc_nguoi_tao = token.get("id_acc")
        if not id_acc_nguoi_tao:
            raise HTTPException(status_code=401, detail="Không xác định được người dùng")
        
        # Tạo lead đề xuất trong database
        result = await tao_lead_de_xuat(data, id_acc_nguoi_tao)
        
        # Nếu có lỗi (số điện thoại trùng), trả về lỗi
        if "error" in result:
            return result
        
        # Gửi thông báo lên Lark
        url = "https://open.larksuite.com/open-apis/bot/v2/hook/dba3ed24-6094-4cf3-95a4-f4675f9b117c"
        # test riêng 
        # url = "https://open.larksuite.com/open-apis/bot/v2/hook/96acfc42-f913-45ed-8dd2-437a983c94a3"
        
        # Xác định loại đề xuất (tạo mới hay reassign)
        proposal_type = result.get("type", "tao_moi")
        
        # Build message content với fields có sẵn (hỗ trợ cả tạo mới và reassign)
        message_content = f"- Nhân sự đề xuất: {nguoi_gui['user_id']} - {nguoi_gui['name']}\n"+\
                          f"- Tên khách hàng: {data['ten_kh']}\n"+\
                          f"- Giới tính: {data.get('gioi_tinh', 'N/A')}\n" +\
                          f"- SĐT: {data['sdt']}\n"
        
        # Thêm các field tùy chọn nếu có
        if data.get('dia_chi'):
            message_content += f"- Địa chỉ: {data['dia_chi']}\n"
        if data.get('nguon_data'):
            message_content += f"- Nguồn data: {data['nguon_data']}\n"
        if data.get('dac_thu'):
            message_content += f"- Đặc thù sản phẩm: {data['dac_thu']}\n"
        if data.get('nhu_cau'):
            message_content += f"- Nhu cầu sử dụng: {data['nhu_cau']}\n"
        
        # Chọn tiêu đề tùy theo loại đề xuất
        title_content = "ĐỀ XUẤT CHIA LEAD - REASSIGN KHÁCH HÀNG:" if proposal_type == "reassign" else "ĐỀ XUẤT THÊM KHÁCH HÀNG MỚI TRÊN CRM:"
        if result.get("auto_approve"):
            title_content += " (ĐÃ TỰ ĐỘNG DUYỆT)"
        
        message = {
            "msg_type": "interactive",
            "card": {
                "elements": [{
                    "tag": "div",
                    "text": {
                        "content": message_content,
                        "tag": "lark_md"
                    }
                }],
                "header": {
                    "title": {
                        "content": title_content,
                        "tag": "plain_text"
                    }
                }
            }
        }
        
        response = requests.post(url, data=json.dumps(message), headers={'Content-Type': 'application/json'})
        if response.status_code == 200:
            print("Gửi Lark thành công!")
        else:
            print(f"Lỗi gửi Lark: {response.status_code}, {response.text}")
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


@router.post("/lead/hen_ngay_banhang")
async def hen_ngay_banhang(
    id_kh: int = Body(...), 
    ngay_hen_banhang: datetime = Body(...), 
    loai_kh:str = Body(...), 
    ghi_chu_them1: str = Body(...),
    ghi_chu_them2: str = Body(...),
    token: str = Depends(check_token)
):
    try:
        return await update_ngay_hen_banhang(id_kh, ngay_hen_banhang, loai_kh, ghi_chu_them1, ghi_chu_them2)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Dữ liệu không hợp lệ: {str(e)}")

# khách thăng hạng trên mini_app
@router.post("/lead/tich_diem/thang_hang")
async def thang_hang(request: Request):
    try:
        data = await request.json()
        print("📥 Nhận thông tin khách thăng hạng:",  json.dumps(data, indent=4, ensure_ascii=False))
        # Xử lý dữ liệu chuyển khoản ở đây (lưu vào DB, gửi thông báo, v.v.)
        return await thang_hang_tich_diem(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Dữ liệu không hợp lệ: {str(e)}")

# khách vào miniapp
@router.post("/lead/join_miniapp")
async def join_miniapp(request: Request):
    try:
        data = await request.json()
        print("📥 Nhận thông tin khách mới truy cập miniapp:", json.dumps(data, indent=4, ensure_ascii=False))
        # Xử lý dữ liệu chuyển khoản ở đây (lưu vào DB, gửi thông báo, v.v.)
        # {
        #     "ten_khach_hang": "Nguyen Van A",
        #     "uid_miniapp": "sdasdasasdasdasda",
        #     "thoi_gian_join": "2025-11-05 10:00:00",
        #     "nguon_data": "MINIAPP" // chỗ này mã nhân sự hoặc không đo được để None
        # }
        return await customer_new_miniapp(data)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Dữ liệu không hợp lệ: {str(e)}")

# khách nhập mã giới thiệu của nhân sự
@router.post("/lead/nhap_ma_gioi_thieu")
async def nhap_ma_gioi_thieu(request: Request):
    try:
        data = await request.json()
        print("📥 Nhận thông tin khách nhập mã giới thiệu từ nhân sự:",  json.dumps(data, indent=4, ensure_ascii=False))
        # Xử lý dữ liệu chuyển khoản ở đây (lưu vào DB, gửi thông báo, v.v.)
        # {
        #     "uid_miniapp": "sdasdasasdasdasda",
        #     "nguon_data": "MINIAPP" // chỗ này mã nhân sự hoặc không đo được để None
        # }
        return await customer_new_miniapp(data)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Dữ liệu không hợp lệ: {str(e)}")

# khách hàng sử dụng điểm hoặc đổi quagf
@router.post("/lead/cap_nhat_diem_thuong")
async def su_dung_diem_thuong(request: Request):
    try:
        data = await request.json()
        print("📥 Khách hàng sử dụng điểm thưởng:",  json.dumps(data, indent=4, ensure_ascii=False))
       
        current_point = await sd_diem(data)

        return {
            "success": True,
            "current_point": int(current_point)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Dữ liệu không hợp lệ: {str(e)}")
    

@router.post("/lead/gmv_chuky")
async def gmv_chuuky(
    id_acc: int = Body(...),  # [{"id_acc":4}, {"id_acc":5}] hoặc [4,5]
    fromdate: str = Body(...),
    todate: str = Body(...),
    token: str = Depends(check_token)
):
    try:
        return await gmv_chuky(fromdate, todate, id_acc)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Dữ liệu không hợp lệ: {str(e)}")

@router.get("/lead/tong_quan_dukien/{id_acc}")
async def tong_quan_dukien(id_acc: int, token: str = Depends(check_token)):
    try:
        
        data = await tong_quan_goi_y(id_acc)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail = "Lỗi khi lấy dữ liệu khách hàng")
    

@router.post("/lead/quay_thuong")
async def them_quay_thuong(data: dict = Body(...)):
    try:
        result = await add_quaythuong(data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server khi thêm dữ liệu quay thưởng: {str(e)}")


@router.get("/lead/top_customers")
async def get_top_customers(
    limit: int = Query(100, description="Số lượng khách hàng top"),
    sort_by: str = Query("gmv", description="Sắp xếp theo: gmv hoặc so_lan_mua"),
    token: dict = Depends(check_token)
):
    """
    API lấy danh sách top khách hàng của nhân viên
    - sort_by: 'gmv' (giá trị mua hàng) hoặc 'so_lan_mua' (số lần mua)
    """
    try:
        id_acc = token.get("id_acc")
        if not id_acc:
            raise HTTPException(status_code=401, detail="Không tìm thấy thông tin người dùng")
        
        # Validate sort_by parameter
        if sort_by not in ["gmv", "so_lan_mua"]:
            raise HTTPException(status_code=400, detail="sort_by phải là 'gmv' hoặc 'so_lan_mua'")
        
        customers = await get_top_customers_sorted(id_acc, limit, sort_by)
        return {
            "success": True,
            "data": customers,
            "total": len(customers),
            "sort_by": sort_by
        }
    except HTTPException as http_err:
        raise http_err
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi server khi lấy danh sách top khách hàng: {str(e)}")


@router.post("/lead/search_advanced")
async def search_customers(
    search_params: dict = Body(...),
    token: dict = Depends(check_token)
):
    """
    API tìm kiếm chuyên sâu khách hàng của nhân viên đang đăng nhập
    
    Dữ liệu được lấy từ:
    - Bảng khach_hang (db crm_tdvn): thông tin cơ bản, GMV, số lần mua
    - Bảng note_address (db fm_tdvn): tỉnh/thành phố, phường/xã
    
    Request body:
    {
        "customer_code": "KH001",  // Mã khách hàng (optional)
        "customer_name": "Nguyễn",  // Tên khách hàng (optional)
        "phone": "0912345678",  // Số điện thoại (optional)
        "province_id": 1,  // ID tỉnh/thành phố từ note_address (optional)
        "ward_id": 10,  // ID phường/xã từ note_address (optional)
        "gmv_from": 1000000,  // GMV từ (optional)
        "gmv_to": 50000000,  // GMV đến (optional)
        "order_count_from": 1,  // Số lần mua từ (optional)
        "order_count_to": 10  // Số lần mua đến (optional)
    }
    """
    try:
        id_acc = token.get("id_acc")
        if not id_acc:
            raise HTTPException(status_code=401, detail="Không tìm thấy thông tin người dùng")
        role_id = token.get("role_id", 4)
        
        # Chuyển đổi các giá trị chuỗi thành số nếu cần
        if search_params.get("gmv_from") is not None:
            search_params["gmv_from"] = float(search_params["gmv_from"])
        if search_params.get("gmv_to") is not None:
            search_params["gmv_to"] = float(search_params["gmv_to"])
        if search_params.get("order_count_from") is not None:
            search_params["order_count_from"] = int(search_params["order_count_from"])
        if search_params.get("order_count_to") is not None:
            search_params["order_count_to"] = int(search_params["order_count_to"])
        
        # Lấy page và page_size từ search_params
        page = search_params.get("page", 1)
        page_size = search_params.get("page_size", 50)
        
        customers, total_records = await search_customers_advanced(id_acc, search_params, role_id)
        
        # Tính toán phân trang
        total_pages = (total_records + page_size - 1) // page_size
        
        return {
            "success": True,
            "data": customers,
            "total": total_records,
            "total_pages": total_pages,
            "current_page": page,
            "page_size": page_size
        }
    except HTTPException as http_err:
        raise http_err
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi server khi tìm kiếm khách hàng: {str(e)}")


# API lấy danh sách lead đề xuất (cho admin)
@router.get("/lead/de_xuat/danh_sach")
async def get_danh_sach_de_xuat(
    trang_thai: Optional[str] = Query(None, description="cho_duyet, da_duyet, tu_choi"),
    token: dict = Depends(check_token)
):
    try:
        from model.lead import get_lead_de_xuat
        
        # Kiểm tra quyền admin (có thể thêm logic check role)
        # if token.get("role_id") not in [1, 2]:  # Admin roles
        #     raise HTTPException(status_code=403, detail="Không có quyền truy cập")
        
        leads = await get_lead_de_xuat(trang_thai)
        return {"success": True, "data": leads}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


# API xác nhận lead đề xuất (approve/reject)
@router.put("/lead/de_xuat/xac_nhan")
async def xac_nhan_de_xuat(
    payload: dict = Body(...),
    token: dict = Depends(check_token)
):
    """
    payload: {
        "id_de_xuat": 123,
        "trang_thai": "da_duyet" hoặc "tu_choi"
    }
    """
    try:
        from model.lead import xac_nhan_lead_de_xuat
        from model.thong_bao import add_thong_bao
        from sockets import sio, NAMESPACE_THONG_BAO
        from database import conn
        
        id_de_xuat = payload.get("id_de_xuat")
        trang_thai = payload.get("trang_thai")
        
        if not id_de_xuat or not trang_thai:
            raise HTTPException(status_code=400, detail="Thiếu thông tin id_de_xuat hoặc trang_thai")
        
        if trang_thai not in ['da_duyet', 'tu_choi']:
            raise HTTPException(status_code=400, detail="trang_thai phải là 'da_duyet' hoặc 'tu_choi'")
        
        # Lấy id_acc của admin
        id_acc_admin = token.get("id_acc")
        if not id_acc_admin:
            raise HTTPException(status_code=401, detail="Không xác định được người dùng")
        
        # Lấy thông tin admin và đề xuất trước khi xác nhận
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    dxl.id_acc as id_acc_de_xuat,
                    au_de_xuat.name as ten_nguoi_de_xuat,
                    kh.id_kh,
                    kh.ma_kh,
                    kh.ten_khach_hang,
                    au_admin.name as ten_admin
                FROM de_xuat_lead dxl
                JOIN khach_hang kh ON dxl.id_kh = kh.id_kh
                JOIN account_users au_de_xuat ON dxl.id_acc = au_de_xuat.id_acc
                LEFT JOIN account_users au_admin ON au_admin.id_acc = %s
                WHERE dxl.id_de_xuat = %s
            """, (id_acc_admin, id_de_xuat))
            info = cur.fetchone()
            
            if not info:
                raise HTTPException(status_code=404, detail="Không tìm thấy đề xuất")
            
            id_acc_de_xuat = info[0]
            ten_nguoi_de_xuat = info[1]
            id_kh = info[2]
            ma_kh = info[3]
            ten_khach_hang = info[4]
            ten_admin = info[5] or "Quản trị viên"
        
        # Xác nhận đề xuất
        result = await xac_nhan_lead_de_xuat(id_de_xuat, trang_thai, id_acc_admin)
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        # Gửi thông báo cho nhân viên đề xuất
        if trang_thai == "da_duyet":
            noi_dung = f"{ten_admin} đã phê duyệt đề xuất lead của bạn. Khách hàng {ten_khach_hang} (Mã: {ma_kh}) đã được chuyển cho bạn phụ trách."
            tieu_de = "✅ Đề xuất lead được phê duyệt"
        else:
            noi_dung = f"{ten_admin} đã từ chối đề xuất lead của bạn. Khách hàng {ten_khach_hang} (Mã: {ma_kh})."
            tieu_de = "❌ Đề xuất lead bị từ chối"
        
        notification_data = {
            "id_acc": id_acc_de_xuat,
            "time_update": datetime.now().isoformat(),
            "noi_dung": noi_dung,
            "tieu_de": tieu_de,
            "id_kh": [id_kh],
            "trang_thai": "chua_doc"
        }
        
        # Lưu thông báo vào database
        thong_bao_result = await add_thong_bao(notification_data)
        notification_data["id_tb"] = thong_bao_result["id_tb"]
        
        # Gửi thông báo realtime qua WebSocket
        await sio.emit(
            "new_thong_bao",
            notification_data,
            namespace=NAMESPACE_THONG_BAO,
            room=str(id_acc_de_xuat)
        )
        
        return result
        
    except HTTPException as http_ex:
        raise http_ex
    except Exception as e:
        print(f"❌ Lỗi trong xac_nhan_de_xuat: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


# ============== API CHO ĐỀ XUẤT THU HỒI LEAD ==============

# API tạo đề xuất thu hồi lead
@router.post("/lead/de_xuat_withdraw")
async def de_xuat_withdraw(
    payload: dict = Body(...),
    token: dict = Depends(check_token)
):
    """
    Tạo đề xuất thu hồi lead
    payload: {
        "id_kh": 123,
        "ma_kh": "KH001",
        "ten_khach_hang": "Tên KH",
        "sdt": "0123456789",
        "reason": "Lý do thu hồi",
        "user_id_de_xuat": "AK0001",
        "ten_nguoi_de_xuat": "Tên nhân viên"
    }
    """
    try:
        from model.lead import tao_withdraw_de_xuat
        
        id_acc = token.get("id_acc")
        if not id_acc:
            raise HTTPException(status_code=401, detail="Không xác định được người dùng")
        
        # Validate required fields
        required_fields = ["id_kh", "reason", "user_id_de_xuat"]
        for field in required_fields:
            if field not in payload or not payload[field]:
                raise HTTPException(status_code=400, detail=f"Thiếu trường: {field}")
        
        # Validate reason length
        reason = payload.get("reason", "").strip()
        if len(reason) < 2:
            raise HTTPException(status_code=400, detail="Lý do phải có ít nhất 2 ký tự")
        
        result = await tao_withdraw_de_xuat(payload, id_acc)
        
        if "error" in result:
            return {"success": False, "error": result["error"]}
        
        return {
            "success": True,
            "message": "Đã gửi đề xuất thu hồi lead thành công!",
            "data": result
        }
        
    except HTTPException as http_ex:
        raise http_ex
    except Exception as e:
        print(f"❌ Lỗi trong de_xuat_withdraw: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


# API lấy danh sách đề xuất thu hồi lead
@router.get("/lead/de_xuat_withdraw/danh_sach")
async def get_danh_sach_de_xuat_withdraw(
    trang_thai: Optional[str] = Query(None, description="cho_duyet, da_duyet, tu_choi"),
    page: int = Query(1, description="Trang hiện tại", ge=1),
    pageSize: int = Query(50, description="Số items trên 1 trang", ge=1, le=500),
    token: dict = Depends(check_token)
):
    try:
        from model.lead import get_withdraw_de_xuat
        
        # Lấy danh sách và tổng số items
        result = await get_withdraw_de_xuat(trang_thai, page=page, pageSize=pageSize)
        
        return {
            "success": True,
            "data": result.get("data", []),
            "totalItems": result.get("totalItems", 0),
            "page": page,
            "pageSize": pageSize
        }
        
    except Exception as e:
        print(f"❌ Lỗi trong get_danh_sach_de_xuat_withdraw: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")


# API xác nhận đề xuất thu hồi lead
@router.put("/lead/de_xuat_withdraw/xac_nhan")
async def xac_nhan_de_xuat_withdraw(
    payload: dict = Body(...),
    token: dict = Depends(check_token)
):
    """
    payload: {
        "id_de_xuat": 123,
        "trang_thai": "da_duyet" hoặc "tu_choi"
    }
    """
    try:
        from model.lead import xac_nhan_withdraw_de_xuat
        from model.thong_bao import add_thong_bao
        from sockets import sio, NAMESPACE_THONG_BAO
        from database import conn
        
        id_de_xuat = payload.get("id_de_xuat")
        trang_thai = payload.get("trang_thai")
        
        if not id_de_xuat or not trang_thai:
            raise HTTPException(status_code=400, detail="Thiếu thông tin id_de_xuat hoặc trang_thai")
        
        if trang_thai not in ['da_duyet', 'tu_choi']:
            raise HTTPException(status_code=400, detail="trang_thai phải là 'da_duyet' hoặc 'tu_choi'")
        
        id_acc_admin = token.get("id_acc")
        if not id_acc_admin:
            raise HTTPException(status_code=401, detail="Không xác định được người dùng")
        
        # Lấy thông tin từ database
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    dwx.id_acc,
                    au_de_xuat.name,
                    kh.id_kh,
                    kh.ma_kh,
                    kh.ten_khach_hang,
                    au_admin.name
                FROM de_xuat_withdraw dwx
                JOIN khach_hang kh ON dwx.id_kh = kh.id_kh
                JOIN account_users au_de_xuat ON dwx.id_acc = au_de_xuat.id_acc
                LEFT JOIN account_users au_admin ON au_admin.id_acc = %s
                WHERE dwx.id_de_xuat = %s
            """, (id_acc_admin, id_de_xuat))
            info = cur.fetchone()
            
            if not info:
                raise HTTPException(status_code=404, detail="Không tìm thấy đề xuất")
            
            id_acc_de_xuat = info[0]
            ten_nguoi_de_xuat = info[1]
            id_kh = info[2]
            ma_kh = info[3]
            ten_khach_hang = info[4]
            ten_admin = info[5] or "Quản trị viên"
        
        # Xác nhận đề xuất
        result = await xac_nhan_withdraw_de_xuat(id_de_xuat, trang_thai, id_acc_admin)
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        # Gửi thông báo cho nhân viên đề xuất
        if trang_thai == "da_duyet":
            noi_dung = f"{ten_admin} đã phê duyệt đề xuất thu hồi lead của bạn. Khách hàng {ten_khach_hang} (Mã: {ma_kh}) đã được thu hồi."
            tieu_de = "✅ Đề xuất thu hồi lead được phê duyệt"
        else:
            noi_dung = f"{ten_admin} đã từ chối đề xuất thu hồi lead của bạn. Khách hàng {ten_khach_hang} (Mã: {ma_kh}) vẫn được phụ trách."
            tieu_de = "❌ Đề xuất thu hồi lead bị từ chối"
        
        notification_data = {
            "id_acc": id_acc_de_xuat,
            "time_update": datetime.now().isoformat(),
            "noi_dung": noi_dung,
            "tieu_de": tieu_de,
            "id_kh": [id_kh],
            "trang_thai": "chua_doc"
        }
        
        # Lưu thông báo vào database
        thong_bao_result = await add_thong_bao(notification_data)
        notification_data["id_tb"] = thong_bao_result["id_tb"]
        
        # Gửi thông báo realtime qua WebSocket
        await sio.emit(
            "new_thong_bao",
            notification_data,
            namespace=NAMESPACE_THONG_BAO,
            room=str(id_acc_de_xuat)
        )
        
        return result
        
    except HTTPException as http_ex:
        raise http_ex
    except Exception as e:
        print(f"❌ Lỗi trong xac_nhan_de_xuat_withdraw: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")












# API MẪU TÌM KIẾM CHUYÊN SÂU
from schemas import SearchTemplateRequest

@router.post("/lead/search_advanced/templates")
async def api_create_search_template(
    payload: SearchTemplateRequest,
    token: dict = Depends(check_token)
):
    try:
        id_acc = token.get("id_acc")
        if not id_acc:
            raise HTTPException(status_code=401, detail="Không tìm thấy thông tin người dùng")
        
        from model.lead import create_search_template
        result = await create_search_template(id_acc, payload.name, payload.filter_data)
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])
        return {"success": True, "data": result}
    except HTTPException as http_err:
        raise http_err
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")

@router.get("/lead/search_advanced/templates")
async def api_get_search_templates(token: dict = Depends(check_token)):
    try:
        from model.lead import get_all_search_templates
        templates = await get_all_search_templates()
        return {"success": True, "data": templates}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")

@router.put("/lead/search_advanced/templates/{template_id}")
async def api_update_search_template(
    template_id: int,
    payload: SearchTemplateRequest,
    token: dict = Depends(check_token)
):
    try:
        from model.lead import update_search_template
        result = await update_search_template(template_id, payload.name, payload.filter_data)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException as http_err:
        raise http_err
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")

@router.delete("/lead/search_advanced/templates/{template_id}")
async def api_delete_search_template(
    template_id: int,
    token: dict = Depends(check_token)
):
    try:
        from model.lead import delete_search_template
        result = await delete_search_template(template_id)
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        return result
    except HTTPException as http_err:
        raise http_err
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi server: {str(e)}")
