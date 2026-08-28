import multipart from '@fastify/multipart';
import { lookup as dnsLookup } from 'node:dns/promises';
import { authMiddleware } from '../auth/auth-middleware.js';
import { createKbEntry } from './kb-service.js';
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB — khớp lời hứa trên giao diện
const CHUNK_TARGET = 2_000;
const CHUNK_MAX = 3_000;
const MAX_CHUNKS_PER_SOURCE = 60;
const WEB_TIMEOUT_MS = 15_000;
const WEB_MAX_BYTES = 3 * 1024 * 1024;
const WEB_MAX_PAGES = 10;
function isKbAdmin(role) {
    return ['owner', 'admin'].includes(role);
}
function sendError(reply, status, message) {
    return reply.status(status).send({ success: false, error: { code: 'ERROR', message } });
}
// ── Cắt đoạn ────────────────────────────────────────────────────────────────
/** Cắt theo ranh giới đoạn văn (\n\n), gom tới ~CHUNK_TARGET; đoạn đơn quá dài
 *  thì cắt cứng ở CHUNK_MAX theo ranh giới câu gần nhất. */
export function chunkText(raw) {
    const text = raw.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text)
        return [];
    const paras = text.split(/\n\n+/);
    const chunks = [];
    let buf = '';
    const flush = () => { if (buf.trim())
        chunks.push(buf.trim()); buf = ''; };
    for (const p of paras) {
        if (p.length > CHUNK_MAX) {
            flush();
            // đoạn khổng lồ: cắt theo câu
            let piece = '';
            for (const sent of p.split(/(?<=[.!?…。])\s+/)) {
                if (piece.length + sent.length + 1 > CHUNK_MAX) {
                    chunks.push(piece.trim());
                    piece = '';
                }
                piece += (piece ? ' ' : '') + sent;
            }
            if (piece.trim())
                chunks.push(piece.trim());
            continue;
        }
        if (buf.length + p.length + 2 > CHUNK_TARGET && buf)
            flush();
        buf += (buf ? '\n\n' : '') + p;
    }
    flush();
    return chunks;
}
// ── Parse tệp ───────────────────────────────────────────────────────────────
async function parseBuffer(filename, mimetype, buf) {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf' || mimetype === 'application/pdf') {
        // import sâu để né mã demo chạy khi import gốc của pdf-parse
        // @ts-ignore
        const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
        const out = await pdfParse(buf);
        return String(out.text || '');
    }
    if (ext === 'docx' || mimetype.includes('officedocument.wordprocessingml')) {
        const mammoth = await import('mammoth');
        const out = await mammoth.extractRawText({ buffer: buf });
        return String(out.value || '');
    }
    if (ext === 'xlsx' || ext === 'xls' || mimetype.includes('spreadsheetml') || mimetype.includes('ms-excel')) {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(buf, { type: 'buffer' });
        const parts = [];
        for (const name of wb.SheetNames) {
            const rows = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
            if (rows.trim())
                parts.push(`## ${name}\n${rows}`);
        }
        return parts.join('\n\n');
    }
    if (['txt', 'md', 'csv', 'json'].includes(ext) || mimetype.startsWith('text/')) {
        return buf.toString('utf8');
    }
    throw new Error(`Định dạng .${ext} chưa hỗ trợ — dùng PDF, DOCX, XLSX, TXT, MD hoặc CSV`);
}
// ── Web: chống SSRF + trích chữ ─────────────────────────────────────────────
function isPrivateIp(ip) {
    if (ip.includes(':')) { // IPv6
        const low = ip.toLowerCase();
        return low === '::1' || low.startsWith('fe80') || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('::ffff:127.');
    }
    const o = ip.split('.').map(Number);
    return o[0] === 127 || o[0] === 10 || o[0] === 0 ||
        (o[0] === 172 && o[1] >= 16 && o[1] <= 31) ||
        (o[0] === 192 && o[1] === 168) ||
        (o[0] === 169 && o[1] === 254);
}
async function assertSafeUrl(u) {
    if (!['http:', 'https:'].includes(u.protocol))
        throw new Error('Chỉ nhận địa chỉ http/https');
    const host = u.hostname;
    if (/^(localhost|.*\.local)$/i.test(host))
        throw new Error('Không thu thập địa chỉ nội bộ');
    try {
        const res = await dnsLookup(host, { all: true });
        if (res.some((r) => isPrivateIp(r.address)))
            throw new Error('Không thu thập địa chỉ nội bộ');
    }
    catch (e) {
        if (e.message.includes('nội bộ'))
            throw e;
        throw new Error('Không phân giải được tên miền');
    }
}
async function fetchPage(u) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), WEB_TIMEOUT_MS);
    try {
        const res = await fetch(u, {
            signal: ctl.signal,
            redirect: 'follow',
            // UA trình duyệt thường — nhiều site (kể cả site công ty) trả 403 cho UA bot lạ
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
                Accept: 'text/html,*/*',
                'Accept-Language': 'vi,en;q=0.8',
            },
        });
        if (!res.ok)
            throw new Error(`Trang trả về ${res.status}`);
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('text/html') && !ct.includes('text/plain'))
            throw new Error('Trang không phải HTML/text');
        const reader = res.body?.getReader();
        if (!reader)
            return { html: await res.text() };
        const parts = [];
        let size = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.length;
            if (size > WEB_MAX_BYTES) {
                await reader.cancel();
                break;
            }
            parts.push(value);
        }
        return { html: Buffer.concat(parts).toString('utf8') };
    }
    finally {
        clearTimeout(timer);
    }
}
export function htmlToText(html) {
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    let body = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<(nav|footer|header|aside)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ');
    body = body
        .replace(/<(p|div|h[1-6]|li|tr|br|section|article)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ' ');
    const decoded = body
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const text = decoded.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
    return { title, text };
}
function sameSiteLinks(html, base) {
    const out = [];
    const seen = new Set();
    for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
        try {
            const u = new URL(m[1], base);
            u.hash = '';
            if (u.origin !== base.origin)
                continue;
            if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|mp4|css|js|ico)(\?|$)/i.test(u.pathname))
                continue;
            if (seen.has(u.href) || u.href === base.href)
                continue;
            seen.add(u.href);
            out.push(u);
        }
        catch { /* bỏ link hỏng */ }
    }
    return out;
}
// ── Ghi entries ─────────────────────────────────────────────────────────────
async function createPendingEntries(orgId, userId, baseTitle, chunks, source, categoryId) {
    const capped = chunks.slice(0, MAX_CHUNKS_PER_SOURCE);
    const ids = [];
    for (let i = 0; i < capped.length; i++) {
        const title = capped.length > 1 ? `${baseTitle} — phần ${i + 1}/${capped.length}` : baseTitle;
        const row = await createKbEntry(orgId, {
            type: 'article',
            title: title.slice(0, 200),
            content: capped[i],
            risk: 'sensitive', // nội dung nạp ngoài → LUÔN vào hàng chờ duyệt
            source,
            categoryId: categoryId || null,
        }, userId);
        ids.push(row.id);
    }
    return ids;
}
export default async function importRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    await app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES, files: 5 } });
    /** POST /api/v1/knowledge/import/file — multipart: file(s) + categoryId? */
    app.post('/api/v1/knowledge/import/file', async (request, reply) => {
        const user = request.user;
        if (!isKbAdmin(user.role))
            return sendError(reply, 403, 'Chỉ admin/owner được nạp tài liệu');
        const results = [];
        let categoryId;
        try {
            const parts = request.parts();
            const files = [];
            for await (const part of parts) {
                if (part.type === 'file') {
                    files.push({ filename: part.filename, mimetype: part.mimetype, buf: await part.toBuffer() });
                }
                else if (part.fieldname === 'categoryId' && typeof part.value === 'string' && part.value) {
                    categoryId = part.value;
                }
            }
            if (!files.length)
                return sendError(reply, 400, 'Chưa đính kèm tệp nào');
            for (const f of files) {
                const text = await parseBuffer(f.filename, f.mimetype, f.buf);
                const chunks = chunkText(text);
                if (!chunks.length) {
                    results.push({ file: f.filename, entries: 0, truncated: false });
                    continue;
                }
                const base = f.filename.replace(/\.[a-z0-9]+$/i, '');
                const ids = await createPendingEntries(user.orgId, user.id, base, chunks, 'import_file', categoryId);
                results.push({ file: f.filename, entries: ids.length, truncated: chunks.length > MAX_CHUNKS_PER_SOURCE });
            }
            return { success: true, results, status: 'pending', note: 'Đã vào hàng chờ duyệt — AI chỉ dùng sau khi duyệt' };
        }
        catch (err) {
            app.log.error({ err }, '[kb-import] file failed');
            return sendError(reply, 400, err.message || 'Không đọc được tệp');
        }
    });
    /** POST /api/v1/knowledge/import/web — { url, depth: 0|1, categoryId? } */
    app.post('/api/v1/knowledge/import/web', async (request, reply) => {
        const user = request.user;
        if (!isKbAdmin(user.role))
            return sendError(reply, 403, 'Chỉ admin/owner được thu thập website');
        const { url, depth = 0, categoryId } = request.body ?? {};
        if (!url?.trim())
            return sendError(reply, 400, 'Thiếu URL');
        let base;
        try {
            base = new URL(url.trim());
        }
        catch {
            return sendError(reply, 400, 'URL không hợp lệ');
        }
        try {
            await assertSafeUrl(base);
            const first = await fetchPage(base);
            const queue = [{ u: base, html: first.html }];
            if (depth >= 1) {
                for (const link of sameSiteLinks(first.html, base).slice(0, WEB_MAX_PAGES - 1)) {
                    try {
                        queue.push({ u: link, html: (await fetchPage(link)).html });
                    }
                    catch { /* trang con lỗi thì bỏ qua, không chặn cả đợt */ }
                }
            }
            const results = [];
            for (const page of queue) {
                const { title, text } = htmlToText(page.html);
                const chunks = chunkText(text);
                if (!chunks.length) {
                    results.push({ url: page.u.href, title, entries: 0 });
                    continue;
                }
                const baseTitle = title || page.u.hostname + page.u.pathname;
                const ids = await createPendingEntries(user.orgId, user.id, baseTitle, chunks, 'import_web', categoryId);
                results.push({ url: page.u.href, title: baseTitle, entries: ids.length });
            }
            return { success: true, results, status: 'pending', note: 'Đã vào hàng chờ duyệt — AI chỉ dùng sau khi duyệt' };
        }
        catch (err) {
            app.log.error({ err }, '[kb-import] web failed');
            return sendError(reply, 400, err.message || 'Không thu thập được trang');
        }
    });
}
//# sourceMappingURL=import-routes.js.map