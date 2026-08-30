import { describe, it, expect } from 'vitest'
import {
  canTransition, assertTransition, isEditable, isLocked, canRespond, QuoteStateError,
} from './quote-status.js'
import { discountCeilingFor, canViewAllQuotes, canDeleteQuotes } from './quote-types.js'
import { normalizePrefix } from './quote-number.js'
import { toPublicQuote } from './quote-serialize.js'

describe('canTransition', () => {
  it('cho phép luồng chuẩn', () => {
    expect(canTransition('draft', 'sent')).toBe(true)
    expect(canTransition('sent', 'viewed')).toBe(true)
    expect(canTransition('viewed', 'accepted')).toBe(true)
    expect(canTransition('sent', 'accepted')).toBe(true) // khách accept không cần mở link trước
  })

  it('CHẶN quay lui', () => {
    expect(canTransition('sent', 'draft')).toBe(false)
    expect(canTransition('viewed', 'sent')).toBe(false)
    expect(canTransition('accepted', 'sent')).toBe(false)
  })

  it('accepted là trạng thái cuối — không đi đâu được', () => {
    expect(canTransition('accepted', 'canceled')).toBe(false)
    expect(canTransition('accepted', 'rejected')).toBe(false)
    expect(canTransition('accepted', 'expired')).toBe(false)
  })

  it('huỷ được từ draft/sent/viewed nhưng KHÔNG từ accepted', () => {
    expect(canTransition('draft', 'canceled')).toBe(true)
    expect(canTransition('sent', 'canceled')).toBe(true)
    expect(canTransition('viewed', 'canceled')).toBe(true)
    expect(canTransition('accepted', 'canceled')).toBe(false)
  })

  it('canceled cũng là trạng thái cuối', () => {
    expect(canTransition('canceled', 'draft')).toBe(false)
    expect(canTransition('canceled', 'sent')).toBe(false)
  })
})

describe('assertTransition', () => {
  it('không ném khi hợp lệ', () => {
    expect(() => assertTransition('draft', 'sent')).not.toThrow()
  })
  it('ném QuoteStateError khi không hợp lệ', () => {
    expect(() => assertTransition('accepted', 'draft')).toThrow(QuoteStateError)
  })
})

describe('isEditable / isLocked / canRespond', () => {
  it('chỉ draft mới sửa được', () => {
    expect(isEditable('draft')).toBe(true)
    expect(isEditable('sent')).toBe(false)
    expect(isEditable('accepted')).toBe(false)
  })
  it('chỉ accepted là khoá', () => {
    expect(isLocked('accepted')).toBe(true)
    expect(isLocked('sent')).toBe(false)
  })
  it('khách chỉ phản hồi khi sent/viewed', () => {
    expect(canRespond('sent')).toBe(true)
    expect(canRespond('viewed')).toBe(true)
    expect(canRespond('draft')).toBe(false)      // chưa gửi
    expect(canRespond('accepted')).toBe(false)   // đã trả lời rồi
    expect(canRespond('expired')).toBe(false)
    expect(canRespond('canceled')).toBe(false)
  })
})

describe('normalizePrefix — tiền tố số chứng từ', () => {
  it('viết hoa và bỏ ký tự lạ', () => {
    expect(normalizePrefix('bg')).toBe('BG')
    expect(normalizePrefix('B-G/2')).toBe('BG2')
  })
  it('rỗng hoặc toàn ký tự lạ → BG', () => {
    expect(normalizePrefix('')).toBe('BG')
    expect(normalizePrefix(null)).toBe('BG')
    expect(normalizePrefix('///')).toBe('BG')
  })
  it('cắt tối đa 8 ký tự', () => {
    expect(normalizePrefix('ABCDEFGHIJK')).toBe('ABCDEFGH')
  })
  it('BG và HD phải khác nhau → hai dãy số độc lập', () => {
    // Nếu hai tiền tố này gộp chung bộ đếm, hợp đồng đầu tiên của công ty sẽ
    // mang số nối tiếp dãy báo giá (HD-2026-0026) — kế toán VN không chấp nhận.
    expect(normalizePrefix('BG')).not.toBe(normalizePrefix('HD'))
  })
})

