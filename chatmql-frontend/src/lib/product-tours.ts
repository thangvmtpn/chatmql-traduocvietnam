/**
 * product-tours.ts — Kịch bản các tour tương tác.
 *
 * Mỗi bước trỏ vào một mốc `data-tour` có thật trên giao diện. Thêm bước mới
 * thì phải gắn mốc tương ứng, đừng neo vào class — class đổi theo thiết kế.
 *
 * Tour không thay được phần đọc trong HDSD: tour dạy "bấm ở đâu", phần đọc nói
 * "vì sao và tránh gì". Module nào có màn hình để chỉ thì mới có tour.
 */
import type { TourDef } from '@/components/shared/product-tour'

export const TOURS: Record<string, TourDef> = {
  conversations: {
    id: 'conversations',
    label: 'Hội thoại',
    steps: [
      {
        route: '/conversations',
        title: 'Đây là nơi làm việc chính',
        body: 'Mọi tin nhắn từ Zalo cá nhân, OA và web chat đều đổ về màn này. Tour sẽ chỉ lần lượt từng công cụ trên đó.',
      },
      {
        selector: '[data-tour="conv-filters"]',
        title: 'Lọc việc cần làm trước',
        body: 'Cột biểu tượng này lọc nhanh hộp thư. "Chưa trả lời" là danh sách phải xử lý đầu ca; "AI tư vấn" gom các hội thoại đang để AI tự trả lời để cuối ca xem lại.',
        pad: 8,
      },
      {
        selector: '[data-tour="crm-tabs"]',
        title: 'Hồ sơ khách nằm ở cột phải',
        body: 'Thông tin lấy thẳng từ CRM: hạng hội viên, lịch sử mua, ghi chú. Đọc trước khi gõ câu đầu tiên để không hỏi lại điều khách đã nói.',
        missingHint: 'Cột phải chỉ hiện khi đang mở một hội thoại và cửa sổ đủ rộng. Chọn một hội thoại, phóng to cửa sổ nếu cần, rồi bấm Tiếp.',
        pad: 8,
      },
      {
        selector: '[data-tour="chat-docs"]',
        title: 'Gửi tài liệu bán hàng',
        body: 'Nút này mở kho ảnh, mô tả, video và biểu giá đã duyệt. Dùng khi khách cần xem chi tiết sản phẩm.',
        missingHint: 'Thanh công cụ chỉ có khi đang mở một hội thoại. Chọn một hội thoại rồi bấm Tiếp.',
        clickToAdvance: true,
      },
      {
        selector: '[data-tour="chat-order"]',
        title: 'Chốt đơn ngay tại đây',
        body: 'Khách đồng ý mua thì bấm "Lên đơn". Đơn đẩy thẳng sang CRM và hệ thống soạn sẵn phiếu bán hàng để gửi lại cho khách.',
        missingHint: 'Mở một hội thoại để thấy thanh công cụ có nút Lên đơn.',
      },
    ],
  },

  products: {
    id: 'products',
    label: 'Sản phẩm',
    steps: [
      {
        route: '/conversations',
        selector: '[data-tour="crm-tabs"]',
        title: 'Tab Sản phẩm nằm cạnh Tạo đơn',
        body: 'Khách hỏi giá giữa cuộc trò chuyện thì mở tab này, không cần rời màn hình.',
        missingHint: 'Chọn một hội thoại và phóng to cửa sổ để cột phải hiện ra, rồi bấm Tiếp.',
        pad: 8,
      },
      {
        route: '/crm-products',
        title: 'Danh mục đầy đủ ở trang riêng',
        body: 'Cần xem cả kho hàng thì vào trang Sản phẩm. Dữ liệu đồng bộ từ hệ thống nguồn nên giá và tồn kho luôn khớp, không có bản sao cũ.',
      },
      {
        selector: '[data-tour="nav-sales-docs"]',
        title: 'Kiến thức sản phẩm ở chỗ khác',
        body: 'Ảnh, mô tả và video để tư vấn nằm trong Tài liệu bán hàng, ghép với sản phẩm bằng mã. Sản phẩm lo giá và tồn, tài liệu lo nội dung bán hàng.',
        missingHint: 'Cửa sổ hẹp nên mục này nằm trong menu "Xem thêm".',
      },
    ],
  },

  'sales-docs': {
    id: 'sales-docs',
    label: 'Tài liệu bán hàng',
    steps: [
      {
        route: '/sales-docs',
        title: 'Đi từ tổng quan xuống chi tiết',
        body: 'Trang mở ra theo đúng cách người bán hàng nghĩ: biểu giá tổng trước, rồi danh mục sản phẩm, rồi từng sản phẩm với ảnh, mô tả và video.',
      },
      {
        route: '/conversations',
        selector: '[data-tour="chat-docs"]',
        title: 'Gửi khách từ trong khung chat',
        body: 'Bấm vào đây khi đang chat. Bước một chọn thứ cần gửi, bước hai tick đúng phần muốn gửi và xem trước tin khách sẽ nhận.',
        missingHint: 'Mở một hội thoại trước, thanh công cụ mới hiện.',
        clickToAdvance: true,
      },
    ],
  },
}

/** Module nào có tour tương tác. */
export function tourFor(moduleId: string): TourDef | null {
  return TOURS[moduleId] ?? null
}
