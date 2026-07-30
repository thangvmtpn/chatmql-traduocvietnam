import type { PresetPackage } from './types.js'

export const facebookPreset: PresetPackage = {
  key: 'facebook',
  name: 'Facebook Fanpage',
  description: 'Tin nhắn, comment, lead form, chiến dịch quảng cáo',
  icon: 'Globe',
  groupName: 'Facebook',
  properties: [
    { name: 'Link Facebook', fieldKey: 'fb_profile_link', fieldType: 'text' },
    { name: 'Fanpage nguồn', fieldKey: 'fb_fanpage_source', fieldType: 'single_select', options: [
      { value: 'main', label: 'Trang chính' }, { value: 'sub', label: 'Trang phụ' },
    ]},
    { name: 'Chiến dịch Ads', fieldKey: 'fb_ads_campaign', fieldType: 'text' },
  ],
  events: [
    { eventName: 'fb.messaging', displayName: 'Nhận tin nhắn Messenger', description: 'Facebook Webhook: messaging' },
    { eventName: 'fb.feed.comment', displayName: 'Comment trên bài viết', description: 'Facebook Webhook: feed/comment' },
    { eventName: 'fb.leadgen', displayName: 'Gửi Lead Form', description: 'Facebook Webhook: leadgen' },
    { eventName: 'fb.ad.click', displayName: 'Click quảng cáo', description: 'Facebook Ads: ad_click event' },
  ],
  automations: [],
}
