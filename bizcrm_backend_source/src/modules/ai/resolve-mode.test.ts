import { describe, it, expect } from 'vitest'
import { resolveConversationMode, isAfterHours, startOfDayInTimezone, type ScheduleConfig } from './ai-config-service.js'

const schedule: ScheduleConfig = {
  enabled: true, startHour: 8, endHour: 18,
  daytimeMode: 'suggest', nighttimeMode: 'auto', timezone: 'Asia/Ho_Chi_Minh',
}
const day = new Date('2026-08-30T03:00:00Z')   // 10:00 VN
const night = new Date('2026-08-30T15:00:00Z') // 22:00 VN
const base = { orgId: 'o', autoReplyEnabled: true, defaultAiMode: 'manual', schedule }

describe('resolveConversationMode — lịch giờ vs chế độ hội thoại', () => {
  it('lịch chia ngày/đêm đúng múi giờ VN', () => {
    expect(isAfterHours(day, 'Asia/Ho_Chi_Minh', 8, 18)).toBe(false)
    expect(isAfterHours(night, 'Asia/Ho_Chi_Minh', 8, 18)).toBe(true)
  })

  it('"Thủ công" do nhân viên chọn (có lý do) là quyết định cuối — lịch không ghi đè', () => {
    expect(resolveConversationMode({ ...base, convAiMode: 'manual', convAiModeReason: 'set by staff u1', currentTime: night })).toBe('manual')
    expect(resolveConversationMode({ ...base, convAiMode: 'manual', convAiModeReason: 'set by staff u1', currentTime: day })).toBe('manual')
  })

  it('AI vừa chuyển nhân viên (handoff đặt manual kèm lý do) → AI KHÔNG tự bật lại ban đêm', () => {
    expect(resolveConversationMode({ ...base, convAiMode: 'manual', convAiModeReason: 'Khách yêu cầu gặp người', currentTime: night })).toBe('manual')
  })

  it('manual chỉ là mặc định lúc tạo (không lý do) → đi theo lịch: ngày suggest, đêm auto', () => {
    expect(resolveConversationMode({ ...base, convAiMode: 'manual', convAiModeReason: null, currentTime: day })).toBe('suggest')
    expect(resolveConversationMode({ ...base, convAiMode: 'manual', convAiModeReason: null, currentTime: night })).toBe('auto')
  })

  it('hội thoại chọn rõ suggest/auto thì giữ nguyên bất kể giờ', () => {
    expect(resolveConversationMode({ ...base, convAiMode: 'suggest', convAiModeReason: 'set by staff', currentTime: night })).toBe('suggest')
    expect(resolveConversationMode({ ...base, convAiMode: 'auto', currentTime: day })).toBe('auto')
  })

  it('"off" và tắt tổng luôn thắng', () => {
    expect(resolveConversationMode({ ...base, convAiMode: 'off', currentTime: night })).toBe('manual')
    expect(resolveConversationMode({ ...base, autoReplyEnabled: false, convAiMode: 'auto' })).toBe('manual')
  })

  it('không bật lịch → chế độ hội thoại, rồi mặc định org', () => {
    const noSched = { ...base, schedule: { ...schedule, enabled: false } }
    expect(resolveConversationMode({ ...noSched, convAiMode: 'manual' })).toBe('manual')
    expect(resolveConversationMode({ ...noSched, convAiMode: null, defaultAiMode: 'suggest' })).toBe('suggest')
  })
})

describe('startOfDayInTimezone — quota reset theo giờ VN', () => {
  it('00:00 VN = 17:00 UTC hôm trước', () => {
    const now = new Date('2026-08-30T03:30:45.123Z') // 10:30:45 VN ngày 30/08
    expect(startOfDayInTimezone('Asia/Ho_Chi_Minh', now).toISOString()).toBe('2026-08-29T17:00:00.000Z')
  })
  it('lúc 01:00 VN vẫn thuộc ngày VN hôm đó (không phải ngày UTC)', () => {
    const now = new Date('2026-08-29T18:00:00.000Z') // 01:00 VN 30/08
    expect(startOfDayInTimezone('Asia/Ho_Chi_Minh', now).toISOString()).toBe('2026-08-29T17:00:00.000Z')
  })
})
