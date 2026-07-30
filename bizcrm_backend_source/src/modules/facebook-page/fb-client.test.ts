import { describe, it, expect } from 'vitest'
import { buildAuthorizeUrl } from './fb-client.js'

describe('buildAuthorizeUrl', () => {
  const base = {
    appId: '123456',
    redirectUri: 'https://api.example.com/api/v1/facebook-page/callback',
    state: 'abc-state',
    scopes: ['pages_show_list', 'pages_messaging'],
  }

  it('points at the Facebook OAuth dialog', () => {
    const url = new URL(buildAuthorizeUrl(base))
    expect(url.origin).toBe('https://www.facebook.com')
    expect(url.pathname).toMatch(/\/v\d+\.\d+\/dialog\/oauth$/)
  })

  it('carries client_id, redirect_uri, state, response_type=code and comma-joined scopes', () => {
    const url = new URL(buildAuthorizeUrl(base))
    expect(url.searchParams.get('client_id')).toBe('123456')
    expect(url.searchParams.get('redirect_uri')).toBe(base.redirectUri)
    expect(url.searchParams.get('state')).toBe('abc-state')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('pages_show_list,pages_messaging')
  })

  it('does NOT use PKCE (Facebook uses the app secret at exchange, not code_challenge)', () => {
    const url = new URL(buildAuthorizeUrl(base))
    expect(url.searchParams.get('code_challenge')).toBeNull()
    expect(url.searchParams.get('code_challenge_method')).toBeNull()
  })
})
