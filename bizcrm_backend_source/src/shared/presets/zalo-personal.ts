import type { PresetPackage } from './types.js'

export const zaloPersonalPreset: PresetPackage = {
  key: 'zalo-personal',
  name: 'Zalo Cá nhân',
  description: 'Trạng thái bạn bè, sinh nhật, sự kiện Zalo cá nhân',
  icon: 'UserCircle',
  groupName: 'Zalo',
  properties: [
    { name: 'Bạn bè Zalo', fieldKey: 'zalo_friend_status', fieldType: 'boolean' },
    { name: 'Ngày sinh nhật', fieldKey: 'birthday', fieldType: 'date' },
  ],
  events: [
    { eventName: 'zalo.friend.added', displayName: 'Thêm bạn Zalo', description: 'zca-js: friend added event' },
    { eventName: 'birthday_detected', displayName: 'Phát hiện sinh nhật', description: 'Tự động phát hiện từ thông báo sinh nhật Zalo' },
  ],
  automations: [
    {
      name: 'Chúc mừng sinh nhật khách hàng',
      description: 'Tự động gửi tin nhắn chúc mừng khi phát hiện sinh nhật qua Zalo',
      trigger: 'birthday_detected',
      conditions: [],
      actions: [{ type: 'send_template', params: { templateId: '__preset__' } }],
      templateName: 'Chúc mừng sinh nhật',
      templateContent: 'Chúc mừng sinh nhật {{contact.fullName}}! 🎂🎉\n\nChúc bạn luôn vui vẻ, hạnh phúc và thành công!\n\nThân ái,\n{{org.name}}',
    },
  ],
}
