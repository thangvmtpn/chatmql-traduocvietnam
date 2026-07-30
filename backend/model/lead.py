import asyncio
from decimal import Decimal
import json
import pprint
import traceback
from typing import Dict, List, Optional
from database import conn, conn_fm
from psycopg import sql
from utils.security import get_google_sheet
from datetime import datetime, timedelta
from model.users import get_all_users


# Helper function chuyển đổi số điện thoại từ 0xxx sang 84xxx
def normalize_phone_number(phone: str) -> str:
    """
    Chuyển đổi số điện thoại về format 84xxx
    - Nếu bắt đầu với '0' thì chuyển thành '84'
    - Nếu bắt đầu với '+84' thì chuyển thành '84'
    - Nếu bắt đầu với '84' thì giữ nguyên
    """
    if not phone:
        return phone
    
    phone = phone.strip()
    
    # Loại bỏ tất cả ký tự không phải số
    phone_digits = ''.join(c for c in phone if c.isdigit())
    
    if not phone_digits:
        return phone
    
    # Chuyển đổi
    if phone_digits.startswith('0'):
        return '84' + phone_digits[1:]  # Bỏ '0' đầu, thêm '84'
    elif phone_digits.startswith('84'):
        return phone_digits  # Giữ nguyên
    else:
        # Nếu format khác, thêm '84' vào đầu
        return '84' + phone_digits


# hàm lưu log
async def luu_log(id_acc, key_tt, action, payload):
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO log_lich_su_thaotac (id_acc, key_tt, action, thoi_gian, payload) 
                VALUES (%s, %s, %s, %s, %s)
            """, (
                id_acc, key_tt, action, datetime.now(), json.dumps(payload, ensure_ascii=False)
            ))
            conn.commit()  
            print("Thêm log thành công")
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi lưu log: {str(e)}")

# luu_log(1, "key_tt", "action", 442)
    
async def them_khach_hang(data_lead):
    try:
        # Normalize số điện thoại
        normalized_sdt = normalize_phone_number(data_lead.sdt)
        
        with conn.cursor() as cur:
            print(f"📥 Dữ liệu nhận: id_acc={data_lead.id_acc}, sdt={normalized_sdt}, nhan_vien_pt={data_lead.nhan_vien_pt}")
            print(normalized_sdt)
            cur.execute("""
                SELECT id_kh FROM khach_hang 
                WHERE sdt1 = %s OR sdt2 = %s
            """, (normalized_sdt, normalized_sdt))
            
            existing_customer = cur.fetchone()
            
            if existing_customer:
                return {"error": "Số điện thoại đã tồn tại trong hệ thống!"}
            
            cur.execute("SELECT MAX(ma_kh) FROM khach_hang")
            result = cur.fetchone()
            max_ma_kh = result[0] if result and result[0] else "KH000000"

            # Tăng lên 1 - Chỉ lấy số từ những ma_kh hợp lệ (KH000XXX)
            try:
                # Nếu max_ma_kh hợp lệ (có dạng KH + 6 chữ số)
                if max_ma_kh and max_ma_kh.startswith("KH") and len(max_ma_kh) >= 8:
                    so_moi = int(max_ma_kh[2:8]) + 1
                else:
                    # Nếu không hợp lệ, query để tìm max từ những ma_kh đúng format
                    cur.execute("""
                        SELECT MAX(CAST(SUBSTRING(ma_kh, 3) AS INTEGER)) 
                        FROM khach_hang 
                        WHERE ma_kh ~ '^KH[0-9]{6}$'
                    """)
                    max_result = cur.fetchone()[0]
                    so_moi = (max_result or 0) + 1
            except ValueError as ve:
                print(f"❌ Lỗi chuyển đổi ma_kh: {max_ma_kh} -> {str(ve)}")
                # Fallback: tìm max từ những ma_kh đúng format
                cur.execute("""
                    SELECT MAX(CAST(SUBSTRING(ma_kh, 3) AS INTEGER)) 
                    FROM khach_hang 
                    WHERE ma_kh ~ '^KH[0-9]{6}$'
                """)
                max_result = cur.fetchone()[0]
                so_moi = (max_result or 0) + 1
            
            new_ma_kh = f"KH{so_moi:06d}"  # Định dạng lại thành KH000XXX
            cur.execute("""
                INSERT INTO khach_hang (id_acc, nhan_vien_pt, ma_kh, nhom_kh, ten_khach_hang, sdt1, gioi_tinh, dia_chi, ngay_sinh, nghe_nghiep, diem_khach_hang, ghi_chu, dac_thu_sp, nhu_cau_sd, thoi_gian_tao, nguon_data, gmv, aov, so_lan_mua, tan_suat_mua, thoi_gian_capnhat) 
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id_kh
            """, (
                data_lead.id_acc, data_lead.nhan_vien_pt, new_ma_kh, data_lead.nhom_kh, 
                data_lead.ten_khach_hang, normalized_sdt, data_lead.gioi_tinh, data_lead.dia_chi,
                data_lead.ngay_sinh, data_lead.nghe_nghiep, data_lead.diem_khach_hang, data_lead.ghi_chu,
                data_lead.dac_thu_sp, data_lead.nhu_cau_sd, data_lead.thoi_gian_tao, data_lead.nguon_data, 0, 0, 0, 0, data_lead.thoi_gian_tao
            ))
            conn.commit()
            
            new_id = cur.fetchone()[0]  # Lấy ID vừa tạo
            return {"id": new_id}  # Trả về ID của khách hàng vừa thêm
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi thêm khách hàng: {str(e)}")
        import traceback
        traceback.print_exc()


# Internal function để tạo khách hàng cho proposal (disable triggers để tránh cascade)
async def _create_customer_internal(data_lead_request):
    """
    Tạo khách hàng cho đề xuất lead - disable triggers tạm thời
    để tránh trigger cascade issue
    
    Lưu ý: Khách hàng được gán cho ADMIN (id_acc=1, nhan_vien_pt='ADMIN')
    vì đề xuất chưa được phê duyệt. Admin sẽ phê duyệt và reassign sau.
    """
    try:
        # Normalize số điện thoại
        normalized_sdt = normalize_phone_number(data_lead_request.sdt)
        
        with conn.cursor() as cur:
            # Validate số điện thoại
            cur.execute("""
                SELECT id_kh FROM khach_hang 
                WHERE sdt1 = %s OR sdt2 = %s
            """, (normalized_sdt, normalized_sdt))
            
            if cur.fetchone():
                return {"error": "Số điện thoại đã tồn tại trong hệ thống!"}
            
            # Generate ma_kh
            cur.execute("SELECT MAX(ma_kh) FROM khach_hang")
            result = cur.fetchone()
            max_ma_kh = result[0] if result and result[0] else "KH000000"

            try:
                if max_ma_kh and max_ma_kh.startswith("KH") and len(max_ma_kh) >= 8:
                    so_moi = int(max_ma_kh[2:8]) + 1
                else:
                    cur.execute("""
                        SELECT MAX(CAST(SUBSTRING(ma_kh, 3) AS INTEGER)) 
                        FROM khach_hang 
                        WHERE ma_kh ~ '^KH[0-9]{6}$'
                    """)
                    max_result = cur.fetchone()[0]
                    so_moi = (max_result or 0) + 1
            except ValueError as ve:
                print(f"❌ Lỗi chuyển đổi ma_kh: {max_ma_kh} -> {str(ve)}")
                cur.execute("""
                    SELECT MAX(CAST(SUBSTRING(ma_kh, 3) AS INTEGER)) 
                    FROM khach_hang 
                    WHERE ma_kh ~ '^KH[0-9]{6}$'
                """)
                max_result = cur.fetchone()[0]
                so_moi = (max_result or 0) + 1
            
            new_ma_kh = f"KH{so_moi:06d}"
            
            # Disable triggers to avoid cascade issue
            cur.execute("SET session_replication_role = replica")
            
            # INSERT with id_acc=1 (ADMIN), nhan_vien_pt='ADMIN' 
            # vì đề xuất chưa được phê duyệt
            cur.execute("""
                INSERT INTO khach_hang (
                    id_acc, nhan_vien_pt, ma_kh, nhom_kh, ten_khach_hang, 
                    sdt1, gioi_tinh, dia_chi, ngay_sinh, nghe_nghiep,
                    diem_khach_hang, ghi_chu, dac_thu_sp, nhu_cau_sd, 
                    thoi_gian_tao, nguon_data, gmv, aov, so_lan_mua, 
                    tan_suat_mua, thoi_gian_capnhat, trang_thai
                ) 
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, CURRENT_TIMESTAMP, %s, 0, 0, 0,
                    0, CURRENT_TIMESTAMP, 'Chưa gọi'
                ) RETURNING id_kh
            """, (
                1, 'ADMIN', new_ma_kh, 
                data_lead_request.nhom_kh, data_lead_request.ten_khach_hang,
                normalized_sdt, data_lead_request.gioi_tinh, data_lead_request.dia_chi,
                data_lead_request.ngay_sinh, data_lead_request.nghe_nghiep,
                data_lead_request.diem_khach_hang, data_lead_request.ghi_chu,
                data_lead_request.dac_thu_sp, data_lead_request.nhu_cau_sd,
                data_lead_request.nguon_data
            ))
            
            new_id_kh = cur.fetchone()[0]
            
            # Re-enable triggers
            cur.execute("SET session_replication_role = default")
            conn.commit()
            
            return {"id": new_id_kh}
            
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi tạo khách hàng internal: {str(e)}")
        traceback.print_exc()
        return {"error": str(e)}

        
async def them_nhieu_khach_hang(danh_sach_khach_hang):
    try:
        with conn.cursor() as cur:
            # Normalize và lấy danh sách số điện thoại từ danh_sach_khach_hang
            normalized_sdt_list = [normalize_phone_number(lead.sdt) for lead in danh_sach_khach_hang]
            sdt_list = normalized_sdt_list

            # Kiểm tra số điện thoại đã tồn tại
            cur.execute("""
                SELECT sdt1, sdt2 FROM khach_hang 
                WHERE sdt1 IN %s OR sdt2 IN %s
            """, (tuple(sdt_list), tuple(sdt_list)))
            
            existing_numbers = set()
            for row in cur.fetchall():
                existing_numbers.update(row)

            # Tìm ma_kh mới nhất
            cur.execute("SELECT MAX(ma_kh) FROM khach_hang")
            result = cur.fetchone()
            max_ma_kh = result[0] if result and result[0] else "KH000000"
            so_moi = int(max_ma_kh[2:])  # Bỏ "KH" rồi ép kiểu số

            # Chuẩn bị danh sách dữ liệu để chèn
            data_insert = []
            dem1 = 0
            dem2 = 0
            for i, data_lead in enumerate(danh_sach_khach_hang):
                normalized_sdt = normalized_sdt_list[i]
                if normalized_sdt in existing_numbers:
                    dem1 += 1
                    # print(f"❌ Số điện thoại {normalized_sdt} đã tồn tại, bỏ qua.")
                    continue

                so_moi += 1
                new_ma_kh = f"KH{so_moi:06d}"  # Tạo mã khách hàng mới
                data_insert.append((
                    data_lead.id_acc, data_lead.nhan_vien_pt, new_ma_kh, data_lead.nhom_kh, 
                    data_lead.ten_khach_hang, normalized_sdt, data_lead.gioi_tinh, data_lead.dia_chi,
                    data_lead.ngay_sinh, data_lead.nghe_nghiep, data_lead.diem_khach_hang, data_lead.ghi_chu,
                    data_lead.dac_thu_sp, data_lead.nhu_cau_sd, data_lead.thoi_gian_tao, data_lead.nguon_data, 0, data_lead.thoi_gian_tao
                ))
            # print(data_insert)
            if data_insert:
                cur.executemany("""
                    INSERT INTO khach_hang (id_acc, nhan_vien_pt, ma_kh, nhom_kh, ten_khach_hang, sdt1, gioi_tinh, dia_chi, ngay_sinh, nghe_nghiep, diem_khach_hang, ghi_chu, dac_thu_sp, nhu_cau_sd, thoi_gian_tao
                                , nguon_data, gmv, thoi_gian_capnhat) 
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, data_insert)
                conn.commit()  # Lưu thay đổi
                if dem1 > 0 or dem2:
                    return {
                        "message": f"Thêm thành công {len(data_insert)} khách hàng và có {dem1+dem2} số điện thoại trùng chưa thêm",
                    }
                else:
                    return {
                        "message": f"Thêm thành công {len(data_insert)} khách hàng",
                    }
            else:
                print("Không có khách hàng hợp lệ để thêm.")
                return {
                    "error": "Không có khách hàng hợp lệ để thêm"
                }
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi thêm nhiều khách hàng: {str(e)}")

async def get_soluong_lead(id_acc):
    """Lấy số lượng khách hàng có trong hệ thống theo id_acc"""
    try:
        with conn.cursor() as cur:
            # Lấy số lượng khách hàng chỉ của id_acc
            sql_self = "SELECT COUNT(*) FROM khach_hang WHERE id_acc = %s;"
            cur.execute(sql_self, (id_acc,))
            only_self = cur.fetchone()[0]

            # Lấy số lượng khách hàng của id_acc và cấp dưới
            sql_recursive = """
            WITH sub_account_clone AS (
                SELECT sub_account, role_id FROM account_users WHERE id_acc = %s
            )
            SELECT 
                COALESCE(
                    CASE
                    WHEN sb.sub_account IS NULL OR array_length(sb.sub_account, 1) = 0
                        THEN (SELECT COUNT(*) FROM khach_hang WHERE id_acc = %s)
                    WHEN 0 = ANY(sb.sub_account)
                        THEN (SELECT COUNT(*) FROM khach_hang WHERE id_acc IN (SELECT id_acc FROM account_users WHERE role_id >= sb.role_id))
                    ELSE (SELECT COUNT(*) FROM khach_hang WHERE id_acc = ANY(sb.sub_account) OR id_acc = %s)
                    END
                , 0) AS list_id_acc
            FROM sub_account_clone sb 
            """
            cur.execute(sql_recursive, (id_acc, id_acc, id_acc))
            total_with_subordinates = cur.fetchone()[0]
            print(f"Số lượng khách hàng của id_acc {id_acc} là {only_self} (chỉ cá nhân) và {total_with_subordinates} (bao gồm cấp dưới)")
            return {
                "data_canhan": only_self,
                "data_quanly": total_with_subordinates
            }
    except Exception as e:
        print(f"❌ Lỗi khi lấy số lượng khách hàng: {str(e)}")
        return {"error": str(e)}
    
