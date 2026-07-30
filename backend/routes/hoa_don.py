import asyncio
from datetime import datetime
from decimal import Decimal
import json
import time
import traceback
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query, Request, requests
from utils.security import check_token
from model.hoadon import bao_cao_zns, lich_su_mua, bao_cao_theo_nguoi_ban, dong_bo_hoadon, get_data_baocao, luu_kh_ck, check_tt_chuyenkhoan, checkFollow, sendByZNS, bao_bao_theo_nhansu, thi_dua_ngay, bao_cao_f0_ngay, chi_tiet_hoadon_theo_kenh, bao_cao_fn_ngay, chi_tiet_fn_theo_nhanvien, assign_kenh_f0
from model.lead import update_uid
from utils.fm import get_product, create_invoice_fm
import requests 

import httpx 

router = APIRouter()




@router.get("/hoa_don/history/{sdt}")
async def history_hoadon(sdt: str, token: dict = Depends(check_token)):
    try:

        lich_su_mh = await lich_su_mua(sdt)
        
        if not lich_su_mh:
            raise HTTPException(status_code=400, detail="Không có lịch sử mua hàng")
        return {"history": lich_su_mh}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")
    
# lấy dữ liệu báo cáo hóa đơn
@router.get("/hoa_don/bao_cao")
async def bao_cao_hd():
    try:

        data_bao_cao = await get_data_baocao()
        
        if not data_bao_cao:
            raise HTTPException(status_code=400, detail="Không có lịch sử mua hàng")
        return data_bao_cao
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")
    
@router.get("/hoa_don/bao_cao_cskh")
async def bao_cao(thoi_gian_tao: List[str] = Query(..., description="Chuỗi thời gian ISO, 2 giá trị: [from, to]"), token: dict = Depends(check_token)):
    try:

        bc = await bao_cao_theo_nguoi_ban(thoi_gian_tao)
        
        # if not bc:
        #     raise HTTPException(status_code=400, detail="Không có lịch sử mua hàng")
        return bc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")


queue = asyncio.Queue()
# processing_limit = asyncio.Semaphore(5)  # chỉ cho xử lý 5 hóa đơn cùng lúc


CONCURRENCY_WORKERS = 20  # số worker thực sự
token_cache = {"value": None, "exp": 0}

# HTTP client dùng chung (tái sử dụng kết nối)
http_client: Optional[httpx.AsyncClient] = None

# ==== QUẢN LÝ WORKER THEO VÒNG ĐỜI APP ====
workers: list[asyncio.Task] = []

