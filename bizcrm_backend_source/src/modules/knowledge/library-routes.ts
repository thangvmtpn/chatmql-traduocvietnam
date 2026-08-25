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
import { sendImageCore } from '../chat/send-image-core.js'
import { emitNewMessage } from '../realtime/socket-gateway.js'
import { transformMessageForFrontend } from '../chat/chat-routes.js'

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
    '/api/v1/library/items',
    async (request) => {
      const user = request.user as AuthUser
      const kind = (request.query?.kind || 'all').toLowerCase()
      const q = (request.query?.q || '').trim()

      const groups: Array<{ id: string; name: string; items: any[] }> = []

      // 1. Ảnh sản phẩm từ bảng products (chỉ sản phẩm active có ảnh)
      if (kind === 'all' || kind === 'image') {
        const cats = await prisma.productCategory.findMany({
          where: { orgId: user.orgId },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            products: {
              where: {
                status: 'active',
                ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
              },
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
                kind: 'image',
                title: (p.images || []).length > 1 ? `${p.name} (${idx + 1})` : p.name,
                thumbUrl: absolute(img),
                fullUrl: absolute(img),
                meta: { sku: p.code },
              })),
          )

          if (items.length) {
            groups.push({ id: `cat:${c.id}`, name: c.name, items })
          }
        }
      }

      // 2. Bài viết, chính sách, tài liệu từ knowledge_entries (status='active')
      if (kind === 'all' || kind === 'content' || kind === 'video') {
        const entries = await prisma.knowledgeEntry.findMany({
          where: {
            orgId: user.orgId,
            status: 'active',
            ...(kind === 'video'
              ? { mediaType: 'video', mediaUrls: { isEmpty: false } }
              : kind === 'content'
                ? { mediaUrls: { isEmpty: true } }
                : {}),
            ...(q
              ? {
                  OR: [
                    { title: { contains: q, mode: 'insensitive' } },
                    { content: { contains: q, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            title: true,
            content: true,
            mediaUrls: true,
            mediaType: true,
            category: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 100,
        })

        const byCat = new Map<string, any[]>()
        for (const e of entries) {
          const catName = e.category?.name || 'Kho tri thức'
          if (!byCat.has(catName)) byCat.set(catName, [])
          const isVideo = e.mediaType === 'video'
          const itemKind = isVideo ? 'video' : (e.mediaUrls.length ? 'image' : 'content')
          const firstMedia = e.mediaUrls[0]

          byCat.get(catName)!.push({
            id: `kb:${e.id}`,
            kind: itemKind,
            title: e.title || '(Chưa có tiêu đề)',
            content: e.content,
            thumbUrl: firstMedia ? absolute(firstMedia) : undefined,
            fullUrl: firstMedia ? absolute(firstMedia) : undefined,
          })
        }
        for (const [name, items] of byCat.entries()) {
          groups.push({ id: `kbcat:${name}`, name, items })
        }
      }

      return { groups }
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

          const result = await sendImageCore({
            orgId: user.orgId,
            conversationId: conv.id,
            imageUrl: img,
            caption: p.name,
            sender: 'staff',
            repliedByUserId: user.id,
          })

          if (result.sent) {
            created.push(raw)
          } else {
            skipped.push({ id: raw, reason: result.error || 'Không gửi được ảnh' })
          }
          continue
        }

        if (prefix === 'kb') {
          const e = await prisma.knowledgeEntry.findFirst({
            where: { id, orgId: user.orgId, status: 'active' },
            select: { title: true, content: true, mediaUrls: true, mediaType: true },
          })
          if (!e) { skipped.push({ id: raw, reason: 'Tài liệu chưa được duyệt hoặc đã bị gỡ' }); continue }

          const media = e.mediaUrls?.[0]
          if (media && e.mediaType !== 'video') {
            const result = await sendImageCore({
              orgId: user.orgId,
              conversationId: conv.id,
              imageUrl: media,
              caption: e.title || undefined,
              sender: 'staff',
              repliedByUserId: user.id,
            })
            if (result.sent) {
              created.push(raw)
            } else {
              skipped.push({ id: raw, reason: result.error || 'Không gửi được ảnh' })
            }
          } else {
            const msg = await prisma.message.create({
              data: {
                conversationId: conv.id,
                senderType: 'user',
                repliedByUserId: user.id,
                contentType: media ? (e.mediaType === 'video' ? 'video' : 'image') : 'text',
                content: media
                  ? JSON.stringify({ href: absolute(media), thumb: absolute(media), caption: e.title, title: e.title })
                  : `**${e.title || ''}**\n\n${e.content || ''}`,
                sentAt: new Date(),
              },
            })
            emitNewMessage(user.orgId, conv.id, transformMessageForFrontend(msg))
            created.push(raw)
          }
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
    return { sent: created.length, created, skipped }
  })
}
