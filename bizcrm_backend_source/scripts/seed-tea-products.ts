import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface ProductData {
  name: string
  code: string
  slug: string
  categorySlug: string
  description: string
  specs: Record<string, any>
  tags: string[]
  price?: number
}

const CATEGORIES = [
  {
    name: 'Trà Xanh Thái Nguyên & Hồng Trà',
    slug: 'tra-xanh-thai-nguyen',
    description: 'Các dòng trà đinh, trà nõn tôm, trà móc câu Thái Nguyên và hồng trà Shan Tuyết cổ thụ.',
    sortOrder: 1,
  },
  {
    name: 'Bộ Trà Cụ & Ấm Chén Bát Tràng',
    slug: 'tra-cu-am-chen',
    description: 'Bộ ấm chén, hũ đựng trà, tống trà, gạt tàn gốm sứ Bát Tràng thủ công cao cấp.',
    sortOrder: 2,
  },
  {
    name: 'Bánh Kẹo Quà Quê Thưởng Trà (TraBa)',
    slug: 'banh-keo-thuong-tra',
    description: 'Bánh chè lam matcha, chè lam mật, kẹo lạc đỏ, kẹo vừng ta, kẹo dồi ăn kèm thưởng trà.',
    sortOrder: 3,
  },
]

const PRODUCTS: ProductData[] = [
  {
    name: 'Trà Đinh Ngọc',
    code: 'SP-TRA-DINH-NGOC',
    slug: 'tra-dinh-ngoc',
    categorySlug: 'tra-xanh-thai-nguyen',
    description: 'TRÀ ĐINH NGỌC - TINH HOA TRÀ XANH THÁI NGUYÊN - CỰC HIẾM.\nTrà Đinh Ngọc là dòng trà tinh hoa bậc nhất của Thái Nguyên – được xem như “ngọc trong trà”, biểu trưng cho sự tinh khiết và quý giá.\n(Chỉ nhận đặt hàng trước khi thu hái)\n\n• Nguồn gốc & Xuất xứ: Được thu hái thủ công từ những búp đinh chè non của giống chè Long Vân trứ danh tại Thái Nguyên - Việt Nam.\n• Hương – Vị – Sắc: Hương cốm non rất đặc trưng của dòng trà quý, thoảng hương - Tiền vị chát thanh - Hậu vị ngọt thơm, dư vị đậm đà - Sắc trà xanh cốm non.\n• Cánh trà: Đinh trà (100%) nhỏ & thẳng đều, xoăn, dầy búp đinh.\n• Quy cách đóng gói: Hộp mica 200G (đóng theo ấm) & Hộp thiếc - 200G, Túi 100G hoặc theo yêu cầu của khách hàng.\n• Cách pha: Trà pha với nước sôi ở nhiệt độ phù hợp nhất khoảng 85 - 90 độ. Mỗi ấm pha từ 8 - 10 gram với 200ml nước.\n• Bảo quản: Có kẹp chống ẩm hoặc hộp bảo quản, bảo quản tủ mát 0 - 5 độ.\n• Hạn sử dụng: 24 tháng. Tiêu chuẩn ISO 22000:2018.',
    specs: {
      origin: 'Long Vân, Thái Nguyên',
      flavor: 'Hương cốm non đặc trưng, chát thanh, hậu ngọt thơm sâu',
      color: 'Xanh cốm non',
      leaf_shape: 'Đinh trà 100% nhỏ thẳng đều',
      packaging: 'Hộp mica 200g, Hộp thiếc 200g, Túi 100g',
      brewing_temp: '85 - 90°C',
      shelf_life: '24 tháng',
      standard: 'ISO 22000:2018',
    },
    tags: ['tra_dinh', 'cao_cap', 'long_van', 'tinh_hoa', 'thai_nguyen', 'qua_bieu'],
  },
  {
    name: 'Vạn Thịnh Trà',
    code: 'SP-VAN-THINH-TRA',
    slug: 'van-thinh-tra',
    categorySlug: 'tra-xanh-thai-nguyen',
    description: 'VẠN THỊNH TRÀ - TRÀ XANH THÁI NGUYÊN - TRÀ ĐINH THƯỢNG HẠNG.\nVạn Thịnh Trà mang ý nghĩa thịnh vượng và trường tồn, hưng thịnh sung túc.\n(Rất phù hợp làm đồ lễ trưng bày trên ban thờ gia tiên, thần tài hoặc nơi thờ phụng, quà biếu ngoại giao cao cấp)\n\n• Nguồn gốc & Xuất xứ: Thu hái thủ công từ búp đinh chè non giống Long Vân Thái Nguyên.\n• Hương - Vị - Sắc: Hương thơm cốm non thuần khiết - Tiền vị chát dịu - Hậu vị ngọt sâu - Sắc trà xanh cốm non đầu mùa.\n• Cánh trà: Đinh trà (~100%), nhỏ & thẳng đều, xoăn, mảnh búp đinh.\n• Quy cách: Túi kraft 100G - 500G, Hộp thiếc 100G, Hộp mica 200G.\n• Cách pha: Nước sôi 85 - 90 độ, pha 8 - 10g với 200ml nước.\n• Hạn sử dụng: 24 tháng. Tiêu chuẩn ISO 22000:2018.',
    specs: {
      origin: 'Long Vân, Thái Nguyên',
      flavor: 'Hương cốm non thuần khiết, chát dịu, hậu ngọt sâu',
      color: 'Xanh cốm non đầu mùa',
      leaf_shape: 'Đinh trà ~100%',
      packaging: 'Túi kraft 100g - 500g, Hộp thiếc 100g, Hộp mica 200g',
      brewing_temp: '85 - 90°C',
      shelf_life: '24 tháng',
      standard: 'ISO 22000:2018',
    },
    tags: ['tra_dinh', 'thuong_hang', 'long_van', 'le_than_tai', 'qua_bieu'],
  },
  {
    name: 'Vạn Khang Trà',
    code: 'SP-VAN-KHANG-TRA',
    slug: 'van-khang-tra',
    categorySlug: 'tra-xanh-thai-nguyen',
    description: 'VẠN KHANG TRÀ - TRÀ XANH THÁI NGUYÊN - TRÀ ĐINH HẢO HẠNG.\nVạn Khang Trà ngụ ý tâm thân an hòa, khỏe mạnh, vạn sự khang.\n(Rất phù hợp cho việc biếu tặng lời chúc sức khỏe)\n\n• Nguồn gốc & Xuất xứ: Thu hái thủ công từ búp đinh chè non của giống Thanh Trà trứ danh tại Thái Nguyên.\n• Hương - Vị - Sắc: Hương cốm non thơm dịu - Tiền vị chát nhẹ - Hậu vị ngọt nhẹ - Sắc trà xanh cốm non ánh xanh.\n• Cánh trà: Đinh trà (~80%) & nõn tôm trà.\n• Quy cách: Túi kraft 100G - 500G, Hộp thiếc 100G, Hộp mica 200G.\n• Cách pha: Nước sôi 85 - 90 độ, pha 8 - 10g với 200ml nước.\n• Hạn sử dụng: 24 tháng. Tiêu chuẩn ISO 22000:2018.',
    specs: {
      origin: 'Thanh Trà, Thái Nguyên',
      flavor: 'Hương cốm non thơm dịu, chát nhẹ, hậu ngọt nhẹ',
      color: 'Xanh cốm non ánh xanh',
      leaf_shape: 'Đinh trà (~80%) & nõn tôm',
      packaging: 'Túi kraft 100g - 500g, Hộp thiếc 100g, Hộp mica 200g',
      brewing_temp: '85 - 90°C',
      shelf_life: '24 tháng',
      standard: 'ISO 22000:2018',
    },
    tags: ['tra_dinh', 'hao_hang', 'thanh_tra', 'chuc_suc_khoe', 'qua_bieu'],
  },
  {
    name: 'Vạn Hỷ Trà',
    code: 'SP-VAN-HY-TRA',
    slug: 'van-hy-tra',
    categorySlug: 'tra-xanh-thai-nguyen',
    description: 'VẠN HỶ TRÀ - TRÀ XANH THÁI NGUYÊN - TRÀ ĐINH NÕN THƯỢNG HẠNG.\nVạn Hỷ Trà ngụ ý người uống cảm nhận được nhiều niềm vui, hoan hỷ trong khi thưởng thức.\n(Rất phù hợp làm quà, tráp lễ, lễ cho việc hỷ, hoặc giỏ quà tặng)\n\n• Nguồn gốc & Xuất xứ: Búp đinh non giống chè Thanh Trà & Long Vân Thái Nguyên.\n• Hương - Vị - Sắc: Hương cốm non thoảng thơm - Tiền vị chát nhẹ - Hậu vị ngọt nhẹ - Sắc trà xanh ánh vàng.\n• Cánh trà: Đinh trà (~70%) & nõn tôm trà.\n• Quy cách: Túi kraft 100G - 500G, Hộp thiếc 100G, Hộp mica 200G.\n• Cách pha: Nước sôi 85 - 90 độ, pha 8 - 12g với 200ml nước.\n• Hạn sử dụng: 24 tháng. Tiêu chuẩn ISO 22000:2018.',
    specs: {
      origin: 'Thanh Trà & Long Vân, Thái Nguyên',
      flavor: 'Hương cốm thoảng thơm, chát nhẹ, hậu ngọt nhẹ',
      color: 'Xanh ánh vàng',
      leaf_shape: 'Đinh trà (~70%) & nõn tôm',
      packaging: 'Túi kraft 100g - 500g, Hộp thiếc 100g, Hộp mica 200g',
      brewing_temp: '85 - 90°C',
      shelf_life: '24 tháng',
      standard: 'ISO 22000:2018',
    },
    tags: ['tra_dinh_non', 'thuong_hang', 'trap_le', 'le_hy', 'qua_tang'],
  },
  {
    name: 'Vạn Thọ Trà',
    code: 'SP-VAN-THO-TRA',
    slug: 'van-tho-tra',
    categorySlug: 'tra-xanh-thai-nguyen',
    description: 'VẠN THỌ TRÀ - TRÀ XANH THÁI NGUYÊN - TRÀ NÕN TÔM THƯỢNG HẠNG.\nVạn Thọ Trà gửi gắm ước nguyện trường thọ, thêm bền sức tuổi thọ kéo dài.\n(Rất phù hợp cho việc làm quà, tráp lễ, lễ chúc thọ hoặc chúc người nhận sức khỏe dồi dào - trường thọ)\n\n• Nguồn gốc & Xuất xứ: Búp chè nõn tôm non (1 tôm - 1 lá) giống Thanh Trà & Long Vân Thái Nguyên.\n• Hương - Vị - Sắc: Hương thơm cốm non dịu nhẹ – Tiền vị chát dịu êm – Hậu vị ngọt thanh – Sắc nước trà xanh ánh vàng.\n• Cánh trà: Nõn tôm, hơi cong, săn chắc và đều nhau.\n• Quy cách: Túi kraft 100G - 500G, Hộp thiếc 100G.\n• Cách pha: Nước sôi 85 - 90 độ, pha 10 - 12g với 200ml nước.\n• Hạn sử dụng: 24 tháng. Tiêu chuẩn ISO 22000:2018.',
    specs: {
      origin: 'Thanh Trà & Long Vân, Thái Nguyên',
      flavor: 'Hương cốm non dịu nhẹ, chát dịu êm, hậu ngọt thanh',
      color: 'Xanh ánh vàng',
      leaf_shape: 'Nõn tôm (1 tôm 1 lá) hơi cong săn chắc',
      packaging: 'Túi kraft 100g - 500g, Hộp thiếc 100g',
      brewing_temp: '85 - 90°C',
      shelf_life: '24 tháng',
      standard: 'ISO 22000:2018',
    },
    tags: ['tra_non_tom', 'thuong_hang', 'chuc_tho', 'suc_khoe', 'qua_tang'],
  },
  {
    name: 'Vạn Lộc Trà',
    code: 'SP-VAN-LOC-TRA',
    slug: 'van-loc-tra',
    categorySlug: 'tra-xanh-thai-nguyen',
    description: 'VẠN LỘC TRÀ - TRÀ XANH THÁI NGUYÊN - TRÀ NÕN TÔM HẢO HẠNG.\nVạn Lộc Trà ngụ ý để mỗi ngụm trà như mở ra nguồn tài lộc và sung túc, giàu tiền tài.\n(Rất phù hợp thắp hương gia tiên, thần tài, cầu lộc hoặc biếu tặng ý nghĩa)\n\n• Nguồn gốc & Xuất xứ: Búp chè nõn tôm non (1 tôm - 1 lá) giống Thanh Trà Thái Nguyên.\n• Hương - Vị - Sắc: Hương thơm thanh dịu – Tiền vị chát vừa phải – Hậu vị ngọt thanh – Sắc nước trà vàng ánh xanh.\n• Cánh trà: Nõn tôm, hơi cong, săn chắc và đều nhau.\n• Quy cách: Túi kraft 100G - 500G, Hộp thiếc 100G.\n• Cách pha: Nước sôi 85 - 90 độ, pha 10 - 15g với 200ml nước.\n• Hạn sử dụng: 24 tháng. Tiêu chuẩn ISO 22000:2018.',
    specs: {
      origin: 'Thanh Trà, Thái Nguyên',
      flavor: 'Hương thanh dịu, chát vừa phải, hậu ngọt thanh',
      color: 'Vàng ánh xanh',
      leaf_shape: 'Nõn tôm (1 tôm 1 lá)',
      packaging: 'Túi kraft 100g - 500g, Hộp thiếc 100g',
      brewing_temp: '85 - 90°C',
      shelf_life: '24 tháng',
      standard: 'ISO 22000:2018',
    },
    tags: ['tra_non_tom', 'hao_hang', 'thap_huong', 'cau_tai_loc', 'qua_bieu'],
  },
  {
    name: 'Vạn Phúc Trà',
    code: 'SP-VAN-PHUC-TRA',
    slug: 'van-phuc-tra',
    categorySlug: 'tra-xanh-thai-nguyen',
    description: 'VẠN PHÚC TRÀ - TRÀ XANH THÁI NGUYÊN - TRÀ MÓC CÂU THƯỢNG HẠNG.\nVạn Phúc Trà mang ý nghĩa phúc khí viên mãn, may mắn trọn vẹn, an vui và đủ đầy hạnh phúc.\n(Rất phù hợp làm lễ, tráp lễ, thắp hương hiếu hỷ, cầu phúc, cầu lộc, cầu tài)\n\n• Nguồn gốc & Xuất xứ: Búp chè 1 tôm 2 lá giống Thanh Trà Thái Nguyên.\n• Hương - Vị - Sắc: Hương thơm thanh dịu – Tiền vị chát đậm – Hậu vị ngọt thanh – Sắc nước vàng ánh xanh.\n• Cánh trà: Cong hình móc câu, săn chắc, đều nhau.\n• Quy cách: Túi kraft 100G - 500G, Hộp thiếc 100G.\n• Cách pha: Nước sôi 85 - 90 độ, pha 10 - 15g với 200ml nước.\n• Hạn sử dụng: 24 tháng. Tiêu chuẩn ISO 22000:2018.',
    specs: {
      origin: 'Thanh Trà, Thái Nguyên',
      flavor: 'Hương thanh dịu, chát đậm, hậu ngọt thanh',
      color: 'Vàng ánh xanh',
      leaf_shape: 'Móc câu 1 tôm 2 lá',
      packaging: 'Túi kraft 100g - 500g, Hộp thiếc 100g',
      brewing_temp: '85 - 90°C',
      shelf_life: '24 tháng',
      standard: 'ISO 22000:2018',
    },
    tags: ['tra_moc_cau', 'thuong_hang', 'thap_huong', 'cau_phuc', 'qua_bieu'],
  },
  {
    name: 'Mạn Thái Trà',
    code: 'SP-MAN-THAI-TRA',
    slug: 'man-thai-tra',
    categorySlug: 'tra-xanh-thai-nguyen',
    description: 'MẠN THÁI TRÀ - TRÀ XANH THÁI NGUYÊN - TRÀ MÓC CÂU TRUYỀN THỐNG.\nMạn Thái Trà mang ý nghĩa tinh hoa truyền thống trà mạn Việt Nam.\n(Phù hợp với khách hàng uống đậm vị, yêu thích trà truyền thống & pha cho tập thể dùng ở mức bình dân)\n\n• Nguồn gốc & Xuất xứ: Búp chè 1 tôm 2 lá giống chè Trung Du Thái Nguyên.\n• Hương - Vị - Sắc: Hương thơm dịu nhẹ – Tiền vị chát đậm – Hậu vị ngọt thanh – Sắc nước vàng ánh xanh.\n• Cánh trà: Cánh cong hình móc câu, săn chắc và đều nhau.\n• Quy cách: Túi Zip 100G - 500G.\n• Cách pha: Nước sôi 85 - 90 độ, pha 10 - 15g với 200ml nước.\n• Hạn sử dụng: 24 tháng. Tiêu chuẩn ISO 22000:2018.',
    specs: {
      origin: 'Trung Du, Thái Nguyên',
      flavor: 'Đậm vị truyền thống, chát đậm, hậu ngọt thanh',
      color: 'Vàng ánh xanh',
      leaf_shape: 'Móc câu Trung Du',
      packaging: 'Túi Zip 100g - 500g',
      brewing_temp: '85 - 90°C',
      shelf_life: '24 tháng',
      standard: 'ISO 22000:2018',
    },
    tags: ['tra_mạn', 'truyen_thong', 'dam_vi', 'binh_dan', 'uong_hang_ngay'],
  },
  {
    name: 'Hồng Hỷ Trà',
    code: 'SP-HONG-HY-TRA',
    slug: 'hong-hy-tra',
    categorySlug: 'tra-xanh-thai-nguyen',
    description: 'HỒNG HỶ TRÀ - HỒNG TRÀ SHAN TUYẾT CỔ THỤ.\nHồng Hỷ Trà mang ý nghĩa niềm vui và sự may mắn, hoan hỷ trong cuộc sống, tâm trạng phấn khởi, lạc quan.\n(Hồng trà đáp ứng nhiều lứa tuổi & giới tính, nhẹ nhàng, thanh tao & đặc biệt phù hợp uống buổi tối không lo mất ngủ)\n\n• Nguồn gốc & Xuất xứ: Búp trà non 1 tôm 1-2 lá từ cây chè Shan Tuyết cổ thụ trên núi cao Hà Giang, Yên Bái.\n• Hương - Vị - Sắc: Hương thơm mật ong, lúa mạch và trái cây chín tự nhiên - Vị ngọt dịu, thanh thoát không gắt - Hậu ngọt thanh - Sắc nước trà đỏ hồng ngọc.\n• Cánh trà: Xoăn chặt, đều, màu nâu đen có xen lẫn ánh kim và tơ trà.\n• Quy cách: Hộp thiếc - 80G.\n• Cách pha: Nước sôi 90 - 95 độ C, pha 5 - 8g với 200ml nước, hãm được nhiều lần.\n• Hạn sử dụng: 24 tháng. Tiêu chuẩn ISO 22000:2018.',
    specs: {
      origin: 'Shan Tuyết cổ thụ Hà Giang / Yên Bái',
      flavor: 'Mật ong, lúa mạch, trái cây chín, ngọt dịu thanh thoát',
      color: 'Đỏ hồng ngọc',
      leaf_shape: 'Cánh xoăn chặt màu nâu đen ánh kim',
      packaging: 'Hộp thiếc 80g',
      brewing_temp: '90 - 95°C',
      shelf_life: '24 tháng',
      standard: 'ISO 22000:2018',
    },
    tags: ['hong_tra', 'shan_tuyet', 'co_thu', 'uong_buoi_toi', 'khong_mat_ngu'],
  },
  {
    name: 'Bộ ấm chén: Quý tộc sơn thủy',
    code: 'SP-AM-CHEN-SON-THUY',
    slug: 'bo-am-chen-quy-toc-son-thuy',
    categorySlug: 'tra-cu-am-chen',
    description: 'BỘ ẤM CHÉN BÁT TRÀNG – QUÝ TỘC SƠN THỦY.\nTượng trưng cho sự bền vững, hòa hợp và an yên. Mang thiên nhiên thu nhỏ về trong không gian sống.\n(Lý tưởng để thưởng trà, tiếp khách trang trọng, hay làm quà tặng cao cấp)\n\n• Chất liệu & Chế tác: Đất sét cao cấp Bát Tràng, nung 1200–1300°C bền chắc, giữ nhiệt tốt.\n• Họa tiết: Sơn thủy xanh lam vẽ tay trên nền men tro trắng mịn, viền vàng nâu thanh lịch.\n• Bộ sản phẩm gồm: 1 ấm dung tích 350ml, 6 chén nhỏ kèm đĩa lót đồng bộ.',
    specs: {
      origin: 'Làng gốm Bát Tràng, Hà Nội',
      set_items: '1 ấm 350ml + 6 chén + 6 đĩa lót',
      material: 'Đất sét nung 1200-1300°C',
      pattern: 'Sơn thủy xanh lam vẽ tay viền vàng nâu',
    },
    tags: ['am_chen', 'bat_trang', 'son_thuy', 'thu_cong', 'qua_tang_cao_cap'],
  },
  {
    name: 'Bộ ấm chén: Trúc lâm thất hiền',
    code: 'SP-AM-CHEN-TRUC-LAM',
    slug: 'bo-am-chen-truc-lam-that-hien',
    categorySlug: 'tra-cu-am-chen',
    description: 'BỘ ẤM CHÉN BÁT TRÀNG – TRÚC LÂM THẤT HIỀN.\nBiểu tượng của sự thanh cao, thoát tục, yêu thiên nhiên và nghệ thuật của bảy bậc hiền nhân.\n\n• Chất liệu: Đất sét cao cấp nung ở 1200–1300°C cho độ bền chắc và giữ nhiệt tốt.\n• Họa tiết: Bảy vị hiền nhân quây quần dưới rừng trúc vẽ tay màu xanh lam trên nền men trắng mịn viền vàng nâu.\n• Bộ sản phẩm gồm: 1 ấm 350ml, 6 chén nhỏ kèm đĩa lót.',
    specs: {
      origin: 'Làng gốm Bát Tràng',
      set_items: '1 ấm 350ml + 6 chén + 6 đĩa lót',
      material: 'Đất sét nung 1200-1300°C',
      pattern: 'Trúc Lâm Thất Hiền vẽ tay',
    },
    tags: ['am_chen', 'bat_trang', 'truc_lam', 'tao_nha', 'qua_tang'],
  },
  {
    name: 'Bộ ấm chén: Cúc cổ trường thọ',
    code: 'SP-AM-CHEN-CUC-CO',
    slug: 'bo-am-chen-cuc-co-truong-tho',
    categorySlug: 'tra-cu-am-chen',
    description: 'BỘ ẤM CHÉN BÁT TRÀNG – CÚC CỔ TRƯỜNG THỌ.\nHoa cúc là biểu tượng của sự trường thọ, sức khỏe và may mắn viên mãn.\n(Lý tưởng thưởng trà, tiếp khách quý, quà tặng mừng thọ, lễ Tết)\n\n• Bộ sản phẩm gồm: 1 ấm tích, 6 chén và 1 khay sứ trang trí đồng bộ.\n• Họa tiết: Hoa cúc cổ vẽ tay màu xanh lam trên nền men trắng ngà bóng mịn viền vàng nâu tinh tế.',
    specs: {
      origin: 'Làng gốm Bát Tràng',
      set_items: '1 ấm tích + 6 chén + 1 khay sứ',
      material: 'Đất sét cao cấp nung 1200-1300°C',
      pattern: 'Hoa cúc cổ vẽ tay',
    },
    tags: ['am_chen', 'bat_trang', 'cuc_co', 'mung_tho', 'qua_tet'],
  },
  {
    name: 'Bộ ấm chén: Hoa Sen Xanh',
    code: 'SP-AM-CHEN-SEN-XANH',
    slug: 'bo-am-chen-hoa-sen-xanh',
    categorySlug: 'tra-cu-am-chen',
    description: 'BỘ ẤM CHÉN BÁT TRÀNG – HOA SEN XANH.\nMen kem hoa sen xanh thanh nhã, biểu tượng thuần khiết và bình an.\n\n• Bộ sản phẩm gồm: 1 ấm dung tích 450ml, 6 chén nhỏ kèm đĩa kê.\n• Chất liệu: Phủ men kem trắng ngà bóng mịn, không bám cặn trà, dễ vệ sinh.',
    specs: {
      origin: 'Làng gốm Bát Tràng',
      set_items: '1 ấm 450ml + 6 chén + 6 đĩa kê',
      material: 'Gốm men kem Bát Tràng',
      pattern: 'Hoa sen xanh vẽ tay',
    },
    tags: ['am_chen', 'bat_trang', 'hoa_sen', 'men_kem', 'thanh_tao'],
  },
  {
    name: 'Hũ đựng trà: Sơn thủy hữu tình',
    code: 'SP-HU-TRA-SON-THUY',
    slug: 'hu-dung-tra-son-thuy-huu-tinh',
    categorySlug: 'tra-cu-am-chen',
    description: 'HŨ ĐỰNG TRÀ BÁT TRÀNG – SƠN THỦY HỮU TÌNH.\nGốm sứ Bát Tràng nung 1200-1300°C, họa tiết sơn thủy xanh lam viền vàng nâu.\n• Thiết kế: Dáng trụ tròn thân phình nhẹ, nắp đậy khít chống ẩm mốc giữ nguyên hương trà.\n• Dung tích: 200–300g trà.',
    specs: {
      origin: 'Làng gốm Bát Tràng',
      capacity: '200g - 300g trà',
      pattern: 'Sơn thủy hữu tình',
    },
    tags: ['tra_cu', 'hu_tra', 'bat_trang', 'bao_quan_tra'],
  },
  {
    name: 'Tống trà: Sơn thủy hữu tình',
    code: 'SP-TONG-TRA-SON-THUY',
    slug: 'tong-tra-son-thuy-huu-tinh',
    categorySlug: 'tra-cu-am-chen',
    description: 'TỐNG TRÀ BÁT TRÀNG – SƠN THỦY HỮU TÌNH.\nDùng trung chuyển trà từ ấm sang các chén nhỏ, giúp hương vị và màu nước trà đồng đều.\n• Dung tích: 150–200ml, quai cầm nhỏ gọn vừa tay.\n• Họa tiết sơn thủy hữu tình vẽ tay viền vàng nâu đồng bộ.',
    specs: {
      origin: 'Làng gốm Bát Tràng',
      capacity: '150ml - 200ml',
      pattern: 'Sơn thủy hữu tình',
    },
    tags: ['tra_cu', 'tong_tra', 'bat_trang', 'chuyen_tra'],
  },
  {
    name: 'Gạt tàn: Sơn thủy hữu tình',
    code: 'SP-GAT-TAN-SON-THUY',
    slug: 'gat-tan-son-thuy-huu-tinh',
    categorySlug: 'tra-cu-am-chen',
    description: 'GẠT TÀN BÁT TRÀNG – SƠN THỦY HỮU TÌNH.\nGốm sứ Bát Tràng cao cấp men trắng ngà vẽ sơn thủy xanh lam viền vàng nâu sang trọng cho bàn trà tiếp khách.',
    specs: { origin: 'Làng gốm Bát Tràng', pattern: 'Sơn thủy hữu tình' },
    tags: ['tra_cu', 'gat_tan', 'bat_trang', 'phu_kien_ban_tra'],
  },
  {
    name: 'Lọ đựng tăm: Sơn thủy hữu tình',
    code: 'SP-LO-TAM-SON-THUY',
    slug: 'lo-dung-tam-son-thuy-huu-tinh',
    categorySlug: 'tra-cu-am-chen',
    description: 'LỌ ĐỰNG TĂM BÁT TRÀNG – SƠN THỦY HỮU TÌNH.\nDáng trụ nhỏ gọn, nắp đậy khít bảo vệ tăm khỏi bụi và ẩm, trang trí bàn trà đồng bộ.',
    specs: { origin: 'Làng gốm Bát Tràng', pattern: 'Sơn thủy hữu tình' },
    tags: ['tra_cu', 'lo_tam', 'bat_trang', 'phu_kien_ban_tra'],
  },
  {
    name: 'Bánh chè lam matcha',
    code: 'SP-BANH-CHE-LAM-MATCHA',
    slug: 'banh-che-lam-matcha',
    categorySlug: 'banh-keo-thuong-tra',
    description: 'BÁNH CHÈ LAM MATCHA (Thương hiệu TraBa).\nGiao thoa tinh tế giữa quà quê Bắc Bộ và matcha tự nhiên.\n• Nguyên liệu: Bột gạo nếp Ruộng Rươi sinh thái Tứ Kỳ – Hải Dương (thuần khiết, không hóa chất), matcha tự nhiên, mật mía, lạc rang, gừng tươi.\n• Không sử dụng chất bảo quản. Dẻo mềm, ngọt thanh, bùi béo cay ấm dịu.\n• Rất hợp khi thưởng thức cùng một chén trà xanh Thái Nguyên ấm nóng.',
    specs: {
      brand: 'TraBa',
      ingredients: 'Nếp ruộng rươi Tứ Kỳ, Matcha tự nhiên, Mật mía, Lạc rang, Gừng tươi',
      preservatives: 'Không chất bảo quản',
      pairing: 'Trà xanh Thái Nguyên ấm nóng',
    },
    tags: ['banh_che_lam', 'matcha', 'nep_ruong_ruoi', 'traba', 'an_kem_tra'],
  },
  {
    name: 'Bánh chè lam mật',
    code: 'SP-BANH-CHE-LAM-MAT',
    slug: 'banh-che-lam-mat',
    categorySlug: 'banh-keo-thuong-tra',
    description: 'BÁNH CHÈ LAM MẬT (Thương hiệu TraBa).\nQuà quê truyền thống đồng bằng Bắc Bộ.\n• Nguyên liệu: Bột gạo nếp Ruộng Rươi Tứ Kỳ – Hải Dương, mật mía nguyên chất, lạc rang, gừng tươi.\n• Nấu thủ công truyền thống, không chất bảo quản. Màu nâu óng tự nhiên, dẻo thơm, ngọt thanh dịu ấm.',
    specs: {
      brand: 'TraBa',
      ingredients: 'Nếp ruộng rươi Tứ Kỳ, Mật mía nguyên chất, Lạc rang, Gừng tươi',
      preservatives: 'Không chất bảo quản',
      pairing: 'Trà xanh Thái Nguyên ấm nóng',
    },
    tags: ['banh_che_lam', 'mat_mia', 'nep_ruong_ruoi', 'traba', 'an_kem_tra'],
  },
  {
    name: 'Kẹo lạc đỏ',
    code: 'SP-KEO-LAC-DO',
    slug: 'keo-lac-do',
    categorySlug: 'banh-keo-thuong-tra',
    description: 'KẸO LẠC ĐỎ (Thương hiệu TraBa).\nQuà quê dân dã truyền thống Bắc Bộ.\n• Nguyên liệu: Hạt lạc đỏ bản địa chắc mẩy từ vùng trồng Vân Hồ – Sơn La, mạch nha, mật mía ngọt dịu tự nhiên.\n• Không chất bảo quản, bùi béo giòn tan, ngọt thanh không gắt.',
    specs: {
      brand: 'TraBa',
      origin: 'Vân Hồ - Sơn La',
      ingredients: 'Lạc đỏ bản địa, Mạch nha, Mật mía',
      preservatives: 'Không chất bảo quản',
    },
    tags: ['keo_lac', 'lac_do', 'van_ho_son_la', 'traba', 'an_kem_tra'],
  },
  {
    name: 'Kẹo vừng ta',
    code: 'SP-KEO-VUNG-TA',
    slug: 'keo-vung-ta',
    categorySlug: 'banh-keo-thuong-tra',
    description: 'KẸO VỪNG TA (Thương hiệu TraBa).\n• Nguyên liệu: Hạt vừng bản địa thu hoạch tại Vân Hồ – Sơn La rang chín vàng thơm béo, mạch nha, mật mía ngọt dịu.\n• Không chất bảo quản, thơm nồng bùi béo, ngọt thanh dễ ăn.',
    specs: {
      brand: 'TraBa',
      origin: 'Vân Hồ - Sơn La',
      ingredients: 'Vừng ta bản địa, Mạch nha, Mật mía',
      preservatives: 'Không chất bảo quản',
    },
    tags: ['keo_vung', 'vung_ta', 'van_ho_son_la', 'traba', 'an_kem_tra'],
  },
  {
    name: 'Kẹo dồi lạc đỏ',
    code: 'SP-KEO-DOI-LAC-DO',
    slug: 'keo-doi-lac-do',
    categorySlug: 'banh-keo-thuong-tra',
    description: 'KẸO DỒI LẠC ĐỎ (Thương hiệu TraBa).\n• Nguyên liệu: Lạc đỏ và vừng rang chín vàng từ vùng trồng Vân Hồ – Sơn La, nha và mật mía ngọt dịu.\n• Vỏ đường nha trắng giòn xốp rắc vừng, nhân lạc đỏ giòn tan bùi béo.',
    specs: {
      brand: 'TraBa',
      origin: 'Vân Hồ - Sơn La',
      ingredients: 'Lạc đỏ, Vừng rang, Mạch nha, Mật mía',
      preservatives: 'Không chất bảo quản',
    },
    tags: ['keo_doi', 'lac_do', 'van_ho_son_la', 'traba', 'an_kem_tra'],
  },
]

