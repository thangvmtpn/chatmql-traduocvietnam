import { authMiddleware } from '../auth/auth-middleware.js';
import { listQuotes, getQuote, getQuoteEvents, createQuote, updateQuote, softDeleteQuote, markQuoteSent, reviseQuote, duplicateQuote, convertToContract, respondByStaff, QuoteNotFoundError, QuoteForbiddenError, QuoteValidationError, } from './quote-service.js';
import { quotesToCsv } from './quote-csv.js';
import { QuoteStateError } from './quote-status.js';
import { listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, TemplateNotFoundError, } from './quote-template-service.js';
import { sendQuoteToContact, publicQuoteUrl } from './quote-send-service.js';
import { canManageQuotes, canDeleteQuotes, SEND_CHANNELS, QUOTE_TYPES } from './quote-types.js';
function err(reply, status, message, code = 'ERROR') {
    return reply.status(status).send({ success: false, error: { code, message } });
}
/** Map lỗi nghiệp vụ → HTTP status. Lỗi lạ → 500 (không lộ chi tiết). */
function handle(reply, e, log, ctx) {
    if (e instanceof QuoteNotFoundError || e instanceof TemplateNotFoundError) {
        return err(reply, 404, e.message, 'NOT_FOUND');
    }
    if (e instanceof QuoteForbiddenError)
        return err(reply, 403, e.message, 'FORBIDDEN');
    if (e instanceof QuoteValidationError)
        return err(reply, 400, e.message, 'VALIDATION_ERROR');
    if (e instanceof QuoteStateError)
        return err(reply, 409, e.message, 'INVALID_STATE');
    log.error({ e }, `[quotes] ${ctx}`);
    return err(reply, 500, 'Lỗi hệ thống, vui lòng thử lại');
}
export async function quoteRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // ── Mẫu báo giá ────────────────────────────────────────────────────
    // Đặt TRƯỚC /api/v1/quotes/:id để không bị nuốt bởi route param.
    app.get('/api/v1/quote-templates', async (request, reply) => {
        const u = request.user;
        try {
            return { success: true, data: await listTemplates(u.orgId) };
        }
        catch (e) {
            return handle(reply, e, app.log, 'list templates');
        }
    });
    app.get('/api/v1/quote-templates/:id', async (request, reply) => {
        const u = request.user;
        const { id } = request.params;
        try {
            return { success: true, data: await getTemplate(u.orgId, id) };
        }
        catch (e) {
            return handle(reply, e, app.log, 'get template');
        }
    });
    app.post('/api/v1/quote-templates', async (request, reply) => {
        const u = request.user;
        if (!canDeleteQuotes(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const body = (request.body ?? {});
        if (!body.name)
            return err(reply, 400, 'Thiếu tên mẫu', 'VALIDATION_ERROR');
        try {
            return reply.status(201).send({ success: true, data: await createTemplate(u.orgId, body) });
        }
        catch (e) {
            return handle(reply, e, app.log, 'create template');
        }
    });
    app.patch('/api/v1/quote-templates/:id', async (request, reply) => {
        const u = request.user;
        if (!canDeleteQuotes(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const { id } = request.params;
        try {
            return { success: true, data: await updateTemplate(u.orgId, id, (request.body ?? {})) };
        }
        catch (e) {
            return handle(reply, e, app.log, 'update template');
        }
    });
    app.delete('/api/v1/quote-templates/:id', async (request, reply) => {
        const u = request.user;
        if (!canDeleteQuotes(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const { id } = request.params;
        try {
            await deleteTemplate(u.orgId, id);
            return { success: true };
        }
        catch (e) {
            return handle(reply, e, app.log, 'delete template');
        }
    });
    // ── Báo giá ────────────────────────────────────────────────────────
    app.get('/api/v1/quotes', async (request, reply) => {
        const u = request.user;
        const q = (request.query ?? {});
        try {
            const result = await listQuotes(u.orgId, { id: u.id, role: u.role }, {
                status: q.status, type: q.type, contactId: q.contactId, companyId: q.companyId,
                assignedUserId: q.assignedUserId, search: q.search, from: q.from, to: q.to,
            }, { page: Number(q.page) || 1, limit: Number(q.limit) || 20 });
            return { success: true, data: result.items, meta: result.meta };
        }
        catch (e) {
            return handle(reply, e, app.log, 'list');
        }
    });
    // Đặt TRƯỚC /quotes/:id để "export" không bị hiểu là một id.
    app.get('/api/v1/quotes/export', async (request, reply) => {
        const u = request.user;
        const q = (request.query ?? {});
        try {
            const result = await listQuotes(u.orgId, { id: u.id, role: u.role }, { status: q.status, type: q.type, contactId: q.contactId, search: q.search, from: q.from, to: q.to }, { page: 1, limit: 5000 });
            const stamp = new Date().toISOString().slice(0, 10);
            return reply
                .type('text/csv; charset=utf-8')
                .header('Content-Disposition', `attachment; filename="bao-gia-${stamp}.csv"`)
                .send(quotesToCsv(result.items));
        }
        catch (e) {
            return handle(reply, e, app.log, 'export');
        }
    });
    app.get('/api/v1/quotes/:id', async (request, reply) => {
        const u = request.user;
        const { id } = request.params;
        try {
            const quote = await getQuote(u.orgId, id, { id: u.id, role: u.role });
            return { success: true, data: { ...quote, publicUrl: publicQuoteUrl(quote.publicToken) } };
        }
        catch (e) {
            return handle(reply, e, app.log, 'get');
        }
    });
    app.get('/api/v1/quotes/:id/events', async (request, reply) => {
        const u = request.user;
        const { id } = request.params;
        try {
            return { success: true, data: await getQuoteEvents(u.orgId, id) };
        }
        catch (e) {
            return handle(reply, e, app.log, 'events');
        }
    });
    app.post('/api/v1/quotes', async (request, reply) => {
        const u = request.user;
        if (!canManageQuotes(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const body = (request.body ?? {});
        if (!body.contactId)
            return err(reply, 400, 'Thiếu khách hàng', 'VALIDATION_ERROR');
        if (body.type && !QUOTE_TYPES.includes(body.type))
            return err(reply, 400, 'Loại chứng từ không hợp lệ', 'VALIDATION_ERROR');
        try {
            const quote = await createQuote(u.orgId, { id: u.id, role: u.role }, body);
            return reply.status(201).send({ success: true, data: quote });
        }
        catch (e) {
            return handle(reply, e, app.log, 'create');
        }
    });
    app.patch('/api/v1/quotes/:id', async (request, reply) => {
        const u = request.user;
        if (!canManageQuotes(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const { id } = request.params;
        try {
            return { success: true, data: await updateQuote(u.orgId, id, { id: u.id, role: u.role }, (request.body ?? {})) };
        }
        catch (e) {
            return handle(reply, e, app.log, 'update');
        }
    });
    app.delete('/api/v1/quotes/:id', async (request, reply) => {
        const u = request.user;
        if (!canDeleteQuotes(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const { id } = request.params;
        try {
            await softDeleteQuote(u.orgId, id, { id: u.id, role: u.role });
            return { success: true };
        }
        catch (e) {
            return handle(reply, e, app.log, 'delete');
        }
    });
    // ── Hành động vòng đời ─────────────────────────────────────────────
    app.post('/api/v1/quotes/:id/send', async (request, reply) => {
        const u = request.user;
        if (!canManageQuotes(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const { id } = request.params;
        const body = (request.body ?? {});
        const channel = body.channel && SEND_CHANNELS.includes(body.channel) ? body.channel : 'link';
        try {
            const quote = await markQuoteSent(u.orgId, id, { id: u.id, role: u.role }, channel);
            const delivery = await sendQuoteToContact(u.orgId, id, channel, u.id);
            return { success: true, data: { ...quote, delivery } };
        }
        catch (e) {
            return handle(reply, e, app.log, 'send');
        }
    });
    app.post('/api/v1/quotes/:id/duplicate', async (request, reply) => {
        const u = request.user;
        if (!canManageQuotes(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const { id } = request.params;
        const body = (request.body ?? {});
        try {
            const quote = await duplicateQuote(u.orgId, id, { id: u.id, role: u.role }, body.contactId);
            return reply.status(201).send({ success: true, data: quote });
        }
        catch (e) {
            return handle(reply, e, app.log, 'duplicate');
        }
    });
    app.post('/api/v1/quotes/:id/revise', async (request, reply) => {
        const u = request.user;
        if (!canManageQuotes(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const { id } = request.params;
        try {
            return reply.status(201).send({ success: true, data: await reviseQuote(u.orgId, id, { id: u.id, role: u.role }) });
        }
        catch (e) {
            return handle(reply, e, app.log, 'revise');
        }
    });
    app.post('/api/v1/quotes/:id/convert-to-contract', async (request, reply) => {
        const u = request.user;
        if (!canManageQuotes(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const { id } = request.params;
        try {
            return reply.status(201).send({ success: true, data: await convertToContract(u.orgId, id, { id: u.id, role: u.role }) });
        }
        catch (e) {
            return handle(reply, e, app.log, 'convert');
        }
    });
    app.post('/api/v1/quotes/:id/respond', async (request, reply) => {
        const u = request.user;
        if (!canManageQuotes(u.role))
            return err(reply, 403, 'Không có quyền', 'FORBIDDEN');
        const { id } = request.params;
        const body = (request.body ?? {});
        if (body.action !== 'accept' && body.action !== 'reject') {
            return err(reply, 400, 'action phải là accept hoặc reject', 'VALIDATION_ERROR');
        }
        try {
            const quote = await respondByStaff(u.orgId, id, { id: u.id, role: u.role }, body.action, body.reason);
            return { success: true, data: quote };
        }
        catch (e) {
            return handle(reply, e, app.log, 'respond');
        }
    });
}
//# sourceMappingURL=quote-routes.js.map