# hàm hiển thị khách hàng (bao gồm tìm kiếm, sắp xếp, phân trang)
async def get_customer_list(id_acc_list, page, limit, sort_by, sort_order, search_conditions):
    """Lấy danh sách khách hàng theo phân trang và tìm kiếm"""
    try:
        with conn.cursor() as cur:
            offset = (page - 1) * limit

            # Xác định các cột hợp lệ để sắp xếp
 
            valid_sort_order = ["ASC", "DESC"]
           
            # Kiểm tra cột sắp xếp hợp lệ
            if sort_order not in valid_sort_order:
                sort_order = "ASC"

            

            # Điều kiện tìm kiếm
            search_clauses = []
            search_params = []
            print(f"search_conditions: {search_conditions}")
            if search_conditions:
                for field, value in search_conditions.items():
                    # if field in valid_search_columns and value:
                    if value:
                        if field == "nhom_kh" and value == "F":
                            search_clauses.append(f"kh.{field} = %s")  # Tìm kiếm tuyệt đối
                            search_params.append(value)
                        elif field == "nhom_kh" and value == "F OR nhom_kh ILIKE '%0%' OR nhom_kh = 'FT' OR nhom_kh = 'FKT'":
                            search_clauses.append("(kh.nhom_kh = %s OR kh.nhom_kh ILIKE %s OR kh.nhom_kh ILIKE %s OR kh.nhom_kh ILIKE %s OR kh.nhom_kh = %s OR kh.nhom_kh = %s)")
                            search_params.extend(["F", "%F0%", "%FT0%", "%FKT0%", "FT", "FKT"])
                        elif field == "thoi_gian_tao" or field == "thoi_gian_capnhat":
                            # Kiểm tra nếu giá trị là danh sách 2 phần tử (start_date, end_date)
                            if isinstance(value, list) and len(value) == 2:
                                start_date, end_date = value
                                search_clauses.append(f"kh.{field} BETWEEN %s AND %s")
                                search_params.extend([start_date, end_date])
                            else:
                                # Nếu chỉ có 1 giá trị, tìm kiếm ngày cụ thể
                                search_clauses.append(f"kh.{field} = %s")
                                search_params.append(value)
                        elif field == "goi_y_chamsoc":
                            search_clauses.append(f"DATE(kh.{field}) = %s")
                            search_params.append(value)
                        elif field == "so_lan_mua":
                            from_slm, to_slm = value
                            search_clauses.append(f"kh.{field} BETWEEN %s AND %s")
                            search_params.extend([from_slm, to_slm])
                        elif field == "check_trung":
                            if value == "lớn hơn 30":
                                search_clauses.append(f"kh.{field} > 30")  # Tìm kiếm tuyệt đối
                                # search_params.append(value)
                            elif value == "nhỏ hơn 30":
                                search_clauses.append(f"kh.{field} <= 30")  # Tìm kiếm tuyệt đối
                                # search_params.append(value)
                        elif field == "nguon_data":
                            if isinstance(value, list) and len(value) > 0:
                                
                                placeholders = ','.join(['%s'] * len(value))
                                search_clauses.append(f"kh.{field} IN ({placeholders})")
                                search_params.extend(value)
                        # elif field == "id_acc":
                        #     search_clauses.append(f"kh.{field} = {value}")
                        elif field == "id_kh":
                            print(value)
                            if isinstance(value, list) and len(value) > 0:
                                value_str = ', '.join([f"'{v}'" for v in value])
                                search_clauses.append(f"kh.{field} IN ({value_str})")
                            else:
                                search_clauses.append(f"kh.{field} = '{value}'")
                        elif field == "tan_suat_mua":
                            print("tần suất mua")
                            search_clauses.append(f"kh.{field} > 0")
                        elif field == "so_ngay_chamsoc":
                            search_clauses.append("kh.thoi_gian_capnhat_ghichu IS NOT NULL AND DATE_PART('day', NOW() - kh.thoi_gian_capnhat_ghichu) >= 30")  
                        elif field == "sdt":
                            search_clauses.append(f"kh.sdt1 ILIKE %s OR kh.sdt2 ILIKE %s")
                            search_params.append(f"%{value}%")
                            search_params.append(f"%{value}%")
                        elif field == "sdt_tracuu":
                            search_clauses.append(f"kh.sdt1 ILIKE %s OR kh.sdt2 ILIKE %s")
                            search_params.append(f"%{value}%")
                            search_params.append(f"%{value}%")
                            id_acc_list = [user['id_acc'] for user in await get_all_users()]  # Lấy tất cả id_acc
                            print("id_acc_list:", id_acc_list)
                        elif field == "check_zalo":
                            if int(value) <= 1:
                                search_clauses.append(f"kh.check_zalo = %s")
                                search_params.append(int(value))
                            else:
                                search_clauses.append(f"kh.check_zalo IS NULL")
                        else:
                            search_clauses.append(f"kh.{field} ILIKE %s")  # LIKE tìm kiếm gần đúng
                            search_params.append(f"%{value}%")

            search_condition = f"AND {' AND '.join(search_clauses)}" if search_clauses else ""

            # Xử lý danh sách ID
            id_acc_placeholder = ", ".join(["%s"] * len(id_acc_list))
            params = id_acc_list.copy()  # Truyền ID vào danh sách params

            params.extend(search_params)  # Thêm tham số tìm kiếm

            if sort_by == "so_ngay_chamsoc":
                sort_expr_for_tile = "DATE_PART('day', NOW() - kh.thoi_gian_capnhat_ghichu)"
                sort_expr_for_final = "f.so_ngay_chamsoc"
            elif sort_by == "goi_y_chamsoc":
                sort_expr_for_tile = "kh.so_lan_mua DESC, kh.thoi_gian_cs_lai ASC, kh.aov"
                sort_expr_for_final = "f.so_lan_mua DESC, f.thoi_gian_cs_lai ASC, f.aov"

            else:
                sort_expr_for_tile = f"kh.{sort_by}"
                sort_expr_for_final = f"f.{sort_by}"


            # Xử lý Python trước
            use_top_20 = sort_by in ['AOV', 'tan_suat_mua']
            print("DEBUG:", sort_by, use_top_20)
           
            tile_filter = "AND tile = 1" if use_top_20 else ""
            
            sql = f"""
            WITH kh_with_rank AS (
                SELECT 
                    kh.*, 
                    DATE_PART('day', NOW() - kh.thoi_gian_capnhat_ghichu) AS so_ngay_chamsoc,
                    -- tách địa chỉ thành mảng từ (chuyển thường, bỏ ký tự đặc biệt)
                    regexp_split_to_array(
                        lower(kh.dia_chi),
                        '[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+'
                    ) AS arr_words_raw,
                    NTILE(5) OVER (ORDER BY {sort_expr_for_tile} {sort_order} NULLS LAST) AS tile
                FROM khach_hang kh
                WHERE kh.id_acc IN ({id_acc_placeholder}) {search_condition} 
            ),
            kh_enriched AS (
                SELECT
                    k.*,
                    CASE
                        WHEN array_length(k.arr_words_raw,1) >= 2 THEN
                            k.arr_words_raw[array_length(k.arr_words_raw,1) - 1] || ' ' ||
                            k.arr_words_raw[array_length(k.arr_words_raw,1)]
                        WHEN array_length(k.arr_words_raw,1) = 1 THEN
                            k.arr_words_raw[1]
                        ELSE
                            ''
                    END AS tinh_thanh_guess
                FROM kh_with_rank k
            ),
            with_priority AS (
                SELECT
                    ke.*,
                    CASE
                        WHEN ke.tinh_thanh_guess ILIKE 'ha noi'
                        OR ke.tinh_thanh_guess ILIKE 'hai phong'
                        OR ke.tinh_thanh_guess ILIKE 'quang ninh'
                        OR ke.tinh_thanh_guess ILIKE 'bac giang'
                        OR ke.tinh_thanh_guess ILIKE 'bac ninh'
                        OR ke.tinh_thanh_guess ILIKE 'hung yen'
                        OR ke.tinh_thanh_guess ILIKE 'hai duong'
                        OR ke.tinh_thanh_guess ILIKE 'thai binh'
                        OR ke.tinh_thanh_guess ILIKE 'nam dinh'
                        OR ke.tinh_thanh_guess ILIKE 'ha nam'
                        OR ke.tinh_thanh_guess ILIKE 'ninh binh'
                        OR ke.tinh_thanh_guess ILIKE 'vinh phuc'
                        OR ke.tinh_thanh_guess ILIKE 'phu tho'
                        OR ke.tinh_thanh_guess ILIKE 'thai nguyen'
                        OR ke.tinh_thanh_guess ILIKE 'tuyen quang'
                        OR ke.tinh_thanh_guess ILIKE 'yen bai'
                        OR ke.tinh_thanh_guess ILIKE 'lao cai'
                        OR ke.tinh_thanh_guess ILIKE 'ha giang'
                        OR ke.tinh_thanh_guess ILIKE 'lang son'
                        OR ke.tinh_thanh_guess ILIKE 'cao bang'
                        OR ke.tinh_thanh_guess ILIKE 'bac kan'
                        OR ke.tinh_thanh_guess ILIKE 'dien bien'
                        OR ke.tinh_thanh_guess ILIKE 'lai chau'
                        OR ke.tinh_thanh_guess ILIKE 'son la'
                        OR ke.tinh_thanh_guess ILIKE 'hoa binh'
                        THEN 0
                        ELSE 1
                    END AS priority_mien
                FROM kh_enriched ke
            ),

            filtered AS (
                SELECT * 
                FROM with_priority
                WHERE 1=1 {tile_filter}
            )
            SELECT 
                f.*,
                COUNT(*) OVER() AS total_count,
                COUNT(*) FILTER (WHERE f.nhom_kh = 'F') OVER() AS total_f,
                SUM(CASE WHEN f.nhom_kh LIKE 'F0%%' THEN 1 ELSE 0 END) OVER() AS total_f0,
                SUM(CASE WHEN f.nhom_kh LIKE 'FT%%' THEN 1 ELSE 0 END) OVER() AS total_ft,
                SUM(CASE WHEN f.nhom_kh LIKE 'FKT%%' THEN 1 ELSE 0 END) OVER() AS total_fkt
            FROM filtered f
            ORDER BY 
                -- 1. Nếu sort_by = 'thoi_gian_cs_lai' thì ưu tiên theo thời gian chăm lại
                CASE
                    WHEN %s = 'thoi_gian_cs_lai' AND f.thoi_gian_cs_lai IS NOT NULL
                    THEN EXTRACT(EPOCH FROM f.thoi_gian_cs_lai) - EXTRACT(EPOCH FROM f.thoi_gian_cs_lai)
                    WHEN %s = 'thoi_gian_cs_lai'
                    THEN EXTRACT(EPOCH FROM f.thoi_gian_cs_lai)
                    ELSE NULL
                END {sort_order},

                -- 2. Tiếp theo: block sort_expr_for_final (ví dụ: so_lan_mua DESC, thoi_gian_cs_lai ASC, aov)
                {sort_expr_for_final} {sort_order},

                -- 3. Ưu tiên miền Bắc nếu đang sort theo goi_y_chamsoc
                CASE 
                    WHEN %s = 'goi_y_chamsoc' THEN f.priority_mien
                    ELSE NULL
                END ASC,

                -- 4. Cuối cùng để ổn định thứ tự
                f.id_kh ASC
            LIMIT %s OFFSET %s;
            """
            params.extend([sort_by, sort_by, sort_by, limit, offset])

            # print("✅ SQL:", sql)
            # print("✅ ID ACC LIST:", id_acc_list)
            # print("✅ PARAMS:", params)

            # Thực thi truy vấn
            cur.execute(sql, params)
            customers = cur.fetchall()
            # Kiểm tra dữ liệu trả về
            if not customers:
                return {"message": "Không có dữ liệu khách hàng"}

            # Kiểm tra nếu cur.description tồn tại trước khi truy xuất cột
            if not cur.description:
                return {"error": "Không thể lấy thông tin cột từ kết quả truy vấn"}

            # Lấy danh sách cột từ kết quả truy vấn
            columns = [desc[0] for desc in cur.description]
            customer_list = [dict(zip(columns, row)) for row in customers]
            # print(customer_list[0])
            total_count = customer_list[0]["total_count"] if customer_list else 0
            total_F = customer_list[0]["total_f"] if customer_list else 0
            total_F0 = customer_list[0]["total_f0"] if customer_list else 0
            total_FT = customer_list[0]["total_ft"] if customer_list else 0
            total_FKT = customer_list[0]["total_fkt"] if customer_list else 0
            return {
                "customers": customer_list,
                "total_count": total_count,
                "total_F": total_F,
                "total_F0": total_F0,
                "total_FT": total_FT,
                "total_FKT": total_FKT
            }

    except Exception as e:
        print(f"❌ Lỗi khi lấy danh sách khách hàng: {str(e)}")
        traceback.print_exc()
        conn.rollback()
        return {"error": str(e)}

async def get_lead_user(id_acc):
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM khach_hang WHERE id_acc = %s", (id_acc,))
            lead = cur.fetchall()
            if not lead:  # Kiểm tra nếu kết quả rỗng
                return {"message": "Không có dữ liệu khách hàng"}
            columns = [desc[0] for desc in cur.description]
            lead_list = [dict(zip(columns, row)) for row in lead]
            # print(lead_list[0])
            return lead_list  # Trả về danh sách thay vì set
    except Exception as e:

        print(f"Lỗi khi lấy data khách hàng: {str(e)}")
        return {"success": False, "message": f"Lỗi khi lấy data khách hàng: {str(e)}"}


