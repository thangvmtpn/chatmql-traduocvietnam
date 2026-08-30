/**
 * quote-service.ts — CRUD + vòng đời báo giá (org-scoped).
 *
 * ⚠️ MULTI-TENANT: orgId LUÔN là tham số đầu tiên và LUÔN có trong mệnh đề where.
 * Không hàm nào ở đây được query bằng id trần.
 *
 * Bất biến nghiệp vụ:
 * - Chỉ `draft` mới sửa được dòng hàng/giá → đã gửi thì phải `reviseQuote`
 * - `accepted` không xoá/huỷ được (chứng từ tài chính)
 * - Tổng tiền LUÔN tính lại ở server, không tin số client gửi lên
 */
import { Prisma } from '@prisma/client'
import { randomBytes } from 'node:crypto'
import { prisma } from '../../shared/prisma-client.js'
import { logger } from '../../shared/logger.js'
import { emitDomainEvent } from '../../shared/domain-events.js'
import { calcLineAmount, calcTotals, effectiveDiscountPercent } from './quote-calc.js'
import { nextQuoteNumber } from './quote-number.js'
import { serializeQuote } from './quote-serialize.js'
import { assertTransition, isEditable, isLocked, QuoteStateError } from './quote-status.js'
import {
  canViewAllQuotes, discountCeilingFor,
  type CreateQuoteInput, type QuoteFilters, type QuoteStatus, type UpdateQuoteInput,
} from './quote-types.js'

const LINE_SELECT = {
  id: true, productId: true, name: true, description: true, quantity: true,
  unit: true, unitPrice: true, discountPercent: true, amount: true, sortOrder: true,
} as const

const LIST_SELECT = {
  id: true, number: true, type: true, status: true, title: true, currency: true,
  total: true, subtotal: true, taxRate: true, taxAmount: true, discountAmount: true,
  discountType: true, discountValue: true,
  validUntil: true, sentAt: true, sentVia: true, firstViewedAt: true, lastViewedAt: true,
  viewCount: true, respondedAt: true, rejectReason: true, source: true, parentId: true,
  assignedUserId: true, createdById: true, createdAt: true, updatedAt: true,
  contact: { select: { id: true, fullName: true, crmName: true, phone: true } },
  company: { select: { id: true, name: true } },
  assignedUser: { select: { id: true, fullName: true } },
} as const

const DETAIL_SELECT = {
  ...LIST_SELECT,
  notes: true, internalNotes: true, templateId: true, templateSnapshot: true,
  publicToken: true, orgId: true, contactId: true, companyId: true,
  lines: { select: LINE_SELECT, orderBy: { sortOrder: 'asc' } },
} as const

export class QuoteNotFoundError extends Error {
  readonly code = 'NOT_FOUND'
  constructor() { super('Không tìm thấy báo giá'); this.name = 'QuoteNotFoundError' }
}
export class QuoteForbiddenError extends Error {
  readonly code = 'FORBIDDEN'
  constructor(message: string) { super(message); this.name = 'QuoteForbiddenError' }
}
export class QuoteValidationError extends Error {
  readonly code = 'VALIDATION_ERROR'
  constructor(message: string) { super(message); this.name = 'QuoteValidationError' }
}

function newPublicToken(): string {
  return randomBytes(24).toString('base64url')
}

/** Ghi nhật ký — không bao giờ làm hỏng luồng chính. */
async function logEvent(
  tx: Prisma.TransactionClient,
  input: { quoteId: string; orgId: string; type: string; actorType?: string; actorId?: string | null; meta?: Prisma.InputJsonValue },
): Promise<void> {
  await tx.quoteEvent.create({
    data: {
      quoteId: input.quoteId, orgId: input.orgId, type: input.type,
      actorType: input.actorType ?? 'user', actorId: input.actorId ?? null,
      meta: input.meta ?? {},
    },
  })
}

