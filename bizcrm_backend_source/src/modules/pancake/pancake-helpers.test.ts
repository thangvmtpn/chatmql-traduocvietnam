import { describe, it, expect } from 'vitest'
import { serializePancakeNotes } from './pancake-helpers.js'

describe('serializePancakeNotes', () => {
  it('returns null for null / undefined / empty', () => {
    expect(serializePancakeNotes(null)).toBeNull()
    expect(serializePancakeNotes(undefined)).toBeNull()
    expect(serializePancakeNotes('')).toBeNull()
    expect(serializePancakeNotes('   ')).toBeNull()
    expect(serializePancakeNotes([])).toBeNull()
  })

  it('passes a plain string through trimmed', () => {
    expect(serializePancakeNotes('  khách cần tư vấn  ')).toBe('khách cần tư vấn')
  })

  // The real bug: Pancake returns an ARRAY of note objects despite its string type.
  it('flattens an array of note objects to their messages, newline-joined', () => {
    const notes = [
      { id: '1', message: 'Đã tư vấn implant', created_by: { fb_name: 'NV A' } },
      { id: '2', message: 'Khách hẹn quay lại', created_by: { fb_name: 'NV B' } },
    ]
    expect(serializePancakeNotes(notes)).toBe('Đã tư vấn implant\nKhách hẹn quay lại')
  })

  it('handles an array of plain strings', () => {
    expect(serializePancakeNotes(['a', ' b ', ''])).toBe('a\nb')
  })

  it('skips note objects with no message', () => {
    const notes = [{ id: '1' }, { id: '2', message: 'có nội dung' }, { id: '3', message: '' }]
    expect(serializePancakeNotes(notes)).toBe('có nội dung')
  })

  it('caps very long serialized notes', () => {
    const notes = [{ message: 'x'.repeat(9000) }]
    const out = serializePancakeNotes(notes)
    expect(out).not.toBeNull()
    expect(out!.length).toBe(5000)
  })

  it('returns null for a non-string / non-array scalar', () => {
    expect(serializePancakeNotes(42)).toBeNull()
    expect(serializePancakeNotes(true)).toBeNull()
  })
})
