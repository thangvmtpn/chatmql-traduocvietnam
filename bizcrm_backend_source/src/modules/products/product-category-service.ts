/**
 * product-category-service.ts — Product category tree (org-scoped).
 * Every function takes orgId first → forces the company filter by API design.
 */
import { prisma } from '../../shared/prisma-client.js'
import { uniqueSlug } from './slug.js'

const SELECT = {
  id: true, parentId: true, name: true, slug: true, description: true,
  icon: true, specSchema: true, importConfig: true, sortOrder: true,
  createdAt: true, updatedAt: true,
} as const

export async function listProductCategories(orgId: string) {
  const rows = await prisma.productCategory.findMany({
    where: { orgId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { ...SELECT, _count: { select: { products: true } } },
  })
  return rows.map((r) => ({ ...r, productCount: r._count.products, _count: undefined }))
}

export async function getProductCategory(orgId: string, id: string) {
  return prisma.productCategory.findFirst({ where: { id, orgId }, select: SELECT })
}

export type ProductCategoryInput = {
  name: string
  parentId?: string | null
  description?: string | null
  icon?: string | null
  specSchema?: unknown
  importConfig?: unknown
  sortOrder?: number
}

export async function createProductCategory(orgId: string, data: ProductCategoryInput) {
  if (data.parentId) await assertSameOrgCategory(orgId, data.parentId)
  const slug = await uniqueSlug(orgId, data.name, 'productCategory')
  return prisma.productCategory.create({
    data: {
      orgId,
      name: data.name,
      slug,
      parentId: data.parentId ?? null,
      description: data.description ?? null,
      icon: data.icon ?? null,
      specSchema: (data.specSchema ?? {}) as object,
      importConfig: (data.importConfig ?? {}) as object,
      sortOrder: data.sortOrder ?? 0,
    },
    select: SELECT,
  })
}

export async function updateProductCategory(
  orgId: string,
  id: string,
  data: Partial<ProductCategoryInput>,
) {
  const existing = await prisma.productCategory.findFirst({ where: { id, orgId }, select: { id: true } })
  if (!existing) return null
  if (data.parentId) {
    if (data.parentId === id) throw httpError('Category không thể là cha của chính nó', 400)
    await assertSameOrgCategory(orgId, data.parentId)
  }
  const patch: Record<string, unknown> = {}
  if (data.name !== undefined) patch.name = data.name
  if (data.parentId !== undefined) patch.parentId = data.parentId
  if (data.description !== undefined) patch.description = data.description
  if (data.icon !== undefined) patch.icon = data.icon
  if (data.specSchema !== undefined) patch.specSchema = data.specSchema as object
  if (data.importConfig !== undefined) patch.importConfig = data.importConfig as object
  if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder
  return prisma.productCategory.update({ where: { id }, data: patch, select: SELECT })
}

export async function deleteProductCategory(orgId: string, id: string): Promise<boolean> {
  const existing = await prisma.productCategory.findFirst({ where: { id, orgId }, select: { id: true } })
  if (!existing) return false
  // Detach children + products (set null) then delete — avoid orphan FK errors.
  await prisma.$transaction([
    prisma.productCategory.updateMany({ where: { parentId: id, orgId }, data: { parentId: null } }),
    prisma.product.updateMany({ where: { categoryId: id, orgId }, data: { categoryId: null } }),
    prisma.productCategory.delete({ where: { id } }),
  ])
  return true
}

async function assertSameOrgCategory(orgId: string, categoryId: string) {
  const cat = await prisma.productCategory.findFirst({ where: { id: categoryId, orgId }, select: { id: true } })
  if (!cat) throw httpError('Category cha không hợp lệ', 400)
}

function httpError(message: string, statusCode: number) {
  const err = new Error(message) as Error & { statusCode: number }
  err.statusCode = statusCode
  return err
}