/** Chuẩn hoá + kiểm tra dòng hàng, trả về data sẵn sàng ghi DB. */
function buildLines(lines: CreateQuoteInput['lines']) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new QuoteValidationError('Báo giá phải có ít nhất 1 dòng hàng')
  }
  if (lines.length > 200) {
    throw new QuoteValidationError('Tối đa 200 dòng hàng')
  }
  return lines.map((l, i) => {
    const name = String(l.name ?? '').trim()
    if (!name) throw new QuoteValidationError(`Dòng ${i + 1}: thiếu tên hàng hoá/dịch vụ`)
    const quantity = Number(l.quantity)
    const unitPrice = Number(l.unitPrice)
    if (!Number.isFinite(quantity) || quantity <= 0) throw new QuoteValidationError(`Dòng ${i + 1}: số lượng không hợp lệ`)
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new QuoteValidationError(`Dòng ${i + 1}: đơn giá không hợp lệ`)
    const discountPercent = Number(l.discountPercent ?? 0)
    return {
      productId: l.productId || null,
      name: name.slice(0, 500),
      description: l.description ? String(l.description).slice(0, 2000) : null,
      quantity: new Prisma.Decimal(quantity),
      unit: (l.unit || 'cái').slice(0, 50),
      unitPrice: new Prisma.Decimal(unitPrice),
      discountPercent: new Prisma.Decimal(Math.min(100, Math.max(0, discountPercent))),
      amount: new Prisma.Decimal(calcLineAmount(quantity, unitPrice, discountPercent)),
      sortOrder: i,
    }
  })
}

/** Chặn nhân viên giảm giá vượt trần theo vai trò. */
function assertDiscountAllowed(role: string, lines: CreateQuoteInput['lines'], opts: { discountType?: string; discountValue?: number }) {
  const ceiling = discountCeilingFor(role)
  if (ceiling >= 100) return
  const effective = effectiveDiscountPercent(
    lines.map((l) => ({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent ?? 0) })),
    { discountType: opts.discountType as any, discountValue: opts.discountValue },
  )
  if (effective > ceiling + 0.001) {
    throw new QuoteForbiddenError(`Vai trò của bạn chỉ được chiết khấu tối đa ${ceiling}% (đang là ${effective.toFixed(1)}%)`)
  }
}

/** Xác nhận contact thuộc org này — chặn gán báo giá sang contact org khác. */
async function assertContactInOrg(orgId: string, contactId: string): Promise<{ companyId: string | null }> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, orgId, deletedAt: null },
    select: { id: true, companyId: true },
  })
  if (!contact) throw new QuoteValidationError('Không tìm thấy khách hàng trong tổ chức này')
  return { companyId: contact.companyId }
}

/** Xác nhận company thuộc org này — chặn gắn báo giá vào công ty của org khác. */
async function assertCompanyInOrg(orgId: string, companyId: string): Promise<void> {
  const company = await prisma.company.findFirst({
    where: { id: companyId, orgId, deletedAt: null },
    select: { id: true },
  })
  if (!company) throw new QuoteValidationError('Công ty không thuộc tổ chức này')
}

// ── Đọc ──────────────────────────────────────────────────────────────