# cập nhật thông tin khách hàng
async def edit_lead(data):
    try:
        with conn.cursor() as cur:
            print(data)
            sql_check = """
                SELECT * 
                FROM khach_hang 
                WHERE (
                    (sdt1 IN (%s, %s) AND sdt1 <> '' AND sdt1 IS NOT NULL)
                    OR
                    (sdt2 IN (%s, %s) AND sdt2 <> '' AND sdt2 IS NOT NULL)
                )
                AND id_kh != %s
            """
            cur.execute(sql_check, (data["sdt1"], data["sdt2"], data["sdt2"], data["sdt1"], data["id_kh"]))
            existing = cur.fetchall()
            # print(existing)
            if existing:
                print("Lỗi: Số điện thoại đã tồn tại trong hệ thống!")
                return {"error": "Số điện thoại đã tồn tại trong hệ thống!"}

            sql = """
            UPDATE khach_hang
            SET 
                ten_khach_hang = %s,
                sdt1 = %s,
                sdt2 = %s,
                check_zalo = %s,
                gioi_tinh = %s,
                ngay_sinh = %s,
                dia_chi = %s,
                nhom_kh = %s,
                nghe_nghiep = %s,
                dac_thu_sp = %s,
                nhu_cau_sd = %s,
                thoi_gian_cs_lai = %s,
                da_goi = false
            WHERE id_kh = %s;

            """
            time_cs_lai = data["thoi_gian_cs_lai"] if data["thoi_gian_cs_lai"] != "null" else None
            values = [
                data["ten_khach_hang"], data["sdt1"], data["sdt2"], int(data["check_zalo"]), data["gioi_tinh"],
                data["ngay_sinh"], data["dia_chi"], data["nhom_kh"], data["nghe_nghiep"], 
                data["dac_thu_sp"], data["nhu_cau_sd"], 
                time_cs_lai, data["id_kh"]
            ]
            cur.execute(sql, values)
            conn.commit()

            return data
    except Exception as e:
        conn.rollback()
        print(f"Lỗi trong edit_lead: {str(e)}")
        return False
    
async def edit_lead_full(data):
    try:
        # Import province detector
        from utils.province_detector import detect_mien_from_address
        
        with conn.cursor() as cur:
            sql = """
            UPDATE khach_hang
            SET 
                id_acc = %s,
                nhan_vien_pt = %s,
                ma_kh = %s,
                nhom_kh = %s,
                ten_khach_hang = %s,
                sdt1 = %s,
                gioi_tinh = %s,
                dia_chi = %s,
                dia_chi2 = %s,
                ngay_sinh = %s,
                nghe_nghiep = %s,
                dac_thu_sp = %s,
                nhu_cau_sd = %s,
                sdt2 = %s,
                thoi_gian_cs_lai = %s,
                thoi_gian_capnhat = %s,
                nguon_data = %s,
                gmv = %s,
                aov = %s,
                tan_suat_mua = %s,
                so_lan_mua = %s,
                thoi_gian_tao = %s,
                name_pt = %s,
                nguoi_ban = %s,
                check_trung = %s,
                loai_kh = %s,
                ghi_chu_them1 = %s,
                mien = %s,
                da_goi = false

            WHERE id_kh = %s;

            """
            
            # Xử lý empty string thành NULL cho các trường timestamp
            ngay_sinh = data.get("ngay_sinh") if data.get("ngay_sinh") and str(data.get("ngay_sinh")).strip() else None
            thoi_gian_cs_lai = data.get("thoi_gian_cs_lai") if data.get("thoi_gian_cs_lai") and str(data.get("thoi_gian_cs_lai")).strip() else None
            gioi_tinh = data.get("gioi_tinh") if data.get("gioi_tinh") and str(data.get("gioi_tinh")).strip() else None

            # Cap thoi_gian_tao về hôm nay nếu nhập ngày tương lai (tránh lỗi thống kê dashboard)
            thoi_gian_tao_raw = data.get("thoi_gian_tao")
            if thoi_gian_tao_raw and str(thoi_gian_tao_raw).strip():
                try:
                    from datetime import timezone
                    tgt_dt = datetime.fromisoformat(str(thoi_gian_tao_raw).replace('Z', '+00:00'))
                    if tgt_dt.date() > datetime.now(timezone.utc).date():
                        data["thoi_gian_tao"] = datetime.now(timezone.utc).isoformat()
                except (ValueError, TypeError):
                    pass
            
            # Phát hiện vùng miền từ địa chỉ
            dia_chi = data.get("dia_chi")
            mien = None
            if dia_chi and str(dia_chi).strip():
                mien = detect_mien_from_address(str(dia_chi))
            
            values = [
                data["id_acc"],
                data["nhan_vien_pt"],
                data["ma_kh"],
                data["nhom_kh"],
                data["ten_khach_hang"],
                data["sdt1"],
                gioi_tinh,
                data["dia_chi"],
                data.get("dia_chi2"),
                ngay_sinh,
                data["nghe_nghiep"],
                data["dac_thu_sp"],
                data["nhu_cau_sd"],
                data["sdt2"],
                thoi_gian_cs_lai,
                data["thoi_gian_capnhat"],
                data["nguon_data"],
                data["gmv"],
                data["aov"],
                data["tan_suat_mua"],
                data["so_lan_mua"],
                data["thoi_gian_tao"],
                data["name_pt"],
                data["nguoi_ban"],
                data["check_trung"],
                data.get("loai_kh"),
                data.get("ghi_chu_them1"),
                mien,
                data["id_kh"]
            ]
            cur.execute(sql, values)
            conn.commit()
            
            # Log the mien update
            if mien:
                print(f"✅ Cập nhật miền cho khách hàng {data['id_kh']}: {mien}")
            
            return {"message": f"Cập nhật thành công khách hàng {data['id_kh']}"} 
    except Exception as e:
        conn.rollback()
        
        return {"error": f"Cập nhật thất bại khách hàng {data['id_kh']} LỖI: {str(e)}"}
    
async def them_ghi_chu(sdt1, ghi_chu):
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT ghi_chu FROM khach_hang WHERE sdt1 = %s", (sdt1,))
            ghi_chu_cu = cur.fetchone()[0]

            if ghi_chu_cu:
                ghi_chu_moi = ghi_chu_cu + "\n" + ghi_chu
            else:
                ghi_chu_moi = ghi_chu
            time_update = datetime.now()
            cur.execute("UPDATE khach_hang SET ghi_chu = %s, thoi_gian_capnhat_ghichu = %s WHERE sdt1 = %s;", (ghi_chu_moi, time_update, sdt1))
            conn.commit()
            return ghi_chu_moi

    except Exception as e:
        print(f"❌ Lỗi không xác định: {str(e)}")
        return {"error": str(e)}
    

async def update_ngay_hen_banhang(id_kh, ngay_hen_banhang, loai_kh, ghi_chu_them1, ghi_chu_them2):
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT ngay_hen_banhang FROM khach_hang WHERE id_kh = %s", (id_kh,))
            old_row = cur.fetchone()
            old_date = old_row[0] if old_row else None
            
            cur.execute("UPDATE khach_hang SET ngay_hen_banhang = %s, loai_kh = %s, ghi_chu_them1 = %s, ghi_chu_them2 = %s, da_goi = false WHERE id_kh = %s;", (ngay_hen_banhang, loai_kh, ghi_chu_them1, ghi_chu_them2, id_kh))
            
            if str(old_date) != str(ngay_hen_banhang) and ngay_hen_banhang and str(ngay_hen_banhang).lower() != "null":
                cur.execute("""
                    INSERT INTO khach_hang_schedule_log (id_kh, old_ngay_hen_banhang, new_ngay_hen_banhang)
                    VALUES (%s, %s, %s)
                """, (id_kh, old_date, ngay_hen_banhang if ngay_hen_banhang else None))
                
            conn.commit()
            return {"message": f"Cập nhật ngày hẹn bán hàng thành công cho khách hàng {id_kh}"}
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi không xác định: {str(e)}")
        traceback.print_exc()
        return {"error": str(e)}

async def get_customer_details(id_kh):
    try:
        with conn.cursor() as cur:
            # Lấy thông tin khách hàng
            cur.execute("SELECT * FROM khach_hang WHERE id_kh = %s", (id_kh,))
            lead = cur.fetchone()

            if not lead:  # Nếu không tìm thấy khách hàng
                return {"message": "Không có dữ liệu khách hàng"}

            # Chuyển dữ liệu thành dictionary
            columns = [desc[0] for desc in cur.description]
            lead_dict = dict(zip(columns, lead))

            # Lấy mã khách hàng
            ma_kh = lead_dict.get("ma_kh")
            
            # Lấy lịch sử mua hàng từ bảng invoice trong fm_tdvn
            hoadon_list = []
            if ma_kh:
                try:
                    with conn_fm.cursor() as cur_fm:
                        cur_fm.execute("""
                            SELECT 
                                i.id_invoice,
                                i.code_invoice,
                                i.time_create,
                                i.subtotal,
                                COALESCE(
                                    NULLIF(STRING_AGG(DISTINCT d.name_product, ', '), ''),
                                    (SELECT p.name_product FROM products p WHERE p.price = i.subtotal LIMIT 1)
                                ) as product_names,
                                i.status_value
                            FROM invoice i
                            LEFT JOIN invoice_detail d ON i.code_invoice = d.code_invoice
                            WHERE i.code_customer = %s 
                            GROUP BY i.id_invoice, i.code_invoice, i.time_create, i.subtotal, i.status_value
                            ORDER BY i.time_create DESC
                        """, (ma_kh,))
                        invoices = cur_fm.fetchall()
                        
                        import re
                        for invoice in invoices:
                            id_hd = invoice[0]
                            ma_hd = invoice[1]
                            thoi_gian = invoice[2]
                            so_tien = float(invoice[3]) if invoice[3] else 0
                            ten_sp = invoice[4]
                            trang_thai = invoice[5]

                            if not ten_sp:
                                try:
                                    # Fallback: lấy từ crm_tdvn.hoa_don
                                    cur.execute("SELECT ma_san_pham FROM hoa_don WHERE ma_hd = %s", (ma_hd,))
                                    row_crm = cur.fetchone()
                                    if row_crm and row_crm[0]:
                                        codes = [re.sub(r'x\d+$', '', line.strip()) for line in row_crm[0].split('\n') if line.strip()]
                                        if codes:
                                            resolved_parts = []
                                            for code in codes:
                                                cur_fm.execute("SELECT name_product FROM products WHERE code_product = %s LIMIT 1", (code,))
                                                name_row = cur_fm.fetchone()
                                                if name_row and name_row[0]:
                                                    resolved_parts.append(name_row[0])
                                                else:
                                                    resolved_parts.append(code)
                                            if resolved_parts:
                                                ten_sp = ", ".join(resolved_parts)
                                    
                                    # Giải pháp dự phòng cuối cùng nếu vẫn trống: Tìm sản phẩm có giá gần nhất
                                    if not ten_sp:
                                        cur_fm.execute("SELECT name_product FROM products ORDER BY ABS(price - %s) ASC LIMIT 1", (so_tien,))
                                        price_row = cur_fm.fetchone()
                                        if price_row and price_row[0]:
                                            ten_sp = f"{price_row[0]} (Tạm tính theo giá)"

                                except Exception as inner_e:
                                    print(f"Lỗi khi tìm ten_sp fallback: {inner_e}")

                            hoadon_list.append({
                                "id_hd": id_hd,
                                "thoi_gian": thoi_gian,
                                "ma_hd": ma_hd,
                                "so_tien": so_tien,
                                "ten_sp": ten_sp or "Không xác định",
                                "trang_thai": trang_thai
                            })
                except Exception as e:
                    print(f"❌ Lỗi khi lấy lịch sử mua hàng: {str(e)}")
                    import traceback
                    traceback.print_exc()
                    hoadon_list = []

            # Gắn lịch sử mua hàng vào thông tin khách hàng
            lead_dict["lich_su_mua"] = hoadon_list
            return lead_dict

    except Exception as e:
        print(f"❌ Lỗi khi lấy dữ liệu: {str(e)}")
        return {"success": False, "message": f"Lỗi khi lấy dữ liệu: {str(e)}"}

async def get_full_thongtin_kh(customer_ids):
    try:
        danh_sach_kh = []
        with conn.cursor() as cur:
            for id_kh in customer_ids:
                sql = "SELECT * FROM khach_hang WHERE id_kh = %s"
                cur.execute(sql, (id_kh,))
                lead = cur.fetchone()
                columns = [desc[0] for desc in cur.description]
                lead_dict = dict(zip(columns, lead))
                danh_sach_kh.append(lead_dict)
            return danh_sach_kh
    except Exception as e:
        print(f"❌ Lỗi khi lấy dữ liệu: {str(e)}")
        return {"success": False, "message": f"Lỗi khi lấy dữ liệu: {str(e)}"}

