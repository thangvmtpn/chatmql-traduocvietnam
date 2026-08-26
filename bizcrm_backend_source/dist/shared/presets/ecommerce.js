export const ecommercePreset = {
    key: 'ecommerce',
    name: 'Bán hàng / E-commerce',
    description: 'Doanh thu, đơn hàng, hạng thành viên, giỏ hàng',
    icon: 'ShoppingCart',
    groupName: 'Giao dịch',
    properties: [
        { name: 'Tổng doanh thu', fieldKey: 'total_revenue', fieldType: 'number', description: 'VND' },
        { name: 'Số đơn hàng', fieldKey: 'order_count', fieldType: 'number' },
        { name: 'Hạng thành viên', fieldKey: 'membership_tier', fieldType: 'single_select', options: [
                { value: 'bronze', label: 'Đồng', color: '#a16207' },
                { value: 'silver', label: 'Bạc', color: '#6b7280' },
                { value: 'gold', label: 'Vàng', color: '#f59e0b' },
                { value: 'diamond', label: 'Kim Cương', color: '#8b5cf6' },
            ] },
        { name: 'Mua hàng gần nhất', fieldKey: 'last_purchase_date', fieldType: 'date' },
        { name: 'Danh mục yêu thích', fieldKey: 'favorite_category', fieldType: 'text' },
    ],
    events: [
        { eventName: 'product_viewed', displayName: 'Xem sản phẩm', description: 'E-commerce: tracking via API' },
        { eventName: 'add_to_cart', displayName: 'Thêm giỏ hàng', description: 'E-commerce: tracking via API' },
        { eventName: 'checkout_started', displayName: 'Bắt đầu thanh toán', description: 'E-commerce: tracking via API' },
        { eventName: 'order_completed', displayName: 'Hoàn thành đơn', description: 'E-commerce: tracking via API' },
        { eventName: 'order_cancelled', displayName: 'Hủy đơn', description: 'E-commerce: tracking via API' },
        { eventName: 'refund_requested', displayName: 'Yêu cầu hoàn tiền', description: 'E-commerce: tracking via API' },
    ],
    automations: [
        {
            name: 'Chào mừng khách hàng mới',
            description: 'Gửi tin nhắn chào mừng khi KH mới liên hệ lần đầu',
            trigger: 'contact_created',
            conditions: [],
            actions: [{ type: 'send_template', params: { templateId: '__preset__' } }],
            templateName: 'Chào mừng khách hàng mới',
            templateContent: 'Chào {{contact.fullName}}!\n\nCảm ơn bạn đã liên hệ {{org.name}}!\nChúng tôi sẵn sàng hỗ trợ bạn. Hãy nhắn tin nếu cần tư vấn nhé!',
        },
        {
            name: 'Tăng số đơn khi hoàn thành',
            description: 'Tự động +1 số đơn hàng và cập nhật ngày mua gần nhất',
            trigger: 'order_completed',
            conditions: [],
            actions: [
                { type: 'increment_property', params: { fieldKey: 'order_count', amount: 1 } },
                { type: 'update_property', params: { fieldKey: 'last_purchase_date', value: '$now' } },
            ],
        },
    ],
};
//# sourceMappingURL=ecommerce.js.map