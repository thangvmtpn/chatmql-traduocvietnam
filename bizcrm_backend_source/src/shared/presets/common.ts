import type { PresetPackage } from './types.js'

export const commonPreset: PresetPackage = {
  key: 'common',
  name: 'Thông tin chung',
  description: 'Dữ liệu cơ bản: ngày sinh, giới tính, mức độ ưu tiên, kênh liên hệ',
  icon: 'ClipboardList',
  groupName: 'Thông tin cá nhân',
  properties: [
    { name: 'Ngày sinh', fieldKey: 'birthday', fieldType: 'date' },
    { name: 'Giới tính', fieldKey: 'gender', fieldType: 'single_select', options: [
      { value: 'male', label: 'Nam' }, { value: 'female', label: 'Nữ' }, { value: 'other', label: 'Khác' },
    ]},
    { name: 'Mức độ ưu tiên', fieldKey: 'priority_level', fieldType: 'single_select', options: [
      { value: 'hot', label: 'Nóng', color: '#ef4444' },
      { value: 'warm', label: 'Ấm', color: '#f59e0b' },
      { value: 'cold', label: 'Lạnh', color: '#3b82f6' },
    ]},
    { name: 'Nguồn giới thiệu', fieldKey: 'referral_source', fieldType: 'text', description: 'Ai/đâu giới thiệu' },
    { name: 'Kênh liên hệ ưa thích', fieldKey: 'contact_preference', fieldType: 'single_select', options: [
      { value: 'zalo', label: 'Zalo' }, { value: 'phone', label: 'Điện thoại' }, { value: 'email', label: 'Email' },
    ]},
  ],
  events: [
    { eventName: 'note_added', displayName: 'Thêm ghi chú' },
    { eventName: 'appointment_created', displayName: 'Tạo lịch hẹn' },
    { eventName: 'lifecycle_changed', displayName: 'Lifecycle thay đổi', description: 'Khi lifecycle stage thay đổi' },
    { eventName: 'lead_score_updated', displayName: 'Cập nhật điểm lead' },
    { eventName: 'conversation_idle', displayName: 'Sau tương tác', description: 'Sau khi kết thúc tương tác, tự động kích hoạt' },
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
  ],
}