export async function listQuotes(
  orgId: string,
  user: { id: string; role: string },
  filters: QuoteFilters = {},
  page = { page: 1, limit: 20 },
) {
  const where: Prisma.QuoteWhereInput = { orgId, deletedAt: null }

  if (filters.status) where.status = { in: filters.status.split(',').map((s) => s.trim()).filter(Boolean) }
  if (filters.type) where.type = filters.type
  if (filters.contactId) where.contactId = filters.contactId
  if (filters.companyId) where.companyId = filters.companyId
  if (filters.assignedUserId) where.assignedUserId = filters.assignedUserId

  // member chỉ thấy báo giá của mình (tạo hoặc được gán)
  if (!canViewAllQuotes(user.role)) {
    where.OR = [{ assignedUserId: user.id }, { createdById: user.id }]
  }

  if (filters.search) {
    const q = filters.search.trim().slice(0, 100)
    const search: Prisma.QuoteWhereInput[] = [
      { number: { contains: q, mode: 'insensitive' } },
      { title: { contains: q, mode: 'insensitive' } },
      { contact: { fullName: { contains: q, mode: 'insensitive' } } },
      { contact: { crmName: { contains: q, mode: 'insensitive' } } },
    ]
    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), { OR: search }]
  }

  if (filters.from || filters.to) {
    where.createdAt = {}
    if (filters.from) where.createdAt.gte = new Date(filters.from)
    if (filters.to) where.createdAt.lte = new Date(filters.to)
  }

  const limit = Math.min(100, Math.max(1, page.limit || 20))
  const skip = Math.max(0, ((page.page || 1) - 1) * limit)

  const [rows, total] = await Promise.all([
    prisma.quote.findMany({ where, select: LIST_SELECT, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.quote.count({ where }),
  ])

  return {
    items: rows.map(serializeQuote),
    meta: { page: page.page || 1, pageSize: limit, total, totalPages: Math.ceil(total / limit) },
  }
}

export async function getQuote(orgId: string, id: string, user?: { id: string; role: string }) {
  const quote = await prisma.quote.findFirst({
    where: { id, orgId, deletedAt: null },
    select: DETAIL_SELECT,
  })
  if (!quote) throw new QuoteNotFoundError()

  if (user && !canViewAllQuotes(user.role)) {
    if (quote.assignedUserId !== user.id && quote.createdById !== user.id) {
      throw new QuoteNotFoundError() // 404 chứ không 403 — không tiết lộ là có tồn tại
    }
  }
  return serializeQuote(quote)
}

export async function getQuoteEvents(orgId: string, id: string) {
  const quote = await prisma.quote.findFirst({ where: { id, orgId, deletedAt: null }, select: { id: true } })
  if (!quote) throw new QuoteNotFoundError()
  return prisma.quoteEvent.findMany({
    where: { quoteId: id, orgId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
}

// ── Tạo / sửa ────────────────────────────────────────────────────────

export async function createQuote(orgId: string, user: { id: string; role: string }, input: CreateQuoteInput) {
  const contact = await assertContactInOrg(orgId, input.contactId)
  if (input.companyId) await assertCompanyInOrg(orgId, input.companyId)
  assertDiscountAllowed(user.role, input.lines, input)

  const lineData = buildLines(input.lines)

  // Template mặc định của org (nếu không chỉ định) — luôn lọc theo orgId
  const template = input.templateId
    ? await prisma.quoteTemplate.findFirst({ where: { id: input.templateId, orgId } })
    : await prisma.quoteTemplate.findFirst({ where: { orgId, isDefault: true } })
  if (input.templateId && !template) throw new QuoteValidationError('Không tìm thấy mẫu báo giá')

  // ⚠️ PHẢI chốt thuế TRƯỚC khi tính tổng. Trước đây calcTotals chạy trước khi
  // tra template nên tính với thuế 0 rồi lại lưu taxRate=10 → báo giá hiện
  // "Thuế GTGT (10%): 0" và tổng thiếu hẳn phần thuế.
  const taxRate = input.taxRate ?? Number(template?.defaultTaxRate ?? 0)
  const totals = calcTotals(
    input.lines.map((l) => ({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent ?? 0) })),
    { discountType: input.discountType, discountValue: input.discountValue, taxRate },
  )

  // Người được gán phải cùng org
  if (input.assignedUserId) {
    const assignee = await prisma.user.findFirst({ where: { id: input.assignedUserId, orgId }, select: { id: true } })
    if (!assignee) throw new QuoteValidationError('Người phụ trách không thuộc tổ chức này')
  }

  const validUntil = input.validUntil
    ? new Date(input.validUntil)
    : template?.defaultValidDays
      ? new Date(Date.now() + template.defaultValidDays * 86_400_000)
      : null

  const created = await prisma.$transaction(async (tx) => {
    const number = await nextQuoteNumber(tx, orgId, template?.numberPrefix ?? 'BG')
    const quote = await tx.quote.create({
      data: {
        orgId,
        contactId: input.contactId,
        companyId: input.companyId ?? contact.companyId,
        number,
        type: input.type ?? 'quote',
        status: 'draft',
        publicToken: newPublicToken(),
        title: input.title?.slice(0, 300) ?? null,
        subtotal: new Prisma.Decimal(totals.subtotal),
        discountType: input.discountType ?? 'none',
        discountValue: new Prisma.Decimal(input.discountValue ?? 0),
        discountAmount: new Prisma.Decimal(totals.discountAmount),
        taxRate: new Prisma.Decimal(taxRate),
        taxAmount: new Prisma.Decimal(totals.taxAmount),
        total: new Prisma.Decimal(totals.total),
        // KHÔNG copy template.termsText vào đây — nó đã hiển thị riêng ở mục
        // "Điều khoản chung" (lấy từ templateSnapshot). Copy vào sẽ in trùng 2 lần.
        notes: input.notes?.slice(0, 5000) ?? null,
        internalNotes: input.internalNotes?.slice(0, 5000) ?? null,
        templateId: template?.id ?? null,
        assignedUserId: input.assignedUserId ?? user.id,
        createdById: user.id,
        source: input.source ?? 'manual',
        validUntil,
        lines: { create: lineData },
      },
      select: DETAIL_SELECT,
    })
    await logEvent(tx, { quoteId: quote.id, orgId, type: 'created', actorId: user.id })
    return quote
  })

  emitDomainEvent({ type: 'quote.created', orgId, id: created.id })
  return serializeQuote(created)
}

export async function updateQuote(orgId: string, id: string, user: { id: string; role: string }, input: UpdateQuoteInput) {
  const existing = await prisma.quote.findFirst({
    where: { id, orgId, deletedAt: null },
    select: { id: true, status: true, templateId: true, assignedUserId: true, createdById: true },
  })
  if (!existing) throw new QuoteNotFoundError()
  if (!canViewAllQuotes(user.role) && existing.assignedUserId !== user.id && existing.createdById !== user.id) {
    throw new QuoteNotFoundError()
  }
  if (!isEditable(existing.status as QuoteStatus)) {
    throw new QuoteStateError('Báo giá đã gửi không sửa được. Hãy tạo bản sửa đổi (revise).')
  }

  const data: Prisma.QuoteUpdateInput = {}
  if (input.title !== undefined) data.title = input.title?.slice(0, 300) ?? null
  if (input.notes !== undefined) data.notes = input.notes?.slice(0, 5000) ?? null
  if (input.internalNotes !== undefined) data.internalNotes = input.internalNotes?.slice(0, 5000) ?? null
  if (input.validUntil !== undefined) data.validUntil = input.validUntil ? new Date(input.validUntil) : null
  if (input.type !== undefined) data.type = input.type

  if (input.assignedUserId !== undefined) {
    if (input.assignedUserId) {
      const assignee = await prisma.user.findFirst({ where: { id: input.assignedUserId, orgId }, select: { id: true } })
      if (!assignee) throw new QuoteValidationError('Người phụ trách không thuộc tổ chức này')
    }
    data.assignedUser = input.assignedUserId ? { connect: { id: input.assignedUserId } } : { disconnect: true }
  }

  if (input.companyId !== undefined) {
    if (input.companyId) await assertCompanyInOrg(orgId, input.companyId)
    data.company = input.companyId ? { connect: { id: input.companyId } } : { disconnect: true }
  }

  // Đổi dòng hàng / chiết khấu / thuế → thay toàn bộ dòng + tính lại tổng
  const touchesMoney = input.lines !== undefined || input.discountType !== undefined
    || input.discountValue !== undefined || input.taxRate !== undefined

  const updated = await prisma.$transaction(async (tx) => {
    if (touchesMoney) {
      const current = await tx.quote.findFirstOrThrow({
        where: { id, orgId },
        select: { discountType: true, discountValue: true, taxRate: true, lines: { select: LINE_SELECT, orderBy: { sortOrder: 'asc' } } },
      })
      const rawLines = input.lines ?? current.lines.map((l) => ({
        productId: l.productId, name: l.name, description: l.description,
        quantity: Number(l.quantity), unit: l.unit, unitPrice: Number(l.unitPrice),
        discountPercent: Number(l.discountPercent),
      }))
      const discountType = (input.discountType ?? current.discountType) as any
      const discountValue = input.discountValue ?? Number(current.discountValue)
      const taxRate = input.taxRate ?? Number(current.taxRate)

      assertDiscountAllowed(user.role, rawLines, { discountType, discountValue })
      const lineData = buildLines(rawLines)
      const totals = calcTotals(
        rawLines.map((l) => ({ quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent ?? 0) })),
        { discountType, discountValue, taxRate },
      )

      await tx.quoteLine.deleteMany({ where: { quoteId: id } })
      await tx.quoteLine.createMany({ data: lineData.map((l) => ({ ...l, quoteId: id })) })

      data.subtotal = new Prisma.Decimal(totals.subtotal)
      data.discountType = discountType
      data.discountValue = new Prisma.Decimal(discountValue)
      data.discountAmount = new Prisma.Decimal(totals.discountAmount)
      data.taxRate = new Prisma.Decimal(taxRate)
      data.taxAmount = new Prisma.Decimal(totals.taxAmount)
      data.total = new Prisma.Decimal(totals.total)
    }

    const quote = await tx.quote.update({ where: { id }, data, select: DETAIL_SELECT })
    await logEvent(tx, { quoteId: id, orgId, type: 'updated', actorId: user.id })
    return quote
  })

  emitDomainEvent({ type: 'quote.updated', orgId, id })
  return serializeQuote(updated)
}

export async function softDeleteQuote(orgId: string, id: string, user: { id: string; role: string }) {
  const existing = await prisma.quote.findFirst({ where: { id, orgId, deletedAt: null }, select: { id: true, status: true } })
  if (!existing) throw new QuoteNotFoundError()
  if (isLocked(existing.status as QuoteStatus)) {
    throw new QuoteStateError('Báo giá đã được chấp nhận — không thể xoá (chứng từ tài chính)')
  }
  await prisma.$transaction(async (tx) => {
    await tx.quote.update({ where: { id }, data: { deletedAt: new Date(), status: 'canceled' } })
    await logEvent(tx, { quoteId: id, orgId, type: 'canceled', actorId: user.id })
  })
  emitDomainEvent({ type: 'quote.status_changed', orgId, id })
}

// ── Vòng đời ─────────────────────────────────────────────────────────

export async function markQuoteSent(
  orgId: string, id: string, user: { id: string; role: string }, sentVia: string,
) {
  const existing = await prisma.quote.findFirst({
    where: { id, orgId, deletedAt: null },
    select: { id: true, status: true, templateId: true, lines: { select: { id: true } } },
  })
  if (!existing) throw new QuoteNotFoundError()
  assertTransition(existing.status as QuoteStatus, 'sent')
  if (existing.lines.length === 0) throw new QuoteValidationError('Báo giá chưa có dòng hàng nào')

  // Đóng băng thông tin bên bán — template đổi sau này không làm đổi báo giá đã gửi
  const template = existing.templateId
    ? await prisma.quoteTemplate.findFirst({ where: { id: existing.templateId, orgId } })
    : await prisma.quoteTemplate.findFirst({ where: { orgId, isDefault: true } })

  // Org chưa tạo mẫu báo giá nào → vẫn phải có tên bên bán, nếu không trang
  // khách hiện đầu trang trống trơ. Lấy tên tổ chức làm phương án dự phòng.
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } })

  const snapshot = template
    ? {
        sellerName: template.sellerName || org?.name || null,
        sellerTaxCode: template.sellerTaxCode, sellerAddress: template.sellerAddress,
        sellerPhone: template.sellerPhone, sellerEmail: template.sellerEmail,
        logoUrl: template.logoUrl, bankInfo: template.bankInfo,
        signerName: template.signerName, signerTitle: template.signerTitle,
        termsText: template.termsText, footerNote: template.footerNote,
        accentColor: template.accentColor,
      }
    : { sellerName: org?.name || null }

  const updated = await prisma.$transaction(async (tx) => {
    const quote = await tx.quote.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date(), sentVia, templateSnapshot: snapshot },
      select: DETAIL_SELECT,
    })
    await logEvent(tx, { quoteId: id, orgId, type: 'sent', actorId: user.id, meta: { channel: sentVia } })
    return quote
  })

  emitDomainEvent({ type: 'quote.sent', orgId, id })
  return serializeQuote(updated)
}

