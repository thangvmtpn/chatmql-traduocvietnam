import { useState, useMemo } from "react";
import BaseLayout from "@/layouts/BaseLayout/BaseLayout";
import useAuthStore from "@/stores/useAuthStore";
import "./ThuatNguPage.css";
import "material-symbols";

interface ThuatNgu {
  stt: string;
  vietTat: string;
  giaiNghia: string;
  mucTieuSuDung: string;
  luuY?: string;
}

const THUAT_NGU_DATA: ThuatNgu[] = [
  {
    stt: "01",
    vietTat: "ARPU",
    giaiNghia:
      "Là giá trị trung bình mà một khách hàng chi trả cho sản phẩm của thương hiệu trên một kênh bán cụ thể trong một khoảng thời gian. Ví dụ: nếu đo trên kênh online thì chỉ tính doanh thu và số khách từ kênh online; nếu đo trên kênh offline thì tính riêng cho kênh đó. Chỉ số này giúp hiểu mỗi khách hàng trên từng kênh mang lại bao nhiêu tiền.",
    mucTieuSuDung:
      "Khả năng chi trả trung bình của khách hàng đối với sản phẩm của thương hiệu trên từng kênh",
    luuY: "ARPU = GMV/ Số khách hàng",
  },
  {
    stt: "02",
    vietTat: "AOV",
    giaiNghia:
      "Giá trị đơn hàng trung bình, chỉ số đo lường số tiền trung bình khách hàng chi tiêu cho mỗi lần mua hàng trên website, ứng dụng hoặc cửa hàng. Đây là thước đo quan trọng để đánh giá hiệu quả kinh doanh, hành vi mua sắm và tối ưu hóa lợi nhuận.",
    mucTieuSuDung:
      "Khả năng chi trả trung bình của khách hàng trên mỗi đơn hàng theo từng kênh",
    luuY: "AOV = GMV/ Số đơn hàng",
  },
  {
    stt: "03",
    vietTat: "Affiliate",
    giaiNghia:
      "Là hình thức hợp tác với người khác (KOL, KOC, publisher…) để bán sản phẩm, họ sẽ nhận hoa hồng trên mỗi đơn hàng phát sinh từ link hoặc mã của họ. Thương hiệu không cần tự bán trực tiếp mà mở rộng kênh bán thông qua cộng tác viên.",
    mucTieuSuDung:
      "Mở rộng kênh bán hàng thông qua mạng lưới KOC/KOL hoặc người dùng giới thiệu sản phẩm.",
  },
  {
    stt: "04",
    vietTat: "B2B",
    giaiNghia:
      "Là mô hình kinh doanh trong đó doanh nghiệp bán sản phẩm, dịch vụ cho các doanh nghiệp khác, thay vì người tiêu dùng cuối cùng. Đặc điểm chính là giao dịch giá trị lớn, hợp đồng dài hạn và dựa trên mối quan hệ hợp tác lâu dài. Ví dụ: nhà cung cấp nguyên liệu bán cho nhà máy, công ty phần mềm cung cấp dịch vụ cho doanh nghiệp.",
    mucTieuSuDung: "Mô hình kinh doanh giữa doanh nghiệp với doanh nghiệp.",
  },
  {
    stt: "05",
    vietTat: "B2C",
    giaiNghia:
      "Là mô hình kinh doanh trong đó doanh nghiệp bán sản phẩm hoặc dịch vụ trực tiếp cho người tiêu dùng cuối cùng. Đây là hình thức bán lẻ phổ biến, ví dụ như siêu thị, cửa hàng thời trang, hoặc sàn thương mại điện tử (Shopee, Lazada). Đặc điểm chính là giao dịch nhanh, tập trung vào trải nghiệm cá nhân và cảm xúc khách hàng.",
    mucTieuSuDung:
      "Bán lẻ sản phẩm trực tiếp cho khách hàng cá nhân qua các kênh sàn, web, cửa hàng.",
  },
  {
    stt: "06",
    vietTat: "CPA",
    giaiNghia:
      "Là chi phí trung bình mà doanh nghiệp phải trả cho mỗi hành động cụ thể của khách hàng, như: mua hàng, điền form, đăng ký, thêm vào giỏ hàng… CPA được tính bằng cách lấy tổng chi phí quảng cáo chia cho số hành động đạt được. Chỉ số này phản ánh hiệu quả thực tế của quảng cáo trong việc tạo ra kết quả mong muốn.",
    mucTieuSuDung:
      "Đánh giá hiệu quả chuyển đổi, tối ưu chi phí quảng cáo, kiểm soát lợi nhuận",
  },
  {
    stt: "07",
    vietTat: "CPC",
    giaiNghia:
      "Là chi phí trung bình mà bạn phải trả cho mỗi lượt nhấp vào quảng cáo trên một kênh cụ thể. Tức là mỗi khi có người click vào quảng cáo thì bạn bị trừ tiền.",
    mucTieuSuDung:
      "Kiểm soát chi phí quảng cáo, đánh giá hiệu quả thu hút click",
    luuY: "CPC = Tổng chi phí quảng cáo / Tổng số lượt click",
  },
  {
    stt: "08",
    vietTat: "CLV",
    giaiNghia:
      "Là tổng số tiền mà một khách hàng chi trả cho thương hiệu trong suốt quá trình mua hàng (từ lần đầu đến các lần mua lại) trên một kênh hoặc toàn hệ thống.",
    mucTieuSuDung:
      "Là tổng số tiền mà một khách hàng chi trả cho thương hiệu trong suốt quá trình mua hàng (từ lần đầu đến các lần mua lại) trên một kênh hoặc toàn hệ thống.",
    luuY: "CLV = AOV x Số lần mua trung bình x Thời gian duy trì khách hàng",
  },
  {
    stt: "09",
    vietTat: "CPL",
    giaiNghia:
      "Là chi phí cho mỗi khách hàng tiềm năng, một mô hình định giá trong quảng cáo trực tuyến. Doanh nghiệp chỉ trả tiền khi người dùng thực hiện hành động cụ thể (điền form, đăng ký, để lại SĐT/Email), giúp tối ưu hóa chi phí Marketing và đảm bảo hiệu quả tìm kiếm khách hàng.",
    mucTieuSuDung:
      "Đo lường hiệu quả chiến dịch thu lead (form, inbox, đăng ký, để lại thông tin)",
    luuY: "CPL = Tổng chi phí marketing / Tổng số lead thu được",
  },
  {
    stt: "10",
    vietTat: "CRR (Tỷ lệ giữ chân khách hàng)",
    giaiNghia:
      "Là tỷ lệ % khách hàng tiếp tục quay lại mua hàng hoặc sử dụng dịch vụ trong một khoảng thời gian. Là chỉ số đo lường phần trăm khách hàng cũ tiếp tục sử dụng sản phẩm/dịch vụ của doanh nghiệp trong một khoảng thời gian nhất định. Đây là thước đo lòng trung thành và hiệu quả chăm sóc khách hàng, giúp doanh nghiệp tối ưu doanh thu và giảm chi phí tìm kiếm khách hàng mới.",
    mucTieuSuDung:
      "Đánh giá hiệu quả giữ chân khách hàng, tối ưu doanh thu từ khách cũ",
    luuY: "CRR = (Số khách hàng cuối kỳ – Khách hàng mới) / Số khách hàng đầu kỳ",
  },
  {
    stt: "11",
    vietTat: "CAC",
    giaiNghia:
      "Là Chi phí sở hữu khách hàng, chỉ tổng số tiền doanh nghiệp bỏ ra (marketing, sales, lương, công cụ) để thu hút một khách hàng mới thành công. Đây là chỉ số quan trọng để đo lường hiệu quả quảng cáo, tối ưu ngân sách và đánh giá khả năng sinh lời bền vững.",
    mucTieuSuDung:
      "Tính toán xem số tiền bỏ ra tìm khách có xứng đáng với lợi nhuận thu về không.",
    luuY: "CAC = Tổng chi phí marketing & bán hàng / Số khách hàng mới",
  },
  {
    stt: "12",
    vietTat: "C2C",
    giaiNghia:
      "Là mô hình kinh doanh mà người tiêu dùng (cá nhân) trực tiếp mua bán, trao đổi hàng hóa/dịch vụ với nhau thông qua nền tảng trung gian trực tuyến. Đặc điểm chính là bỏ qua vai trò nhà bán lẻ lớn, hàng hóa đa dạng, giá cả cạnh tranh.",
    mucTieuSuDung:
      "Tận dụng các hội nhóm (Group Facebook), chợ cư dân, hoặc việc khách mua đi bán lại.",
  },
  {
    stt: "13",
    vietTat: "CRM",
    giaiNghia:
      "Là hệ thống giúp lưu trữ, quản lý và khai thác dữ liệu khách hàng trên các kênh (online, offline, sàn…). CRM hỗ trợ theo dõi hành vi, lịch sử mua hàng, chăm sóc khách và triển khai các hoạt động như: broadcast, automation, remarketing…",
    mucTieuSuDung:
      "Quản lý toàn bộ lịch sử tương tác, mua hàng để chăm sóc và bán lại hiệu quả.",
  },
  {
    stt: "14",
    vietTat: "CTA",
    giaiNghia:
      'Là cụm từ, hình ảnh hoặc nút bấm (button) trong Marketing nhằm thúc đẩy người xem thực hiện ngay một hành động cụ thể như "Mua ngay", "Đăng ký", "Tìm hiểu thêm". CTA đóng vai trò quan trọng để tăng tỷ lệ chuyển đổi, hướng dẫn khách hàng tiềm năng, và tối ưu hóa hiệu quả nội dung',
    mucTieuSuDung:
      "Thúc đẩy khách hàng đưa ra quyết định mua hàng nhanh hơn.",
  },
  {
    stt: "15",
    vietTat: "COD",
    giaiNghia:
      "Là hình thức vận chuyển và giao hàng thu tiền hộ, nơi người mua thanh toán tiền hàng trực tiếp cho shipper khi nhận hàng, giúp tăng độ an toàn, hạn chế lừa đảo và không cần tài khoản ngân hàng",
    mucTieuSuDung:
      "Tăng tỷ lệ chốt đơn, phù hợp với khách chưa tin tưởng thanh toán online",
  },
  {
    stt: "16",
    vietTat: "Cross-sell",
    giaiNghia:
      "Kỹ thuật gợi ý khách hàng mua thêm các sản phẩm liên quan hoặc bổ trợ cho sản phẩm chính",
    mucTieuSuDung:
      "Tăng giá trị đơn hàng (AOV) và tối đa hóa doanh thu trên mỗi khách",
  },
  {
    stt: "17",
    vietTat: "Dropship",
    giaiNghia:
      "Là mô hình bán lẻ trực tuyến mà người bán (dropshipper) không cần giữ hàng trong kho hay trực tiếp vận chuyển. Khi có đơn hàng, người bán mua lại từ nhà cung cấp (nhà sản xuất/bán buôn) và yêu cầu họ gửi trực tiếp đến khách hàng. Lợi nhuận là chênh lệch giữa giá bán và giá nhập.",
    mucTieuSuDung:
      "Mở rộng mạng lưới cộng tác viên bán hàng cho cửa hàng mà không cần họ bỏ vốn.",
  },
  {
    stt: "18",
    vietTat: "Flash Sale",
    giaiNghia:
      'Là chương trình khuyến mãi giảm giá cực sâu (thường từ 50% - 90%) cho một hoặc một nhóm sản phẩm trong một khung giờ giới hạn. Mục đích là tạo tâm lý khan hiếm, thúc đẩy người mua chốt đơn ngay lập tức ("săn sale"), giúp doanh nghiệp tăng doanh số nhanh chóng và giải phóng hàng tồn.',
    mucTieuSuDung:
      "Tạo hiệu ứng đám đông, đẩy hàng tồn hoặc lấy lượt bán/đánh giá.",
  },
  {
    stt: "19",
    vietTat: "OKR",
    giaiNghia:
      "Phương pháp quản trị mục tiêu giúp doanh nghiệp liên kết mục tiêu tổ chức, đội nhóm và cá nhân, đảm bảo tất cả đi đúng hướng thông qua các kết quả có thể đo lường được. OKR tập trung vào sự minh bạch, tham vọng (thường theo quý) và hỗ trợ quản lý hiệu suất.",
    mucTieuSuDung:
      "Định hướng tập trung, tạo sự thống nhất và đo lường sự tiến bộ của toàn đội ngũ.",
  },
  {
    stt: "20",
    vietTat: "GMV",
    giaiNghia:
      "Tổng doanh thu từ hàng hóa được bán qua các sàn thương mại điện tử (như Shopee, Lazada, Amazon, TikTok Shop) trong một khoảng thời gian. Chỉ số này đo lường quy mô giao dịch, không bao gồm các chi phí trừ đi như giảm giá, hoàn trả hay chiết khấu.",
    mucTieuSuDung:
      "Đo lường quy mô và sức tăng trưởng của gian hàng.",
  },
  {
    stt: "21",
    vietTat: "KPI",
    giaiNghia:
      "Là chỉ số đo lường và đánh giá hiệu quả công việc, thể hiện qua số liệu cụ thể để theo dõi tiến độ hoàn thành mục tiêu chiến lược của cá nhân, bộ phận hoặc doanh nghiệp",
    mucTieuSuDung:
      "Dùng để đo lường mức độ hoàn thành công việc của cá nhân hoặc phòng ban.",
  },
  {
    stt: "22",
    vietTat: "Landing Page",
    giaiNghia:
      "Là một trang web đơn lẻ, độc lập, được thiết kế chuyên biệt cho các chiến dịch Marketing hoặc quảng cáo. Mục tiêu duy nhất là thuyết phục người truy cập thực hiện một hành động cụ thể như mua hàng, điền form thông tin, hoặc tải tài liệu. Nó tập trung cao độ, giúp tăng tỷ lệ chuyển đổi (CTA) hơn website thông thường.",
    mucTieuSuDung: "Tăng tỷ lệ chuyển đổi",
  },
  {
    stt: "23",
    vietTat: "Time on page",
    giaiNghia:
      "Là chỉ số đo lường tổng thời gian trung bình người dùng ở lại và tương tác trên một trang web cụ thể. Chỉ số này giúp đánh giá nội dung có hấp dẫn, hữu ích hay không, đồng thời ảnh hưởng trực tiếp đến thứ hạng SEO và tỷ lệ chuyển đổi của website.",
    mucTieuSuDung:
      "Đánh giá mức độ quan tâm và sự hấp dẫn của nội dung bài viết/sản phẩm.",
  },
  {
    stt: "24",
    vietTat: "Telesales",
    giaiNghia:
      "Là hình thức bán hàng qua điện thoại, trong đó nhân viên sử dụng các cuộc gọi để tiếp cận, giới thiệu sản phẩm/dịch vụ, tư vấn và thuyết phục khách hàng tiềm năng mua hàng hoặc sử dụng dịch vụ. Đây là một bộ phận chủ chốt của phòng kinh doanh, giúp doanh nghiệp tìm kiếm khách hàng mới, chăm sóc khách hàng cũ và chốt doanh số trực tiếp",
    mucTieuSuDung:
      "Tiếp cận khách hàng nhanh chóng, giải đáp thắc mắc tức thì để chốt đơn ngay.",
  },
  {
    stt: "25",
    vietTat: "Traffic",
    giaiNghia:
      "Là tổng số lượng người dùng truy cập và hoạt động trên một website, ứng dụng hoặc nền tảng trực tuyến trong một khoảng thời gian nhất định. Đây là chỉ số quan trọng đo lường mức độ quan tâm, độ uy tín và hiệu quả kinh doanh của trang web.",
    mucTieuSuDung:
      "Đánh giá độ phủ của thương hiệu và hiệu quả của các kênh kéo khách.",
  },
  {
    stt: "26",
    vietTat: "Upsell",
    giaiNghia:
      "Kỹ thuật thuyết phục khách hàng mua sản phẩm/dịch vụ có giá trị cao hơn hoặc phiên bản nâng cấp so với lựa chọn ban đầu",
    mucTieuSuDung:
      "Tăng giá trị đơn hàng (AOV) và doanh thu trên mỗi khách hàng",
  },
  {
    stt: "27",
    vietTat: "F",
    giaiNghia:
      "Nhóm khách hàng đã có thông tin (lead/inbox/form…) nhưng chưa mua hàng, cần chuyển sang bộ phận sale để tư vấn chốt đơn",
    mucTieuSuDung:
      "Phân loại data để sale tiếp cận, tăng tỷ lệ chuyển đổi từ lead → đơn hàng",
  },
  {
    stt: "28",
    vietTat: "F0",
    giaiNghia:
      "Nhóm khách hàng lần đầu tiếp cận hoặc lần đầu mua sản phẩm/dịch vụ",
    mucTieuSuDung: "Mở rộng tệp khách hàng, tăng trưởng doanh thu mới",
  },
  {
    stt: "29",
    vietTat: "FnKT",
    giaiNghia:
      "Nhóm khách hàng đã từng mua nhiều lần nhưng hiện tại không còn tương tác, không phản hồi hoặc ngừng mua",
    mucTieuSuDung:
      "Nhận diện tệp khách hàng có giá trị để kích hoạt lại",
  },
  {
    stt: "30",
    vietTat: "FnT",
    giaiNghia:
      "Nhóm khách hàng đang phát sinh đơn đều đặn, có tần suất mua cao và duy trì tương tác tốt",
    mucTieuSuDung:
      "Tăng doanh thu bền vững, khai thác tối đa giá trị khách hàng (CLV)",
  },
];

