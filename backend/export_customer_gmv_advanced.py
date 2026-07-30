"""
Script nâng cao để export dữ liệu khách hàng với GMV ra file CSV/Excel
Hỗ trợ filter theo khoảng thời gian tùy chỉnh
"""
import csv
import pandas as pd
from database import conn, conn_fm
from datetime import datetime
import os
import argparse


def get_customer_gmv_data_by_date(start_date=None, end_date=None, output_name='custom'):
    """
    Lấy dữ liệu khách hàng với GMV theo khoảng thời gian tùy chỉnh
    
    Args:
        start_date: Ngày bắt đầu (YYYY-MM-DD) hoặc None
        end_date: Ngày kết thúc (YYYY-MM-DD) hoặc None
        output_name: Tên file output
    
    Returns:
        List of dict chứa dữ liệu khách hàng
    """
    try:
        # Xây dựng điều kiện lọc
        date_conditions = []
        params = []
        
        if start_date:
            date_conditions.append("created_at >= %s")
            params.append(start_date)
        
        if end_date:
            date_conditions.append("created_at < %s")
            params.append(end_date)
        
        where_clause = " AND ".join(date_conditions) if date_conditions else "1=1"
        
        print(f"⏳ Đang truy vấn dữ liệu {output_name}...")
        if start_date or end_date:
            print(f"   Từ: {start_date or 'Không giới hạn'} đến: {end_date or 'Không giới hạn'}")
        
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
                    'GMV': 0,
                    'Số đơn hàng': 0
                }
        
        print(f"📋 Đã lấy {len(customer_dict)} khách hàng")
        
        # Bước 2: Lấy GMV từ database fm_tdvn
        with conn_fm.cursor() as cur_fm:
            query_invoice = f"""
                SELECT 
                    id_customer,
                    SUM(total_amount) as total_gmv,
                    COUNT(*) as order_count
                FROM invoice
                WHERE status_value = 'Giao thành công'
                    AND {where_clause}
                    AND id_customer IS NOT NULL
                GROUP BY id_customer
            """
            # Thay thế created_at bằng time_create
            query_invoice = query_invoice.replace('created_at', 'time_create')
            cur_fm.execute(query_invoice, tuple(params))
            invoices = cur_fm.fetchall()
            
            # Cập nhật GMV vào customer_dict
            gmv_count = 0
            total_gmv = 0
            for row in invoices:
                id_customer = row[0]
                gmv_amount = float(row[1]) if row[1] else 0
                order_count = int(row[2]) if row[2] else 0
                
                if id_customer in customer_dict:
                    customer_dict[id_customer]['GMV'] = gmv_amount
                    customer_dict[id_customer]['Số đơn hàng'] = order_count
                    gmv_count += 1
                    total_gmv += gmv_amount
        
        print(f"💰 Đã tính GMV cho {gmv_count} khách hàng")
        print(f"💵 Tổng GMV: {total_gmv:,.0f} VNĐ")
        
        # Bước 3: Chuyển đổi sang list và sắp xếp theo GMV
        data = list(customer_dict.values())
        data.sort(key=lambda x: x['GMV'], reverse=True)
        
        print(f"✅ Đã lấy {len(data)} bản ghi")
        return data, output_name
            
    except Exception as e:
        print(f"❌ Lỗi khi truy vấn dữ liệu: {str(e)}")
        import traceback
        traceback.print_exc()
        return [], output_name


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
                column_letter = chr(65 + idx) if idx < 26 else chr(64 + idx // 26) + chr(65 + idx % 26)
                worksheet.column_dimensions[column_letter].width = max_length
        
        print(f"✅ Đã export Excel: {excel_filename}")
        return excel_filename
        
    except Exception as e:
        print(f"❌ Lỗi khi export Excel: {str(e)}")
        return None


def main():
    """Hàm chính để chạy export"""
    parser = argparse.ArgumentParser(description='Export dữ liệu khách hàng với GMV')
    parser.add_argument('--mode', choices=['split', 'custom', 'all'], default='split',
                      help='Chế độ export: split (chia theo 2026), custom (tùy chỉnh), all (tất cả)')
    parser.add_argument('--start', type=str, help='Ngày bắt đầu (YYYY-MM-DD)')
    parser.add_argument('--end', type=str, help='Ngày kết thúc (YYYY-MM-DD)')
    parser.add_argument('--format', choices=['csv', 'excel', 'both'], default='both',
                      help='Định dạng export: csv, excel, hoặc both')
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("🚀 BẮT ĐẦU EXPORT DỮ LIỆU KHÁCH HÀNG VÀ GMV")
    print("=" * 60)
    
    if args.mode == 'split':
        # Export dữ liệu trước 2026
        print("\n📊 PHẦN 1: Export dữ liệu TRƯỚC năm 2026")
        print("-" * 60)
        data_before, suffix_before = get_customer_gmv_data_by_date(
            end_date='2026-01-01',
            output_name='truoc_2026'
        )
        if data_before:
            if args.format in ['csv', 'both']:
                export_to_csv(data_before, suffix_before)
            if args.format in ['excel', 'both']:
                export_to_excel(data_before, suffix_before)
        
        # Export dữ liệu từ 2026 trở đi
        print("\n📊 PHẦN 2: Export dữ liệu TỪ năm 2026 trở đi")
        print("-" * 60)
        data_from, suffix_from = get_customer_gmv_data_by_date(
            start_date='2026-01-01',
            output_name='tu_2026'
        )
        if data_from:
            if args.format in ['csv', 'both']:
                export_to_csv(data_from, suffix_from)
            if args.format in ['excel', 'both']:
                export_to_excel(data_from, suffix_from)
        
        print("\n" + "=" * 60)
        print("✨ HOÀN THÀNH EXPORT DỮ LIỆU")
        print("=" * 60)
        print(f"📁 Các file đã được lưu trong thư mục: exports/")
        print(f"   - Trước 2026: {len(data_before)} bản ghi")
        print(f"   - Từ 2026: {len(data_from)} bản ghi")
        
    elif args.mode == 'custom':
        # Export với khoảng thời gian tùy chỉnh
        print("\n📊 Export dữ liệu theo khoảng thời gian tùy chỉnh")
        print("-" * 60)
        
        output_name = f"custom_{args.start or 'start'}_{args.end or 'end'}"
        data, suffix = get_customer_gmv_data_by_date(
            start_date=args.start,
            end_date=args.end,
            output_name=output_name
        )
        
        if data:
            if args.format in ['csv', 'both']:
                export_to_csv(data, suffix)
            if args.format in ['excel', 'both']:
                export_to_excel(data, suffix)
        
        print("\n" + "=" * 60)
        print("✨ HOÀN THÀNH EXPORT DỮ LIỆU")
        print("=" * 60)
        print(f"📁 Các file đã được lưu trong thư mục: exports/")
        print(f"   - Tổng: {len(data)} bản ghi")
        
    else:  # all
        # Export tất cả dữ liệu
        print("\n📊 Export TẤT CẢ dữ liệu")
        print("-" * 60)
        data, suffix = get_customer_gmv_data_by_date(output_name='tat_ca')
        
        if data:
            if args.format in ['csv', 'both']:
                export_to_csv(data, suffix)
            if args.format in ['excel', 'both']:
                export_to_excel(data, suffix)
        
        print("\n" + "=" * 60)
        print("✨ HOÀN THÀNH EXPORT DỮ LIỆU")
        print("=" * 60)
        print(f"📁 Các file đã được lưu trong thư mục: exports/")
        print(f"   - Tổng: {len(data)} bản ghi")


if __name__ == "__main__":
    main()
