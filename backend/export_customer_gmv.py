"""
Script để export dữ liệu khách hàng với GMV ra file CSV/Excel
Xuất 2 file: 
- Trước năm 2026
- Từ 2026 trở đi
"""
import csv
import pandas as pd
from database import conn, conn_fm
from datetime import datetime
import os

def get_customer_gmv_data(year_filter='before_2026'):
    """
    Lấy dữ liệu khách hàng với GMV
    
    Args:
        year_filter: 'before_2026' hoặc 'from_2026'
    
    Returns:
        List of dict chứa dữ liệu khách hàng
    """
    try:
        # Xác định điều kiện lọc theo năm
        if year_filter == 'before_2026':
            year_condition = "EXTRACT(YEAR FROM created_at) < 2026"
            filename_suffix = "truoc_2026"
        else:  # from_2026
            year_condition = "EXTRACT(YEAR FROM created_at) >= 2026"
            filename_suffix = "tu_2026"
        
        print(f"⏳ Đang truy vấn dữ liệu {filename_suffix}...")
        
        # Bước 1: Lấy dữ liệu khách hàng từ database crm_tdvn
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    id_kh,
                    ten_khach_hang,
                    ma_kh,
                    sdt1,
                    nhom_kh
                FROM khach_hang
                ORDER BY id_kh
            """)
            customers = cur.fetchall()
            
            # Chuyển đổi thành dict
            customer_dict = {}
            for row in customers:
                customer_dict[row[0]] = {
                    'Tên khách hàng': row[1] or '',
                    'Mã khách hàng': row[2] or '',
                    'Số điện thoại': row[3] or '',
                    'Nhóm': row[4] or '',
                    'GMV': 0
                }
        
        print(f"📋 Đã lấy {len(customer_dict)} khách hàng")
        
        # Bước 2: Lấy GMV từ database fm_tdvn
        with conn_fm.cursor() as cur_fm:
            query_invoice = f"""
                SELECT 
                    id_customer,
                    SUM(total_amount) as total_gmv
                FROM invoice
                WHERE status_value = 'Giao thành công'
                    AND {year_condition}
                    AND id_customer IS NOT NULL
                GROUP BY id_customer
            """
            # Thay thế created_at bằng time_create
            query_invoice = query_invoice.replace('created_at', 'time_create')
            cur_fm.execute(query_invoice)
            invoices = cur_fm.fetchall()
            
            # Cập nhật GMV vào customer_dict
            gmv_count = 0
            for row in invoices:
                id_customer = row[0]
                total_gmv = float(row[1]) if row[1] else 0
                
                if id_customer in customer_dict:
                    customer_dict[id_customer]['GMV'] = total_gmv
                    gmv_count += 1
        
        print(f"💰 Đã tính GMV cho {gmv_count} khách hàng")
        
        # Bước 3: Chuyển đổi sang list và sắp xếp theo GMV
        data = list(customer_dict.values())
        data.sort(key=lambda x: x['GMV'], reverse=True)
        
        print(f"✅ Đã lấy {len(data)} bản ghi")
        return data, filename_suffix
            
    except Exception as e:
        print(f"❌ Lỗi khi truy vấn dữ liệu: {str(e)}")
        import traceback
        traceback.print_exc()
        return [], filename_suffix


def export_to_csv(data, filename_suffix):
    """Export dữ liệu ra file CSV"""
    if not data:
        print(f"⚠️ Không có dữ liệu để export cho {filename_suffix}")
        return
    
    try:
        # Tạo thư mục export nếu chưa có
        export_dir = "exports"
        os.makedirs(export_dir, exist_ok=True)
        
        # Tạo tên file với timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        csv_filename = f"{export_dir}/khachhang_gmv_{filename_suffix}_{timestamp}.csv"
        
        # Export ra CSV
        df = pd.DataFrame(data)
        df.to_csv(csv_filename, index=False, encoding='utf-8-sig')
        
        print(f"✅ Đã export CSV: {csv_filename}")
        return csv_filename
        
    except Exception as e:
        print(f"❌ Lỗi khi export CSV: {str(e)}")
        return None


def export_to_excel(data, filename_suffix):
    """Export dữ liệu ra file Excel"""
    if not data:
        print(f"⚠️ Không có dữ liệu để export cho {filename_suffix}")
        return
    
    try:
        # Tạo thư mục export nếu chưa có
        export_dir = "exports"
        os.makedirs(export_dir, exist_ok=True)
        
        # Tạo tên file với timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        excel_filename = f"{export_dir}/khachhang_gmv_{filename_suffix}_{timestamp}.xlsx"
        
        # Export ra Excel với formatting
        df = pd.DataFrame(data)
        
        with pd.ExcelWriter(excel_filename, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Khách hàng')
            
            # Lấy worksheet để format
            worksheet = writer.sheets['Khách hàng']
            
            # Auto-adjust column width
            for idx, col in enumerate(df.columns):
                max_length = max(
                    df[col].astype(str).apply(len).max(),
                    len(col)
                ) + 2
                worksheet.column_dimensions[chr(65 + idx)].width = max_length
        
        print(f"✅ Đã export Excel: {excel_filename}")
        return excel_filename
        
    except Exception as e:
        print(f"❌ Lỗi khi export Excel: {str(e)}")
        return None


def main():
    """Hàm chính để chạy export"""
    print("=" * 60)
    print("🚀 BẮT ĐẦU EXPORT DỮ LIỆU KHÁCH HÀNG VÀ GMV")
    print("=" * 60)
    
    # Export dữ liệu trước 2026
    print("\n📊 PHẦN 1: Export dữ liệu TRƯỚC năm 2026")
    print("-" * 60)
    data_before, suffix_before = get_customer_gmv_data('before_2026')
    if data_before:
        export_to_csv(data_before, suffix_before)
        export_to_excel(data_before, suffix_before)
    
    # Export dữ liệu từ 2026 trở đi
    print("\n📊 PHẦN 2: Export dữ liệu TỪ năm 2026 trở đi")
    print("-" * 60)
    data_from, suffix_from = get_customer_gmv_data('from_2026')
    if data_from:
        export_to_csv(data_from, suffix_from)
        export_to_excel(data_from, suffix_from)
    
    print("\n" + "=" * 60)
    print("✨ HOÀN THÀNH EXPORT DỮ LIỆU")
    print("=" * 60)
    print(f"📁 Các file đã được lưu trong thư mục: exports/")
    print(f"   - Trước 2026: {len(data_before)} bản ghi")
    print(f"   - Từ 2026: {len(data_from)} bản ghi")


if __name__ == "__main__":
    main()