async def get_token_kiotviet():
    global http_client
    now = time.time()
    if token_cache["value"] and now < float(token_cache["exp"] or 0):
        return token_cache["value"]  # type: ignore

    if http_client is None:
        raise HTTPException(status_code=500, detail="HTTP client chưa sẵn sàng")

    url = "https://id.kiotviet.vn/connect/token"
    data = {
        "scopes": "PublicApi.Access",
        "grant_type": "client_credentials",
        "client_id": "4407d357-adc7-48b8-b685-1608c62863a5",
        "client_secret": "97C7ABEA39F6AA15D2B92B2798669BEB6ABF6531"
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    r = await http_client.post(url, data=data, headers=headers, timeout=30.0)
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Không lấy được token KiotViet: {r.text}")

    res = r.json()
    token = f"Bearer {res['access_token']}"
    token_cache["value"] = token
    token_cache["exp"] = now + res.get("expires_in", 1200)
    return token


async def get_chi_tiet_hd(ma_hd):
    global http_client
    if http_client is None:
        raise HTTPException(status_code=500, detail="HTTP client chưa sẵn sàng")

    token = await get_token_kiotviet()
    url = f"https://public.kiotapi.com/invoices/code/{ma_hd}"
    headers = {
        "Retailer": "trafvietnam",
        "Authorization": token,
        "Content-Type": "application/json",
    }

    # retry/backoff đơn giản cho 429/5xx
    base_delay = 0.5
    for attempt in range(5):
        r = await http_client.get(url, headers=headers, timeout=30.0)
        if r.status_code == 200:
            return r.json()
        if r.status_code == 401:
            # token có thể hết hạn -> buộc renew
            token_cache["value"] = None
            token_cache["exp"] = 0
        if r.status_code in (429, 500, 502, 503, 504):
            await asyncio.sleep(base_delay * (2 ** attempt))
            continue
        print("❌ Lỗi lấy chi tiết hóa đơn:", r.text)
        return None

    print("❌ Lỗi lấy chi tiết hóa đơn: quá số lần retry")
    return None

async def xu_ly_hoa_don(ma_hd):
    try:
        
        data = await get_chi_tiet_hd(ma_hd)
        if data:
            await dong_bo_hoadon(data)  # đảm bảo idempotent ở DB
            print(f"✅ Đã đồng bộ hóa đơn {ma_hd}")
        else:
            print(f"⚠️ Bỏ qua hóa đơn {ma_hd} (không lấy được chi tiết)")
    except Exception as e:
        print(f"❌ Lỗi xử lý hóa đơn {ma_hd}: {e}")

async def huy_hoadon(id_hoadon):
    global http_client
    token = await get_token_kiotviet()

    url = "https://public.kiotapi.com/invoices"

    headers = {
        "Authorization": token,
        "Retailer": "trafvietnam",
        "Content-Type": "application/json",
    }

    payload = {
        "id": id_hoadon,
        "isVoidPayment": True
    }

    # ❗ Thay vì json=payload, ta encode thủ công:
    r = await http_client.request("DELETE", url, headers=headers, content=json.dumps(payload))

    print("➡️ URL gọi:", r.url)
    print("🔢 Status:", r.status_code)
    if r.status_code != 200:
        print("❌ Lỗi:", r.text)
        r.raise_for_status()

    return r.json()


async def worker():
    while True:
        ma_hd = await queue.get()
        try:
            await xu_ly_hoa_don(ma_hd)
        finally:
            queue.task_done()


# =============== QUẢN LÝ VÒNG ĐỜI APP (WORKER + HTTP CLIENT) ===============
@router.on_event("startup")
async def _start_workers():
    global http_client, workers
    http_client = httpx.AsyncClient(timeout=30.0)
    # tạo 3 worker (bạn có thể tăng/giảm)
    workers = [asyncio.create_task(worker()) for _ in range(CONCURRENCY_WORKERS)]
    print(f"🚀 Started {len(workers)} invoice workers")

@router.on_event("shutdown")
async def _stop_workers():
    global http_client, workers
    for t in workers:
        t.cancel()
    if workers:
        await asyncio.gather(*workers, return_exceptions=True)
    if http_client:
        await http_client.aclose()
    print("🛑 Stopped invoice workers & closed http client")

# ================= WEBHOOK CHÍNH =====================
@router.post("/update/hoa_don")
async def webhook_hoa_don(request: Request):
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Payload không hợp lệ (không phải JSON)")

    hoadon_list = data.get("Notifications", [])
    added = 0

    for node in hoadon_list:
        for hd in node.get("Data", []):
            ma_hd = hd.get("Code")
            if not ma_hd:
                continue
            await queue.put(ma_hd)
            added += 1

    return {"message": f"✅ Đã nhận {added} hóa đơn, xử lý nền theo hàng đợi"}

@router.post("/update/hoa_don1")
async def webhook_hoa_don_1(id_hd, ma_hd):
    print("Cập nhật mã hóa đơn: ", ma_hd)
    await queue.put(ma_hd)
    return {"message": f"✅ Đã nhận hóa đơn {ma_hd}, xử lý nền theo hàng đợi"}
    


# ================= API TEST =====================

@router.get("/update/hoa_don/status")
async def status():
    return {"đang_trong_hàng_đợi": queue.qsize()}



#==================== API CHECK thông tin chuyển khoản từ miniapp ====================
@router.post("/hoa_don/check_chuyen_khoan")
async def check_thong_tin_chuyen_khoan(request: Request):
    try:
        data = await request.json()
        print("📥 Nhận thông tin chuyển khoản từ bdsd lark:", data)
        # Xử lý dữ liệu chuyển khoản ở đây (lưu vào DB, gửi thông báo, v.v.)
        check = await check_tt_chuyenkhoan(data)
        if check == True:
            return "Xác nhận khách hàng đã thanh toán"
        else:
            return "Xác nhận khách hàng chưa thanh toán"
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Dữ liệu không hợp lệ: {str(e)}")
    


async def create_invoice_kiotviet(http_client: httpx.AsyncClient, payload):
    """
    Gửi hóa đơn lên KiotViet.
    Trả về response JSON từ KiotViet hoặc raise HTTPException nếu lỗi.
    """

    # 1. Lấy token
    token = await get_token_kiotviet()

    # 2. Gọi API KiotViet
    url = "https://public.kiotapi.com/invoices"

    headers = {
        "Content-Type": "application/json",
        "Authorization": token,
        "Retailer": "trafvietnam",
    }
    # 1. log request trước khi gửi
    print("===== PAYLOAD GỬI LÊN KIOTVIET =====")
    # print(json.dumps(payload, ensure_ascii=False, indent=2))

    resp = await http_client.post(url, headers=headers, json=payload)

    # 3. Kiểm tra lỗi
    if resp.status_code >= 400:
        # Trả chi tiết lỗi của KiotViet ra cho dễ debug
        raise HTTPException(
            status_code=resp.status_code,
            detail={
                "message": "KiotViet trả lỗi khi tạo hóa đơn",
                "kiotviet_response": resp.text,
            },
        )

    return resp.json()

def clean_prefix(text: str):
    prefixes = ["Tỉnh", "Thành phố", "Quận", "Huyện", "Thị xã"]
    for pre in prefixes:
        if text.startswith(pre + " "):
            return text[len(pre) + 1:]
    return text


@router.post("/orders/webhook")
async def create_invoice(request: Request):
    """
    Nhận data đơn hàng thô từ Miniapp -> tạo hóa đơn KiotViet
    Chỉ map các trường có, còn lại dùng default/hardcode.
    """
    try:
        raw = await request.json()
        print("📥 Nhận thông tin tạo hóa đơn từ Miniapp:")
        print(json.dumps(raw, indent=4, ensure_ascii=False))

        # =========================
        # 1. Lấy dữ liệu từ miniapp
        # =========================
        time_create = raw.get("BaseEntity", {}).get("created_at", "")
        time_update = raw.get("BaseEntity", {}).get("modified_at", "")
        customer_name = raw.get("customer_name")
        customer_phone = raw.get("phone_number")
        customer_address = raw.get("address")
        # giá kh phải trả
        code_need_payment = raw.get("actual_payment_amount", 0) # code_need_payment
        subtotal = raw.get("total_price", 0)
        items_ban = raw.get("order_detail", [])
        items_tang = raw.get("tichdiem_doiqua", [])
        uidZaloApp = raw.get("user_zalo_id", "")
        uidOA = raw.get("id_zalo_oa", "")
        payment_type = raw.get("payment_type", 0)

        # ship 
        ship_fee = raw.get("ship_fee", 0)
        ship_voucher = raw.get("ship_voucher_amount", 0)

        if ship_voucher > ship_fee:
            ship_voucher = ship_fee

        
        # thu_khac = [
        #     {
        #         "id": 206944,
        #         "code": "20. Phí vận chuyển",
        #         "price": ship_fee
        #     }
        # ]

        # giảm giá
        shop_voucher = raw.get("shop_voucher_amount", 0)
        # điểm giảm giá
        shop_voucher += raw.get("money_score", 0)
        shop_voucher += raw.get("rewards_voucher_amount", 0)
        # shop_voucher += ship_voucher
        # ghi_chu = raw.get("note", "")

        data_check = {
            "ten_khach_hang": customer_name,
            "dia_chi": customer_address
        }
        sdt = f"84{''.join(filter(str.isdigit, customer_phone))[-9:]}"

        customer_crm =  await update_uid(sdt, uidZaloApp, uidOA, data_check)
            

        san_pham_goc = await get_product()
        if not san_pham_goc:
            raise HTTPException(status_code=503, detail="Không thể lấy danh sách sản phẩm từ FM, vui lòng thử lại sau.")
        san_pham = []
        weight = 0
        gift_amount = 0

        ghi_chu = raw.get("notes", "")

        for it in items_ban:
            for node in san_pham_goc:
                # print("🔍 node:", node, type(node))
                if node["code_product"] in it["product_type"]:
                    weight += node["weight"]*it["quantity"]
                    san_pham.append({
                        "id_product": node["id_product"],
                        "code_product": node["code_product"],
                        "name_product": node["name_product"],
                        "sub_code_product": it["product_id"],
                        # "sub_name_code_product": it["quantity"],
                        "quantity": it["quantity"],
                        "sub_price": it["actual_price"],
                        "price": node["price"],
                        "total": node["price"] * it["quantity"],
                        "type_product": "sale",
                    })
                    break

        for it in items_tang:
            for node in san_pham_goc:
                # print("🔍 node:", node, type(node))
                if it["product_type"] == node["code"]:
                    weight += node["weight"]*it["quantity"]
                    # kiểm tra trùng productId
                    san_pham.append({
                        "id_product": node["id_product"],
                        
                        "code_product": "QT" + node["code_product"][2:],
                        "name_product": "(Quà tặng) " + node["name_product"],
                        "sub_code_product": it["product_id"],
                        # "sub_name_code_product": it["quantity"],
                        "quantity": 1,
                        "sub_price": it["actual_price"],
                        "price": node["price"],
                        "total": node["price"],
                        "type_product": "gift",
                    })
                    gift_amount += node["price"]

                    break

        
        # print(f"{address}, {phuong_xa}, {khu_vuc}")
        data_put_fm =  {
            "invoice": {

                "time_create": time_create,
                "time_update": time_update,
                "time_start_hoan": None,


                "id_creator": 1,
                "code_creator": "ADMIN",
                "name_creator": "ADMIN",

  
                "id_seller": 1,
                "code_seller": "ADMIN",
                "name_seller": "ADMIN",

                "id_customer": customer_crm["id_kh"],
                "code_customer": customer_crm["ma_kh"],
                "name_customer": customer_name,
                "phone_number": customer_phone,


                "id_salechannel": 12,
                "name_salechannel": "ZALO MINI APP",

                "subtotal": subtotal,
                "gift_amount": gift_amount,
                "discount": shop_voucher+ship_voucher,

                "total_amount": subtotal + gift_amount,

                "fee_delivery": ship_fee,
                "support_delivery": ship_voucher,
                "type_fee_delivery": 'CC_CASH' if ship_voucher == 0 else 'PP_CASH',
                "cod_need_payment": code_need_payment,

                "description": ghi_chu,
                "send_zns": None,

                "id_status": 1,
                "status_value": "Chờ xử lí",
            },

            "invoice_details": san_pham,
            
            "delivery_info": {
                "time_create": time_create,
                "time_update": time_update,
                "code_delivery": None,
                "id_partner_delivery": 4,
                "partner_delivery": "CHỜ VẬN ĐƠN",
                "code_invoice": None,
                "height": 10,
                "width": 10,
                "length": 10,
                "weight": weight,
                "receiver": customer_name,
                "contact_number": customer_phone,
                "prov": raw.get("province", None).replace("\r", "").strip(),
                "city": raw.get("province", None).replace("\r", "").strip(),
                "area": raw.get("ward", None).replace("\r", "").strip(),
                "address": raw.get("address", None).replace("\r", "").replace("\n", "").strip(),
                "id_status": 1,
                "description": None,
            }
            
        }
        global http_client
        if http_client is None:
            raise HTTPException(status_code=500, detail="HTTP client chưa sẵn sàng")

        fm_res = await create_invoice_fm(data_put_fm)

        if payment_type == 3 or payment_type == 4:
            phuong_thuc_ck = ""
            if payment_type == 3:
                phuong_thuc_ck = "Chuyển khoản ngân hàng"
            elif payment_type == 4:
                phuong_thuc_ck = "Tự chuyển khoản ngân hàng"
            # thanh toán chuyển khoản
            await luu_kh_ck({
                "CustomerName": customer_name,
                "PhoneNumber": customer_phone,
                "OrderID": fm_res.get("code_invoice"),
                "PaymentContent": f"Don hang {fm_res.get('code_invoice').replace('_', '')} Zalo mini app chuyen tien",
                "PaymentType": phuong_thuc_ck,
                "TotalPrice": code_need_payment
            })


        # =========================
        # 8. Response trả lại Miniapp
        # =========================
        return {
            "status": "success",
            "message": "Tạo hóa đơn thành công",
            "kiotviet_response": fm_res,
            "order_id": fm_res.get("code_invoice")
        }

    except HTTPException as http_err:
        raise http_err

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi xử lý webhook: {str(e)}"
        )