/**
 * Nhân bản báo giá — tạo bản nháp MỚI, không có lineage với bản gốc.
 * Khác `reviseQuote` ở chỗ đây là chứng từ độc lập; cho phép đổi sang khách
 * khác (sale hay báo cùng một gói dịch vụ cho nhiều khách).
 */
export async function duplicateQuote(
  orgId: string, id: string, user: { id: string; role: string }, targetContactId?: string,
) {
  const source = await prisma.quote.findFirst({
    where: { id, orgId, deletedAt: null },
    select: { ...DETAIL_SELECT, lines: { select: LINE_SELECT, orderBy: { sortOrder: 'asc' } } },
  })
  if (!source) throw new QuoteNotFoundError()

  // Đổi khách → phải kiểm tra khách mới thuộc org này
  let contactId = source.contactId
  let companyId = source.companyId
  if (targetContactId && targetContactId !== source.contactId) {
    const target = await assertContactInOrg(orgId, targetContactId)
    contactId = targetContactId
    companyId = target.companyId
  }

  const template = source.templateId
    ? await prisma.quoteTemplate.findFirst({ where: { id: source.templateId, orgId }, select: { numberPrefix: true } })
    : await prisma.quoteTemplate.findFirst({ where: { orgId, isDefault: true }, select: { numberPrefix: true } })

  const created = await prisma.$transaction(async (tx) => {
    const prefix = source.type === 'contract' ? 'HD' : (template?.numberPrefix ?? 'BG')
    const number = await nextQuoteNumber(tx, orgId, prefix)
    const quote = await tx.quote.create({
      data: {
        orgId, contactId, companyId,
        // KHÔNG set parentId — đây là chứng từ độc lập, không phải bản sửa đổi
        number, type: source.type, status: 'draft', publicToken: newPublicToken(),
        title: source.title, currency: source.currency,
        subtotal: source.subtotal, discountType: source.discountType,
        discountValue: source.discountValue, discountAmount: source.discountAmount,
        taxRate: source.taxRate, taxAmount: source.taxAmount, total: source.total,
        notes: source.notes, internalNotes: source.internalNotes,
        templateId: source.templateId,
        assignedUserId: user.id, createdById: user.id, source: 'manual',
        validUntil: source.validUntil,
        lines: {
          create: source.lines.map((l) => ({
            productId: l.productId, name: l.name, description: l.description,
            quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice,
            discountPercent: l.discountPercent, amount: l.amount, sortOrder: l.sortOrder,
          })),
        },
      },
      select: DETAIL_SELECT,
    })
    await logEvent(tx, {
      quoteId: quote.id, orgId, type: 'created', actorId: user.id,
      meta: { duplicatedFrom: source.number },
    })
    return quote
  })

  emitDomainEvent({ type: 'quote.created', orgId, id: created.id })
  return serializeQuote(created)
}

