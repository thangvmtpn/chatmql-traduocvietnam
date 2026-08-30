import { describe, it, expect } from 'vitest'
import { calcLineAmount, calcTotals, effectiveDiscountPercent, round2 } from './quote-calc.js'
import { moneyToWords, formatMoney } from './money-to-words.js'

describe('round2', () => {
  it('làm tròn 2 số lẻ', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(0.1 + 0.2)).toBe(0.3)
  })
  it('trả 0 khi không phải số hữu hạn', () => {
    expect(round2(NaN)).toBe(0)
    expect(round2(Infinity)).toBe(0)
  })
})

describe('calcLineAmount', () => {
  it('tính SL × đơn giá', () => {
    expect(calcLineAmount(2, 500_000)).toBe(1_000_000)
  })
  it('áp chiết khấu dòng', () => {
    expect(calcLineAmount(2, 500_000, 10)).toBe(900_000)
  })
  it('hỗ trợ số lượng thập phân (0.5 ngày công)', () => {
    expect(calcLineAmount(0.5, 1_000_000)).toBe(500_000)
    expect(calcLineAmount(2.75, 200_000)).toBe(550_000)
  })
  it('chặn giá trị âm về 0', () => {
    expect(calcLineAmount(-5, 100_000)).toBe(0)
    expect(calcLineAmount(2, -100_000)).toBe(0)
  })
  it('kẹp chiết khấu trong 0–100%', () => {
    expect(calcLineAmount(1, 100_000, 150)).toBe(0)
    expect(calcLineAmount(1, 100_000, -50)).toBe(100_000)
  })
})

describe('calcTotals', () => {
  const lines = [
    { quantity: 1, unitPrice: 1_200_000 },
    { quantity: 2, unitPrice: 50_000 },
  ]

  it('cộng subtotal từ các dòng', () => {
    expect(calcTotals(lines).subtotal).toBe(1_300_000)
  })

  it('danh sách rỗng → tất cả bằng 0', () => {
    expect(calcTotals([])).toEqual({ subtotal: 0, discountAmount: 0, taxAmount: 0, total: 0 })
  })

  it('THUẾ TÍNH SAU CHIẾT KHẤU (chuẩn kế toán VN)', () => {
    const r = calcTotals(lines, { discountType: 'amount', discountValue: 300_000, taxRate: 10 })
    expect(r.subtotal).toBe(1_300_000)
    expect(r.discountAmount).toBe(300_000)
    // thuế trên 1.000.000 chứ KHÔNG phải trên 1.300.000
    expect(r.taxAmount).toBe(100_000)
    expect(r.total).toBe(1_100_000)
  })

  it('chiết khấu theo %', () => {
    const r = calcTotals(lines, { discountType: 'percent', discountValue: 10, taxRate: 8 })
    expect(r.discountAmount).toBe(130_000)
    expect(r.taxAmount).toBe(93_600) // 1.170.000 × 8%
    expect(r.total).toBe(1_263_600)
  })

  it('VAT 8% (mức giảm theo NQ) tính đúng', () => {
    const r = calcTotals([{ quantity: 1, unitPrice: 1_000_000 }], { taxRate: 8 })
    expect(r.taxAmount).toBe(80_000)
    expect(r.total).toBe(1_080_000)
  })

  it('chiết khấu tiền KHÔNG vượt subtotal (không cho tổng âm)', () => {
    const r = calcTotals(lines, { discountType: 'amount', discountValue: 99_999_999 })
    expect(r.discountAmount).toBe(1_300_000)
    expect(r.total).toBe(0)
  })

  it('discountType none thì bỏ qua discountValue', () => {
    const r = calcTotals(lines, { discountType: 'none', discountValue: 500_000 })
    expect(r.discountAmount).toBe(0)
    expect(r.total).toBe(1_300_000)
  })

  it('gộp chiết khấu dòng + chiết khấu tổng + thuế', () => {
    const r = calcTotals(
      [{ quantity: 2, unitPrice: 500_000, discountPercent: 10 }], // 900.000
      { discountType: 'percent', discountValue: 10, taxRate: 10 },
    )
    expect(r.subtotal).toBe(900_000)
    expect(r.discountAmount).toBe(90_000)
    expect(r.taxAmount).toBe(81_000)
    expect(r.total).toBe(891_000)
  })
})

