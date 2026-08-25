/**
 * library-routes.ts — Thư viện tài liệu gửi cho khách.
 *
 * Nguyên tắc an toàn: CHỈ trả về tài liệu đã duyệt (status='active'). Mục đang
 * chờ duyệt hoặc bị từ chối không bao giờ lọt ra đây, vì đầu ra của endpoint
 * này được nhân viên gửi thẳng cho khách hàng.
 *
 * Hai nguồn:
 *   • Ảnh sản phẩm  — products.images, nhóm theo danh mục sản phẩm
 *   • Kho tri thức  — knowledge_entries (bài viết, chính sách, ảnh/video đã duyệt)
 */
import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'
import { logger } from '../../shared/logger.js'

type AuthUser = { orgId: string; id: string; fullName?: string }

/** Đường dẫn tương đối -> URL tuyệt đối để trình duyệt tải được. */
function absolute(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  const base = (process.env.PUBLIC_API_URL || 'http://localhost:4520').replace(/\/$/, '')
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`
}

export async function libraryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  // ── Danh sách tài liệu đã duyệt, gom theo nhóm ────────────────────
  app.get<{ Querystring: { kind?: string; q?: string } }>(
    '/api/v1/library',
    async (request) => {
      const user = request.user as AuthUser
      const kind = request.query.kind?.trim() || 'all'   // image | content | video | all
      const q = request.query.q?.trim().toLowerCase()

      const groups: Array<{
        id: string
        name: string
        kind: 'image' | 'content' | 'video'
        items: Array<{
          id: string
          title: string
          kind: 'image' | 'content' | 'video'
          url: string | null
          text: string | null
          productName: string | null
        }>
      }> = []

      // ── Ảnh sản phẩm ────────────────────────────────────────────
      if (kind === 'all' || kind === 'image') {
        const cats = await prisma.productCategory.findMany({
          where: { orgId: user.orgId },
          orderBy: { name: 'asc' },
          select: {
            id: true, name: true,
            products: {
              where: { status: 'active' },
              orderBy: { name: 'asc' },
              select: { id: true, name: true, code: true, images: true },
            },
          },
        })

        for (const c of cats) {
          const items = c.products.flatMap(p =>
            (p.images || [])
              .filter(Boolean)
              .map((img, idx) => ({
                id: `prod:${p.id}:${idx}`,
                title: p.name + ((p.images || []).length > 1 ? ` (${idx + 1})` : ''),
                kind: 'image' as const,
                url: absolute(img),
                text: null,
                productName: p.name,
              })),
          ).filter(i => !q || i.title.toLowerCase().includes(q))

          if (items.length) groups.push({ id: `cat:${c.id}`, name: c.name, kind: 'image', items })
        }
      }

      // ── Kho tri thức đã duyệt ───────────────────────────────────
      if (kind === 'all' || kind === 'content' || kind === 'video') {
        const entries = await prisma.knowledgeEntry.findMany({
          // status='active' = đã duyệt. Đây là rào chắn quan trọng nhất của file này.
          where: {
            orgId: user.orgId,
            status: 'active',
            ...(kind === 'video' ? { mediaType: 'video' } : {}),
            ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { content: { contains: q, mode: 'insensitive' } }] } : {}),
          },
          orderBy: { updatedAt: 'desc' },
          take: 300,
          select: {
            id: true, title: true, content: true, type: true,
            mediaUrls: true, mediaType: true,
            category: { select: { name: true } },
            product: { select: { name: true } },
          },
        })

        const byCat = new Map<string, typeof groups[number]['items']>()
        for (const e of entries) {
          const itemKind: 'image' | 'content' | 'video' =
            e.mediaType === 'video' ? 'video' : e.mediaType === 'image' ? 'image' : 'content'
          if (kind === 'content' && itemKind !== 'content') continue
          if (kind === 'video' && itemKind !== 'video') continue

          const catName = e.category?.name || (itemKind === 'content' ? 'Bài viết & chính sách' : 'Tài liệu khác')
          if (!byCat.has(catName)) byCat.set(catName, [])
          byCat.get(catName)!.push({
            id: `kb:${e.id}`,
            // title có thể null trong schema — không để lọt chuỗi 'null' ra giao diện.
            title: e.title?.trim() || '(chưa đặt tiêu đề)',
            kind: itemKind,
            url: e.mediaUrls?.[0] ? absolute(e.mediaUrls[0]) : null,
            text: itemKind === 'content' ? (e.content || '').slice(0, 4000) : null,
            productName: e.product?.name || null,
          })
        }
        for (const [name, items] of byCat) {
          if (items.length) groups.push({ id: `kb:${name}`, name, kind: items[0].kind, items })
        }
      }

      const total = groups.reduce((n, g) => n + g.items.length, 0)
      return { groups, total, approvedOnly: true }
    },
  )

  // ── Gửi tài liệu đã chọn vào hội thoại ────────────────────────────
  app.post<{
    Body: { conversationId?: string; itemIds?: string[] }
  }>('/api/v1/library/send', async (request, reply) => {
    const user = request.user as AuthUser
    const { conversationId, itemIds } = request.body || {}

    if (!conversationId?.trim()) return reply.status(400).send({ error: 'Thiếu conversationId' })
    if (!itemIds?.length) return reply.status(400).send({ error: 'Chưa chọn tài liệu nào' })

    const conv = await prisma.conversation.findFirst({
      where: { id: conversationId.trim(), orgId: user.orgId },
      select: { id: true },
    })
    if (!conv) return reply.status(404).send({ error: 'Không tìm thấy hội thoại' })

    // Nạp lại nội dung từ nguồn thay vì tin dữ liệu client gửi lên — client chỉ
    // được phép nói "gửi mục nào", không được quyết định nội dung gửi đi.
    const created: string[] = []
    const skipped: Array<{ id: string; reason: string }> = []

    for (const raw of itemIds.slice(0, 20)) {
      const [prefix, id, idxRaw] = String(raw).split(':')

      try {
        if (prefix === 'prod') {
          const p = await prisma.product.findFirst({
            where: { id, orgId: user.orgId, status: 'active' },
            select: { name: true, images: true },
          })
          const img = p?.images?.[parseInt(idxRaw || '0', 10)]
          if (!img) { skipped.push({ id: raw, reason: 'Không tìm thấy ảnh' }); continue }

          await prisma.message.create({
            data: {
              conversationId: conv.id,
              senderType: 'user',
              repliedByUserId: user.id,
              contentType: 'image',
              content: JSON.stringify({
                href: absolute(img), thumb: absolute(img),
                caption: p!.name, title: p!.name,
              }),
              sentAt: new Date(),
            },
          })
          created.push(raw)
          continue
        }

        if (prefix === 'kb') {
          const e = await prisma.knowledgeEntry.findFirst({
            // Kiểm tra lại status ở đây: mục có thể bị rút duyệt sau khi
            // nhân viên mở thư viện nhưng trước khi bấm gửi.
            where: { id, orgId: user.orgId, status: 'active' },
            select: { title: true, content: true, mediaUrls: true, mediaType: true },
          })
          if (!e) { skipped.push({ id: raw, reason: 'Tài liệu chưa được duyệt hoặc đã bị gỡ' }); continue }

          const media = e.mediaUrls?.[0]
          await prisma.message.create({
            data: {
              conversationId: conv.id,
              senderType: 'user',
              repliedByUserId: user.id,
              contentType: media ? (e.mediaType === 'video' ? 'video' : 'image') : 'text',
              content: media
                ? JSON.stringify({ href: absolute(media), thumb: absolute(media), caption: e.title, title: e.title })
                : `**${e.title}**\n\n${e.content || ''}`,
              sentAt: new Date(),
            },
          })
          created.push(raw)
          continue
        }

        skipped.push({ id: raw, reason: 'Loại tài liệu không hợp lệ' })
      } catch (err) {
        logger.error({ err, itemId: raw }, '[library] Không gửi được tài liệu')
        skipped.push({ id: raw, reason: 'Lỗi hệ thống' })
      }
    }

    logger.info(
      { conversationId: conv.id, userId: user.id, sent: created.length, skipped: skipped.length },
      '[library] Nhân viên gửi tài liệu vào hội thoại',
    )
    return { sent: created.length, skipped }
  })
}