/** Tạo bản sửa đổi từ một báo giá đã gửi. Bản cũ giữ nguyên (bất biến). */
export async function reviseQuote(orgId: string, id: string, user: { id: string; role: string }) {
  const source = await prisma.quote.findFirst({
    where: { id, orgId, deletedAt: null },
    select: { ...DETAIL_SELECT, lines: { select: LINE_SELECT, orderBy: { sortOrder: 'asc' } } },
  })
  if (!source) throw new QuoteNotFoundError()

  const template = source.templateId
    ? await prisma.quoteTemplate.findFirst({ where: { id: source.templateId, orgId }, select: { numberPrefix: true } })
    : null

  const created = await prisma.$transaction(async (tx) => {
    const number = await nextQuoteNumber(tx, orgId, template?.numberPrefix ?? 'BG')
    const quote = await tx.quote.create({
      data: {
        orgId, contactId: source.contactId, companyId: source.companyId,
        parentId: source.id,
        number, type: source.type, status: 'draft', publicToken: newPublicToken(),
        title: source.title, currency: source.currency,
        subtotal: source.subtotal, discountType: source.discountType,
        discountValue: source.discountValue, discountAmount: source.discountAmount,
        taxRate: source.taxRate, taxAmount: source.taxAmount, total: source.total,
        notes: source.notes, internalNotes: source.internalNotes,
        templateId: source.templateId,
        assignedUserId: source.assignedUserId, createdById: user.id,
        source: 'manual', validUntil: source.validUntil,
        lines: {
          create: source.lines.map((l) => ({
            productId: l.productId, name: l.name, description: l.description,
            quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice,
            discountPercent: l.discountPercent, amount: l.amount, sortOrder: l.sortOrder,
          })),
        },
      },
      select: DETAIL_SELECT,
    })
    await logEvent(tx, { quoteId: quote.id, orgId, type: 'revised', actorId: user.id, meta: { from: source.number } })
    await logEvent(tx, { quoteId: source.id, orgId, type: 'revised', actorId: user.id, meta: { to: number } })
    return quote
  })

  emitDomainEvent({ type: 'quote.created', orgId, id: created.id })
  return serializeQuote(created)
}

