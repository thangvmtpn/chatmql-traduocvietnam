import { describe, it, expect } from 'vitest'
import { normalizeConfig } from './perfex-config.js'

describe('normalizeConfig', () => {
  it('applies defaults for an empty/partial config', () => {
    const c = normalizeConfig({})
    expect(c.syncContacts).toBe(true)
    expect(c.syncLeads).toBe(false)
    expect(c.syntheticEmailFallbackDomain).toBe('noreply.bizcrm.vn')
    expect(c.debounceSeconds).toBe(15)
    expect(c.baseUrl).toBe('')
    expect(c.authTokenEnc).toBe('')
  })

  it('passes through provided values', () => {
    const c = normalizeConfig({
      baseUrl: 'https://crm.x', authTokenEnc: 'enc', syncLeads: true,
      leadSourceId: 5, fallbackCustomerId: 9, debounceSeconds: 30,
    })
    expect(c.baseUrl).toBe('https://crm.x')
    expect(c.authTokenEnc).toBe('enc')
    expect(c.syncLeads).toBe(true)
    expect(c.leadSourceId).toBe(5)
    expect(c.fallbackCustomerId).toBe(9)
    expect(c.debounceSeconds).toBe(30)
  })

  it('tolerates null/undefined raw input', () => {
    expect(normalizeConfig(null).debounceSeconds).toBe(15)
    expect(normalizeConfig(undefined).syncContacts).toBe(true)
  })
})