@router.post("/tra_cuu/hoa_don/send_zns")
async def send_zns_tracuu_hoa_don(sdt: str = Query(..., description="Số điện thoại khách hàng")):
    try:
        sdt_clean = f"84{''.join(filter(str.isdigit, sdt))[-9:]}"
        print("Gửi ZNS tra cứu đơn hàng cho số:", sdt_clean)
        # Gọi hàm gửi ZNS ở đây
        # await gui_zns_tracuu_donhang(sdt_clean)
        return {"message": f"Đã gửi ZNS tra cứu đơn hàng đến số {sdt_clean}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")


@router.post("/webhook/cancel-order")
async def huy_hoa_don(crm_order_id: str = Body(..., embed=True)):
    try:
        print(f"Yêu cầu hủy hóa đơn CRM ID: {crm_order_id}")
        hoa_don = await get_chi_tiet_hd(crm_order_id)
        if hoa_don:
            # print(json.dumps(hoa_don, indent=4, ensure_ascii=False))
            id_hoadon = hoa_don.get("id")
            await huy_hoadon(id_hoadon)
            return {
                "message": f"Đã hủy hóa đơn CRM ID {crm_order_id}",
                "return_code": 1
            }
        else:
            traceback.print_exc()
            raise HTTPException(status_code=404, detail=f"Không tìm thấy hóa đơn CRM ID {crm_order_id}")

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")
    