/** Chuyển báo giá đã chấp nhận thành hợp đồng (bản mới, giữ lineage). */
export async function convertToContract(orgId: string, id: string, user: { id: string; role: string }) {
  const source = await prisma.quote.findFirst({
    where: { id, orgId, deletedAt: null },
    select: { ...DETAIL_SELECT, lines: { select: LINE_SELECT, orderBy: { sortOrder: 'asc' } } },
  })
  if (!source) throw new QuoteNotFoundError()
  if (source.status !== 'accepted') throw new QuoteStateError('Chỉ báo giá đã được chấp nhận mới chuyển thành hợp đồng')
  if (source.type === 'contract') throw new QuoteStateError('Đây đã là hợp đồng')

  const created = await prisma.$transaction(async (tx) => {
    const number = await nextQuoteNumber(tx, orgId, 'HD')
    const quote = await tx.quote.create({
      data: {
        orgId, contactId: source.contactId, companyId: source.companyId, parentId: source.id,
        number, type: 'contract', status: 'draft', publicToken: newPublicToken(),
        title: source.title, currency: source.currency,
        subtotal: source.subtotal, discountType: source.discountType,
        discountValue: source.discountValue, discountAmount: source.discountAmount,
        taxRate: source.taxRate, taxAmount: source.taxAmount, total: source.total,
        notes: source.notes, templateId: source.templateId,
        assignedUserId: source.assignedUserId, createdById: user.id, source: 'manual',
        lines: {
          create: source.lines.map((l) => ({
            productId: l.productId, name: l.name, description: l.description,
            quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice,
            discountPercent: l.discountPercent, amount: l.amount, sortOrder: l.sortOrder,
          })),
        },
      },
      select: DETAIL_SELECT,
    })
    await logEvent(tx, { quoteId: quote.id, orgId, type: 'created', actorId: user.id, meta: { convertedFrom: source.number } })
    return quote
  })

  emitDomainEvent({ type: 'quote.created', orgId, id: created.id })
  return serializeQuote(created)
}