describe('effectiveDiscountPercent', () => {
  it('0% khi không chiết khấu', () => {
    expect(effectiveDiscountPercent([{ quantity: 1, unitPrice: 1_000_000 }])).toBe(0)
  })
  it('tính chiết khấu chỉ ở dòng', () => {
    expect(effectiveDiscountPercent([{ quantity: 1, unitPrice: 1_000_000, discountPercent: 20 }])).toBe(20)
  })
  it('tính chiết khấu chỉ ở tổng', () => {
    const r = effectiveDiscountPercent([{ quantity: 1, unitPrice: 1_000_000 }], {
      discountType: 'percent', discountValue: 15,
    })
    expect(r).toBe(15)
  })
  it('gộp chiết khấu dòng + tổng', () => {
    // dòng −10% → 900k; tổng −10% của 900k = 90k → tổng giảm 190k / 1tr = 19%
    const r = effectiveDiscountPercent([{ quantity: 1, unitPrice: 1_000_000, discountPercent: 10 }], {
      discountType: 'percent', discountValue: 10,
    })
    expect(r).toBe(19)
  })
  it('0% khi tổng gốc bằng 0 (không chia cho 0)', () => {
    expect(effectiveDiscountPercent([])).toBe(0)
  })
})

describe('moneyToWords', () => {
  it('số 0', () => {
    expect(moneyToWords(0)).toBe('Không đồng')
  })
  it('hàng đơn vị', () => {
    expect(moneyToWords(1)).toBe('Một đồng')
    expect(moneyToWords(5)).toBe('Năm đồng')
  })
  it('hàng chục — mười / mươi', () => {
    expect(moneyToWords(10)).toBe('Mười đồng')
    expect(moneyToWords(15)).toBe('Mười lăm đồng')
    expect(moneyToWords(21)).toBe('Hai mươi mốt đồng')
    expect(moneyToWords(25)).toBe('Hai mươi lăm đồng')
  })
  it('hàng trăm — linh', () => {
    expect(moneyToWords(101)).toBe('Một trăm linh một đồng')
    expect(moneyToWords(105)).toBe('Một trăm linh năm đồng')
    expect(moneyToWords(110)).toBe('Một trăm mười đồng')
  })
  it('nghìn', () => {
    expect(moneyToWords(1_000)).toBe('Một nghìn đồng')
    expect(moneyToWords(50_000)).toBe('Năm mươi nghìn đồng')
  })
  it('triệu — ví dụ thật trên báo giá', () => {
    expect(moneyToWords(1_200_000)).toBe('Một triệu hai trăm nghìn đồng')
    expect(moneyToWords(1_320_000)).toBe('Một triệu ba trăm hai mươi nghìn đồng')
  })
  it('tỷ', () => {
    expect(moneyToWords(1_000_000_000)).toBe('Một tỷ đồng')
    expect(moneyToWords(2_500_000_000)).toBe('Hai tỷ năm trăm triệu đồng')
  })
  it('nhóm rỗng ở giữa vẫn đọc đúng', () => {
    expect(moneyToWords(1_000_500)).toBe('Một triệu năm trăm đồng')
    expect(moneyToWords(1_000_005)).toBe('Một triệu không trăm linh năm đồng')
  })
  it('làm tròn phần lẻ', () => {
    expect(moneyToWords(1_000.6)).toBe('Một nghìn không trăm linh một đồng')
  })
  it('số âm', () => {
    expect(moneyToWords(-1000)).toBe('Âm một nghìn đồng')
  })
  it('đổi được đơn vị tiền', () => {
    expect(moneyToWords(5, 'đô la')).toBe('Năm đô la')
  })
  it('giá trị không hợp lệ → chuỗi rỗng', () => {
    expect(moneyToWords(NaN)).toBe('')
  })
})

describe('formatMoney', () => {
  it('định dạng kiểu VN', () => {
    expect(formatMoney(1_200_000)).toBe('1.200.000')
    expect(formatMoney(0)).toBe('0')
  })
})
