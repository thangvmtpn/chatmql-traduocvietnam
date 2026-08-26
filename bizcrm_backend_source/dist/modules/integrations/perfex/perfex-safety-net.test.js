import { describe, it, expect, vi, beforeEach } from 'vitest';
const { prismaMock, cacheMock, queueMock } = vi.hoisted(() => ({
    prismaMock: { syncOutbox: { deleteMany: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() } },
    cacheMock: { isPerfexEnabled: vi.fn(), getEnabledOrgIds: vi.fn(() => ['o1', 'o2']) },
    queueMock: { schedulePerfexFlush: vi.fn() },
}));
vi.mock('../../../shared/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('./perfex-enabled-cache.js', () => cacheMock);
vi.mock('./perfex-queue.js', () => queueMock);
import { runPerfexSafetyNet } from './perfex-safety-net.js';
beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.syncOutbox.deleteMany.mockResolvedValue({ count: 3 });
    prismaMock.syncOutbox.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.syncOutbox.findMany.mockResolvedValue([{ orgId: 'o1' }, { orgId: 'o2' }]);
});
describe('runPerfexSafetyNet', () => {
    it('prunes old rows, re-queues failed, reschedules only ENABLED stale orgs', async () => {
        cacheMock.isPerfexEnabled.mockImplementation((id) => id === 'o1'); // o2 disabled
        await runPerfexSafetyNet();
        // retention: prunes terminal rows (done/skipped OR exhausted-failed) past cutoff
        expect(prismaMock.syncOutbox.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                createdAt: expect.objectContaining({ lt: expect.any(Date) }),
                OR: expect.arrayContaining([{ status: { in: ['done', 'skipped'] } }]),
            }),
        }));
        // retry: failed under cap → pending, scoped to ENABLED orgs only
        expect(prismaMock.syncOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ status: 'failed', orgId: { in: ['o1', 'o2'] } }),
            data: { status: 'pending' },
        }));
        // only the enabled org (o1) gets a flush
        expect(queueMock.schedulePerfexFlush).toHaveBeenCalledTimes(1);
        expect(queueMock.schedulePerfexFlush).toHaveBeenCalledWith('o1', 0);
    });
    it('does nothing surprising when there is no work', async () => {
        prismaMock.syncOutbox.deleteMany.mockResolvedValue({ count: 0 });
        prismaMock.syncOutbox.updateMany.mockResolvedValue({ count: 0 });
        prismaMock.syncOutbox.findMany.mockResolvedValue([]);
        await runPerfexSafetyNet();
        expect(queueMock.schedulePerfexFlush).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=perfex-safety-net.test.js.map