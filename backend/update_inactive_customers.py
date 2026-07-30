import sys
from pathlib import Path
from database import conn, conn_fm

def main():
    cur_crm = conn.cursor()
    cur_fm = conn_fm.cursor()
    
    print("1. Đang lấy danh sách GMV và Recency từ bảng invoice (database fm)...")
    # Lấy tổng GMV (tất cả các đơn không hủy) và recency
    cur_fm.execute("""
        SELECT 
            code_customer,
            COALESCE(SUM(subtotal), 0) as gmv,
            EXTRACT(EPOCH FROM (NOW() - MAX(time_create))) / 86400 as recency
        FROM invoice
        WHERE id_status <> 12
        GROUP BY code_customer
    """)
    
    invoice_data = {}
    for row in cur_fm.fetchall():
        code_customer = row[0]
        if code_customer:
            gmv = float(row[1]) if row[1] else 0
            recency = float(row[2]) if row[2] else 0
            invoice_data[code_customer] = {
                "gmv": gmv,
                "recency": recency
            }
            
    print(f"   Đã tải dữ liệu hóa đơn cho {len(invoice_data)} khách hàng.")
    
    print("2. Đang tìm các khách hàng thỏa mãn điều kiện...")
    # Lấy các khách hàng "đã bàn giao" (đang gán cho nhân sự role 4 đang làm)
    cur_crm.execute("""
        SELECT kh.id_kh, kh.ma_kh, kh.id_acc, au.name
        FROM khach_hang kh
        INNER JOIN account_users au ON kh.id_acc = au.id_acc
        WHERE au.trang_thai = 'Đang làm' AND au.role_id = 4
          AND COALESCE(NULLIF(TRIM(kh.thoi_gian_tao::text), ''), NULL) IS NOT NULL
    """)
    
    handed_over_customers = cur_crm.fetchall()
    
    target_customers = []
    
    for row in handed_over_customers:
        id_kh = row[0]
        ma_kh = row[1]
        current_id_acc = row[2]
        current_acc_name = row[3]
        
        # Bỏ qua nếu đã được gán cho id_acc = 3 (chính là SUBADMIN)
        if current_id_acc == 3:
            continue
            
        data = invoice_data.get(ma_kh, {"gmv": 0, "recency": 0})
        gmv = data["gmv"]
        recency = data["recency"]
        
        # Điều kiện:
        # GMV = 0 (Chưa mua lần nào)
        # HOẶC (Cấp VIP là 0 (gmv < 1,000,000) VÀ lần mua cuối > 300 ngày)
        if gmv == 0 or (gmv < 1000000 and recency > 300):
            target_customers.append({
                "id_kh": id_kh,
                "ma_kh": ma_kh,
                "gmv": gmv,
                "recency": recency,
                "id_acc": current_id_acc,
                "acc_name": current_acc_name
            })
            
    print(f"   Tìm thấy tổng cộng {len(target_customers)} khách hàng cần cập nhật/thu hồi.")
    
    if len(target_customers) == 0:
        print("Không có khách hàng nào cần cập nhật. Kết thúc.")
        return
        
    print("\n3. Bắt đầu xử lý...")
    if len(sys.argv) > 1 and sys.argv[1] == "--execute":
        print("   Đang cập nhật database (chuyển về id_acc=3, nhan_vien_pt='SUBADMIN')...")
        update_count = 0
        for cust in target_customers:
            cur_crm.execute("""
                UPDATE khach_hang 
                SET id_acc = 3, nhan_vien_pt = 'SUBADMIN'
                WHERE id_kh = %s
            """, (cust["id_kh"],))
            update_count += 1
            
        conn.commit()
        print(f"✅ HOÀN TẤT: Đã thu hồi thành công {update_count} khách hàng về kho SUBADMIN.")
    else:
        print("ℹ️  Đây là chế độ CHẠY THỬ (Dry run). Database CHƯA BỊ THAY ĐỔI.")
        print("   Dưới đây là 10 khách hàng ví dụ sẽ bị thu hồi:")
        for i, cust in enumerate(target_customers[:10]):
            status_desc = "Chưa mua lần nào" if cust["gmv"] == 0 else "VIP 0, quá 300 ngày"
            print(f"   {i+1}. Mã KH: {cust['ma_kh']} | GMV: {cust['gmv']:,.0f} đ | Recency: {cust['recency']:.0f} ngày | NV hiện tại: {cust['acc_name']} (Lý do: {status_desc})")
        
        print("\n👉 Để THỰC SỰ cập nhật database, hãy chạy lệnh:")
        print("   venv/bin/python update_inactive_customers.py --execute")

    cur_crm.close()
    cur_fm.close()

if __name__ == "__main__":
    main()
