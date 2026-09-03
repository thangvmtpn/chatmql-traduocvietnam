import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFunnel, winRate, avgDaysToClose, rankUsers, fillPeriods, } from './quote-analytics-calc.js';
const counts = (p = {}) => ({
    draft: 0, sent: 0, viewed: 0, accepted: 0, rejected: 0, expired: 0, canceled: 0, ...p,
});
describe('buildFunnel — phễu tích luỹ', () => {
    it('báo giá đã chấp nhận vẫn được tính là đã gửi và đã xem', () => {
        // Nếu đếm theo trạng thái hiện tại, "đã gửi" sẽ = 0 và phễu trông thủng đáy
        const f = buildFunnel(counts({ accepted: 10 }));
        expect(f.map((s) => s.count)).toEqual([10, 10, 10, 10]);
        expect(f.every((s) => s.pctOfTop === 100)).toBe(true);
    });
    it('tính đúng tỉ lệ rơi rụng từng bước', () => {
        const f = buildFunnel(counts({ draft: 20, sent: 30, viewed: 20, accepted: 10, rejected: 20 }));
        // created 100 · sent 80 · viewed 50 · accepted 10
        expect(f.map((s) => s.count)).toEqual([100, 80, 50, 10]);
        expect(f.map((s) => s.pctOfTop)).toEqual([100, 80, 50, 10]);
        expect(f.map((s) => s.pctOfPrev)).toEqual([100, 80, 62.5, 20]);
    });
    it('bản nháp KHÔNG được tính là đã gửi', () => {
        const f = buildFunnel(counts({ draft: 5 }));
        expect(f[0].count).toBe(5);
        expect(f[1].count).toBe(0);
    });
    it('bản huỷ tính vào "đã tạo" nhưng không vào "đã gửi"', () => {
        const f = buildFunnel(counts({ canceled: 4 }));
        expect(f[0].count).toBe(4);
        expect(f[1].count).toBe(0);
    });
    it('không có dữ liệu → 0 hết, không chia cho 0', () => {
        const f = buildFunnel(counts());
        expect(f.every((s) => s.count === 0 && s.pctOfTop === 0)).toBe(true);
    });
});
describe('winRate', () => {
    it('chỉ tính trên số đã ngã ngũ', () => {
        // 10 chốt / (10 + 5 + 5) = 50% — 100 bản đang chờ KHÔNG kéo tỉ lệ xuống
        expect(winRate(counts({ accepted: 10, rejected: 5, expired: 5, sent: 100, draft: 50 }))).toBe(50);
    });
    it('chưa có kết quả nào → 0, không NaN', () => {
        expect(winRate(counts({ draft: 10, sent: 10 }))).toBe(0);
    });
    it('chốt hết → 100%', () => {
        expect(winRate(counts({ accepted: 7 }))).toBe(100);
    });
    it('làm tròn 1 số lẻ', () => {
        expect(winRate(counts({ accepted: 1, rejected: 2 }))).toBe(33.3);
    });
});
describe('avgDaysToClose', () => {
    const d = (s) => new Date(s);
    it('trung bình số ngày gửi → phản hồi', () => {
        const r = avgDaysToClose([
            { sentAt: d('2026-07-01T00:00:00Z'), respondedAt: d('2026-07-03T00:00:00Z') },
            { sentAt: d('2026-07-01T00:00:00Z'), respondedAt: d('2026-07-05T00:00:00Z') },
        ]);
        expect(r).toBe(3);
    });
    it('bỏ qua bản thiếu mốc thời gian', () => {
        const r = avgDaysToClose([
            { sentAt: d('2026-07-01T00:00:00Z'), respondedAt: d('2026-07-03T00:00:00Z') },
            { sentAt: null, respondedAt: d('2026-07-05T00:00:00Z') },
            { sentAt: d('2026-07-01T00:00:00Z'), respondedAt: null },
        ]);
        expect(r).toBe(2);
    });
    it('không có dữ liệu → null (KHÔNG phải 0, để UI hiện "—")', () => {
        expect(avgDaysToClose([])).toBeNull();
        expect(avgDaysToClose([{ sentAt: null, respondedAt: null }])).toBeNull();
    });
    it('bỏ qua khoảng âm (dữ liệu bẩn)', () => {
        const r = avgDaysToClose([
            { sentAt: d('2026-07-10T00:00:00Z'), respondedAt: d('2026-07-01T00:00:00Z') },
        ]);
        expect(r).toBeNull();
    });
});
describe('rankUsers', () => {
    it('xếp theo doanh thu chốt, hoà thì xét tỉ lệ chốt', () => {
        const r = rankUsers([
            { userId: 'a', userName: 'An', sent: 10, accepted: 2, rejected: 0, expired: 0, wonValue: 100 },
            { userId: 'b', userName: 'Bình', sent: 10, accepted: 5, rejected: 0, expired: 0, wonValue: 500 },
            { userId: 'c', userName: 'Cường', sent: 10, accepted: 1, rejected: 9, expired: 0, wonValue: 100 },
        ]);
        expect(r.map((x) => x.userName)).toEqual(['Bình', 'An', 'Cường']);
        expect(r[1].winRate).toBe(100); // An: 2/(2+0+0)
        expect(r[2].winRate).toBe(10); // Cường: 1/(1+9+0)
    });
    it('sale chưa có kết quả → winRate 0, không NaN', () => {
        const r = rankUsers([{ userId: 'a', userName: 'An', sent: 5, accepted: 0, rejected: 0, expired: 0, wonValue: 0 }]);
        expect(r[0].winRate).toBe(0);
    });
});
describe('ranh giới multi-tenant — báo cáo báo giá', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const svc = readFileSync(join(dir, 'quote-analytics-service.ts'), 'utf8');
    const routes = readFileSync(join(dir, 'analytics-routes.ts'), 'utf8');
    it('service nhận orgId làm tham số đầu tiên', () => {
        expect(svc).toMatch(/export async function getQuoteAnalytics\(\s*orgId: string/);
    });
    it('MỌI raw SQL đều lọc org_id — báo cáo lẫn org là rò rỉ nặng nhất', () => {
        // Tách theo $queryRaw rồi soi từng câu
        const raws = svc.split('$queryRaw').slice(1);
        expect(raws.length).toBeGreaterThan(0);
        for (const r of raws) {
            const sql = r.slice(0, 900);
            expect(sql, `raw SQL thiếu org_id: ${sql.slice(0, 90)}`).toMatch(/org_id\s*=\s*\$\{orgId\}/);
        }
    });
    it('mọi truy vấn Prisma trong service đều có orgId', () => {
        // Hằng `where` dùng chung được chấp nhận, NHƯNG chỉ khi bản thân nó khai
        // báo orgId — kiểm tra luôn, đừng tin vào tên biến.
        const whereConsts = new Set();
        for (const m of svc.matchAll(/const (\w+): Prisma\.\w+WhereInput = \{([\s\S]*?)\n  \}/g)) {
            if (/orgId/.test(m[2]))
                whereConsts.add(m[1]);
        }
        expect(whereConsts.size, 'không tìm thấy hằng where nào có orgId').toBeGreaterThan(0);
        const stmts = svc.split(/(?=prisma\.\w+\.)/).slice(1);
        for (const s of stmts) {
            const head = s.slice(0, 300);
            // Chấp nhận cả `where: inPeriod` lẫn `where: { ...inPeriod, … }`
            const viaConst = [...whereConsts].some((c) => new RegExp(`where:\\s*\\{?\\s*(\\.\\.\\.)?${c}\\b`).test(head));
            expect(/orgId/.test(head) || viaConst, `thiếu orgId: ${head.slice(0, 80)}`).toBe(true);
        }
    });
    it('route lấy orgId từ request.user, KHÔNG từ query', () => {
        const block = routes.slice(routes.indexOf("'/api/v1/analytics/quotes'"));
        expect(block.slice(0, 900)).toMatch(/request\.user as \{ orgId: string \}/);
        expect(routes).not.toMatch(/query[\s.[]*['"]?orgId/);
    });
    it('member bị chặn khỏi toàn bộ module Phân tích', () => {
        expect(routes).toMatch(/role === 'member'[\s\S]{0,120}403/);
    });
});
describe('fillPeriods', () => {
    it('chèn ngày trống để biểu đồ không đứt đoạn', () => {
        const r = fillPeriods([{ period: '2026-07-03', count: 2, value: 500 }], new Date('2026-07-01T00:00:00Z'), new Date('2026-07-05T00:00:00Z'));
        expect(r).toHaveLength(5);
        expect(r.map((x) => x.period)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05']);
        expect(r[2]).toEqual({ period: '2026-07-03', count: 2, value: 500 });
        expect(r[0]).toEqual({ period: '2026-07-01', count: 0, value: 0 });
    });
    it('có chặn vòng lặp vô hạn khi khoảng ngày quá lớn', () => {
        const r = fillPeriods([], new Date('2020-01-01T00:00:00Z'), new Date('2030-01-01T00:00:00Z'));
        expect(r.length).toBeLessThanOrEqual(400);
    });
    it('from = to → đúng 1 ngày', () => {
        const r = fillPeriods([], new Date('2026-07-01T00:00:00Z'), new Date('2026-07-01T00:00:00Z'));
        expect(r).toHaveLength(1);
    });
});
//# sourceMappingURL=quote-analytics-calc.test.js.map