async def bao_cao_sale(thoi_gian_tao):
    try:
        with conn.cursor() as cur:
            if len(thoi_gian_tao) != 2:
                return {"error": "❌ Tham số 'thoi_gian_tao' không hợp lệ. Cần đúng 2 giá trị."}

            from_time, to_time = thoi_gian_tao[0], thoi_gian_tao[1]

            sql_summary = """
                SELECT
                    COUNT(*) AS tong_data,

                    SUM(CASE 
                            WHEN EXISTS (
                                SELECT 1
                                FROM hoa_don hd
                                WHERE hd.sdt = kh.sdt1
                                AND hd.thoi_gian >= kh.thoi_gian_tao 
                                AND hd.thoi_gian < date_trunc('day', kh.thoi_gian_tao + INTERVAL '1 day') + INTERVAL '12 hours'
                                AND LOWER(hd.trang_thai) NOT LIKE '%%hủy%%'
                                AND LOWER(hd.trang_thai) NOT LIKE '%%hoàn%%'
                                AND hd.nguon_ban IN ('FACEBOOK', 'TIKTOK LANDING', 'HOTLINE-TIKTOK LANDING', 'FACEBOOK - PANCAKE', 'YOUTUBE')
                                
                            ) THEN 1
                            ELSE 0
                        END) AS da_chot,

                    SUM(CASE 
                            WHEN EXISTS (
                                SELECT 1
                                FROM hoa_don hd
                                WHERE hd.sdt = kh.sdt1
                                AND hd.thoi_gian >= kh.thoi_gian_tao
                                AND hd.thoi_gian < date_trunc('day', kh.thoi_gian_tao + INTERVAL '1 day') + INTERVAL '12 hours'
                                AND LOWER(hd.trang_thai) LIKE '%%hoàn%%'
                                AND hd.nguon_ban IN ('FACEBOOK', 'TIKTOK LANDING', 'HOTLINE-TIKTOK LANDING', 'FACEBOOK - PANCAKE', 'YOUTUBE')
                            ) THEN 1
                            ELSE 0
                        END) AS da_hoan,

                    SUM(CASE 
                            WHEN EXISTS (
                                SELECT 1
                                FROM hoa_don hd
                                WHERE hd.sdt = kh.sdt1
                                AND hd.thoi_gian >= kh.thoi_gian_tao
                                AND hd.thoi_gian < date_trunc('day', kh.thoi_gian_tao + INTERVAL '1 day') + INTERVAL '12 hours'
                                AND LOWER(hd.trang_thai) LIKE '%%hủy%%'
                                AND hd.nguon_ban IN ('FACEBOOK', 'TIKTOK LANDING', 'HOTLINE-TIKTOK LANDING', 'FACEBOOK - PANCAKE', 'YOUTUBE')
                            ) THEN 1
                            ELSE 0
                        END) AS da_huy,

                    SUM(CASE WHEN kh.check_trung > 30 THEN 1 ELSE 0 END) AS check_trung_lon_30,
                    SUM(CASE WHEN kh.check_trung <= 30 THEN 1 ELSE 0 END) AS check_trung_nho_hoac_30

                FROM khach_hang kh
                WHERE kh.thoi_gian_tao BETWEEN %s AND %s
                AND kh.nguon_data IN ('FACEBOOK', 'TIKTOK LANDING', 'HOTLINE-TIKTOK LANDING', 'FACEBOOK - PANCAKE', 'YOUTUBE')
                -- AND (kh.check_trung > 30 OR kh.check_trung IS NULL)
            """
            cur.execute(sql_summary, (from_time, to_time))
            # print(cur.fetchone())
            tong_data, da_chot, da_hoan, da_huy, check_trung_lon_30, check_trung_nho_hoac_30 = cur.fetchone()

            status_summary = {
                "Tổng data": tong_data,
                "Đã chốt": da_chot,
                "Đã hoàn": da_hoan,
                "Đã hủy": da_huy,
                "check_trung > 30": check_trung_lon_30,
                "check_trung <= 30": check_trung_nho_hoac_30
            }

            # 3. Thống kê theo từng `nguoi_ban`
            sql_pt = """
                WITH hoa_don_moi_nhat AS (
                    SELECT h1.*
                    FROM hoa_don h1
                    
                    WHERE h1.thoi_gian >= %s AND h1.thoi_gian <= %s
                   
                )

                SELECT 
                    CASE 
                        WHEN k.nguon_data = 'FACEBOOK - PANCAKE' AND h.nguoi_ban ILIKE '%%Nguyễn An Phi - MKT%%' THEN 20
                        ELSE k.id_acc 
                    END AS id_acc,

                    -- Xử lý đặc biệt cho name_pt
                    CASE 
                        WHEN k.nguon_data = 'FACEBOOK - PANCAKE' AND h.nguoi_ban ILIKE '%%Nguyễn An Phi - MKT%%' THEN 'FACEBOOK - PANCAKE'
                        ELSE k.name_pt 
                    END AS nguon_phan_loai,

                    COUNT(*) AS tong,
                    COUNT(CASE 
                        WHEN h.trang_thai IS NOT NULL AND LOWER(h.trang_thai) NOT LIKE '%%hủy%%' AND LOWER(h.trang_thai) NOT LIKE '%%hoàn%%' 
                        AND h.nguon_ban IN ('FACEBOOK', 'TIKTOK LANDING', 'HOTLINE-TIKTOK LANDING', 'FACEBOOK - PANCAKE', 'YOUTUBE')
                        THEN 1 END) AS da_chot,
                    COUNT(CASE 
                        WHEN h.trang_thai IS NOT NULL AND LOWER(h.trang_thai) LIKE '%%hoàn%%' 
                        AND h.nguon_ban IN ('FACEBOOK', 'TIKTOK LANDING', 'HOTLINE-TIKTOK LANDING', 'FACEBOOK - PANCAKE', 'YOUTUBE')
                        THEN 1 END) AS da_hoan,
                    COUNT(CASE 
                        WHEN k.trang_thai_sale IS NOT NULL AND k.trang_thai_sale <> 'Không kết nối' 
                        AND h.nguon_ban IN ('FACEBOOK', 'TIKTOK LANDING', 'HOTLINE-TIKTOK LANDING', 'FACEBOOK - PANCAKE', 'YOUTUBE')
                        THEN 1 END) AS da_ket_noi,
                    SUM(CASE 
                        WHEN h.trang_thai NOT LIKE '%%hủy%%' 
                        AND h.nguon_ban IN ('FACEBOOK', 'TIKTOK LANDING', 'HOTLINE-TIKTOK LANDING', 'FACEBOOK - PANCAKE', 'YOUTUBE')
                        THEN h.tong_tien 
                        ELSE 0 END) AS tong_doanh_so,
                    SUM(CASE 
                        WHEN h.trang_thai IS NOT NULL AND LOWER(h.trang_thai) LIKE '%%hoàn%%' 
                        AND h.nguon_ban IN ('FACEBOOK', 'TIKTOK LANDING', 'HOTLINE-TIKTOK LANDING', 'FACEBOOK - PANCAKE', 'YOUTUBE')
                        THEN h.tong_tien ELSE 0 END) AS tong_hoan,

                    ROUND(
                        SUM(CASE 
                            WHEN h.trang_thai IS NOT NULL AND LOWER(h.trang_thai) NOT LIKE '%%hủy%%' 
                            AND h.nguon_ban IN ('FACEBOOK', 'TIKTOK LANDING', 'HOTLINE-TIKTOK LANDING', 'FACEBOOK - PANCAKE', 'YOUTUBE')
                            THEN h.tong_tien ELSE 0 END) / 
                        NULLIF(COUNT(CASE 
                            WHEN h.trang_thai IS NOT NULL AND LOWER(h.trang_thai) NOT LIKE '%%hủy%%'
                            AND h.nguon_ban IN ('FACEBOOK', 'TIKTOK LANDING', 'HOTLINE-TIKTOK LANDING', 'FACEBOOK - PANCAKE', 'YOUTUBE')
                            THEN 1 END), 0),
                        0
                    ) AS AOV

                FROM khach_hang k
                LEFT JOIN hoa_don_moi_nhat h ON k.sdt1 = h.sdt
                WHERE k.thoi_gian_tao BETWEEN %s AND %s AND k.nguon_data IN ('FACEBOOK', 'TIKTOK LANDING', 'HOTLINE-TIKTOK LANDING', 'FACEBOOK - PANCAKE', 'YOUTUBE')
                
                AND (k.check_trung > 30 OR k.check_trung IS NULL)
                
                GROUP BY 
                    CASE 
                        WHEN k.nguon_data = 'FACEBOOK - PANCAKE' AND h.nguoi_ban ILIKE '%%Nguyễn An Phi - MKT%%' THEN 20
                        ELSE k.id_acc 
                    END,
                    CASE 
                        WHEN k.nguon_data = 'FACEBOOK - PANCAKE' AND h.nguoi_ban ILIKE '%%Nguyễn An Phi - MKT%%' THEN 'FACEBOOK - PANCAKE'
                        ELSE k.name_pt 
                    END
                ORDER BY da_chot DESC

            """

            cur.execute(sql_pt, (from_time, datetime.strptime(to_time, "%Y-%m-%d %H:%M:%S")+timedelta(hours=12), from_time, to_time))
            rows_pt = cur.fetchall()
            pt_columns = [desc[0] for desc in cur.description]
            pt_summary = [dict(zip(pt_columns, row)) for row in rows_pt]

            # 4. Thống kê theo nguon_data
            sql_nguon_data = """
                SELECT nguon_data, COUNT(*) AS so_luong
                FROM khach_hang
                WHERE thoi_gian_tao BETWEEN %s AND %s AND nguon_data IS NOT NULL
                GROUP BY nguon_data
            """
            cur.execute(sql_nguon_data, (from_time, to_time))
            rows_nguon_data = cur.fetchall()
            nguon_data_columns = [desc[0] for desc in cur.description]
            nguon_data_summary = [dict(zip(nguon_data_columns, row)) for row in rows_nguon_data]

            return {
                "tong_theo_trang_thai": status_summary,
                "thong_ke_theo_pt": pt_summary,
                "nguon_data": nguon_data_summary
            }

    except Exception as e:
        print("❌ Lỗi khi lấy báo cáo:")
        traceback.print_exc()
        conn.rollback()
        return {"error": str(e)}


async def update_tt_sale(id_kh, trang_thai):
    try:
        with conn.cursor() as cur:
            sql = """
            UPDATE khach_hang
            SET 
                trang_thai_sale = %s
            WHERE id_kh = %s;
            """
            cur.execute(sql, (trang_thai, id_kh))
            conn.commit()
            return {"message": f"Cập nhật trạng thái sale cho khách hàng có id = {id_kh} thành công"}
    except Exception as e:
        conn.rollback()
        print(f"Lỗi trong edit_lead: {str(e)}")
        return False


async def phan_tich_khach_hang(thoi_gian_tao, list_id_acc):
    try:
        print(thoi_gian_tao)
        from_time, to_time = thoi_gian_tao[0], thoi_gian_tao[1]
        with conn.cursor() as cur:
            sql = """
            WITH hoa_don_goc AS (
                SELECT 
                    hd.id_hd,
                    hd.sdt,
                    hd.tinh,
                    CASE 
                        WHEN hd.tinh ILIKE ANY (ARRAY[
                            '%%Hà Nội%%', '%%Hải Phòng%%', '%%Vĩnh Phúc%%', '%%Bắc Ninh%%', '%%Hưng Yên%%', '%%Hải Dương%%',
                            '%%Thái Bình%%', '%%Nam Định%%', '%%Ninh Bình%%', '%%Hà Nam%%',
                            '%%Lào Cai%%', '%%Yên Bái%%', '%%Lai Châu%%', '%%Điện Biên%%', '%%Sơn La%%', '%%Hòa Bình%%', '%%Hoà Bình%%',
                            '%%Hà Giang%%', '%%Tuyên Quang%%', '%%Phú Thọ%%', '%%Thái Nguyên%%', '%%Bắc Kạn%%', '%%Cao Bằng%%',
                            '%%Lạng Sơn%%', '%%Bắc Giang%%', '%%Quảng Ninh%%'
                        ]) THEN 'Miền Bắc'

                        WHEN hd.tinh ILIKE ANY (ARRAY[
                            '%%Thanh Hóa%%', '%%Nghệ An%%', '%%Hà Tĩnh%%', '%%Quảng Bình%%', '%%Quảng Trị%%', '%%Thừa Thiên Huế%%',
                            '%%Đà Nẵng%%', '%%Quảng Nam%%', '%%Quảng Ngãi%%', '%%Bình Định%%', '%%Phú Yên%%', '%%Khánh Hòa%%',
                            '%%Ninh Thuận%%', '%%Bình Thuận%%',
                            '%%Kon Tum%%', '%%Gia Lai%%', '%%Đắk Lắk%%', '%%Đắk Nông%%', '%%Lâm Đồng%%'
                        ]) THEN 'Miền Trung'

                        WHEN hd.tinh ILIKE ANY (ARRAY[
                            '%%TP Hồ Chí Minh%%', '%%Hồ Chí Minh%%', '%%Đồng Nai%%', '%%Bà Rịa - Vũng Tàu%%', '%%Bình Dương%%', 
                            '%%Bình Phước%%', '%%Tây Ninh%%',
                            '%%Cần Thơ%%', '%%Long An%%', '%%Tiền Giang%%', '%%Bến Tre%%', '%%Vĩnh Long%%', '%%Trà Vinh%%',
                            '%%Đồng Tháp%%', '%%An Giang%%', '%%Kiên Giang%%', '%%Hậu Giang%%', '%%Sóc Trăng%%', '%%Bạc Liêu%%', '%%Cà Mau%%'
                        ]) THEN 'Miền Nam'

                        ELSE 'Không xác định'
                    END AS vung_mien,
                    hd.ma_san_pham
                FROM hoa_don hd
                JOIN khach_hang kh ON (hd.sdt = kh.sdt1 OR hd.sdt = kh.sdt2)
                WHERE 
                    hd.thoi_gian BETWEEN %s AND %s
                    AND (
                        COALESCE(hd.trang_thai, '') NOT ILIKE '%%hoàn%%'
                        AND COALESCE(hd.trang_thai, '') NOT ILIKE '%%hủy%%'
                    )
                    AND hd.nguon_ban NOT IN ('Mộc Tâm Trà', 'TRAF - TRÀ VIỆT NAM', 'TIKTOK SHOP (SPARK ADS)', 'TIKTOK SHOP (LIVESTREAM PHƯƠNG ANH)', 'TIKTOK SHOP (LIVESTREAM HẢI HÀ)', 'TRAF OFFICIAL - TRÀ VIỆT NAM', 'Traf Vina - Vietnamese tea', 'Bán trực tiếp')
                    AND kh.id_acc IN %s
            ),
            so_hoa_don_theo_tinh AS (
                SELECT vung_mien, tinh, COUNT(DISTINCT sdt) AS so_hoa_don
                FROM hoa_don_goc
                GROUP BY vung_mien, tinh
            ),
            hoa_don_san_pham AS (
                SELECT 
                    id_hd,
                    vung_mien,
                    tinh,
                    trim(unnest(string_to_array(ma_san_pham, E'\n'))) AS dong_sp
                FROM hoa_don_goc
            ),
            tach_ma_va_sl AS (
                SELECT 
                    id_hd,
                    vung_mien,
                    tinh,
                    CASE
                        WHEN sp_raw ~* 'x[0-9]+$' THEN regexp_replace(sp_raw, 'x[0-9]+$', '')
                        ELSE sp_raw
                    END AS ma_sp,
                    CASE
                        WHEN sp_raw ~* 'x[0-9]+$' THEN (regexp_match(sp_raw, 'x([0-9]+)$'))[1]::int
                        ELSE 1
                    END AS so_luong

                FROM (
                    SELECT id_hd, vung_mien, tinh, dong_sp AS sp_raw
                    FROM hoa_don_san_pham
                ) AS t
            ),
            kq_theo_phanloai AS (
                SELECT 
                    vung_mien,
                    tinh,
                    sp.phan_loai,
                    SUM(t.so_luong) AS tong_sl
                FROM tach_ma_va_sl t
                JOIN san_pham sp ON sp.ma_sp = t.ma_sp
                GROUP BY vung_mien, tinh, sp.phan_loai
            )
            SELECT 
                sht.vung_mien,
                sht.tinh,
                sht.so_hoa_don,
                COALESCE(SUM(kq.tong_sl) FILTER (WHERE kq.phan_loai = 'Trà Phổ Thông'), 0) AS "Trà Phổ Thông",
                COALESCE(SUM(kq.tong_sl) FILTER (WHERE kq.phan_loai = 'Trà Cao Cấp'), 0) AS "Trà Cao Cấp",
                COALESCE(SUM(kq.tong_sl) FILTER (WHERE kq.phan_loai = 'Trà Cụ'), 0) AS "Trà Cụ",
                COALESCE(SUM(kq.tong_sl) FILTER (WHERE kq.phan_loai = 'Quà Biếu'), 0) AS "Quà Biếu",
                COALESCE(SUM(kq.tong_sl) FILTER (WHERE kq.phan_loai = 'Ấm Chén Bát Tràng'), 0) AS "Ấm Chén Bát Tràng"
            FROM so_hoa_don_theo_tinh sht
            LEFT JOIN kq_theo_phanloai kq ON sht.vung_mien = kq.vung_mien AND sht.tinh = kq.tinh
            GROUP BY sht.vung_mien, sht.tinh, sht.so_hoa_don
            ORDER BY 
                CASE sht.vung_mien
                    WHEN 'Miền Bắc' THEN 1
                    WHEN 'Miền Trung' THEN 2
                    WHEN 'Miền Nam' THEN 3
                    ELSE 4
                END,
                sht.so_hoa_don DESC;
            """
            cur.execute(sql, (from_time, to_time, tuple(list_id_acc)))
            rows1 = cur.fetchall()
            print(rows1)
            if not rows1:
                return []

            columns = [desc[0] for desc in cur.description]
            ket_qua = [dict(zip(columns, row)) for row in rows1]
            # print(json.dumps(ket_qua, indent=4, ensure_ascii=False, default=lambda x: float(x) if isinstance(x, Decimal) else x))
            return ket_qua
            
    except Exception as e:
        conn.rollback()
        print(f"Lỗi trong phân tích khách hàng: {str(e)}")
        traceback.print_exc()
        return False

