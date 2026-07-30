import { describe, it, expect, vi, beforeEach } from 'vitest'

const { prismaMock, queueMock, cacheMock } = vi.hoisted(() => ({
  prismaMock: { syncOutbox: { create: vi.fn() } },
  queueMock: { schedulePerfexFlush: vi.fn() },
  cacheMock: { getDebounceSeconds: vi.fn(() => 15) },
}))
vi.mock('../../../shared/prisma-client.js', () => ({ prisma: prismaMock }))
vi.mock('./perfex-queue.js', () => queueMock)
vi.mock('./perfex-enabled-cache.js', () => cacheMock)

import { enqueueSync } from './perfex-outbox.js'

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.syncOutbox.create.mockResolvedValue({ id: 'r1' })
})

describe('enqueueSync', () => {
  it('writes a pending outbox row and schedules a debounced flush', async () => {
    await enqueueSync({ orgId: 'o1', localType: 'contact', localId: 'c1', op: 'upsert' })
    expect(prismaMock.syncOutbox.create).toHaveBeenCalledWith({
      data: { orgId: 'o1', localType: 'contact', localId: 'c1', op: 'upsert', status: 'pending' },
    })
    expect(queueMock.schedulePerfexFlush).toHaveBeenCalledWith('o1', 15000) // debounceSeconds * 1000
  })

  it('never throws into the caller (best-effort) when the DB write fails', async () => {
    prismaMock.syncOutbox.create.mockRejectedValue(new Error('db down'))
    await expect(enqueueSync({ orgId: 'o1', localType: 'company', localId: 'co1', op: 'delete' })).resolves.toBeUndefined()
    expect(queueMock.schedulePerfexFlush).not.toHaveBeenCalled()
  })
})
