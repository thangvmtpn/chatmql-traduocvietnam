/**
 * knowledge-category-service.ts — Knowledge category tree (org-scoped).
 * Sales/consulting taxonomy: company info, FAQ, policy, pricing, scripts…
 */
import { prisma } from '../../shared/prisma-client.js';
import { uniqueSlug } from '../products/slug.js';
const SELECT = {
    id: true, parentId: true, name: true, slug: true, description: true,
    kind: true, importConfig: true, sortOrder: true, createdAt: true, updatedAt: true,
};
/** Each knowledge group is exactly one kind: 'knowledge' (bài viết) or 'faq'. */
function normalizeKind(kind) {
    return kind === 'faq' ? 'faq' : 'knowledge';
}
export async function listKnowledgeCategories(orgId) {
    const rows = await prisma.knowledgeCategory.findMany({
        where: { orgId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { ...SELECT, _count: { select: { entries: true } } },
    });
    return rows.map((r) => ({ ...r, entryCount: r._count.entries, _count: undefined }));
}
export async function createKnowledgeCategory(orgId, data) {
    if (data.parentId)
        await assertSameOrg(orgId, data.parentId);
    const slug = await uniqueSlug(orgId, data.name, 'knowledgeCategory');
    return prisma.knowledgeCategory.create({
        data: {
            orgId, name: data.name, slug,
            parentId: data.parentId ?? null,
            description: data.description ?? null,
            kind: normalizeKind(data.kind),
            importConfig: (data.importConfig ?? {}),
            sortOrder: data.sortOrder ?? 0,
        },
        select: SELECT,
    });
}
export async function updateKnowledgeCategory(orgId, id, data) {
    const existing = await prisma.knowledgeCategory.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!existing)
        return null;
    if (data.parentId) {
        if (data.parentId === id)
            throw httpError('Nhóm không thể là cha của chính nó', 400);
        await assertSameOrg(orgId, data.parentId);
    }
    const patch = {};
    if (data.name !== undefined)
        patch.name = data.name;
    if (data.parentId !== undefined)
        patch.parentId = data.parentId;
    if (data.description !== undefined)
        patch.description = data.description;
    if (data.kind !== undefined)
        patch.kind = normalizeKind(data.kind);
    if (data.importConfig !== undefined)
        patch.importConfig = data.importConfig;
    if (data.sortOrder !== undefined)
        patch.sortOrder = data.sortOrder;
    return prisma.knowledgeCategory.update({ where: { id }, data: patch, select: SELECT });
}
export async function deleteKnowledgeCategory(orgId, id) {
    const existing = await prisma.knowledgeCategory.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!existing)
        return false;
    await prisma.$transaction([
        prisma.knowledgeCategory.updateMany({ where: { parentId: id, orgId }, data: { parentId: null } }),
        prisma.knowledgeEntry.updateMany({ where: { categoryId: id, orgId }, data: { categoryId: null } }),
        prisma.knowledgeCategory.delete({ where: { id } }),
    ]);
    return true;
}
/** Idempotent seed of default sales/consulting taxonomy (only if org has none). */
export async function seedDefaultKnowledgeCategories(orgId) {
    const count = await prisma.knowledgeCategory.count({ where: { orgId } });
    if (count > 0)
        return 0;
    const defaults = [
        { name: 'Thông tin công ty', kind: 'knowledge' },
        { name: 'Sản phẩm & dịch vụ', kind: 'knowledge' },
        { name: 'Câu hỏi thường gặp', kind: 'faq' },
        { name: 'Chính sách', kind: 'knowledge' },
        { name: 'Bảng giá & Khuyến mãi', kind: 'knowledge' },
        { name: 'Tư vấn bán hàng', kind: 'knowledge' },
        { name: 'Xử lý từ chối', kind: 'knowledge' },
        { name: 'Hướng dẫn sử dụng', kind: 'knowledge' },
    ];
    let created = 0;
    for (let i = 0; i < defaults.length; i++) {
        await createKnowledgeCategory(orgId, { name: defaults[i].name, kind: defaults[i].kind, sortOrder: i });
        created++;
    }
    return created;
}
async function assertSameOrg(orgId, id) {
    const c = await prisma.knowledgeCategory.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!c)
        throw httpError('Nhóm cha không hợp lệ', 400);
}
function httpError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}
//# sourceMappingURL=knowledge-category-service.js.map