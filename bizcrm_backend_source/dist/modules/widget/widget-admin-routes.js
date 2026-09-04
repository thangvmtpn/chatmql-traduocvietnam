import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import multipart from '@fastify/multipart';
import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import { userHasPermissionFresh } from '../../shared/permission-service.js';
/** Chuẩn hoá danh sách tên miền: bỏ giao thức, đường dẫn, khoảng trắng, trùng lặp. */
function cleanDomains(input) {
    const raw = Array.isArray(input)
        ? input
        : typeof input === 'string'
            ? input.split(/[\n,]/)
            : [];
    const out = raw
        .map((d) => String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
        .filter(Boolean);
    return [...new Set(out)];
}
const POSITIONS = new Set(['left', 'right']);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WIDGET_LOGO_DIR = path.resolve(__dirname, '../../../uploads/widget-logos');
mkdir(WIDGET_LOGO_DIR, { recursive: true }).catch(() => { });
const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB — logo nhỏ, tải trên mọi website khách
const ALLOWED_LOGO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);
function publicApiBase() {
    return (process.env.PUBLIC_API_URL || 'http://localhost:4520').replace(/\/$/, '');
}
/**
 * Logo được nhét thẳng vào `<img src>` trên website của khách, nên chỉ nhận
 * http(s). `javascript:` hay `data:text/html` ở đây là lỗ XSS trên site người khác.
 */
function safeLogoUrl(raw) {
    if (!raw)
        return null;
    try {
        const u = new URL(raw, publicApiBase());
        return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
    }
    catch {
        return null;
    }
}
export async function widgetAdminRoutes(app) {
    await app.register(multipart, { limits: { fileSize: MAX_LOGO_SIZE } });
    app.addHook('preHandler', authMiddleware);
    /** Route GHI: đọc quyền động `integrations.*` — giống eCDP. */
    async function can(request, key, reply) {
        const user = request.user;
        if (await userHasPermissionFresh(user.id, user.role, key))
            return true;
        reply.status(403).send({ error: 'Bạn không có quyền thực hiện thao tác này', code: 'PERMISSION_DENIED' });
        return false;
    }
    // ── Danh sách ────────────────────────────────────────────────────────
    app.get('/api/v1/widgets', async (request) => {
        const user = request.user;
        const widgets = await prisma.websiteWidget.findMany({
            where: { orgId: user.orgId },
            orderBy: { createdAt: 'asc' },
        });
        // Đếm hội thoại đến từ từng website để biết cái nào thực sự có khách.
        const counts = await Promise.all(widgets.map((w) => prisma.conversation.count({
            where: { orgId: user.orgId, externalThreadId: { startsWith: `web:${w.siteKey}:` } },
        })));
        return {
            widgets: widgets.map((w, i) => ({
                ...w,
                domains: Array.isArray(w.domains) ? w.domains : [],
                conversationCount: counts[i],
            })),
        };
    });
    // ── Tạo ──────────────────────────────────────────────────────────────
    app.post('/api/v1/widgets', async (request, reply) => {
        if (!(await can(request, 'integrations.create', reply)))
            return;
        const user = request.user;
        const name = String(request.body?.name ?? '').trim();
        if (!name)
            return reply.status(400).send({ error: 'Cần tên website' });
        const widget = await prisma.websiteWidget.create({
            data: {
                orgId: user.orgId,
                name,
                // 24 ký tự hex: đủ dài để không đoán được, đủ ngắn để dán vào mã trang.
                siteKey: `cmql_${randomBytes(12).toString('hex')}`,
                domains: cleanDomains(request.body?.domains),
            },
        });
        return reply.status(201).send({ ...widget, domains: Array.isArray(widget.domains) ? widget.domains : [] });
    });
    // ── Sửa ──────────────────────────────────────────────────────────────
    app.put('/api/v1/widgets/:id', async (request, reply) => {
        if (!(await can(request, 'integrations.update', reply)))
            return;
        const user = request.user;
        const existing = await prisma.websiteWidget.findFirst({
            where: { id: request.params.id, orgId: user.orgId },
            select: { id: true },
        });
        if (!existing)
            return reply.status(404).send({ error: 'Không tìm thấy website' });
        const b = request.body ?? {};
        const data = {};
        const str = (k) => (typeof b[k] === 'string' ? String(b[k]).trim() : undefined);
        if (str('name'))
            data.name = str('name');
        if (b.domains !== undefined)
            data.domains = cleanDomains(b.domains);
        if (typeof b.isActive === 'boolean')
            data.isActive = b.isActive;
        if (str('title') !== undefined)
            data.title = str('title');
        if (str('greeting') !== undefined)
            data.greeting = str('greeting');
        if (str('primaryColor'))
            data.primaryColor = str('primaryColor');
        if (str('position') && POSITIONS.has(str('position')))
            data.position = str('position');
        if (typeof b.liveChatEnabled === 'boolean')
            data.liveChatEnabled = b.liveChatEnabled;
        if (b.displayName !== undefined)
            data.displayName = str('displayName') || null;
        if (b.logoUrl !== undefined)
            data.logoUrl = safeLogoUrl(str('logoUrl'));
        // Chuỗi rỗng = xoá liên kết, khác với không truyền (giữ nguyên).
        for (const k of ['zaloUrl', 'facebookUrl', 'phoneNumber']) {
            if (b[k] !== undefined)
                data[k] = str(k) || null;
        }
        const updated = await prisma.websiteWidget.update({ where: { id: existing.id }, data });
        return { ...updated, domains: Array.isArray(updated.domains) ? updated.domains : [] };
    });
    // ── Tải logo ─────────────────────────────────────────────────────────
    app.post('/api/v1/widgets/upload-logo', async (request, reply) => {
        if (!(await can(request, 'integrations.update', reply)))
            return;
        const user = request.user;
        const file = await request.file();
        if (!file)
            return reply.status(400).send({ error: 'Chưa chọn tệp ảnh' });
        if (!ALLOWED_LOGO_MIMES.has(file.mimetype)) {
            return reply.status(400).send({ error: 'Chỉ nhận ảnh PNG, JPG, WebP hoặc SVG' });
        }
        const buffer = await file.toBuffer();
        if (buffer.length > MAX_LOGO_SIZE)
            return reply.status(400).send({ error: 'Logo tối đa 2MB' });
        const ext = path.extname(file.filename || '').toLowerCase();
        const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext) ? ext : '.png';
        const name = `${user.orgId}-${randomUUID().slice(0, 8)}${safeExt}`;
        await writeFile(path.join(WIDGET_LOGO_DIR, name), buffer);
        return { url: `${publicApiBase()}/uploads/widget-logos/${name}` };
    });
    // ── Xoá ──────────────────────────────────────────────────────────────
    app.delete('/api/v1/widgets/:id', async (request, reply) => {
        if (!(await can(request, 'integrations.delete', reply)))
            return;
        const user = request.user;
        const existing = await prisma.websiteWidget.findFirst({
            where: { id: request.params.id, orgId: user.orgId },
            select: { id: true },
        });
        if (!existing)
            return reply.status(404).send({ error: 'Không tìm thấy website' });
        // Hội thoại đã có KHÔNG bị xoá — chúng thuộc kênh Web Chat, không thuộc widget.
        await prisma.websiteWidget.delete({ where: { id: existing.id } });
        return { ok: true };
    });
}
//# sourceMappingURL=widget-admin-routes.js.map