import sys
import json
import urllib.request

sys.path.insert(0, '/www/wwwroot/crmdev/backend')
from database import conn_fm

PROVINCES_MAP = [
    (1, 'Hà Nội'), (2, 'Hà Giang'), (4, 'Cao Bằng'), (6, 'Bắc Kạn'), (8, 'Tuyên Quang'),
    (11, 'Điện Biên'), (12, 'Lai Châu'), (14, 'Sơn La'), (15, 'Lào Cai'), (17, 'Hòa Bình'),
    (19, 'Thái Nguyên'), (20, 'Lạng Sơn'), (22, 'Quảng Ninh'), (24, 'Bắc Ninh'), (25, 'Phú Thọ'),
    (26, 'Vĩnh Phúc'), (30, 'Hải Dương'), (31, 'Hải Phòng'), (33, 'Hưng Yên'), (34, 'Thái Bình'),
    (35, 'Hà Nam'), (36, 'Nam Định'), (37, 'Ninh Bình'), (38, 'Thanh Hóa'), (40, 'Nghệ An'),
    (42, 'Hà Tĩnh'), (44, 'Quảng Trị'), (46, 'Huế'), (48, 'Đà Nẵng'), (49, 'Quảng Nam'),
    (51, 'Quảng Ngãi'), (52, 'Gia Lai'), (54, 'Phú Yên'), (56, 'Khánh Hòa'), (58, 'Ninh Thuận'),
    (60, 'Bình Thuận'), (62, 'Kon Tum'), (66, 'Đắk Lắk'), (67, 'Đắk Nông'), (68, 'Lâm Đồng'),
    (70, 'Bình Phước'), (74, 'Bình Dương'), (75, 'Đồng Nai'), (77, 'Bà Rịa - Vũng Tàu'),
    (79, 'Hồ Chí Minh'), (80, 'Tây Ninh'), (82, 'Đồng Tháp'), (83, 'Bến Tre'), (84, 'Trà Vinh'),
    (86, 'Vĩnh Long'), (91, 'An Giang'), (92, 'Cần Thơ'), (93, 'Hậu Giang'), (94, 'Sóc Trăng'),
    (95, 'Bạc Liêu'), (96, 'Cà Mau'), (97, 'Bắc Giang'), (98, 'Yên Bái'), (99, 'Quảng Bình'),
    (100, 'Thừa Thiên Huế'), (101, 'Bình Định'), (102, 'Long An'), (103, 'Tiền Giang'), (104, 'Kiên Giang')
]

def remove_tones(input_str):
    if not input_str:
        return ''
    s1 = u'ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỴỵỶỷỸỹ'
    s0 = u'AAAAEEEIIOOOOUUYaaaaeeeiioooouuyAaDdIiUuOoUuAaAaAaAaAaAaAaAaAaAaAaAaEeEeEeEeEeEeEeEeIiIiOoOoOoOoOoOoOoOoOoOoOoOoUuUuUuUuUuUuUuYyYyYyYy'
    s = ''
    for c in input_str:
        if c in s1:
            s += s0[s1.index(c)]
        else:
            s += c
    return s.lower().strip()

def main():
    print("Fetching provinces from provinces.open-api.vn...")
    req = urllib.request.Request("https://provinces.open-api.vn/api/?depth=3", headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req, timeout=30)
    api_provinces = json.loads(resp.read().decode('utf-8'))
    print("Fetched %d provinces from open-api." % len(api_provinces))

    with conn_fm.cursor() as cur:
        # Delete any rows with empty ward or null id_ward
        cur.execute("DELETE FROM note_address WHERE id_ward IS NULL OR ward = '' OR ward IS NULL")
        conn_fm.commit()

        cur.execute("SELECT COALESCE(MAX(id_address), 0), COALESCE(MAX(id_ward), 0) FROM note_address")
        max_addr_id, max_ward_id = cur.fetchone()

        cur.execute("SELECT id_prov, id_ward, ward FROM note_address WHERE id_ward IS NOT NULL")
        existing_rows = cur.fetchall()
        existing_map = set((r[0], (r[2] or '').strip().lower()) for r in existing_rows)

        inserts = []
        next_addr_id = max_addr_id + 1
        next_ward_id = max(max_ward_id + 1, 50000)

        for p_id, p_name in PROVINCES_MAP:
            norm_db_name = remove_tones(p_name)
            matched_api_p = None
            for ap in api_provinces:
                norm_ap_name = remove_tones(ap['name'])
                if norm_db_name == norm_ap_name or norm_db_name in norm_ap_name or norm_ap_name in norm_db_name:
                    matched_api_p = ap
                    break
            
            if not matched_api_p:
                if 'huế' in norm_db_name:
                    for ap in api_provinces:
                        if 'huế' in remove_tones(ap['name']) or 'thừa thiên' in remove_tones(ap['name']):
                            matched_api_p = ap
                            break

            if not matched_api_p:
                print("Could not match: %s (%s)" % (p_name, p_id))
                continue

            # Add wards from matched province
            p_wards = []
            for d in matched_api_p.get('districts', []):
                d_name = d.get('name', '')
                for w in d.get('wards', []):
                    w_name = w.get('name', '')
                    full_w_name = "%s, %s" % (w_name, d_name)
                    if (p_id, full_w_name.lower()) not in existing_map and (p_id, w_name.lower()) not in existing_map:
                        p_wards.append((p_id, p_name, full_w_name, w.get('code')))

            print("Province '%s' (id %s): adding %d new wards" % (p_name, p_id, len(p_wards)))
            for id_prov, prov, full_ward_name, api_w_code in p_wards:
                ward_id = api_w_code if api_w_code is not None else next_ward_id
                next_ward_id += 1
                inserts.append((next_addr_id, id_prov, prov, ward_id, full_ward_name))
                existing_map.add((id_prov, full_ward_name.lower()))
                next_addr_id += 1

        print("Total rows to insert: %d" % len(inserts))
        if inserts:
            batch_size = 500
            for i in range(0, len(inserts), batch_size):
                batch = inserts[i:i+batch_size]
                cur.executemany("INSERT INTO note_address (id_address, id_prov, prov, id_ward, ward) VALUES (%s, %s, %s, %s, %s)", batch)
            conn_fm.commit()
            print("Successfully inserted %d rows into note_address!" % len(inserts))

        # Check total provinces and Nam Dinh
        cur.execute("SELECT id_prov, prov, COUNT(id_ward) FROM note_address WHERE prov ILIKE '%Nam Định%' GROUP BY id_prov, prov")
        print("Nam Dinh count:", cur.fetchall())

        cur.execute("SELECT COUNT(DISTINCT id_prov), COUNT(id_ward) FROM note_address")
        print("Total provinces with wards in DB:", cur.fetchall())

if __name__ == '__main__':
    main()
