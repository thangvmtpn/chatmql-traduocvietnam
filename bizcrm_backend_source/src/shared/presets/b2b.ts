import type { PresetPackage } from './types.js'

export const b2bPreset: PresetPackage = {
  key: 'b2b',
  name: 'Doanh nghiệp (B2B)',
  description: 'Thông tin công ty, mã số thuế, ngành nghề, quy mô',
  icon: 'Building2',
  groupName: 'Doanh nghiệp',
  properties: [
    { name: 'Tên công ty', fieldKey: 'company_name', fieldType: 'text' },
    { name: 'Mã số thuế', fieldKey: 'tax_code', fieldType: 'text' },
    { name: 'Chức danh', fieldKey: 'job_title', fieldType: 'single_select', options: [
      { value: 'director', label: 'Giám đốc' }, { value: 'manager', label: 'Quản lý' },
      { value: 'staff', label: 'Nhân viên' }, { value: 'accountant', label: 'Kế toán' },
    ]},
    { name: 'Ngành nghề', fieldKey: 'industry', fieldType: 'single_select', options: [
      { value: 'real_estate', label: 'Bất động sản' }, { value: 'retail', label: 'Bán lẻ' },
      { value: 'it', label: 'CNTT' }, { value: 'manufacturing', label: 'Sản xuất' },
      { value: 'healthcare', label: 'Y tế' }, { value: 'education', label: 'Giáo dục' },
    ]},
    { name: 'Quy mô công ty', fieldKey: 'company_size', fieldType: 'single_select', options: [
      { value: '1-10', label: '1-10 người' }, { value: '11-50', label: '11-50 người' },
      { value: '51-200', label: '51-200 người' }, { value: '200+', label: 'Trên 200 người' },
    ]},
    { name: 'Website', fieldKey: 'company_website', fieldType: 'text' },
    { name: 'Địa chỉ công ty', fieldKey: 'company_address', fieldType: 'text' },
  ],
  events: [
    { eventName: 'contract_signed', displayName: 'Ký hợp đồng', description: 'CRM: manual event via API' },
    { eventName: 'proposal_sent', displayName: 'Gửi báo giá', description: 'CRM: manual event via API' },
    { eventName: 'meeting_scheduled', displayName: 'Đặt lịch họp', description: 'CRM: manual event via API' },
    { eventName: 'invoice_paid', displayName: 'Thanh toán hóa đơn', description: 'CRM: manual event via API' },
  ],
  automations: [{
    name: 'Nhắc follow-up khách B2B mới',
    description: 'Tự động tạo lịch hẹn follow-up 3 ngày sau khi KH B2B mới liên hệ',
    trigger: 'contact_created',
    conditions: [],
    actions: [{ type: 'create_appointment', params: { title: 'Follow-up khách B2B mới', offsetHours: 72 } }],
  }],
}