describe('phân quyền', () => {
  it('trần chiết khấu theo vai trò', () => {
    expect(discountCeilingFor('owner')).toBe(100)
    expect(discountCeilingFor('admin')).toBe(100)
    expect(discountCeilingFor('manager')).toBe(20)
    expect(discountCeilingFor('member')).toBe(10)
  })
  it('vai trò lạ → mức thấp nhất (fail-safe)', () => {
    expect(discountCeilingFor('hacker')).toBe(10)
    expect(discountCeilingFor('')).toBe(10)
  })
  it('member không xem được báo giá người khác', () => {
    expect(canViewAllQuotes('member')).toBe(false)
    expect(canViewAllQuotes('manager')).toBe(true)
  })
  it('member không xoá được', () => {
    expect(canDeleteQuotes('member')).toBe(false)
    expect(canDeleteQuotes('manager')).toBe(true)
  })
})

describe('toPublicQuote — allowlist (chống rò rỉ dữ liệu)', () => {
  const row = {
    id: 'quote-uuid',
    orgId: 'org-secret',
    number: 'BG-2026-0001',
    type: 'quote',
    status: 'sent',
    total: 1_320_000,
    subtotal: 1_300_000,
    taxRate: 10,
    taxAmount: 130_000,
    discountAmount: 0,
    notes: 'Điều khoản công khai',
    internalNotes: 'BÍ MẬT: giá vốn 800k, có thể giảm thêm 20%',
    publicToken: 'secret-token',
    createdById: 'user-1',
    assignedUserId: 'user-2',
    templateSnapshot: { sellerName: 'Công ty ABC', sellerTaxCode: '0101234567' },
    contact: {
      id: 'contact-1', fullName: 'Anh Thắng', crmName: null,
      phone: '0901234567', email: 'a@b.vn', leadScore: 85, tags: ['hot'],
    },
    company: { id: 'c1', name: 'Công ty XYZ', taxCode: '0109876543', notes: 'nội bộ' },
    lines: [{
      id: 'line-1', quoteId: 'quote-uuid', productId: 'prod-1',
      name: 'Thiết kế UI', quantity: 1, unit: 'gói', unitPrice: 1_300_000,
      discountPercent: 0, amount: 1_300_000, sortOrder: 0,
    }],
  }

  const pub = toPublicQuote(row)
  const json = JSON.stringify(pub)

  it('KHÔNG lộ ghi chú nội bộ', () => {
    expect(json).not.toContain('BÍ MẬT')
    expect(pub.internalNotes).toBeUndefined()
  })

  it('KHÔNG lộ id nội bộ / orgId / token', () => {
    expect(pub.id).toBeUndefined()
    expect(pub.orgId).toBeUndefined()
    expect(pub.publicToken).toBeUndefined()
    expect(json).not.toContain('org-secret')
    expect(json).not.toContain('secret-token')
  })

  it('KHÔNG lộ người tạo / người phụ trách', () => {
    expect(pub.createdById).toBeUndefined()
    expect(pub.assignedUserId).toBeUndefined()
    expect(json).not.toContain('user-1')
    expect(json).not.toContain('user-2')
  })

  it('KHÔNG lộ PII của contact (điện thoại, email, điểm số, tag)', () => {
    expect(json).not.toContain('0901234567')
    expect(json).not.toContain('a@b.vn')
    expect(json).not.toContain('85')
    expect(json).not.toContain('hot')
    expect(pub.buyer).toEqual({
      name: 'Anh Thắng', companyName: 'Công ty XYZ', taxCode: '0109876543',
    })
  })

  it('KHÔNG lộ productId ở dòng hàng', () => {
    expect(json).not.toContain('prod-1')
    expect(pub.lines[0].productId).toBeUndefined()
    expect(pub.lines[0].quoteId).toBeUndefined()
  })

  it('VẪN trả đủ thứ khách cần xem', () => {
    expect(pub.number).toBe('BG-2026-0001')
    expect(pub.total).toBe(1_320_000)
    expect(pub.totalInWords).toBe('Một triệu ba trăm hai mươi nghìn đồng')
    expect(pub.notes).toBe('Điều khoản công khai')
    expect(pub.lines[0].name).toBe('Thiết kế UI')
    expect(pub.seller.name).toBe('Công ty ABC')
    expect(pub.seller.taxCode).toBe('0101234567')
  })

  it('an toàn khi thiếu contact/company/lines', () => {
    const bare = toPublicQuote({ number: 'BG-1', total: 0, templateSnapshot: {} })
    expect(bare.buyer).toBeNull()
    expect(bare.lines).toEqual([])
    expect(bare.seller.name).toBeNull()
  })
})