@router.get("/invoice/detail/{ma_hoadon}")
async def chi_tiet_hoadon(ma_hoadon:str):
    try:
        hoa_don = await get_chi_tiet_hd(ma_hoadon)

        return hoa_don
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")

@router.get("/bao-cao-ngay")
async def bc_ngay():
    try:
        hoa_don = await bao_bao_theo_nhansu()

        return hoa_don
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")
    
@router.get("/thi_dua_ngay")
async def thidua_ngay():
    try:
        bc = await thi_dua_ngay()

        return bc
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")
    
@router.get("/bao_cao_zns")
async def zns_bc(from_date: str = Query(..., description="Ngày bắt đầu YYYY-MM-DD"), to_date: str = Query(..., description="Ngày kết thúc YYYY-MM-DD")):
    try:
        bc = await bao_cao_zns(from_date, to_date)

        return bc
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")


@router.get("/bao-cao-f0")
async def bc_f0(
    from_date: str = Query(default=None, description="Ngày bắt đầu YYYY-MM-DD"),
    to_date: str = Query(default=None, description="Ngày kết thúc YYYY-MM-DD"),
    token: dict = Depends(check_token)
):
    """Báo cáo doanh số F0 theo 9 kênh, lọc theo khoảng ngày."""
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        fd = from_date or today
        td = to_date or today
        data = await bao_cao_f0_ngay(fd, td)
        return {"from_date": fd, "to_date": td, "channels": data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")


@router.get("/bao-cao-f0/chi-tiet")
async def bc_f0_chi_tiet(
    kenh: str = Query(..., description="Tên kênh F0"),
    from_date: str = Query(default=None, description="Ngày bắt đầu YYYY-MM-DD"),
    to_date: str = Query(default=None, description="Ngày kết thúc YYYY-MM-DD"),
    token: dict = Depends(check_token)
):
    """Danh sách hóa đơn chi tiết theo kênh F0."""
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        fd = from_date or today
        td = to_date or today
        invoices = await chi_tiet_hoadon_theo_kenh(kenh, fd, td)
        return {"kenh": kenh, "from_date": fd, "to_date": td, "invoices": invoices}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")


@router.get("/bao-cao-fn")
async def bc_fn(
    from_date: str = Query(default=None, description="Ngày bắt đầu YYYY-MM-DD"),
    to_date: str = Query(default=None, description="Ngày kết thúc YYYY-MM-DD"),
    token: dict = Depends(check_token)
):
    """Báo cáo doanh số FN theo từng nhân viên, lọc theo khoảng ngày."""
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        fd = from_date or today
        td = to_date or today
        data = await bao_cao_fn_ngay(fd, td)
        return {"from_date": fd, "to_date": td, "sellers": data}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")


@router.get("/bao-cao-fn/chi-tiet")
async def bc_fn_chi_tiet(
    code_seller: str = Query(..., description="Code nhân viên"),
    name_seller: str = Query(default="", description="Tên nhân viên (hiển thị)"),
    from_date: str = Query(default=None, description="Ngày bắt đầu YYYY-MM-DD"),
    to_date: str = Query(default=None, description="Ngày kết thúc YYYY-MM-DD"),
    token: dict = Depends(check_token)
):
    """Danh sách hóa đơn chi tiết theo nhân viên FN."""
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        fd = from_date or today
        td = to_date or today
        invoices = await chi_tiet_fn_theo_nhanvien(code_seller, fd, td)
        return {"name_seller": name_seller, "from_date": fd, "to_date": td, "invoices": invoices}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")


@router.put("/bao-cao-f0/assign-kenh")
async def f0_assign_kenh(
    code_invoice: str = Body(..., description="Mã hóa đơn cần phân loại"),
    source_kenh: str = Body(..., description="Kênh hiện tại"),
    target_kenh: str = Body(..., description="Kênh mục tiêu"),
    token: dict = Depends(check_token)
):
    """Chuyển đơn hàng sang kênh khác trong cùng nhóm F0."""
    try:
        result = await assign_kenh_f0(code_invoice, source_kenh, target_kenh)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Lỗi sever: {str(e)}")