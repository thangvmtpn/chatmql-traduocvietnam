/**
 * quote-tenancy.test.ts — bảo vệ ranh giới multi-tenant.
 *
 * Đây là test "kiến trúc": nó ĐỌC MÃ NGUỒN của module quotes và bắt lỗi khi
 * ai đó thêm truy vấn Prisma không scope orgId. Rẻ hơn nhiều so với phát hiện
 * rò rỉ dữ liệu ở production.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isOrgActive } from './quote-public-service.js';
import { toPublicQuote } from './quote-serialize.js';
const DIR = dirname(fileURLToPath(import.meta.url));
const sourceFiles = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
const read = (f) => readFileSync(join(DIR, f), 'utf8');
/**
 * JOB HỆ THỐNG — được phép quét mọi org.
 *
 * Thêm tên vào đây là một hành động CÓ Ý THỨC: hàm đó chạy ngoài ngữ cảnh
 * đăng nhập (cron), nên không có orgId để nhận. Đổi lại, nó BẮT BUỘC phải
 * select `orgId` của từng bản ghi để mọi thao tác phía sau (thông báo, log,
 * domain event) vẫn gắn đúng org — có test riêng kiểm điều này bên dưới.
 */
const SYSTEM_JOBS = [
    'expireOverdueQuotes',
    'remindExpiringQuotes',
    'remindUnviewedQuotes',
    'runQuoteDailyJobs',
];
/** Helper thuần / không đụng dữ liệu của org nào. */
const PURE_HELPERS = ['nextQuoteNumber', 'currentPeriod', 'isOrgActive', 'publicQuoteUrl', 'normalizePrefix'];
describe('ranh giới multi-tenant — mã nguồn', () => {
    it('mọi hàm service nhận orgId làm THAM SỐ ĐẦU TIÊN', () => {
        const offenders = [];
        for (const file of sourceFiles) {
            if (file.includes('routes') || file.includes('calc') || file.includes('words')
                || file.includes('status') || file.includes('types') || file.includes('serialize')
                || file.includes('csv'))
                continue;
            const src = read(file);
            const re = /export async function (\w+)\(([^)]*)\)/g;
            let m;
            while ((m = re.exec(src)) !== null) {
                const [, name, params] = m;
                const first = params.split(',')[0]?.trim() ?? '';
                if (SYSTEM_JOBS.includes(name) || PURE_HELPERS.includes(name))
                    continue;
                if (/token/.test(name) || /token/.test(first))
                    continue; // luồng public dùng token
                if (!first.startsWith('orgId') && !first.startsWith('tx')) {
                    offenders.push(`${file}: ${name}(${first}…)`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });
    it('job hệ thống PHẢI mang orgId của từng bản ghi đi tiếp', () => {
        // Quét mọi org thì được, nhưng thông báo/log/event sinh ra phải gắn đúng
        // org — nếu không sẽ lạc sang tổ chức khác.
        for (const file of ['quote-reminder-service.ts', 'quote-service.ts']) {
            const src = read(file);
            for (const job of SYSTEM_JOBS) {
                const start = src.indexOf(`export async function ${job}`);
                if (start === -1)
                    continue;
                const body = src.slice(start, start + 1600);
                if (!/prisma\.quote\.findMany/.test(body))
                    continue;
                const selectsOrgId = /orgId: true/.test(body) || /select: SELECT/.test(body);
                expect(selectsOrgId, `${file}: ${job} quét mọi org nhưng không select orgId`).toBe(true);
            }
        }
        // Hằng SELECT dùng chung của reminder phải có orgId
        expect(read('quote-reminder-service.ts')).toMatch(/const SELECT = \{[^}]*orgId: true/s);
    });
    it('KHÔNG có findUnique bằng id trần trên bảng thuộc tenant', () => {
        const offenders = [];
        for (const file of sourceFiles) {
            read(file).split('\n').forEach((line, i) => {
                if (!/\.findUnique\(\{\s*where:\s*\{\s*id[:,\s}]/.test(line))
                    return;
                // Organization CHÍNH LÀ tenant → tra nó bằng orgId là hợp lệ.
                // Mọi bảng khác tra bằng id trần = bỏ qua ranh giới org.
                if (/prisma\.organization\.findUnique\(\{\s*where:\s*\{\s*id:\s*orgId\s*\}/.test(line))
                    return;
                offenders.push(`${file}:${i + 1} ${line.trim()}`);
            });
        }
        expect(offenders).toEqual([]);
    });
    it('mọi findMany/findFirst trên quote đều lọc orgId hoặc publicToken', () => {
        const offenders = [];
        for (const file of sourceFiles) {
            const src = read(file);
            // ghép các lệnh nhiều dòng lại rồi soi từng lệnh
            const stmts = src.split(/(?=(?:await\s+)?(?:prisma|tx)\.)/);
            for (const s of stmts) {
                if (!/\b(prisma|tx)\.quote\.(findMany|findFirst|count)\(/.test(s))
                    continue;
                const head = s.slice(0, 400);
                const scoped = /orgId/.test(head) || /publicToken/.test(head) || /where(,|\s*[,})])/.test(head);
                // Job hệ thống quét mọi org — đã có test riêng bắt nó phải select orgId
                const inSystemJob = SYSTEM_JOBS.some((job) => {
                    const start = src.indexOf(`export async function ${job}`);
                    if (start === -1)
                        return false;
                    const pos = src.indexOf(head.slice(0, 60));
                    return pos > start && pos < start + 1600;
                });
                if (!scoped && !inSystemJob)
                    offenders.push(`${file}: ${head.slice(0, 110).replace(/\s+/g, ' ')}`);
            }
        }
        expect(offenders).toEqual([]);
    });
    it('route lấy orgId từ request.user, KHÔNG BAO GIỜ từ body/query/params', () => {
        for (const file of sourceFiles.filter((f) => f.includes('routes'))) {
            const src = read(file);
            expect(src, `${file} đọc orgId từ body`).not.toMatch(/body[\s.[]*['"]?orgId/);
            expect(src, `${file} đọc orgId từ query`).not.toMatch(/query[\s.[]*['"]?orgId/);
            expect(src, `${file} đọc orgId từ params`).not.toMatch(/params[\s.[]*['"]?orgId/);
        }
    });
    it('route đã đăng nhập PHẢI gắn authMiddleware', () => {
        const src = read('quote-routes.ts');
        expect(src).toMatch(/addHook\(\s*'preHandler',\s*authMiddleware\s*\)/);
    });
    it('route public KHÔNG gắn authMiddleware nhưng PHẢI có rate limit', () => {
        const src = read('quote-public-routes.ts');
        expect(src).not.toMatch(/addHook\(\s*'preHandler',\s*authMiddleware/);
        expect(src).toMatch(/rateLimit/);
    });
    it('route public chỉ trả dữ liệu qua allowlist toPublicQuote', () => {
        const svc = read('quote-public-service.ts');
        expect(svc).toMatch(/toPublicQuote/);
        // không được trả thẳng object Prisma cho khách
        expect(svc).not.toMatch(/quote:\s*quote\s*[,}]/);
    });
    it('id sinh ra bằng crypto.randomBytes, KHÔNG dùng Math.random', () => {
        for (const file of sourceFiles) {
            expect(read(file), `${file} dùng Math.random cho token`).not.toMatch(/Math\.random/);
        }
        expect(read('quote-service.ts')).toMatch(/randomBytes\(\s*24\s*\)/);
    });
    it('PATCH mẫu báo giá KHÔNG được hành xử như PUT', () => {
        // Bug đã gặp: updateTemplate dùng chung hàm dựng data với create → gửi
        // `{name, isDefault}` để đổi mẫu mặc định là xoá sạch thông tin bên bán,
        // tiền tố, thuế, hiệu lực của mẫu đó.
        const src = read('quote-template-service.ts');
        expect(src).toMatch(/buildPatchData/);
        expect(src).toMatch(/\.\.\.buildPatchData\(input\)/);
        // create dùng hàm riêng có mặc định
        expect(src).toMatch(/\.\.\.buildCreateData\(input\)/);
        // patch phải kiểm tra undefined trước khi ghi
        expect(src).toMatch(/!== undefined\) data\./);
    });
    it('thuế PHẢI được chốt TRƯỚC khi tính tổng', () => {
        // Bug đã gặp: calcTotals chạy trước khi tra template → tính với thuế 0
        // rồi lưu taxRate=10 → báo giá hiện "Thuế GTGT (10%): 0", tổng thiếu thuế.
        const src = read('quote-service.ts');
        const posTaxRate = src.indexOf('const taxRate = input.taxRate ??');
        const posTotals = src.indexOf('const totals = calcTotals(');
        expect(posTaxRate, 'không tìm thấy biến taxRate đã chốt').toBeGreaterThan(-1);
        expect(posTaxRate, 'taxRate phải được tính TRƯỚC calcTotals').toBeLessThan(posTotals);
        // và giá trị lưu vào DB phải là chính biến đó, không tính lại
        expect(src).toMatch(/taxRate: new Prisma\.Decimal\(taxRate\)/);
    });
    it('job hết hạn PHẢI được lên lịch chạy — nếu không là code chết', () => {
        // expireOverdueQuotes từng tồn tại mà không ai gọi: báo giá quá hạn nằm
        // mãi ở "Đã gửi" trong danh sách của sale → phễu báo cáo sai.
        const cron = read('quote-expiry-cron.ts');
        expect(cron).toMatch(/expireOverdueQuotes/);
        expect(cron).toMatch(/cron\.schedule/);
    });
    it('đánh số chạy trong transaction (chống trùng số khi song song)', () => {
        const src = read('quote-number.ts');
        expect(src).toMatch(/tx: Prisma\.TransactionClient/);
        expect(src).toMatch(/increment: 1/);
        // quote-service phải gọi nó bên trong $transaction
        expect(read('quote-service.ts')).toMatch(/\$transaction\(async \(tx\)/);
    });
});
describe('isOrgActive — chặn org bị khoá/hết hạn', () => {
    it('org active không hết hạn → cho phép', () => {
        expect(isOrgActive({ status: 'active', expiresAt: null })).toBe(true);
        expect(isOrgActive({ status: 'active', expiresAt: new Date(Date.now() + 86_400_000) })).toBe(true);
    });
    it('org suspended → chặn', () => {
        expect(isOrgActive({ status: 'suspended', expiresAt: null })).toBe(false);
    });
    it('org hết hạn license → chặn', () => {
        expect(isOrgActive({ status: 'active', expiresAt: new Date(Date.now() - 1000) })).toBe(false);
    });
    it('org null → chặn (fail-safe)', () => {
        expect(isOrgActive(null)).toBe(false);
        expect(isOrgActive(undefined)).toBe(false);
    });
});
describe('toPublicQuote — không rò rỉ khi thêm field mới vào schema', () => {
    it('field lạ trong row KHÔNG tự động lọt ra ngoài', () => {
        const pub = toPublicQuote({
            number: 'BG-1', total: 1000, templateSnapshot: {},
            // giả lập ai đó thêm cột nhạy cảm vào Quote sau này
            secretCostPrice: 999, supplierName: 'NCC bí mật', orgId: 'org-x', internalNotes: 'nội bộ',
        });
        const json = JSON.stringify(pub);
        expect(json).not.toContain('secretCostPrice');
        expect(json).not.toContain('NCC bí mật');
        expect(json).not.toContain('org-x');
        expect(json).not.toContain('nội bộ');
    });
});
//# sourceMappingURL=quote-tenancy.test.js.map