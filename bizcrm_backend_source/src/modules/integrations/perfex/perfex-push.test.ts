import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Company, Contact } from '@prisma/client'

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    externalSyncRef: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    company: { findFirst: vi.fn() },
    contact: { update: vi.fn() },
    integration: { update: vi.fn() },
  },
}))
vi.mock('../../../shared/prisma-client.js', () => ({ prisma: prismaMock }))

import { pushCompany, pushContact, pushLead, deleteEntity, type FlushContext } from './perfex-push.js'
import { companyToCustomer, payloadHash } from './perfex-mappers.js'
import type { PerfexIntegrationConfig } from './perfex-types.js'

const config = (): PerfexIntegrationConfig => ({
  baseUrl: 'https://x', authTokenEnc: 'e', syncContacts: true, syncLeads: true,
  leadSourceId: 1, leadStatusId: 2, leadAssignedId: 3, fallbackCustomerId: 99,
  syntheticEmailFallbackDomain: 'noreply.bizcrm.vn', debounceSeconds: 15,
})

function makeClient() {
  let searchCalls = 0
  return {
    createCustomer: vi.fn().mockResolvedValue({ recordId: 500 }),
    updateCustomer: vi.fn().mockResolvedValue(undefined),
    deleteCustomer: vi.fn().mockResolvedValue(undefined),
    createContact: vi.fn().mockResolvedValue(undefined),
    updateContact: vi.fn().mockResolvedValue(undefined),
    deleteContact: vi.fn().mockResolvedValue(undefined),
    // 1st search (pre-create) → none; later searches echo the queried email back as a found contact
    searchContacts: vi.fn().mockImplementation((q: string) => Promise.resolve(searchCalls++ === 0 ? [] : [{ id: '55', email: q }])),
    createLead: vi.fn().mockResolvedValue({ recordId: 700 }),
    updateLead: vi.fn().mockResolvedValue(undefined),
    deleteLead: vi.fn().mockResolvedValue(undefined),
  }
}

const ctx = (client: ReturnType<typeof makeClient>): FlushContext => ({
  orgId: 'o1', integrationId: 'int1', config: config(), client: client as never,
})

const contact = (over: Partial<Contact> = {}): Contact => ({
  id: 'c1', orgId: 'o1', companyId: null, zaloUid: null, phone: null, email: null,
  fullName: 'Test User', crmName: null, source: 'manual', isPrimaryContact: false,
  jobTitle: null, lifecycleStage: 'subscriber', notes: null, metadata: {},
} as unknown as Contact)

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.externalSyncRef.findUnique.mockResolvedValue(null)
  prismaMock.externalSyncRef.upsert.mockResolvedValue({})
  prismaMock.externalSyncRef.delete.mockResolvedValue({})
  prismaMock.contact.update.mockResolvedValue({})
})

describe('pushCompany', () => {
  const company = { id: 'co1', name: 'Acme', taxCode: null, phone: null, website: null, address: null } as Company

  it('creates a new customer + records the ref', async () => {
    const client = makeClient()
    const id = await pushCompany(ctx(client), company)
    expect(client.createCustomer).toHaveBeenCalledOnce()
    expect(id).toBe(500)
    expect(prismaMock.externalSyncRef.upsert).toHaveBeenCalled()
  })

  it('skips the API call when payload hash is unchanged', async () => {
    const client = makeClient()
    const hash = payloadHash(companyToCustomer(company) as unknown as Record<string, unknown>)
    prismaMock.externalSyncRef.findUnique.mockResolvedValue({ id: 'r', externalId: '500', lastHash: hash })
    const id = await pushCompany(ctx(client), company)
    expect(client.createCustomer).not.toHaveBeenCalled()
    expect(client.updateCustomer).not.toHaveBeenCalled()
    expect(id).toBe(500)
  })

  it('updates when an existing ref has a different hash', async () => {
    const client = makeClient()
    prismaMock.externalSyncRef.findUnique.mockResolvedValue({ id: 'r', externalId: '500', lastHash: 'STALE' })
    await pushCompany(ctx(client), company)
    expect(client.updateCustomer).toHaveBeenCalledWith(500, expect.objectContaining({ company: 'Acme' }))
  })
})

describe('pushContact', () => {
  it('synthesizes email, creates, recovers id by search, sets ref', async () => {
    const client = makeClient()
    await pushContact(ctx(client), contact())
    expect(client.createContact).toHaveBeenCalledOnce()
    const payload = client.createContact.mock.calls[0][0]
    expect(payload.email).toBe('manual.c1@noreply.bizcrm.vn') // synthetic (no real email, no provider)
    expect(payload.donotsendwelcomeemail).toBe('on')
    expect(client.searchContacts).toHaveBeenCalled() // id recovery
    expect(prismaMock.externalSyncRef.upsert).toHaveBeenCalled()
  })

  it('is idempotent: adopts an existing Perfex contact instead of creating a duplicate', async () => {
    const client = makeClient()
    client.searchContacts.mockResolvedValue([{ id: '88', email: 'manual.c1@noreply.bizcrm.vn' }]) // found on first search
    await pushContact(ctx(client), contact())
    expect(client.createContact).not.toHaveBeenCalled()
    expect(client.updateContact).toHaveBeenCalledWith(88, expect.anything())
  })
})

describe('pushLead', () => {
  it('creates a lead + removes a stale contact ref on promotion', async () => {
    const client = makeClient()
    // first findUnique (lead ref) none; second (stale contact ref) exists → should be deleted
    prismaMock.externalSyncRef.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'rc', externalId: '88' })
    await pushLead(ctx(client), contact({ email: 'l@x.com' }), 'Acme')
    expect(client.createLead).toHaveBeenCalledOnce()
    expect(client.deleteContact).toHaveBeenCalledWith(88) // stale contact cleaned up
  })
})

describe('deleteEntity', () => {
  it('deletes both contact and lead Perfex records if mapped', async () => {
    const client = makeClient()
    prismaMock.externalSyncRef.findUnique
      .mockResolvedValueOnce({ id: 'rc', externalId: '11' }) // contact ref
      .mockResolvedValueOnce({ id: 'rl', externalId: '22' }) // lead ref
    await deleteEntity(ctx(client), 'contact', 'c1')
    expect(client.deleteContact).toHaveBeenCalledWith(11)
    expect(client.deleteLead).toHaveBeenCalledWith(22)
    expect(prismaMock.externalSyncRef.delete).toHaveBeenCalledTimes(2)
  })

  it('no-op when no ref exists', async () => {
    const client = makeClient()
    prismaMock.externalSyncRef.findUnique.mockResolvedValue(null)
    await deleteEntity(ctx(client), 'company', 'co1')
    expect(client.deleteCustomer).not.toHaveBeenCalled()
  })
})