async function seed() {
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } })
  console.log(`Seeding products for ${orgs.length} organization(s)...`)

  for (const org of orgs) {
    console.log(`\n▶ Processing org: ${org.name} (${org.id})`)

    // 1. Create / Upsert categories
    const categoryMap = new Map<string, string>()
    for (const cat of CATEGORIES) {
      const createdCat = await prisma.productCategory.upsert({
        where: { orgId_slug: { orgId: org.id, slug: cat.slug } },
        update: { name: cat.name, description: cat.description, sortOrder: cat.sortOrder },
        create: {
          orgId: org.id,
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
          sortOrder: cat.sortOrder,
        },
      })
      categoryMap.set(cat.slug, createdCat.id)
      console.log(`  ✓ Category: ${cat.name} (${createdCat.id})`)
    }

    // 2. Create / Upsert products
    for (let i = 0; i < PRODUCTS.length; i++) {
      const p = PRODUCTS[i]
      const categoryId = categoryMap.get(p.categorySlug) || null

      const createdProduct = await prisma.product.upsert({
        where: { orgId_slug: { orgId: org.id, slug: p.slug } },
        update: {
          name: p.name,
          code: p.code,
          categoryId,
          description: p.description,
          specs: p.specs,
          tags: p.tags,
          sortOrder: i + 1,
          status: 'active',
        },
        create: {
          orgId: org.id,
          name: p.name,
          code: p.code,
          slug: p.slug,
          categoryId,
          description: p.description,
          specs: p.specs,
          tags: p.tags,
          sortOrder: i + 1,
          status: 'active',
          priceType: 'contact',
          currency: 'VND',
        },
      })
      console.log(`  ✓ [${i + 1}/${PRODUCTS.length}] Product: ${p.name} (${createdProduct.code})`)
    }
  }

  console.log('\n🎉 ALL PRODUCTS SEEDED SUCCESSFULLY!')
}

seed()
  .catch((err) => {
    console.error('Error seeding products:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