async def tong_quan_kh(list_id_acc, thoi_gian_vao):
    try:
        with conn.cursor() as cur:
            if len(thoi_gian_vao) != 2:
                return {"error": "❌ Tham số 'thoi_gian_tao' không hợp lệ. Cần đúng 2 giá trị."}

            from_time, to_time = thoi_gian_vao[0], thoi_gian_vao[1]
            sql = """
                SELECT 
            """
            # cur.execute(sql, (trang_thai, id_kh))
            # conn.commit()
            # return {"message": f"Cập nhật trạng thái sale cho khách hàng có id = {id_kh} thành công"}
    except Exception as e:
        conn.rollback()
        print(f"Lỗi trong edit_lead: {str(e)}")
        
async def thang_hang_tich_diem(data):
    try:
        with conn.cursor() as cur:
            sql = """
                INSERT INTO tich_diem (
                    current_rank,
                    phone_number,
                    reward_name,
                    time_update,
                    gmv
                )
                VALUES (
                    %s,  
                    %s,  
                    %s,  
                    %s,
                    %s
                );
            """ 
            
            cur.execute(sql, (data["new_rank"], data["phone_number"], data["reward_name"], 
                            data["upgrade_date"], data["purchase_total"]))
            
            conn.commit()
            return {"message": "Thêm dữ liệu thành công"}
    except Exception as e:
        traceback.print_exc()
        conn.rollback()
        print(f"❌ Lỗi khi truy vấn: {str(e)}")    


