import { authMiddleware } from '../auth/auth-middleware.js';
import { prisma } from '../../shared/prisma-client.js';
import { runAutomationRules } from '../automation/automation-engine.js';
import { logger } from '../../shared/logger.js';
/**
 * Kết quả tương tác của một lần liên hệ. Lưu bằng mã tiếng Anh để nhãn hiển thị
 * đổi được mà không phải sửa dữ liệu cũ; nhãn tiếng Việt gửi kèm cho giao diện.
 */
export const NOTE_STATUSES = [
    { value: 'no_contact', label: 'Không kết nối', tone: 'muted' },
    { value: 'consulting', label: 'Đang tư vấn', tone: 'info' },
    { value: 'callback', label: 'Hẹn gọi lại', tone: 'warning' },
    { value: 'opportunity', label: 'Cơ hội', tone: 'info' },
    { value: 'won', label: 'Chốt thành công', tone: 'success' },
    { value: 'at_risk', label: 'Nguy cơ rời bỏ', tone: 'danger' },
];
const VALID_STATUSES = new Set(NOTE_STATUSES.map(s => s.value));
/** '' hoặc null -> null (ghi chú thường). Giá trị lạ -> ném lỗi để client biết. */
function normalizeStatus(raw) {
    if (raw === undefined || raw === null)
        return null;
    const v = String(raw).trim();
    if (!v)
        return null;
    if (!VALID_STATUSES.has(v)) {
        const err = new Error(`Trạng thái "${v}" không hợp lệ. Chỉ nhận: ${[...VALID_STATUSES].join(', ')}`);
        err.statusCode = 400;
        throw err;
    }
    return v;
}
export async function noteRoutes(app) {
    app.addHook('preHandler', authMiddleware);
    // GET /api/v1/notes/statuses — danh sách trạng thái cho ô chọn
    app.get('/api/v1/notes/statuses', async () => ({ statuses: NOTE_STATUSES }));
    // GET /api/v1/notes — list notes by contactId or conversationId
    app.get('/api/v1/notes', async (request) => {
        const user = request.user;
        const { contactId, conversationId, status } = request.query;
        const where = { orgId: user.orgId };
        if (contactId)
            where.contactId = contactId;
        if (conversationId)
            where.conversationId = conversationId;
        if (status?.trim())
            where.status = status.trim();
        const notes = await prisma.note.findMany({
            where,
            orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
            include: {
                createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
            },
        });
        return { notes, total: notes.length };
    });
    // POST /api/v1/notes — create note
    app.post('/api/v1/notes', async (request, reply) => {
        const user = request.user;
        const { contactId, conversationId, content, isPinned } = request.body;
        if (!content?.trim()) {
            return reply.status(400).send({ error: 'Nội dung ghi chú không được để trống' });
        }
        let status;
        try {
            status = normalizeStatus(request.body.status);
        }
        catch (err) {
            return reply.status(400).send({ error: err.message });
        }
        const note = await prisma.note.create({
            data: {
                orgId: user.orgId,
                contactId: contactId || null,
                conversationId: conversationId || null,
                createdByUserId: user.id,
                content: content.trim(),
                status,
                isPinned: isPinned ?? false,
            },
            include: {
                createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
            },
        });
        // Fire automation trigger for note creation
        if (contactId) {
            runAutomationRules('note_added', {
                orgId: user.orgId,
                contactId,
                triggerData: { content: content.trim().slice(0, 200) },
            }).catch(err => logger.error({ err }, '[automation] note_added trigger failed'));
        }
        return note;
    });
    // PUT /api/v1/notes/:id — update note
    app.put('/api/v1/notes/:id', async (request, reply) => {
        const user = request.user;
        const existing = await prisma.note.findFirst({
            where: { id: request.params.id, orgId: user.orgId },
        });
        if (!existing)
            return reply.status(404).send({ error: 'Note not found' });
        const data = {};
        if (request.body.content !== undefined) {
            if (typeof request.body.content !== 'string') {
                return reply.status(400).send({ error: 'content must be a string' });
            }
            data.content = request.body.content.trim();
        }
        if (request.body.isPinned !== undefined)
            data.isPinned = request.body.isPinned;
        if (request.body.status !== undefined) {
            try {
                data.status = normalizeStatus(request.body.status);
            }
            catch (err) {
                return reply.status(400).send({ error: err.message });
            }
        }
        const updated = await prisma.note.update({
            where: { id: request.params.id },
            data,
            include: {
                createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
            },
        });
        return updated;
    });
    // DELETE /api/v1/notes/:id — delete note
    app.delete('/api/v1/notes/:id', async (request, reply) => {
        const user = request.user;
        const existing = await prisma.note.findFirst({
            where: { id: request.params.id, orgId: user.orgId },
        });
        if (!existing)
            return reply.status(404).send({ error: 'Note not found' });
        await prisma.note.delete({ where: { id: request.params.id } });
        return { ok: true };
    });
    // PATCH /api/v1/notes/:id/pin — toggle pin
    app.patch('/api/v1/notes/:id/pin', async (request, reply) => {
        const user = request.user;
        const existing = await prisma.note.findFirst({
            where: { id: request.params.id, orgId: user.orgId },
        });
        if (!existing)
            return reply.status(404).send({ error: 'Note not found' });
        const updated = await prisma.note.update({
            where: { id: request.params.id },
            data: { isPinned: !existing.isPinned },
            include: {
                createdBy: { select: { id: true, fullName: true, avatarUrl: true } },
            },
        });
        return updated;
    });
}
//# sourceMappingURL=note-routes.js.map