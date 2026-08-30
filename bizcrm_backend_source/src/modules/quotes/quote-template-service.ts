/**
 * quote-template-service.ts — mẫu báo giá (thông tin bên bán + điều khoản).
 * ⚠️ orgId luôn là tham số đầu tiên và luôn có trong where.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../../shared/prisma-client.js'
import { serializeQuoteTemplate } from './quote-serialize.js'

export interface TemplateInput {
  name: string
  isDefault?: boolean
  sellerName?: string | null
  sellerTaxCode?: string | null
  sellerAddress?: string | null
  sellerPhone?: string | null
  sellerEmail?: string | null
  logoUrl?: string | null
  bankInfo?: string | null
  signerName?: string | null
  signerTitle?: string | null
  termsText?: string | null
  footerNote?: string | null
  numberPrefix?: string
  defaultTaxRate?: number
  defaultValidDays?: number
  accentColor?: string | null
}

export class TemplateNotFoundError extends Error {
  readonly code = 'NOT_FOUND'
  constructor() { super('Không tìm thấy mẫu báo giá'); this.name = 'TemplateNotFoundError' }
}

const str = (v: unknown, max: number): string | null => {
  if (v == null) return null
  const s = String(v).trim()
  return s ? s.slice(0, max) : null
}

/** Giới hạn độ dài từng field text. */
const TEXT_LIMITS: Record<string, number> = {
  sellerName: 300, sellerTaxCode: 50, sellerAddress: 500, sellerPhone: 50,
  sellerEmail: 200, logoUrl: 500, bankInfo: 500, signerName: 200,
  signerTitle: 200, termsText: 5000, footerNote: 1000, accentColor: 20,
}

const clampTaxRate = (v: unknown) => new Prisma.Decimal(Math.min(100, Math.max(0, Number(v) || 0)))
const clampValidDays = (v: unknown) => Math.min(365, Math.max(1, Number(v) || 30))
const clampPrefix = (v: unknown) =>
  (String(v ?? '') || 'BG').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'BG'

/** CREATE — điền đủ mặc định cho mọi field. */
function buildCreateData(input: TemplateInput) {
  const data: Record<string, unknown> = {}
  for (const [key, limit] of Object.entries(TEXT_LIMITS)) {
    data[key] = str(input[key as keyof TemplateInput], limit)
  }
  data.numberPrefix = clampPrefix(input.numberPrefix)
  data.defaultTaxRate = clampTaxRate(input.defaultTaxRate)
  data.defaultValidDays = clampValidDays(input.defaultValidDays)
  return data
}

/**
 * PATCH — CHỈ đụng field thực sự có trong payload.
 * ⚠️ Trước đây dùng chung buildCreateData nên PATCH hành xử như PUT: gửi
 * `{name, isDefault}` để đổi mẫu mặc định là XOÁ SẠCH thông tin bên bán,
 * tiền tố, thuế, hiệu lực của mẫu đó.
 */
function buildPatchData(input: TemplateInput) {
  const data: Record<string, unknown> = {}
  for (const [key, limit] of Object.entries(TEXT_LIMITS)) {
    if (input[key as keyof TemplateInput] !== undefined) {
      data[key] = str(input[key as keyof TemplateInput], limit)
    }
  }
  if (input.numberPrefix !== undefined) data.numberPrefix = clampPrefix(input.numberPrefix)
  if (input.defaultTaxRate !== undefined) data.defaultTaxRate = clampTaxRate(input.defaultTaxRate)
  if (input.defaultValidDays !== undefined) data.defaultValidDays = clampValidDays(input.defaultValidDays)
  return data
}

export async function listTemplates(orgId: string) {
  const rows = await prisma.quoteTemplate.findMany({
    where: { orgId },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })
  return rows.map(serializeQuoteTemplate)
}

export async function getTemplate(orgId: string, id: string) {
  const row = await prisma.quoteTemplate.findFirst({ where: { id, orgId } })
  if (!row) throw new TemplateNotFoundError()
  return serializeQuoteTemplate(row)
}

export async function createTemplate(orgId: string, input: TemplateInput) {
  const name = str(input.name, 200)
  if (!name) throw new Error('Thiếu tên mẫu')

  const created = await prisma.$transaction(async (tx) => {
    const existingCount = await tx.quoteTemplate.count({ where: { orgId } })
    const makeDefault = input.isDefault === true || existingCount === 0
    if (makeDefault) {
      await tx.quoteTemplate.updateMany({ where: { orgId, isDefault: true }, data: { isDefault: false } })
    }
    return tx.quoteTemplate.create({
      data: { orgId, name, isDefault: makeDefault, ...buildCreateData(input) },
    })
  })
  return serializeQuoteTemplate(created)
}

export async function updateTemplate(orgId: string, id: string, input: TemplateInput) {
  const existing = await prisma.quoteTemplate.findFirst({ where: { id, orgId }, select: { id: true } })
  if (!existing) throw new TemplateNotFoundError()

  const updated = await prisma.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.quoteTemplate.updateMany({ where: { orgId, isDefault: true }, data: { isDefault: false } })
    }
    return tx.quoteTemplate.update({
      where: { id },
      data: {
        ...(input.name ? { name: str(input.name, 200)! } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...buildPatchData(input),
      },
    })
  })
  return serializeQuoteTemplate(updated)
}

export async function deleteTemplate(orgId: string, id: string) {
  const existing = await prisma.quoteTemplate.findFirst({ where: { id, orgId }, select: { id: true, isDefault: true } })
  if (!existing) throw new TemplateNotFoundError()
  // Quote.templateId là SetNull → báo giá cũ vẫn giữ templateSnapshot
  await prisma.quoteTemplate.delete({ where: { id } })
  if (existing.isDefault) {
    const next = await prisma.quoteTemplate.findFirst({ where: { orgId }, orderBy: { createdAt: 'asc' }, select: { id: true } })
    if (next) await prisma.quoteTemplate.update({ where: { id: next.id }, data: { isDefault: true } })
  }
}