async def update_uid(phone, uidApp, uidOA, data):
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM khach_hang 
                WHERE sdt1 = %s OR sdt2 = %s
            """, (phone, phone))
            existing_customers = cur.fetchone()

            

            if existing_customers:
                columns = [desc[0] for desc in cur.description]
                customer_list = dict(zip(columns, existing_customers))
                ma_kh = customer_list["ma_kh"]
                id_kh = customer_list["id_kh"]
                cur.execute("UPDATE khach_hang SET uid_oa = %s WHERE ma_kh = %s"
                            , (uidOA, customer_list["ma_kh"]))
                conn.commit()
                return {
                    "id_kh": id_kh,
                    "ma_kh": ma_kh,
                    "is_new": False
                }
            else:
                cur.execute("SELECT MAX(ma_kh) FROM khach_hang")
                result = cur.fetchone()
                max_ma_kh = result[0] if result and result[0] else "KH000000"

                # Tăng lên 1
                so_moi = int(max_ma_kh[2:]) + 1  # Bỏ "KH" rồi ép kiểu số
                new_ma_kh = f"KH{so_moi:06d}"  # Định dạng lại thành KH000XXX

                cur.execute("""
                    INSERT INTO khach_hang (
                        id_acc, nhan_vien_pt, ma_kh, nhom_kh, ten_khach_hang, 
                        sdt1, dia_chi, thoi_gian_tao, thoi_gian_capnhat, nguon_data, 
                        gmv, aov, so_lan_mua, tan_suat_mua, uid_oa, ghi_chu
                    ) 
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id_kh
                """, (
                    3,
                    "SUBADMIN",
                    new_ma_kh,
                    "F",
                    data["ten_khach_hang"],
                    phone,
                    data["dia_chi"],
                    datetime.now(),
                    datetime.now(),
                    "ZALO MINI APP",
                    0,
                    0,
                    0,
                    0,
                    uidOA,
                    ""
                ))
                new_id = cur.fetchone()[0]
                conn.commit()
                return {
                    "id_kh": new_id,
                    "ma_kh": new_ma_kh,
                    "is_new": True
                }
                
               

    except Exception as e:  
        traceback.print_exc()
        conn.rollback()
        print(f"❌ Lỗi khi truy vấn: {str(e)}")   
# phan_tich_khach_hang(['2024-06-01', '2024-06-30'], 4)


async def customer_new_miniapp(data):
    try:
        with conn.cursor() as cur:
            sql = "SELECT * FROM khach_miniapp WHERE uid_user_miniapp = %s"
            cur.execute(sql, (data["uid_user_miniapp"],))
            existing = cur.fetchone()
            if existing:
                # Lấy danh sách cột hiện có
                columns = [desc[0] for desc in cur.description]
                existing = dict(zip(columns, existing))

                # Các trường có thể cập nhật
                fields = ["sdt", "nguoi_gioi_thieu", "nguon_data", "ma_kh", "ma_hd", "uid_user_oa"]

                updates = []
                values = []

                for field in fields:
                    new_val = data.get(field)
                    old_val = existing.get(field)

                    # Nếu giá trị cũ trống (None hoặc '') và data có giá trị mới
                    if (old_val is None or old_val == "" or old_val == "None" or old_val == "NONE") and new_val:
                        updates.append(f"{field} = %s")
                        values.append(new_val)

                if updates:
                    sql_update = f"""
                        UPDATE khach_miniapp
                        SET {', '.join(updates)}
                        WHERE uid_user_miniapp = %s
                    """
                    values.append(data["uid_user_miniapp"])
                    cur.execute(sql_update, tuple(values))
                    conn.commit()
                    return {"message": "Đã cập nhật các trường còn trống!"}
                else:
                    return {"message": "Không có trường nào cần cập nhật!"}
            else:
                sql_insert = """
                    INSERT INTO khach_miniapp (
                        uid_user_miniapp,
                        sdt,
                        thoi_gian_join,
                        nguoi_gioi_thieu,
                        nguon_data,
                        ma_kh,
                        ma_hd,
                        nguon_app,
                        uid_user_oa
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                cur.execute(sql_insert, (
                    data["uid_user_miniapp"],
                    data["sdt"],
                    data["thoi_gian_join"],
                    data["nguoi_gioi_thieu"],
                    data["nguon_data"],
                    data["ma_kh"],
                    data["ma_hd"],
                    data["nguon_app"],
                    data["uid_user_oa"]
                ))
                conn.commit()
                return {"message": "Thêm khách hàng miniapp thành công!"}
            
    except Exception as e:  
        traceback.print_exc()
        conn.rollback()
        print(f"❌ Lỗi khi truy vấn: {str(e)}")


async def sd_diem(data):
    try:
        with conn.cursor() as cur:
            sql = "SELECT * FROM lich_su_tichdiem WHERE sdt = %s AND sdt <> '' AND sdt IS NOT NULL ORDER BY thoi_gian DESC LIMIT 1"
            cur.execute(sql, (data["sdt"],))
            last_record = cur.fetchone()
            if last_record:
                colums_lstd = [desc[0] for desc in cur.description]
                last_record = dict(zip(colums_lstd, last_record))
                current_point_old = last_record.get("diem_hien_tai", 0)
                current_point = current_point_old - data["so_diem_su_dung"]
                cur.execute("""
                    INSERT INTO lich_su_tichdiem (sdt, ma_hoadon, tong_tien, so_diem, diem_hien_tai, ma_kh, thoi_gian, diem_du, phan_loai)
                    VALUES (%s, %s, %s, %s, %s, %s, NOW(), %s, %s)
                """, (data["sdt"], data["ten_qua_tang"], data["gia_tri"], data["so_diem_su_dung"], current_point, last_record.get("ma_kh", ""), 0, data["ly_do_su_dung"]))
                
                conn.commit()

            
            
            return current_point
    except Exception as e:  
        traceback.print_exc()
        conn.rollback()
        print(f"❌ Lỗi khi truy vấn: {str(e)}")


async def gmv_chuky(fromdate, todate, id_acc):
    try:
        with conn.cursor() as cur:
            # Lấy tất cả id_acc từ list_accs['users']
            

            sql = f"""
                SELECT SUM(hd.tong_tien)
                FROM khach_hang kh
                LEFT JOIN hoa_don hd 
                    ON (kh.sdt1 = hd.sdt OR kh.sdt2 = hd.sdt)
                    AND hd.sdt <> ''
                    AND hd.sdt IS NOT NULL
                    AND hd.thoi_gian < %s
                    AND hd.trang_thai NOT ILIKE '%%hủy%%'
                    AND hd.trang_thai NOT ILIKE '%%hoàn%%'
                WHERE kh.id_acc = %s
            """

            # Tham số: fromdate + danh_sach_acc
            cur.execute(sql, (fromdate, id_acc))
            dau_ky = cur.fetchone()[0] or 0

            # Tham số: todate + danh_sach_acc
            cur.execute(sql, (todate, id_acc))
            cuoi_ky = cur.fetchone()[0] or 0

            print(f"Đầu kỳ: {dau_ky} - Cuối kỳ: {cuoi_ky}")
            
            return {
                "dauky": dau_ky,
                "cuoiky": cuoi_ky
            }

    except Exception as e:  
        traceback.print_exc()
        conn.rollback()
        print(f"❌ Lỗi khi truy vấn: {str(e)}")
        return {"dauky": 0, "cuoiky": 0}
    
async def thong_ke_muctieu(fromdate, todate, id_acc):
    try:
        with conn.cursor() as cur:
            # Lấy tất cả id_acc từ list_accs['users']
            

            sql = f"""
                SELECT SUM(hd.tong_tien)
                FROM khach_hang kh
                LEFT JOIN hoa_don hd 
                    ON (kh.sdt1 = hd.sdt OR kh.sdt2 = hd.sdt)
                    AND hd.sdt <> ''
                    AND hd.sdt IS NOT NULL
                    AND hd.thoi_gian < %s
                    AND hd.trang_thai NOT ILIKE '%%hủy%%'
                    AND hd.trang_thai NOT ILIKE '%%hoàn%%'
                WHERE kh.id_acc = %s
            """

            # Tham số: fromdate + danh_sach_acc
            cur.execute(sql, (fromdate, id_acc))
            dau_ky = cur.fetchone()[0] or 0

            # Tham số: todate + danh_sach_acc
            cur.execute(sql, (todate, id_acc))
            cuoi_ky = cur.fetchone()[0] or 0

            print(f"Đầu kỳ: {dau_ky} - Cuối kỳ: {cuoi_ky}")
            
            return {
                "dauky": dau_ky,
                "cuoiky": cuoi_ky
            }

    except Exception as e:  
        traceback.print_exc()
        conn.rollback()
        print(f"❌ Lỗi khi truy vấn: {str(e)}")
        return {"dauky": 0, "cuoiky": 0}


async def tong_quan_goi_y(id_acc):
    today = datetime.now().date()  # hôm nay
    
    try:
        with conn.cursor() as cur:
            # === PHẦN 1: Thống kê gợi ý hôm nay của nhân viên ===
            sql1 = """
            SELECT 
                id_acc,
                COUNT(*) AS tong_so_hen,
                SUM(CASE WHEN type_hen = 'Bán hàng' THEN 1 ELSE 0 END) AS ban_hang,
                SUM(CASE WHEN type_hen = 'Chăm sóc' THEN 1 ELSE 0 END) AS cham_soc,
                SUM(CASE WHEN type_hen = 'Bán hàng' AND DATE(thoi_gian_capnhat_ghichu) = %s THEN 1 ELSE 0 END) AS da_ban_hang,
                SUM(CASE WHEN type_hen = 'Chăm sóc' AND DATE(thoi_gian_capnhat_ghichu) = %s THEN 1 ELSE 0 END) AS da_cham_soc 
            FROM khach_hang
            WHERE DATE(goi_y_chamsoc) = %s AND id_acc = %s
            GROUP BY id_acc
            """
            cur.execute(sql1, (today, today, today, id_acc))
            row = cur.fetchone()
            colums = [desc[0] for desc in cur.description]
            thong_ke_hom_nay = dict(zip(colums, row)) if row else {
                "id_acc": id_acc, "tong_so_hen": 0, "ban_hang": 0, "cham_soc": 0,
                "da_ban_hang": 0, "da_cham_soc": 0
            }

            # === PHẦN 2: Lịch hẹn 6 ngày tiếp theo ===
            sql2 = """
            WITH ngay_series AS (
                SELECT 
                    (%s::date + INTERVAL '1 day') + (seq - 1) * INTERVAL '1 day' AS ngay
                FROM generate_series(1, 6) AS t(seq)
            ),
            du_lieu AS (
                SELECT
                    DATE(ngay_hen_banhang) AS ngay_hen_bh,
                    DATE(thoi_gian_cs_lai) AS ngay_cs
                FROM khach_hang
                WHERE id_acc = %s
                  AND (
                        ngay_hen_banhang BETWEEN (%s::date + INTERVAL '1 day') AND (%s::date + INTERVAL '6 day')
                     OR thoi_gian_cs_lai BETWEEN (%s::date + INTERVAL '1 day') AND (%s::date + INTERVAL '6 day')
                  )
            )
            SELECT
                ns.ngay::date AS ngay,
                COALESCE(COUNT(CASE WHEN dl.ngay_hen_bh = ns.ngay THEN 1 END), 0) AS ban_hang,
                COALESCE(COUNT(CASE WHEN dl.ngay_cs = ns.ngay THEN 1 END), 0) AS cham_soc,
                COALESCE(COUNT(CASE WHEN dl.ngay_hen_bh = ns.ngay THEN 1 END), 0) 
                + COALESCE(COUNT(CASE WHEN dl.ngay_cs = ns.ngay THEN 1 END), 0) AS tong_cong
            FROM ngay_series ns
            LEFT JOIN du_lieu dl 
                ON dl.ngay_hen_bh = ns.ngay OR dl.ngay_cs = ns.ngay
            GROUP BY ns.ngay
            ORDER BY ns.ngay;
            """
            cur.execute(sql2, (today, id_acc, today, today, today, today))
            rows = cur.fetchall()  # ← quan trọng: phải fetchall()
            columns = [desc[0] for desc in cur.description]
            lich_6_ngay = [dict(zip(columns, row)) for row in rows]
            result = {}
            result[0] = {
                "mucTieu": f"{thong_ke_hom_nay['cham_soc']} / {thong_ke_hom_nay['ban_hang']} / {thong_ke_hom_nay['cham_soc'] + thong_ke_hom_nay['ban_hang']}",
                "thucTe": f"{thong_ke_hom_nay['da_cham_soc']} / {thong_ke_hom_nay['da_ban_hang']} / {thong_ke_hom_nay['da_cham_soc'] + thong_ke_hom_nay['da_ban_hang']}"
            }
            for index, node in enumerate(lich_6_ngay):
                result[index+1] = {
                    "mucTieu": f"{node['cham_soc']} / {node['ban_hang']} / {node['cham_soc'] + node['ban_hang']}",
                    "thucTe": ""
                }
            
            # print(result)
            return result

    except Exception as e:
        traceback.print_exc()
        print(f"Lỗi khi truy vấn tổng quan: {str(e)}")
        return {
            "thong_ke_hom_nay": {"tong_so_hen": 0, "ban_hang": 0, "cham_soc": 0, "da_ban_hang": 0, "da_cham_soc": 0},
            "lich_6_ngay_sap_toi": [
                {"ngay": today + timedelta(days=i+1), "ban_hang": 0, "cham_soc": 0, "tong_cong": 0}
                for i in range(6)
            ]
        }

async def add_quaythuong(data):
    try:
        with conn.cursor() as cur:
            sql = "SELECT ma_kh FROM khach_hang WHERE sdt1 = %s OR sdt2 = %s"
            cur.execute(sql, (data["sdt"], data["sdt"]))
            result = cur.fetchone()
            if result:
                data["ma_kh"] = result[0]
            sql = """
                INSERT INTO quay_thuong_mini_app (
                    user_id,
                    user_zalo_id,
                    sdt,
                    ma_kh,
                    ten_qua_tang,
                    status,
                    create_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s);
            """
            cur.execute(sql, (data["user_id"], data["user_zalo_id"], data["sdt"], data["ma_kh"],
                            data["ten_qua_tang"], data["status"], data["created_at"]))
            conn.commit()
            return {"message": "Thêm dữ liệu quay thưởng thành công"}
    except Exception as e:
        traceback.print_exc()
        conn.rollback()
        print(f"❌ Lỗi khi truy vấn: {str(e)}")


# print("Lead báo cáo")
# print(bao_cao_sale(["2025-04-01 00:00:00","2025-04-30 23:59:59"]))
# asyncio.run(tong_quan_goi_y(5))


async def get_top_customers_sorted(id_acc: int, limit: int = 100, sort_by: str = "gmv"):
    """
    Lấy danh sách top khách hàng của nhân viên
    sort_by: 'gmv' (mặc định) hoặc 'so_lan_mua'
    
    GMV và số lần mua được tính từ bảng invoice trong fm_tdvn
    (Chỉ tính các đơn có status_value = 'Giao thành công')
    """
    try:
        print(f"🔍 [TOP CUSTOMERS] Fetching top {limit} customers for id_acc={id_acc}, sort_by={sort_by}")
        
        # Bước 1: Lấy GMV và số lần mua từ bảng invoice trong fm_tdvn
        print(f"📊 [TOP CUSTOMERS] Calculating GMV and purchase count from invoice table...")
        gmv_dict = {}  # {code_customer: gmv (>= 2026)}
        gmv_truoc_dict = {}  # {code_customer: gmv_truoc (< 2026)}
        so_lan_mua_dict = {}  # {code_customer: count}
        
        with conn_fm.cursor() as cur_fm:
            cur_fm.execute("""
                SELECT 
                    code_customer,
                    COALESCE(SUM(CASE WHEN time_create >= '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) as gmv_sau,
                    COALESCE(SUM(CASE WHEN time_create < '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) as gmv_truoc,
                    COUNT(*) as so_lan_mua
                FROM invoice
                WHERE id_status <> 12
                GROUP BY code_customer
            """)
            gmv_results = cur_fm.fetchall()
            for row in gmv_results:
                if row[0]:  # code_customer
                    gmv_dict[row[0]] = float(row[1]) if row[1] else 0
                    gmv_truoc_dict[row[0]] = float(row[2]) if row[2] else 0
                    so_lan_mua_dict[row[0]] = int(row[3]) if row[3] else 0
        
        print(f"✅ [TOP CUSTOMERS] Loaded GMV and purchase count for {len(gmv_dict)} customers from invoice table")
        
        # Bước 2: Lấy danh sách khách hàng của nhân viên
        with conn.cursor() as cur:
            query = """
                SELECT 
                    id_kh,
                    ma_kh,
                    ten_khach_hang,
                    sdt1,
                    aov,
                    nhom_kh,
                    thoi_gian_tao
                FROM khach_hang
                WHERE id_acc = %s
            """
            cur.execute(query, (id_acc,))
            customers = cur.fetchall()
            
            # Bước 3: Gắn GMV và số lần mua từ invoice vào từng khách hàng
            result = []
            for customer in customers:
                ma_kh = customer[1]
                
                # Lấy GMV và số lần mua từ invoice
                gmv = gmv_dict.get(ma_kh, 0)
                gmv_truoc = gmv_truoc_dict.get(ma_kh, 0)
                so_lan_mua = so_lan_mua_dict.get(ma_kh, 0)
                
                # Tính AOV = Tổng GMV / số lần mua
                aov = (gmv + gmv_truoc) / so_lan_mua if so_lan_mua > 0 else 0
                
                result.append({
                    "id_kh": customer[0],
                    "ma_kh": ma_kh,
                    "ten_khach_hang": customer[2],
                    "sdt": customer[3],
                    "gmv": gmv,
                    "gmv_truoc_2026": gmv_truoc,
                    "aov": aov,
                    "so_lan_mua": so_lan_mua,
                    "nhom_kh": customer[5],
                    "thoi_gian_tao": customer[6].isoformat() if customer[6] else None
                })
            
            # Bước 4: Sắp xếp theo sort_by
            if sort_by == "so_lan_mua":
                result.sort(key=lambda x: x["so_lan_mua"], reverse=True)
            else:  # mặc định là gmv
                # Chỉ sort theo GMV từ 2026
                result.sort(key=lambda x: x["gmv"], reverse=True)
            
            # Bước 5: Giới hạn số lượng và thêm STT
            result = result[:limit]
            for idx, customer in enumerate(result, 1):
                customer["stt"] = idx
            
            print(f"✅ [TOP CUSTOMERS] Returned {len(result)} customers")
            return result
            
    except Exception as e:
        print(f"❌ Lỗi khi lấy top khách hàng: {str(e)}")
        traceback.print_exc()
        return []


async def search_customers_advanced(id_acc: int, search_params: dict, role_id: int = 4):
    """
    Tìm kiếm chuyên sâu khách hàng với nhiều tiêu chí
    
    Dữ liệu được lấy từ:
    - Bảng khach_hang (db crm_tdvn): id_kh, ma_kh, ten_khach_hang, sdt1, sdt2, 
      dia_chi, gmv, so_lan_mua, nhom_kh, aov
    
    Args:
        id_acc: ID nhân viên
        search_params: Dictionary chứa các tham số tìm kiếm:
            - customer_code: Mã khách hàng
            - customer_name: Tên khách hàng
            - phone: Số điện thoại (tìm trong sdt1 hoặc sdt2)
            - nhom_kh: Nhóm khách hàng (text search)
            - aov: AOV (text search)
            - gmv_from: GMV từ
            - gmv_to: GMV đến
            - order_count_from: Số lần mua từ
            - order_count_to: Số lần mua đến
    
    Returns:
        List[dict]: Danh sách khách hàng phù hợp
    """
    try:
        with conn.cursor() as cur:
            # Lấy page và page_size từ search_params
            page = search_params.get("page", 1)
            page_size = search_params.get("page_size", 50)
            
            # Validate page và page_size
            if page < 1:
                page = 1
            if page_size < 1 or page_size > 100:
                page_size = 50
            
            offset = (page - 1) * page_size
            
            # Base query - Lấy dữ liệu từ bảng khach_hang (db crm_tdvn)
            # Admin/Manager/Supervisor (role_id 1,2,3) xem được tất cả khách hàng
            if role_id in (1, 2, 3):
                query = """
                    SELECT 
                        kh.id_kh,
                        kh.ma_kh,
                        kh.ten_khach_hang,
                        kh.sdt1 as sdt,
                        kh.dia_chi,
                        COALESCE(kh.gmv, 0) as gmv,
                        COALESCE(kh.so_lan_mua, 0) as so_lan_mua,
                        COALESCE(kh.aov, 0) as aov,
                        kh.tinh as ten_tinh,
                        kh.phuong as ten_xa,
                        kh.nhom_kh,
                        kh.mien,
                        kh.gioi_tinh,
                        kh.ngay_sinh
                    FROM khach_hang kh
                    WHERE 1=1
                """
                params = []
            else:
                query = """
                    SELECT 
                        kh.id_kh,
                        kh.ma_kh,
                        kh.ten_khach_hang,
                        kh.sdt1 as sdt,
                        kh.dia_chi,
                        COALESCE(kh.gmv, 0) as gmv,
                        COALESCE(kh.so_lan_mua, 0) as so_lan_mua,
                        COALESCE(kh.aov, 0) as aov,
                        kh.tinh as ten_tinh,
                        kh.phuong as ten_xa,
                        kh.nhom_kh,
                        kh.mien,
                        kh.gioi_tinh,
                        kh.ngay_sinh
                    FROM khach_hang kh
                    WHERE kh.id_acc = %s
                """
                params = [id_acc]
            # Các filter bằng SQL (text, date, staff, mien)
            filter_type = search_params.get("filter_type", "all")
            if filter_type == "handed_over":
                query += """ AND kh.id_acc IN (
                    SELECT id_acc FROM account_users WHERE trang_thai = 'Đang làm' AND role_id = 4
                ) AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL"""
            elif filter_type == "not_handed_over":
                if role_id == 1:
                    query += """ AND (kh.id_acc IS NULL 
                           OR kh.id_acc NOT IN (
                               SELECT id_acc FROM account_users WHERE trang_thai = 'Đang làm' AND role_id = 4
                           )
                           OR COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NULL)"""
                else:
                    query += """ AND (kh.id_acc IS NULL 
                           OR kh.id_acc NOT IN (
                               SELECT id_acc FROM account_users WHERE trang_thai = 'Đang làm' AND role_id = 4
                           )
                           OR COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NULL)
                           AND (kh.id_acc IS NULL OR kh.id_acc NOT IN (
                               SELECT id_acc FROM account_users WHERE role_id = 1
                           ))"""
            if role_id in (1, 2, 3) and search_params.get("staff_id"):
                query += " AND kh.id_acc = %s"
                params.append(int(search_params["staff_id"]))
                
            if search_params.get("customer_code"):
                query += " AND kh.ma_kh ILIKE %s"
                params.append(f"%{search_params['customer_code']}%")
            
            if search_params.get("customer_name"):
                query += " AND kh.ten_khach_hang ILIKE %s"
                params.append(f"%{search_params['customer_name']}%")
            
            if search_params.get("phone"):
                query += " AND (kh.sdt1 LIKE %s OR kh.sdt2 LIKE %s)"
                phone_pattern = f"%{search_params['phone']}%"
                params.extend([phone_pattern, phone_pattern])
                
            if search_params.get("product_codes"):
                product_codes = search_params["product_codes"]
                if isinstance(product_codes, list) and len(product_codes) > 0:
                    try:
                        with conn_fm.cursor() as cur_fm:
                            cur_fm.execute("""
                                SELECT DISTINCT i.code_customer
                                FROM invoice_detail d
                                JOIN invoice i ON d.code_invoice = i.code_invoice
                                WHERE d.code_product = ANY(%s)
                                AND i.id_status <> 12
                                AND i.code_customer IS NOT NULL
                                AND i.code_customer != ''
                            """, [product_codes])
                            ma_kh_list = [r[0] for r in cur_fm.fetchall() if r[0]]
                            
                            if not ma_kh_list:
                                return [], 0
                            
                            query += " AND kh.ma_kh = ANY(%s)"
                            params.append(ma_kh_list)
                    except Exception as e:
                        print(f"Error filtering by product_codes: {traceback.format_exc()}")
                        
            purchase_date_from = search_params.get("purchase_date_from")
            purchase_date_to = search_params.get("purchase_date_to")
            if purchase_date_from or purchase_date_to:
                try:
                    with conn_fm.cursor() as cur_fm:
                        date_query = """
                            SELECT DISTINCT code_customer
                            FROM invoice
                            WHERE id_status <> 12
                            AND code_customer IS NOT NULL
                            AND code_customer != ''
                        """
                        date_params = []
                        if purchase_date_from:
                            date_query += " AND DATE(time_create) >= %s"
                            date_params.append(purchase_date_from)
                        if purchase_date_to:
                            date_query += " AND DATE(time_create) <= %s"
                            date_params.append(purchase_date_to)
                        
                        cur_fm.execute(date_query, date_params)
                        ma_kh_list_date = [r[0] for r in cur_fm.fetchall() if r[0]]
                        
                        if not ma_kh_list_date:
                            return [], 0
                            
                        query += " AND kh.ma_kh = ANY(%s)"
                        params.append(ma_kh_list_date)
                except Exception as e:
                    print(f"Error filtering by purchase_date: {traceback.format_exc()}")
                
            if search_params.get("thang_sinh"):
                query += " AND LENGTH(COALESCE(kh.ngay_sinh, '')) >= 10 AND SUBSTRING(kh.ngay_sinh FROM 6 FOR 2) = %s"
                params.append(search_params["thang_sinh"])
            
            if search_params.get("con_giap"):
                zodiac_map = {
                    "Thân": 0, "Dậu": 1, "Tuất": 2, "Hợi": 3,
                    "Tý": 4, "Sửu": 5, "Dần": 6, "Mão": 7,
                    "Thìn": 8, "Tỵ": 9, "Ngọ": 10, "Mùi": 11
                }
                zodiac = search_params["con_giap"]
                if zodiac in zodiac_map:
                    query += " AND COALESCE(kh.ngay_sinh, '') ~ '^[0-9]{4}' AND MOD(CAST(SUBSTRING(kh.ngay_sinh FROM 1 FOR 4) AS INTEGER), 12) = %s"
                    params.append(zodiac_map[zodiac])
                    
            if search_params.get("age_from") and str(search_params["age_from"]).isdigit():
                query += " AND COALESCE(kh.ngay_sinh, '') ~ '^[0-9]{4}' AND EXTRACT(YEAR FROM CURRENT_DATE) - CAST(SUBSTRING(kh.ngay_sinh FROM 1 FOR 4) AS INTEGER) >= %s"
                params.append(int(search_params["age_from"]))
                
            if search_params.get("age_to") and str(search_params["age_to"]).isdigit():
                query += " AND COALESCE(kh.ngay_sinh, '') ~ '^[0-9]{4}' AND EXTRACT(YEAR FROM CURRENT_DATE) - CAST(SUBSTRING(kh.ngay_sinh FROM 1 FOR 4) AS INTEGER) <= %s"
                params.append(int(search_params["age_to"]))
                    
            if search_params.get("mien"):
                query += " AND kh.mien = %s"
                params.append(search_params["mien"])
            
            if search_params.get("gioi_tinh"):
                query += " AND kh.gioi_tinh = %s"
                params.append(search_params["gioi_tinh"])
            
            # Thực thi SQL Query cơ bản
            cur.execute(query, params)
            rows = cur.fetchall()
            
            # Fetch real GMV map từ invoice
            real_gmv_map = {}
            with conn_fm.cursor() as cur_fm:
                cur_fm.execute("""
                    SELECT 
                        code_customer,
                        COALESCE(SUM(CASE WHEN time_create >= '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) as gmv_sau,
                        COALESCE(SUM(CASE WHEN time_create < '2026-01-01 00:00:00+07' THEN subtotal ELSE 0 END), 0) as gmv_truoc,
                        COUNT(CASE WHEN time_create >= '2026-01-01 00:00:00+07' THEN 1 END) as so_lan_mua_sau,
                        COUNT(CASE WHEN time_create < '2026-01-01 00:00:00+07' THEN 1 END) as so_lan_mua_truoc
                    FROM invoice
                    WHERE id_status <> 12
                    GROUP BY code_customer
                """)
                for r in cur_fm.fetchall():
                    if r[0]:
                        real_gmv_map[r[0]] = {"gmv": float(r[1]), "gmv_truoc": float(r[2]), "so_lan_mua": int(r[3]), "so_lan_mua_truoc": int(r[4])}
            
            all_customers = []
            for row in rows:
                ma_kh = row[1]
                real_data = real_gmv_map.get(ma_kh, {"gmv": 0.0, "gmv_truoc": 0.0, "so_lan_mua": 0, "so_lan_mua_truoc": 0})
                gmv = real_data["gmv"]
                gmv_truoc = real_data["gmv_truoc"]
                so_lan_mua_sau = real_data["so_lan_mua"]
                so_lan_mua_truoc = real_data.get("so_lan_mua_truoc", 0)
                
                # Cấp admin (role=1) tính GMV cả trước 2026, các cấp khác chỉ tính từ 2026
                # Số lần mua tính toàn bộ cho tất cả các role
                total_gmv = gmv if role_id != 1 else (gmv + gmv_truoc)
                total_so_lan_mua = so_lan_mua_sau + so_lan_mua_truoc
                
                # AOV luôn tính trên toàn thời gian để xếp hạng VIP Badge hiển thị chính xác cho mọi role
                total_all_time_gmv = gmv + gmv_truoc
                total_all_time_so_lan_mua = so_lan_mua_sau + so_lan_mua_truoc
                aov_all_time = total_all_time_gmv / total_all_time_so_lan_mua if total_all_time_so_lan_mua > 0 else 0
                
                # Filter bằng GMV (tính dựa trên role_id)
                if search_params.get("gmv_from") is not None and total_gmv < search_params["gmv_from"]: continue
                if search_params.get("gmv_to") is not None and total_gmv > search_params["gmv_to"]: continue
                
                # Filter bằng số lần mua
                if search_params.get("order_count_from") is not None and total_so_lan_mua < search_params["order_count_from"]: continue
                if search_params.get("order_count_to") is not None and total_so_lan_mua > search_params["order_count_to"]: continue
                
                # Define VIP level calculation function
                def get_vip_level(g_val: float) -> int:
                    g = g_val / 1_000_000.0
                    if g < 1: return 0
                    if g < 10: return int(g)
                    if g < 60: return min(int((g - 10) / 5) + 10, 19)
                    if g < 160: return min(int((g - 60) / 10) + 20, 29)
                    return min(int((g - 160) / 50) + 30, 39)
                
                vip_level = get_vip_level(total_all_time_gmv)
                
                # Filter bằng Cấp VIP
                vip_from_val = search_params.get("vip_from")
                if vip_from_val is not None and str(vip_from_val).strip() != "":
                    if vip_level < int(vip_from_val): continue
                
                vip_to_val = search_params.get("vip_to")
                if vip_to_val is not None and str(vip_to_val).strip() != "":
                    if vip_level > int(vip_to_val): continue
                
                all_customers.append({
                    "id_kh": row[0],
                    "ma_kh": ma_kh,
                    "ten_khach_hang": row[2] or "",
                    "sdt": row[3] or "",
                    "dia_chi": row[4] or "",
                    "gmv": gmv,
                    "gmv_truoc_2026": gmv_truoc,
                    "so_lan_mua": total_so_lan_mua,
                    "aov": aov_all_time,
                    "ten_tinh": row[8] or "",
                    "ten_xa": row[9] or "",
                    "nhom_kh": row[10] or "",
                    "mien": row[11] or "",
                    "gioi_tinh": row[12] or "",
                    "ngay_sinh": row[13] or ""
                })
            
            # Python Sort
            sort_by = search_params.get("sort_by")
            sort_order = search_params.get("sort_order", "desc")
            reverse = sort_order == "desc"
            
            if sort_by == "gmv":
                all_customers.sort(key=lambda x: x["gmv"], reverse=reverse)
            elif sort_by == "so_lan_mua":
                all_customers.sort(key=lambda x: x["so_lan_mua"], reverse=reverse)
            elif sort_by == "cap_vip":
                all_customers.sort(key=lambda x: (get_vip_level(x["gmv"] + x["gmv_truoc_2026"]), x["aov"], x["gmv"]), reverse=reverse)
            else:
                all_customers.sort(key=lambda x: x["gmv"], reverse=True)
            
            total_records = len(all_customers)
            result = all_customers[offset:offset+page_size]
            
            print(f"✅ [SEARCH ADVANCED] Found {len(result)} on page {page} out of {total_records} matching records")
            return result, total_records

    except Exception as e:
        print(f"❌ Lỗi khi tìm kiếm khách hàng: {str(e)}")
        traceback.print_exc()
        return [], 0


# Tạo lead đề xuất
async def tao_lead_de_xuat(data_lead, id_acc_nguoi_tao):
    try:
        from datetime import datetime
        from schemas import KhachHangRequest
        
        with conn.cursor() as cur:
            # Kiểm tra số điện thoại đã tồn tại
            cur.execute("""
                SELECT id_kh, ten_khach_hang, nhan_vien_pt, id_acc
                FROM khach_hang 
                WHERE sdt1 = %s OR sdt2 = %s
            """, (data_lead["sdt"], data_lead["sdt"]))
            
            existing_customer = cur.fetchone()
            
            # Lấy thông tin user
            cur.execute("SELECT user_id, name FROM account_users WHERE id_acc = %s", (id_acc_nguoi_tao,))
            user_info = cur.fetchone()
            if not user_info:
                return {"error": "Không tìm thấy thông tin người dùng"}
            
            user_id = user_info[0]
            
            auto_approve = False
            
            # Trường hợp 1: Khách hàng chưa tồn tại → Tạo khách hàng mới
            if not existing_customer:
                # Create KhachHangRequest object
                khach_hang_request = KhachHangRequest(
                    id_acc=id_acc_nguoi_tao,
                    nhan_vien_pt=user_id,
                    nhom_kh=data_lead.get("nhom_kh", "F"),
                    ten_khach_hang=data_lead["ten_kh"],
                    sdt=data_lead["sdt"],
                    gioi_tinh=data_lead.get("gioi_tinh", "Nam"),
                    dia_chi=data_lead.get("dia_chi", ""),
                    ngay_sinh=data_lead.get("ngay_sinh", ""),
                    nghe_nghiep=data_lead.get("nghe_nghiep", ""),
                    diem_khach_hang=0,
                    ghi_chu="",
                    dac_thu_sp=data_lead.get("dac_thu", ""),
                    nhu_cau_sd=data_lead.get("nhu_cau", ""),
                    thoi_gian_tao=datetime.now(),
                    nguon_data=data_lead.get("nguon_data", "CRM")
                )
                
                # Gọi _create_customer_internal() để tạo khách hàng
                result = await _create_customer_internal(khach_hang_request)
                
                if "error" in result:
                    return result
                
                new_id_kh = result.get("id")
                proposal_type = "tao_moi"
                auto_approve = True
                
            else:
                # Trường hợp 2: Khách hàng đã tồn tại → Đề xuất reassign
                id_kh = existing_customer[0]
                existing_id_acc = existing_customer[3]
                new_id_kh = id_kh
                proposal_type = "reassign"
                
                cur.execute("SELECT role_id FROM account_users WHERE id_acc = %s", (existing_id_acc,))
                existing_role_info = cur.fetchone()
                existing_role_id = existing_role_info[0] if existing_role_info else None
                
                # Tự động duyệt nếu khách hàng không thuộc nhân viên khác (role_id = 4)
                if existing_role_id != 4:
                    auto_approve = True
        
        # Insert vào bảng de_xuat_lead
        with conn.cursor() as cur:
            # Kiểm tra xem đã có đề xuất "chờ duyệt" cho khách hàng này từ cùng user chưa
            cur.execute("""
                SELECT id_de_xuat FROM de_xuat_lead
                WHERE id_kh = %s AND id_acc = %s AND trang_thai = 'cho_duyet'
            """, (new_id_kh, id_acc_nguoi_tao))
            
            existing_proposal = cur.fetchone()
            if existing_proposal:
                # Đã có đề xuất chờ duyệt rồi, không cho insert thêm
                return {
                    "error": "Bạn đã gửi đề xuất cho khách hàng này rồi. Vui lòng chờ phê duyệt!",
                    "existing_proposal": True
                }
            
            if auto_approve:
                cur.execute("""
                    INSERT INTO de_xuat_lead (
                        id_kh, id_acc, user_id_de_xuat, trang_thai, thoi_gian_duyet, id_acc_duyet
                    ) 
                    VALUES (
                        %s, %s, %s, 'da_duyet', CURRENT_TIMESTAMP, 3
                    ) RETURNING id_de_xuat
                """, (
                    new_id_kh, id_acc_nguoi_tao, user_id
                ))
                new_id_de_xuat = cur.fetchone()[0]
                
                # Reassign ngay cho người đề xuất
                cur.execute("""
                    UPDATE khach_hang
                    SET id_acc = %s,
                        nhan_vien_pt = %s,
                        thoi_gian_capnhat = CURRENT_TIMESTAMP
                    WHERE id_kh = %s
                """, (id_acc_nguoi_tao, user_id, new_id_kh))
                
                if proposal_type == "tao_moi":
                    message = "Đã tạo lead thành công và được tự động phê duyệt"
                else:
                    message = "Đã reassign khách hàng thành công và được tự động phê duyệt"
            else:
                cur.execute("""
                    INSERT INTO de_xuat_lead (
                        id_kh, id_acc, user_id_de_xuat, trang_thai
                    ) 
                    VALUES (
                        %s, %s, %s, 'cho_duyet'
                    ) RETURNING id_de_xuat
                """, (
                    new_id_kh, id_acc_nguoi_tao, user_id
                ))
                new_id_de_xuat = cur.fetchone()[0]
                
                if proposal_type == "tao_moi":
                    message = "Đã gửi đề xuất tạo lead thành công, chờ admin phê duyệt"
                else:
                    message = "Đã gửi đề xuất reassign khách hàng thành công, chờ admin phê duyệt"
            
            conn.commit()
        
        return {
            "success": True,
            "id_de_xuat": new_id_de_xuat,
            "id_kh": new_id_kh,
            "type": proposal_type,
            "message": message,
            "auto_approve": auto_approve
        }
            
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi tạo lead đề xuất: {str(e)}")
        traceback.print_exc()
        return {"error": str(e)}


# Lấy danh sách lead đề xuất (cho admin)
async def get_lead_de_xuat(trang_thai=None):
    try:
        with conn.cursor() as cur:
            if trang_thai:
                cur.execute("""
                    SELECT 
                        dxl.id_de_xuat, kh.id_kh, kh.ma_kh, kh.ten_khach_hang, 
                        kh.sdt1, kh.gioi_tinh, kh.dia_chi, 
                        kh.nguon_data, kh.dac_thu_sp, kh.nhu_cau_sd,
                        dxl.id_acc, dxl.user_id_de_xuat, au.name AS ten_nguoi_de_xuat,
                        dxl.trang_thai, dxl.thoi_gian_de_xuat,
                        dxl.thoi_gian_duyet, dxl.id_acc_duyet
                    FROM de_xuat_lead dxl
                    JOIN khach_hang kh ON dxl.id_kh = kh.id_kh
                    JOIN account_users au ON dxl.id_acc = au.id_acc
                    WHERE dxl.trang_thai = %s
                    ORDER BY dxl.thoi_gian_de_xuat DESC
                """, (trang_thai,))
            else:
                cur.execute("""
                    SELECT 
                        dxl.id_de_xuat, kh.id_kh, kh.ma_kh, kh.ten_khach_hang, 
                        kh.sdt1, kh.gioi_tinh, kh.dia_chi, 
                        kh.nguon_data, kh.dac_thu_sp, kh.nhu_cau_sd,
                        dxl.id_acc, dxl.user_id_de_xuat, au.name AS ten_nguoi_de_xuat,
                        dxl.trang_thai, dxl.thoi_gian_de_xuat,
                        dxl.thoi_gian_duyet, dxl.id_acc_duyet
                    FROM de_xuat_lead dxl
                    JOIN khach_hang kh ON dxl.id_kh = kh.id_kh
                    JOIN account_users au ON dxl.id_acc = au.id_acc
                    WHERE dxl.trang_thai IN ('cho_duyet', 'da_duyet', 'tu_choi')
                    ORDER BY dxl.thoi_gian_de_xuat DESC
                """)
            
            leads = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            lead_list = [dict(zip(columns, row)) for row in leads]
            
            return lead_list
            
    except Exception as e:
        print(f"❌ Lỗi khi lấy danh sách lead đề xuất: {str(e)}")
        traceback.print_exc()
        return {"error": str(e)}


# Xác nhận lead đề xuất (admin approve/reject)
async def xac_nhan_lead_de_xuat(id_de_xuat, trang_thai, id_acc_admin):
    """
    trang_thai: 'da_duyet' hoặc 'tu_choi'
    Khi phê duyệt, khách hàng sẽ được reassign từ ADMIN sang nhân viên đề xuất
    """
    try:
        with conn.cursor() as cur:
            # Lấy thông tin đề xuất
            cur.execute("""
                SELECT id_kh, user_id_de_xuat, id_acc
                FROM de_xuat_lead
                WHERE id_de_xuat = %s
            """, (id_de_xuat,))
            
            proposal_data = cur.fetchone()
            if not proposal_data:
                return {"error": "Không tìm thấy đề xuất"}
            
            id_kh, user_id_de_xuat, id_acc_de_xuat = proposal_data
            
            # Cập nhật trạng thái đề xuất
            cur.execute("""
                UPDATE de_xuat_lead
                SET trang_thai = %s,
                    thoi_gian_duyet = CURRENT_TIMESTAMP,
                    id_acc_duyet = %s
                WHERE id_de_xuat = %s
            """, (trang_thai, id_acc_admin, id_de_xuat))
            
            # Nếu phê duyệt, reassign khách hàng cho người đề xuất
            if trang_thai == 'da_duyet':
                cur.execute("""
                    UPDATE khach_hang
                    SET id_acc = %s,
                        nhan_vien_pt = %s,
                        thoi_gian_capnhat = CURRENT_TIMESTAMP
                    WHERE id_kh = %s
                """, (id_acc_de_xuat, user_id_de_xuat, id_kh))
                message = "Đã phê duyệt đề xuất lead và reassign cho nhân viên"
            else:
                message = "Đã từ chối đề xuất lead"
            
            conn.commit()
            
            return {"success": True, "message": message}
            
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi xác nhận lead đề xuất: {str(e)}")
        traceback.print_exc()
        return {"error": str(e)}


# ============== HÀM CHO ĐỀ XUẤT THU HỒI LEAD ==============

# Tạo đề xuất thu hồi lead
async def tao_withdraw_de_xuat(data_withdraw, id_acc_nguoi_tao):
    try:
        from datetime import datetime
        
        with conn.cursor() as cur:
            # Lấy thông tin user
            cur.execute("SELECT user_id, name FROM account_users WHERE id_acc = %s", (id_acc_nguoi_tao,))
            user_info = cur.fetchone()
            if not user_info:
                return {"error": "Không tìm thấy thông tin người dùng"}
            
            user_id = user_info[0]
            
            # Kiểm tra khách hàng tồn tại
            id_kh = data_withdraw.get("id_kh")
            cur.execute("SELECT id_kh FROM khach_hang WHERE id_kh = %s", (id_kh,))
            if not cur.fetchone():
                return {"error": "Khách hàng không tồn tại"}
            
            # Kiểm tra xem đã có đề xuất "chờ duyệt" cho khách hàng này từ cùng user chưa
            cur.execute("""
                SELECT id_de_xuat FROM de_xuat_withdraw
                WHERE id_kh = %s AND id_acc = %s AND trang_thai = 'cho_duyet'
            """, (id_kh, id_acc_nguoi_tao))
            
            existing_proposal = cur.fetchone()
            if existing_proposal:
                return {
                    "error": "Bạn đã gửi đề xuất thu hồi cho khách hàng này rồi. Vui lòng chờ phê duyệt!"
                }
            
            # Insert vào bảng de_xuat_withdraw
            cur.execute("""
                INSERT INTO de_xuat_withdraw (
                    id_kh, id_acc, user_id_de_xuat, reason, trang_thai, thoi_gian_de_xuat
                ) 
                VALUES (
                    %s, %s, %s, %s, 'cho_duyet', CURRENT_TIMESTAMP
                ) RETURNING id_de_xuat
            """, (
                id_kh, id_acc_nguoi_tao, user_id, data_withdraw.get("reason", "")
            ))
            conn.commit()
            new_id_de_xuat = cur.fetchone()[0]
        
        return {
            "success": True,
            "id_de_xuat": new_id_de_xuat,
            "id_kh": id_kh,
            "message": "Đã gửi đề xuất thu hồi lead thành công, chờ admin phê duyệt"
        }
            
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi tạo đề xuất thu hồi lead: {str(e)}")
        traceback.print_exc()
        return {"error": str(e)}


# Lấy danh sách đề xuất thu hồi lead (cho admin)
async def get_withdraw_de_xuat(trang_thai=None, page=1, pageSize=50):
    try:
        with conn.cursor() as cur:
            # Tính offset
            offset = (page - 1) * pageSize
            
            # Đếm tổng số records
            if trang_thai:
                cur.execute("""
                    SELECT COUNT(*) as total
                    FROM de_xuat_withdraw dwx
                    WHERE dwx.trang_thai = %s
                """, (trang_thai,))
            else:
                cur.execute("""
                    SELECT COUNT(*) as total
                    FROM de_xuat_withdraw dwx
                    WHERE dwx.trang_thai IN ('cho_duyet', 'da_duyet', 'tu_choi')
                """)
            
            total_items = cur.fetchone()[0]
            
            # Lấy dữ liệu phân trang
            if trang_thai:
                cur.execute("""
                    SELECT 
                        dwx.id_de_xuat, kh.id_kh, kh.ma_kh, kh.ten_khach_hang, 
                        kh.sdt1 as sdt, dwx.reason,
                        dwx.id_acc, dwx.user_id_de_xuat, au.name AS ten_nguoi_de_xuat,
                        dwx.trang_thai, dwx.thoi_gian_de_xuat,
                        dwx.thoi_gian_duyet, dwx.id_acc_duyet
                    FROM de_xuat_withdraw dwx
                    JOIN khach_hang kh ON dwx.id_kh = kh.id_kh
                    JOIN account_users au ON dwx.id_acc = au.id_acc
                    WHERE dwx.trang_thai = %s
                    ORDER BY dwx.thoi_gian_de_xuat DESC
                    LIMIT %s OFFSET %s
                """, (trang_thai, pageSize, offset))
            else:
                cur.execute("""
                    SELECT 
                        dwx.id_de_xuat, kh.id_kh, kh.ma_kh, kh.ten_khach_hang, 
                        kh.sdt1 as sdt, dwx.reason,
                        dwx.id_acc, dwx.user_id_de_xuat, au.name AS ten_nguoi_de_xuat,
                        dwx.trang_thai, dwx.thoi_gian_de_xuat,
                        dwx.thoi_gian_duyet, dwx.id_acc_duyet
                    FROM de_xuat_withdraw dwx
                    JOIN khach_hang kh ON dwx.id_kh = kh.id_kh
                    JOIN account_users au ON dwx.id_acc = au.id_acc
                    WHERE dwx.trang_thai IN ('cho_duyet', 'da_duyet', 'tu_choi')
                    ORDER BY dwx.thoi_gian_de_xuat DESC
                    LIMIT %s OFFSET %s
                """, (pageSize, offset))
            
            leads = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            lead_list = [dict(zip(columns, row)) for row in leads]
            
            return {
                "data": lead_list,
                "totalItems": total_items
            }
            
    except Exception as e:
        print(f"❌ Lỗi khi lấy danh sách đề xuất thu hồi lead: {str(e)}")
        traceback.print_exc()
        return {"error": str(e)}


# Xác nhận đề xuất thu hồi lead (admin approve/reject)
async def xac_nhan_withdraw_de_xuat(id_de_xuat, trang_thai, id_acc_admin):
    """
    trang_thai: 'da_duyet' hoặc 'tu_choi'
    Khi phê duyệt, khách hàng sẽ được chuyển cho admin hoặc xóa khỏi phụ trách
    """
    try:
        with conn.cursor() as cur:
            # Lấy thông tin đề xuất
            cur.execute("""
                SELECT id_kh
                FROM de_xuat_withdraw
                WHERE id_de_xuat = %s
            """, (id_de_xuat,))
            
            proposal_data = cur.fetchone()
            if not proposal_data:
                return {"error": "Không tìm thấy đề xuất"}
            
            id_kh = proposal_data[0]
            
            # Cập nhật trạng thái đề xuất
            cur.execute("""
                UPDATE de_xuat_withdraw
                SET trang_thai = %s,
                    thoi_gian_duyet = CURRENT_TIMESTAMP,
                    id_acc_duyet = %s
                WHERE id_de_xuat = %s
            """, (trang_thai, id_acc_admin, id_de_xuat))
            
            # Nếu phê duyệt, gán khách hàng cho admin
            if trang_thai == 'da_duyet':
                cur.execute("""
                    UPDATE khach_hang
                    SET id_acc = 3,
                        nhan_vien_pt = 'SUBADMIN',
                        thoi_gian_capnhat = CURRENT_TIMESTAMP
                    WHERE id_kh = %s
                """, (id_kh,))
                message = "Đã phê duyệt đề xuất thu hồi và chuyển khách hàng cho subadmin"
            else:
                message = "Đã từ chối đề xuất thu hồi lead"
            
            conn.commit()
            
            return {"success": True, "message": message}
            
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi xác nhận đề xuất thu hồi lead: {str(e)}")
        traceback.print_exc()
        return {"error": str(e)}





























# QUẢN LÝ MẪU TÌM KIẾM CHUYÊN SÂU
async def create_search_template(id_acc: int, name: str, filter_data: dict):
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO saved_search_filters (id_acc, name, filter_data) VALUES (%s, %s, %s) RETURNING id",
                (id_acc, name, json.dumps(filter_data))
            )
            new_id = cur.fetchone()[0]
            conn.commit()
            return {"id": new_id, "id_acc": id_acc, "name": name, "filter_data": filter_data}
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi thêm mẫu tìm kiếm: {str(e)}")
        return {"error": str(e)}

