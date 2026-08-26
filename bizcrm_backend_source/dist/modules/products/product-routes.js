import multipart from '@fastify/multipart';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from '../auth/auth-middleware.js';
import { listProductCategories, createProductCategory, updateProductCategory, deleteProductCategory, } from './product-category-service.js';
import { listProducts, getProduct, createProduct, updateProduct, deleteProduct, } from './product-service.js';
import { semanticSearch, structuredFilter, aggregate } from './product-query-service.js';
import { backfillProductEmbeddings } from './product-embedding.js';
import { fetchSheetRows, parseCsv, importProducts, importKnowledge } from './import-service.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PRODUCT_UPLOADS_DIR = path.resolve(__dirname, '../../../uploads/products');
mkdir(PRODUCT_UPLOADS_DIR, { recursive: true }).catch(() => { });
const MAX_IMG_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMG_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
function canManage(role) {
    return ['owner', 'admin', 'manager'].includes(role);
}
function err(reply, status, message, code = 'ERROR') {
    return reply.status(status).send({ success: false, error: { code, message } });
}
export async function productRoutes(app) {
    await app.register(multipart, { limits: { fileSize: MAX_IMG_SIZE } });
    app.addHook('preHandler', authMiddleware);
    // ── Image upload (returns a URL to use in product.images) ───────────
    app.post('/api/v1/products/upload-image', async (request, reply) => {
        const u = request.user;
        if (!canManage(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const file = await request.file();
        if (!file)
            return err(reply, 400, 'Vui lòng chọn file ảnh');
        if (!ALLOWED_IMG_MIMES.has(file.mimetype))
            return err(reply, 400, 'Chỉ chấp nhận ảnh JPG, PNG, WebP, GIF');
        const buffer = await file.toBuffer();
        if (buffer.length > MAX_IMG_SIZE)
            return err(reply, 400, 'Ảnh tối đa 5MB');
        const ext = path.extname(file.filename || '.jpg').toLowerCase();
        const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
        const filename = `${u.orgId}-${randomUUID().slice(0, 8)}${safeExt}`;
        await writeFile(path.join(PRODUCT_UPLOADS_DIR, filename), buffer);
        return { success: true, data: { url: `/uploads/products/${filename}` } };
    });
    // ── Product Categories ──────────────────────────────────────────────
    app.get('/api/v1/product-categories', async (request, reply) => {
        try {
            const u = request.user;
            return { success: true, data: await listProductCategories(u.orgId) };
        }
        catch (e) {
            app.log.error({ e }, '[products] list cats');
            return err(reply, 500, 'Lỗi tải danh mục');
        }
    });
    app.post('/api/v1/product-categories', async (request, reply) => {
        const u = request.user;
        if (!canManage(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const body = (request.body ?? {});
        if (!body.name)
            return err(reply, 400, 'Thiếu tên danh mục');
        try {
            const cat = await createProductCategory(u.orgId, body);
            return reply.status(201).send({ success: true, data: cat });
        }
        catch (e) {
            return err(reply, e.statusCode ?? 500, e.message ?? 'Lỗi tạo danh mục', e.code);
        }
    });
    app.patch('/api/v1/product-categories/:id', async (request, reply) => {
        const u = request.user;
        if (!canManage(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        try {
            const cat = await updateProductCategory(u.orgId, request.params.id, request.body ?? {});
            if (!cat)
                return err(reply, 404, 'Không tìm thấy danh mục');
            return { success: true, data: cat };
        }
        catch (e) {
            return err(reply, e.statusCode ?? 500, e.message ?? 'Lỗi cập nhật', e.code);
        }
    });
    app.delete('/api/v1/product-categories/:id', async (request, reply) => {
        const u = request.user;
        if (!canManage(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const ok = await deleteProductCategory(u.orgId, request.params.id);
        if (!ok)
            return err(reply, 404, 'Không tìm thấy danh mục');
        return { success: true, data: { deleted: true } };
    });
    // ── Products ────────────────────────────────────────────────────────
    app.get('/api/v1/products', async (request, reply) => {
        try {
            const u = request.user;
            const q = (request.query ?? {});
            const result = await listProducts(u.orgId, {
                search: q.search, categoryId: q.categoryId, status: q.status,
                page: q.page ? parseInt(q.page) : undefined,
                pageSize: q.pageSize ? parseInt(q.pageSize) : undefined,
            });
            return { success: true, data: result.items, meta: result.meta };
        }
        catch (e) {
            app.log.error({ e }, '[products] list');
            return err(reply, 500, 'Lỗi tải sản phẩm');
        }
    });
    app.get('/api/v1/products/:id', async (request, reply) => {
        const u = request.user;
        const p = await getProduct(u.orgId, request.params.id);
        if (!p)
            return err(reply, 404, 'Không tìm thấy sản phẩm');
        return { success: true, data: p };
    });
    app.post('/api/v1/products', async (request, reply) => {
        const u = request.user;
        if (!canManage(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const body = (request.body ?? {});
        if (!body.name)
            return err(reply, 400, 'Thiếu tên sản phẩm');
        try {
            const p = await createProduct(u.orgId, body, u.id);
            return reply.status(201).send({ success: true, data: p });
        }
        catch (e) {
            return err(reply, e.statusCode ?? 500, e.message ?? 'Lỗi tạo sản phẩm', e.code);
        }
    });
    app.patch('/api/v1/products/:id', async (request, reply) => {
        const u = request.user;
        if (!canManage(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        try {
            const p = await updateProduct(u.orgId, request.params.id, request.body ?? {});
            if (!p)
                return err(reply, 404, 'Không tìm thấy sản phẩm');
            return { success: true, data: p };
        }
        catch (e) {
            return err(reply, e.statusCode ?? 500, e.message ?? 'Lỗi cập nhật', e.code);
        }
    });
    app.delete('/api/v1/products/:id', async (request, reply) => {
        const u = request.user;
        if (!canManage(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const ok = await deleteProduct(u.orgId, request.params.id);
        if (!ok)
            return err(reply, 404, 'Không tìm thấy sản phẩm');
        return { success: true, data: { deleted: true } };
    });
    // ── Unified retrieval (semantic / filter / aggregate) ───────────────
    // orgId ALWAYS taken from the session — never from the request body.
    app.post('/api/v1/product-knowledge/query', async (request, reply) => {
        try {
            const u = request.user;
            const b = (request.body ?? {});
            const mode = b.mode ?? 'semantic';
            if (mode === 'aggregate')
                return { success: true, data: await aggregate(u.orgId) };
            if (mode === 'filter') {
                return { success: true, data: await structuredFilter(u.orgId, {
                        scope: b.scope, categoryId: b.categoryId, productId: b.productId,
                        status: b.status, type: b.type, search: b.search, limit: b.limit,
                    }) };
            }
            // semantic
            if (!b.query?.trim())
                return err(reply, 400, 'query là bắt buộc cho mode semantic');
            return { success: true, data: await semanticSearch(u.orgId, b.query, {
                    scope: b.scope, topK: b.topK, categoryId: b.categoryId,
                }) };
        }
        catch (e) {
            app.log.error({ e }, '[pkb] query');
            return err(reply, 500, 'Lỗi truy vấn');
        }
    });
    // ── Backfill product embeddings (owner/admin/manager) ───────────────
    app.post('/api/v1/products/embeddings/backfill', async (request, reply) => {
        const u = request.user;
        if (!canManage(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const result = await backfillProductEmbeddings(u.orgId);
        return { success: true, data: result };
    });
    // ── Import / Sync (Google Sheet or raw CSV) ─────────────────────────
    // Body: { kind:'products'|'knowledge', sheetUrl?, csv?, mapping, categoryId?, productId?, format? }
    app.post('/api/v1/product-knowledge/import', async (request, reply) => {
        const u = request.user;
        if (!canManage(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const b = (request.body ?? {});
        const mapping = b.mapping ?? {};
        if (!b.sheetUrl && !b.csv)
            return err(reply, 400, 'Cần sheetUrl hoặc csv');
        try {
            const rows = b.sheetUrl ? await fetchSheetRows(b.sheetUrl) : parseCsv(String(b.csv));
            const result = b.kind === 'knowledge'
                ? await importKnowledge(u.orgId, rows, mapping, { categoryId: b.categoryId, productId: b.productId, format: b.format })
                : await importProducts(u.orgId, rows, mapping, { categoryId: b.categoryId, specMapping: b.specMapping });
            return { success: true, data: result };
        }
        catch (e) {
            return err(reply, e.statusCode ?? 500, e.message ?? 'Lỗi import', e.code);
        }
    });
}
//# sourceMappingURL=product-routes.js.map