function ThuatNguPage() {
  const user = useAuthStore((state) => state.user);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return THUAT_NGU_DATA;
    const lower = searchTerm.toLowerCase();
    return THUAT_NGU_DATA.filter(
      (item) =>
        item.vietTat.toLowerCase().includes(lower) ||
        item.giaiNghia.toLowerCase().includes(lower) ||
        item.mucTieuSuDung.toLowerCase().includes(lower) ||
        (item.luuY && item.luuY.toLowerCase().includes(lower))
    );
  }, [searchTerm]);

  if (!user) return null;

  return (
    <BaseLayout
      user={user}
      title="Bảng thuật ngữ"
      subtitle="Tra cứu các thuật ngữ chuyên môn trong kinh doanh"
    >
      <div className="thuat-ngu-page">
        {/* Header */}
        <div className="thuat-ngu-header">

          <div className="thuat-ngu-title-row">
            <h1 className="thuat-ngu-title">BẢNG THUẬT NGỮ</h1>
            <div className="thuat-ngu-search">
              <span className="material-symbols-outlined search-icon">
                search
              </span>
              <input
                type="text"
                placeholder="Nhập từ khóa cần tìm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                id="search-thuat-ngu"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="thuat-ngu-table-wrapper">
          <table className="thuat-ngu-table">
            <thead>
              <tr>
                <th className="col-stt">STT</th>
                <th className="col-viettat">THUẬT NGỮ</th>
                <th className="col-giainghi">GIẢI NGHĨA</th>
                <th className="col-muctieu">MỤC TIÊU SỬ DỤNG</th>
                <th className="col-luuy">CÔNG THỨC</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty-row">
                    <span className="material-symbols-outlined">search_off</span>
                    <p>Không tìm thấy thuật ngữ phù hợp</p>
                  </td>
                </tr>
              ) : (
                filteredData.map((item, index) => (
                  <tr key={index} className="thuat-ngu-row">
                    <td className="col-stt">{item.stt}</td>
                    <td className="col-viettat">
                      <span className="term-badge">{item.vietTat}</span>
                    </td>
                    <td className="col-giainghi">{item.giaiNghia}</td>
                    <td className="col-muctieu">{item.mucTieuSuDung}</td>
                    <td className="col-luuy">
                      {item.luuY ? (
                        <span className="formula-badge">{item.luuY}</span>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </BaseLayout>
  );
}

export default ThuatNguPage;