async def get_all_search_templates():
    try:
        with conn.cursor() as cur:
            # Load tất cả template vì user bảo tất cả admin đều thấy chung
            cur.execute("SELECT id, id_acc, name, filter_data, created_at FROM saved_search_filters ORDER BY created_at DESC")
            templates = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            template_list = []
            for row in templates:
                template = dict(zip(columns, row))
                # Convert datetime object to string format
                if template.get("created_at"):
                    template["created_at"] = template["created_at"].strftime('%Y-%m-%d %H:%M:%S')
                template_list.append(template)
            return template_list
    except Exception as e:
        print(f"❌ Lỗi khi lấy danh sách mẫu tìm kiếm: {str(e)}")
        return []

async def update_search_template(template_id: int, name: str, filter_data: dict):
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE saved_search_filters SET name = %s, filter_data = %s WHERE id = %s RETURNING id",
                (name, json.dumps(filter_data), template_id)
            )
            updated = cur.fetchone()
            if updated:
                conn.commit()
                return {"success": True, "id": template_id}
            else:
                conn.rollback()
                return {"error": "Không tìm thấy mẫu tìm kiếm"}
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi cập nhật mẫu tìm kiếm: {str(e)}")
        return {"error": str(e)}

async def delete_search_template(template_id: int):
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM saved_search_filters WHERE id = %s RETURNING id", (template_id,))
            deleted = cur.fetchone()
            if deleted:
                conn.commit()
                return {"success": True}
            else:
                conn.rollback()
                return {"error": "Không tìm thấy mẫu tìm kiếm"}
    except Exception as e:
        conn.rollback()
        print(f"❌ Lỗi khi xóa mẫu tìm kiếm: {str(e)}")
        return {"error": str(e)}
