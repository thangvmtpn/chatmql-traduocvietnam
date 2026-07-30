import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks — declared via vi.hoisted so they exist inside the hoisted vi.mock factories ──
const { prismaMock, push } = vi.hoisted(() => ({
  prismaMock: {
    syncOutbox: { findMany: vi.fn(), updateMany: vi.fn() },
    integration: { update: vi.fn() },
    company: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn() },
  },
  push: { pushCompany: vi.fn(), pushContact: vi.fn(), pushLead: vi.fn(), deleteEntity: vi.fn() },
}))
vi.mock('../../../shared/prisma-client.js', () => ({ prisma: prismaMock }))
vi.mock('./perfex-client.js', () => ({ PerfexClient: class {} }))
vi.mock('./perfex-config.js', () => ({
  loadPerfexIntegration: vi.fn(),
  decryptAuthToken: vi.fn(() => 'tok'),
}))
vi.mock('./perfex-push.js', () => push)

import { flushOrg } from './perfex-sync-service.js'
import { loadPerfexIntegration } from './perfex-config.js'

const ORG = 'org-1'
const integration = (over = {}) => ({
  integrationId: 'int-1', enabled: true,
  config: { baseUrl: 'https://crm.x', authTokenEnc: 'enc', syncContacts: true, syncLeads: false, syntheticEmailFallbackDomain: 'noreply.bizcrm.vn', debounceSeconds: 15, ...over },
})
const row = (over: Record<string, unknown>) => ({ id: 'r', orgId: ORG, localType: 'contact', localId: 'c1', op: 'upsert', status: 'pending', createdAt: new Date(), ...over })

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.syncOutbox.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.integration.update.mockResolvedValue({})
  prismaMock.company.findFirst.mockResolvedValue({ id: 'co1', orgId: ORG, name: 'Acme', deletedAt: null })
  prismaMock.contact.findFirst.mockResolvedValue({ id: 'c1', orgId: ORG, lifecycleStage: 'subscriber', companyId: null, deletedAt: null })
})

describe('flushOrg', () => {
  it('no pending rows → no work', async () => {
    ;(loadPerfexIntegration as any).mockResolvedValue(integration())
    prismaMock.syncOutbox.findMany.mockResolvedValue([])
    await flushOrg(ORG)
    expect(push.pushContact).not.toHaveBeenCalled()
    expect(prismaMock.integration.update).not.toHaveBeenCalled()
  })

  it('integration disabled → mark rows skipped, no push', async () => {
    ;(loadPerfexIntegration as any).mockResolvedValue({ ...integration(), enabled: false })
    prismaMock.syncOutbox.findMany.mockResolvedValue([row({ id: 'r1' })])
    await flushOrg(ORG)
    expect(push.pushContact).not.toHaveBeenCalled()
    expect(prismaMock.syncOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'skipped' }),
    }))
  })

  it('coalesces 3 rows for same contact into ONE push', async () => {
    ;(loadPerfexIntegration as any).mockResolvedValue(integration())
    prismaMock.syncOutbox.findMany.mockResolvedValue([
      row({ id: 'r1', op: 'upsert' }), row({ id: 'r2', op: 'upsert' }), row({ id: 'r3', op: 'upsert' }),
    ])
    await flushOrg(ORG)
    expect(push.pushContact).toHaveBeenCalledTimes(1)
    // all 3 row ids marked done together
    expect(prismaMock.syncOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['r1', 'r2', 'r3'] } },
      data: expect.objectContaining({ status: 'done' }),
    }))
  })

  it('processes Company before Contact', async () => {
    ;(loadPerfexIntegration as any).mockResolvedValue(integration())
    prismaMock.syncOutbox.findMany.mockResolvedValue([
      row({ id: 'rc', localType: 'contact', localId: 'c1' }),
      row({ id: 'rco', localType: 'company', localId: 'co1' }),
    ])
    await flushOrg(ORG)
    expect(push.pushCompany.mock.invocationCallOrder[0]).toBeLessThan(push.pushContact.mock.invocationCallOrder[0])
  })

  it('one group failing does not abort the others', async () => {
    ;(loadPerfexIntegration as any).mockResolvedValue(integration())
    prismaMock.syncOutbox.findMany.mockResolvedValue([
      row({ id: 'rco', localType: 'company', localId: 'co1' }),
      row({ id: 'rc', localType: 'contact', localId: 'c1' }),
    ])
    push.pushCompany.mockRejectedValueOnce(new Error('boom'))
    await flushOrg(ORG)
    expect(push.pushContact).toHaveBeenCalledTimes(1) // contact still processed
    expect(prismaMock.syncOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ['rco'] } }, data: expect.objectContaining({ status: 'failed' }),
    }))
  })

  it('routes lead-stage contact to pushLead when syncLeads on', async () => {
    ;(loadPerfexIntegration as any).mockResolvedValue(integration({ syncLeads: true }))
    prismaMock.contact.findFirst.mockResolvedValue({ id: 'c1', orgId: ORG, lifecycleStage: 'lead', companyId: null, deletedAt: null })
    prismaMock.syncOutbox.findMany.mockResolvedValue([row({ id: 'r1' })])
    await flushOrg(ORG)
    expect(push.pushLead).toHaveBeenCalledTimes(1)
    expect(push.pushContact).not.toHaveBeenCalled()
  })

  it('delete op → deleteEntity', async () => {
    ;(loadPerfexIntegration as any).mockResolvedValue(integration())
    prismaMock.syncOutbox.findMany.mockResolvedValue([row({ id: 'r1', op: 'delete' })])
    await flushOrg(ORG)
    expect(push.deleteEntity).toHaveBeenCalledWith(expect.anything(), 'contact', 'c1')
    expect(push.pushContact).not.toHaveBeenCalled()
  })

  it('soft-deleted contact on upsert → treated as delete', async () => {
    ;(loadPerfexIntegration as any).mockResolvedValue(integration())
    prismaMock.contact.findFirst.mockResolvedValue({ id: 'c1', orgId: ORG, lifecycleStage: 'subscriber', companyId: null, deletedAt: new Date() })
    prismaMock.syncOutbox.findMany.mockResolvedValue([row({ id: 'r1', op: 'upsert' })])
    await flushOrg(ORG)
    expect(push.deleteEntity).toHaveBeenCalled()
    expect(push.pushContact).not.toHaveBeenCalled()
  })
})