/** Nhân viên tự ghi nhận phản hồi của khách (khách trả lời qua điện thoại/chat). */
export async function respondByStaff(
  orgId: string, id: string, user: { id: string; role: string },
  action: 'accept' | 'reject', reason?: string,
) {
  const existing = await prisma.quote.findFirst({ where: { id, orgId, deletedAt: null }, select: { id: true, status: true } })
  if (!existing) throw new QuoteNotFoundError()
  const to: QuoteStatus = action === 'accept' ? 'accepted' : 'rejected'
  assertTransition(existing.status as QuoteStatus, to)

  const updated = await prisma.$transaction(async (tx) => {
    const quote = await tx.quote.update({
      where: { id },
      data: { status: to, respondedAt: new Date(), rejectReason: action === 'reject' ? (reason?.slice(0, 500) ?? null) : null },
      select: DETAIL_SELECT,
    })
    await logEvent(tx, { quoteId: id, orgId, type: to, actorId: user.id, meta: { by: 'staff', reason: reason ?? null } })
    return quote
  })

  emitDomainEvent({ type: action === 'accept' ? 'quote.accepted' : 'quote.rejected', orgId, id })
  return serializeQuote(updated)
}

/** Job: đánh dấu hết hạn các báo giá quá `validUntil`. */
export async function expireOverdueQuotes(): Promise<number> {
  const overdue = await prisma.quote.findMany({
    where: { deletedAt: null, status: { in: ['sent', 'viewed'] }, validUntil: { lt: new Date() } },
    select: { id: true, orgId: true },
    take: 500,
  })
  for (const q of overdue) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.quote.update({ where: { id: q.id }, data: { status: 'expired' } })
        await logEvent(tx, { quoteId: q.id, orgId: q.orgId, type: 'expired', actorType: 'system' })
      })
      emitDomainEvent({ type: 'quote.status_changed', orgId: q.orgId, id: q.id })
    } catch (err) {
      logger.error({ err, quoteId: q.id }, '[quotes] expire failed')
    }
  }
  return overdue.length
}
