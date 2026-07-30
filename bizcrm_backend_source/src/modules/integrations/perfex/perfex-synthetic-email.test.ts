import { describe, it, expect } from 'vitest'
import { synthesizeEmail, normalizeSource, isSyntheticEmail } from './perfex-synthetic-email.js'

const FB = 'noreply.bizcrm.vn'

describe('normalizeSource', () => {
  it('maps known aliases to canonical keys', () => {
    expect(normalizeSource('FB')).toBe('facebook')
    expect(normalizeSource('  TikTok ')).toBe('tiktok')
    expect(normalizeSource('zalo_oa')).toBe('zalo')
    expect(normalizeSource('whatsapp')).toBe('whatsapp')
  })
  it('falls back to "other" for unknown / empty', () => {
    expect(normalizeSource('Khác')).toBe('other')
    expect(normalizeSource('')).toBe('other')
    expect(normalizeSource(null)).toBe('other')
    expect(normalizeSource(undefined)).toBe('other')
  })
})

describe('synthesizeEmail', () => {
  it('uses provider domain with zaloUid for Zalo', () => {
    expect(synthesizeEmail({ id: 'i', source: 'Zalo', zaloUid: 'abc123' }, FB)).toBe('abc123@zalo.me')
  })
  it('uses wa.me with phone digits for WhatsApp', () => {
    expect(synthesizeEmail({ id: 'i', source: 'WhatsApp', phone: '+84 90-123-4567' }, FB)).toBe('84901234567@wa.me')
  })
  it('falls back to uuid when no zaloUid/phone', () => {
    expect(synthesizeEmail({ id: 'uuid-1', source: 'Facebook' }, FB)).toBe('uuid-1@facebook.com')
  })
  it('keeps source prefix + fallback domain when provider unknown', () => {
    expect(synthesizeEmail({ id: 'u1', source: 'Website' }, FB)).toBe('web.u1@noreply.bizcrm.vn')
    expect(synthesizeEmail({ id: 'u2', source: null }, FB)).toBe('other.u2@noreply.bizcrm.vn')
  })
  it('is deterministic for the same input', () => {
    const a = synthesizeEmail({ id: 'i', source: 'Zalo', zaloUid: 'z' }, FB)
    const b = synthesizeEmail({ id: 'i', source: 'Zalo', zaloUid: 'z' }, FB)
    expect(a).toBe(b)
  })
})

describe('isSyntheticEmail', () => {
  it('detects unambiguous placeholder domains + fallback', () => {
    expect(isSyntheticEmail('abc@zalo.me', FB)).toBe(true)
    expect(isSyntheticEmail('84901234567@wa.me', FB)).toBe(true)
    expect(isSyntheticEmail('x@t.me', FB)).toBe(true)
    expect(isSyntheticEmail('web.u1@noreply.bizcrm.vn', FB)).toBe(true)
  })
  it('does NOT misclassify real corporate emails on mailbox-capable provider domains', () => {
    expect(isSyntheticEmail('employee@x.com', FB)).toBe(false)
    expect(isSyntheticEmail('user@linkedin.com', FB)).toBe(false)
    expect(isSyntheticEmail('a@facebook.com', FB)).toBe(false)
    expect(isSyntheticEmail('real@gmail.com', FB)).toBe(false)
  })
  it('handles null/empty', () => {
    expect(isSyntheticEmail(null, FB)).toBe(false)
    expect(isSyntheticEmail('', FB)).toBe(false)
  })
})
