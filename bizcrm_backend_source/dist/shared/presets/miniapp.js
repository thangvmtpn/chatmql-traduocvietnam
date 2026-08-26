export const miniappPreset = {
    key: 'miniapp',
    name: 'Zalo Mini App',
    description: 'Theo dõi người dùng Mini App, đơn hàng, thanh toán',
    icon: 'Smartphone',
    groupName: 'Mini App',
    properties: [
        { name: 'Mini App User ID', fieldKey: 'miniapp_user_id', fieldType: 'text' },
        { name: 'Truy cập gần nhất', fieldKey: 'miniapp_last_open', fieldType: 'date' },
    ],
    events: [
        { eventName: 'zma.app.open', displayName: 'Mở Mini App', description: 'Zalo Mini App SDK: onShow' },
        { eventName: 'zma.order.created', displayName: 'Đặt hàng Mini App', description: 'Zalo Checkout SDK: createOrder' },
        { eventName: 'zma.payment.completed', displayName: 'Thanh toán Mini App', description: 'Zalo Checkout SDK: payment callback' },
    ],
    automations: [
        {
            name: 'Cập nhật ngày truy cập Mini App',
            description: 'Tự động cập nhật ngày truy cập gần nhất khi KH mở Mini App',
            trigger: 'zma.app.open',
            conditions: [],
            actions: [{ type: 'update_property', params: { fieldKey: 'miniapp_last_open', value: '$now' } }],
        },
    ],
};
//# sourceMappingURL=miniapp.js.map