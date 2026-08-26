export const zaloOaPreset = {
    key: 'zalo-oa',
    name: 'Zalo Official Account',
    description: 'Theo dõi follow/unfollow, tương tác OA, menu, bài viết',
    icon: 'MessageCircle',
    groupName: 'Zalo',
    properties: [
        { name: 'Trạng thái follow OA', fieldKey: 'oa_follow_status', fieldType: 'boolean' },
        { name: 'Link Zalo profile', fieldKey: 'zalo_profile_link', fieldType: 'text' },
        { name: 'Nhãn Zalo', fieldKey: 'zalo_label', fieldType: 'single_select', options: [
                { value: 'vip', label: 'VIP', color: '#f59e0b' },
                { value: 'potential', label: 'Tiềm năng', color: '#3b82f6' },
                { value: 'new', label: 'Mới', color: '#22c55e' },
            ] },
        { name: 'Tương tác Zalo gần nhất', fieldKey: 'last_zalo_interaction', fieldType: 'date' },
    ],
    events: [
        { eventName: 'user_follow_oa', displayName: 'Follow OA', description: 'Zalo OA webhook: follow event' },
        { eventName: 'user_unfollow_oa', displayName: 'Unfollow OA', description: 'Zalo OA webhook: unfollow event' },
    ],
    automations: [
        {
            name: 'Chào mừng Follow OA',
            description: 'Gửi tin nhắn chào mừng khi có người follow OA',
            trigger: 'contact_created',
            conditions: [],
            actions: [{ type: 'send_template', params: { templateId: '__preset__' } }],
            templateName: 'Chào mừng Follow OA',
            templateContent: 'Chào {{contact.fullName}}!\n\nCảm ơn bạn đã quan tâm đến {{org.name}}.\nChúng tôi rất vui được hỗ trợ bạn. Hãy nhắn tin nếu cần tư vấn nhé!',
        },
        {
            name: 'Cập nhật tương tác Zalo gần nhất',
            description: 'Tự động cập nhật ngày tương tác khi KH gửi tin nhắn',
            trigger: 'message_received',
            conditions: [],
            actions: [{ type: 'update_property', params: { fieldKey: 'last_zalo_interaction', value: '$now' } }],
        },
        {
            name: 'Đánh dấu đã follow OA',
            description: 'Tự động cập nhật trạng thái follow khi có người follow OA',
            trigger: 'user_follow_oa',
            conditions: [],
            actions: [{ type: 'update_property', params: { fieldKey: 'oa_follow_status', value: 'true' } }],
        },
        {
            name: 'Đánh dấu đã unfollow OA',
            description: 'Tự động cập nhật trạng thái follow khi có người bỏ quan tâm OA',
            trigger: 'user_unfollow_oa',
            conditions: [],
            actions: [{ type: 'update_property', params: { fieldKey: 'oa_follow_status', value: 'false' } }],
        },
    ],
};
//# sourceMappingURL=zalo-oa.js.map