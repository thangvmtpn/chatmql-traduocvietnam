export const aiCdpPreset = {
    key: 'ai-cdp',
    name: 'AI Phân tích hội thoại',
    description: 'Dùng AI phân tích hội thoại tự động: lifecycle, lead score, sentiment, intent, tags. Cài đặt nhanh bộ sự kiện và tự động hóa AI-CDP.',
    icon: 'Activity',
    groupName: 'AI & Tự động',
    properties: [
        {
            name: 'Sản phẩm quan tâm',
            fieldKey: 'product_interest',
            fieldType: 'text',
            description: 'Sản phẩm/dịch vụ khách đang quan tâm (AI trích xuất từ hội thoại)',
        },
        {
            name: 'Nhu cầu chính',
            fieldKey: 'main_need',
            fieldType: 'text',
            description: 'Nhu cầu/vấn đề chính của khách (AI trích xuất từ hội thoại)',
        },
        {
            name: 'Ngân sách dự kiến',
            fieldKey: 'budget_range',
            fieldType: 'single_select',
            description: 'Khoảng ngân sách khách hàng',
            options: [
                { value: 'under_1m', label: 'Dưới 1 triệu' },
                { value: '1m_5m', label: '1-5 triệu' },
                { value: '5m_20m', label: '5-20 triệu' },
                { value: '20m_50m', label: '20-50 triệu' },
                { value: 'over_50m', label: 'Trên 50 triệu' },
            ],
        },
        {
            name: 'Mức độ khẩn cấp',
            fieldKey: 'urgency_level',
            fieldType: 'single_select',
            description: 'Mức độ gấp của khách',
            options: [
                { value: 'immediate', label: 'Cần ngay' },
                { value: 'this_week', label: 'Trong tuần' },
                { value: 'this_month', label: 'Trong tháng' },
                { value: 'exploring', label: 'Đang tìm hiểu' },
            ],
        },
    ],
    events: [
        { eventName: 'conversation_idle', displayName: 'Sau tương tác', description: 'Sau khi kết thúc tương tác, tự động kích hoạt' },
        { eventName: 'ai_cdp_analyzed', displayName: 'AI-CDP đã phân tích', description: 'Khi AI hoàn tất phân tích hội thoại' },
        { eventName: 'lifecycle_changed', displayName: 'Lifecycle thay đổi', description: 'Khi lifecycle stage thay đổi' },
        { eventName: 'lead_score_updated', displayName: 'Cập nhật điểm lead', description: 'Khi lead score thay đổi' },
    ],
    automations: [
        {
            name: 'AI-CDP phân loại sau lần cuối phản hồi',
            description: 'Sau khi hết thời gian phản hồi → AI phân tích hội thoại → cập nhật lifecycle, lead score, sentiment, intent',
            trigger: 'conversation_idle',
            conditions: [],
            actions: [{
                    type: 'ai_cdp',
                    params: {
                        analysis: { messageCount: 20, confidenceThreshold: 0.7, customPrompt: '' },
                        outputs: {
                            lifecycle: { enabled: true, allowDowngrade: false },
                            leadScore: { enabled: true },
                            sentiment: { enabled: true },
                            intent: { enabled: true },
                            tags: { enabled: false, allowedTags: [] },
                            profile: { enabled: false, fields: [] },
                            customProperties: { enabled: false, propertyIds: [] },
                        },
                        audit: { enabled: true },
                    },
                }],
        },
        {
            name: 'AI-CDP đầy đủ (profile + custom properties)',
            description: 'AI phân tích toàn bộ: lifecycle, lead score, sentiment, intent, tags, profile, CDP properties',
            trigger: 'conversation_idle',
            conditions: [],
            actions: [{
                    type: 'ai_cdp',
                    params: {
                        analysis: { messageCount: 30, confidenceThreshold: 0.7, customPrompt: '' },
                        outputs: {
                            lifecycle: { enabled: true, allowDowngrade: false },
                            leadScore: { enabled: true },
                            sentiment: { enabled: true },
                            intent: { enabled: true },
                            tags: { enabled: true, allowedTags: [] },
                            profile: { enabled: true, fields: ['fullName', 'phone', 'email', 'jobTitle'] },
                            customProperties: { enabled: true, propertyIds: [] },
                        },
                        audit: { enabled: true },
                    },
                }],
        },
    ],
};
//# sourceMappingURL=ai-cdp.js.map