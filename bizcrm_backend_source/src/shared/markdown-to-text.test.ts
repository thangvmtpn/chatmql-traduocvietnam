import { describe, it, expect } from 'vitest'
import { markdownToPlainText } from './markdown-to-text.js'

describe('markdownToPlainText', () => {
  it('strips bold/italic/strikethrough/inline-code', () => {
    expect(markdownToPlainText('**đậm** *nghiêng* ~~gạch~~ `code`')).toBe('đậm nghiêng gạch code')
    expect(markdownToPlainText('__đậm__ _nghiêng_')).toBe('đậm nghiêng')
  })

  it('converts headings and blockquotes to plain lines', () => {
    expect(markdownToPlainText('# Tiêu đề\n## Phụ đề')).toBe('Tiêu đề\nPhụ đề')
    expect(markdownToPlainText('> trích dẫn')).toBe('trích dẫn')
  })

  it('converts links and drops images', () => {
    expect(markdownToPlainText('Xem [trang](https://x.vn) nhé')).toBe('Xem trang (https://x.vn) nhé')
    expect(markdownToPlainText('Ảnh ![alt](https://x.vn/a.jpg) đây')).toBe('Ảnh  đây')
  })

  it('converts ordered + unordered lists to • bullets', () => {
    expect(markdownToPlainText('1. Một\n2. Hai')).toBe('• Một\n• Hai')
    expect(markdownToPlainText('- A\n* B\n+ C')).toBe('• A\n• B\n• C')
  })

  it('handles the real AI reply from the bug report (bold + numbered list)', () => {
    const input = `Dạ, anh Trung! Shop em có bán nhiều sản phẩm, bao gồm:

1. **Sản phẩm chăm sóc da**: Kem dưỡng ẩm, serum, mặt nạ
2. **Sản phẩm trang điểm**: Kem nền, phấn phủ`
    const out = markdownToPlainText(input)
    expect(out).not.toContain('**')
    expect(out).toContain('• Sản phẩm chăm sóc da: Kem dưỡng ẩm, serum, mặt nạ')
    expect(out).toContain('• Sản phẩm trang điểm: Kem nền, phấn phủ')
  })

  it('preserves \\n\\n bubble splits and trims, collapses 3+ newlines', () => {
    expect(markdownToPlainText('A\n\n\n\nB')).toBe('A\n\nB')
    expect(markdownToPlainText('  hi  ')).toBe('hi')
  })

  it('returns empty string for empty/whitespace input', () => {
    expect(markdownToPlainText('')).toBe('')
    expect(markdownToPlainText('   ')).toBe('')
  })
})
