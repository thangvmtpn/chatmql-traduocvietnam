import { requirePlatformAdmin } from './platform-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import { getOrgStatsMap, getGlobalTotals } from './org-stats-service.js';
import { orgDisplayStatus, isExpiringWithin } from './org-license.js';
const COMPANIES_CAP = 1000; // safety cap; log if exceeded
export async function platformReportRoutes(app) {
    app.addHook('preHandler', requirePlatformAdmin);
    // GET /api/v1/platform/reports/overview — system-wide KPIs
    app.get('/api/v1/platform/reports/overview', async () => {
        const now = new Date();
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const orgs = await prisma.organization.findMany({ select: { status: true, expiresAt: true, createdAt: true } });
        let active = 0, suspended = 0, expired = 0, unlimited = 0, expiringIn7d = 0, newLast30d = 0;
        for (const o of orgs) {
            const ds = orgDisplayStatus(o, now);
            if (ds === 'suspended')
                suspended++;
            else if (ds === 'expired')
                expired++;
            else if (ds === 'unlimited')
                unlimited++;
            else
                active++;
            if (isExpiringWithin(o, 7, now))
                expiringIn7d++;
            if (o.createdAt >= monthAgo)
                newLast30d++;
        }
        const totals = await getGlobalTotals();
        return {
            companies: { total: orgs.length, active, suspended, expired, unlimited, expiringIn7d, newLast30d },
            users: totals.users,
            contacts: totals.contacts,
            conversations: totals.conversations,
        };
    });
    // GET /api/v1/platform/reports/companies — per-company rows (capped)
    app.get('/api/v1/platform/reports/companies', async () => {
        const rows = await buildCompanyRows();
        return { items: rows, capped: rows.length >= COMPANIES_CAP };
    });
    // GET /api/v1/platform/reports/companies.csv — same data as CSV download
    app.get('/api/v1/platform/reports/companies.csv', async (_request, reply) => {
        const rows = await buildCompanyRows();
        const header = ['id', 'name', 'status', 'expiresAt', 'plan', 'users', 'contacts', 'conversations', 'createdAt'];
        const escape = (v) => {
            const s = v === null || v === undefined ? '' : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const lines = [header.join(',')];
        for (const r of rows) {
            lines.push([
                r.id, r.name, r.displayStatus, r.expiresAt ?? '', r.plan ?? '',
                r.stats.users, r.stats.contacts, r.stats.conversations, r.createdAt.toISOString(),
            ].map(escape).join(','));
        }
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="companies-report.csv"');
        // Prepend UTF-8 BOM so Excel renders Vietnamese company names correctly.
        return '﻿' + lines.join('\n');
    });
    async function buildCompanyRows() {
        const orgs = await prisma.organization.findMany({
            orderBy: { createdAt: 'desc' }, take: COMPANIES_CAP,
            select: { id: true, name: true, status: true, expiresAt: true, plan: true, createdAt: true },
        });
        if (orgs.length >= COMPANIES_CAP) {
            app.log.warn(`[platform-reports] company report capped at ${COMPANIES_CAP} rows`);
        }
        const stats = await getOrgStatsMap(orgs.map((o) => o.id));
        return orgs.map((o) => ({
            ...o,
            displayStatus: orgDisplayStatus(o),
            expiringSoon: isExpiringWithin(o, 7),
            stats: stats.get(o.id) ?? { users: 0, contacts: 0, conversations: 0 },
        }));
    }
}
//# sourceMappingURL=report-routes.js.map