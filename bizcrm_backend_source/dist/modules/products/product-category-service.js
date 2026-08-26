/**
 * product-category-service.ts — Product category tree (org-scoped).
 * Every function takes orgId first → forces the company filter by API design.
 */
import { prisma } from '../../shared/prisma-client.js';
import { uniqueSlug } from './slug.js';
const SELECT = {
    id: true, parentId: true, name: true, slug: true, description: true,
    icon: true, specSchema: true, importConfig: true, sortOrder: true,
    createdAt: true, updatedAt: true,
};
export async function listProductCategories(orgId) {
    const rows = await prisma.productCategory.findMany({
        where: { orgId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { ...SELECT, _count: { select: { products: true } } },
    });
    return rows.map((r) => ({ ...r, productCount: r._count.products, _count: undefined }));
}
export async function getProductCategory(orgId, id) {
    return prisma.productCategory.findFirst({ where: { id, orgId }, select: SELECT });
}
export async function createProductCategory(orgId, data) {
    if (data.parentId)
        await assertSameOrgCategory(orgId, data.parentId);
    const slug = await uniqueSlug(orgId, data.name, 'productCategory');
    return prisma.productCategory.create({
        data: {
            orgId,
            name: data.name,
            slug,
            parentId: data.parentId ?? null,
            description: data.description ?? null,
            icon: data.icon ?? null,
            specSchema: (data.specSchema ?? {}),
            importConfig: (data.importConfig ?? {}),
            sortOrder: data.sortOrder ?? 0,
        },
        select: SELECT,
    });
}
export async function updateProductCategory(orgId, id, data) {
    const existing = await prisma.productCategory.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!existing)
        return null;
    if (data.parentId) {
        if (data.parentId === id)
            throw httpError('Category không thể là cha của chính nó', 400);
        await assertSameOrgCategory(orgId, data.parentId);
    }
    const patch = {};
    if (data.name !== undefined)
        patch.name = data.name;
    if (data.parentId !== undefined)
        patch.parentId = data.parentId;
    if (data.description !== undefined)
        patch.description = data.description;
    if (data.icon !== undefined)
        patch.icon = data.icon;
    if (data.specSchema !== undefined)
        patch.specSchema = data.specSchema;
    if (data.importConfig !== undefined)
        patch.importConfig = data.importConfig;
    if (data.sortOrder !== undefined)
        patch.sortOrder = data.sortOrder;
    return prisma.productCategory.update({ where: { id }, data: patch, select: SELECT });
}
export async function deleteProductCategory(orgId, id) {
    const existing = await prisma.productCategory.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!existing)
        return false;
    // Detach children + products (set null) then delete — avoid orphan FK errors.
    await prisma.$transaction([
        prisma.productCategory.updateMany({ where: { parentId: id, orgId }, data: { parentId: null } }),
        prisma.product.updateMany({ where: { categoryId: id, orgId }, data: { categoryId: null } }),
        prisma.productCategory.delete({ where: { id } }),
    ]);
    return true;
}
async function assertSameOrgCategory(orgId, categoryId) {
    const cat = await prisma.productCategory.findFirst({ where: { id: categoryId, orgId }, select: { id: true } });
    if (!cat)
        throw httpError('Category cha không hợp lệ', 400);
}
function httpError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
}
//# sourceMappingURL=product-category-service.js.map