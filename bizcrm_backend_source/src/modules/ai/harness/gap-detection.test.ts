import { describe, it, expect } from 'vitest'
import {
  normalizeGapType, normalizeQuestion, isConfidentHit, looksLikeDefer,
  shouldAutoLogGap, GAP_HIT_THRESHOLD,
} from './gap-detection.js'

describe('normalizeGapType', () => {
  it('passes through the 3 valid types', () => {
    expect(normalizeGapType('missing_info')).toBe('missing_info')
    expect(normalizeGapType('needs_knowledge')).toBe('needs_knowledge')
    expect(normalizeGapType('needs_staff')).toBe('needs_staff')
  })
  it('defaults unknown / empty / undefined to missing_info', () => {
    expect(normalizeGapType('ESCALATION')).toBe('missing_info')
    expect(normalizeGapType('')).toBe('missing_info')
    expect(normalizeGapType(undefined)).toBe('missing_info')
  })
})

describe('normalizeQuestion', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeQuestion('  giá   nhổ răng   khôn ')).toBe('giá nhổ răng khôn')
    expect(normalizeQuestion('a\n\tb')).toBe('a b')
  })
  it('caps at 1000 chars', () => {
    expect(normalizeQuestion('x'.repeat(2000))).toHaveLength(1000)
  })
})

describe('isConfidentHit', () => {
  it('counts hits at/above the threshold', () => {
    expect(isConfidentHit(GAP_HIT_THRESHOLD)).toBe(true)
    expect(isConfidentHit(0.75)).toBe(true)
  })
  it('rejects low-relevance noise below the threshold (0.4–0.58)', () => {
    expect(isConfidentHit(0.59)).toBe(false)
    expect(isConfidentHit(0.41)).toBe(false)
  })
  it('treats null/undefined score as NOT confident', () => {
    expect(isConfidentHit(null)).toBe(false)
    expect(isConfidentHit(undefined)).toBe(false)
  })
})

describe('looksLikeDefer', () => {
  it('detects standard defer phrases', () => {
    expect(looksLikeDefer('Dạ em chưa thấy thông tin này, em kiểm tra lại rồi báo ạ')).toBe(true)
    expect(looksLikeDefer('Để em chuyển nhân viên hỗ trợ mình nhé')).toBe(true)
  })
  it('is case-insensitive', () => {
    expect(looksLikeDefer('EM KIỂM TRA LẠI RỒI BÁO')).toBe(true)
  })
  it('returns false for a confident answer (no defer wording)', () => {
    expect(looksLikeDefer('Dạ nhổ răng khôn bên em có 3 mức: 1tr, 2tr, 3tr ạ')).toBe(false)
    expect(looksLikeDefer('Dạ bên em có ạ, mình cho bé khám sớm nhé')).toBe(false)
  })
})

describe('shouldAutoLogGap', () => {
  const base = { searchAttempted: true, searchHit: false, gapLogged: false, replyText: 'em kiểm tra lại rồi báo' }
  it('logs when AI searched, found nothing confident, did not log, and deferred', () => {
    expect(shouldAutoLogGap(base)).toBe(true)
  })
  it('does NOT log when the AI answered (no defer) — e.g. from prompt/scenario/instructions', () => {
    expect(shouldAutoLogGap({ ...base, replyText: 'Dạ bên em có dịch vụ này ạ' })).toBe(false)
  })
  it('does NOT log when a confident hit answered (searchHit)', () => {
    expect(shouldAutoLogGap({ ...base, searchHit: true })).toBe(false)
  })
  it('does NOT log when the model already logged via the tool (gapLogged)', () => {
    expect(shouldAutoLogGap({ ...base, gapLogged: true })).toBe(false)
  })
  it('does NOT log when no search ran (no data-intent / no search tools)', () => {
    expect(shouldAutoLogGap({ ...base, searchAttempted: false })).toBe(false)
  })
})
