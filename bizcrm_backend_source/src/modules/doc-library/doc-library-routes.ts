/**
 * doc-library-routes.ts — HTTP cho thư viện tài liệu bán hàng.
 * Đọc: mọi nhân viên. Ghi: owner/admin/manager.
 */
import type { FastifyInstance, FastifyReply } from 'fastify'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import multipart from '@fastify/multipart'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'
import { logger } from '../../shared/logger.js'
import { sendImageCore } from '../chat/send-image-core.js'
import { emitNewMessage } from '../realtime/socket-gateway.js'
import { transformMessageForFrontend } from '../chat/chat-routes.js'
import {
  ASSET_KINDS, VISIBILITIES,
  listFolders, createFolder, updateFolder, deleteFolder,
  listAssets, createAsset, updateAsset, deleteAsset,
} from './doc-library-service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DOC_ASSETS_DIR = path.resolve(__dirname, '../../../uploads/doc-assets')
mkdir(DOC_ASSETS_DIR, { recursive: true }).catch(() => {})

/** 25MB: đủ cho ảnh chất lượng cao và pdf tài liệu; video nên dán link thay vì tải lên. */
const MAX_FILE_SIZE = 25 * 1024 * 1024

/** Đuôi file cho phép, kèm loại tài nguyên suy ra từ đó. */
const EXT_KIND: Record<string, string> = {
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.webp': 'image', '.gif': 'image',
  '.pdf': 'pdf',
  '.doc': 'doc', '.docx': 'doc', '.xls': 'doc', '.xlsx': 'doc', '.ppt': 'doc', '.pptx': 'doc',
  '.txt': 'text', '.md': 'text', '.csv': 'text',
  '.mp4': 'video', '.webm': 'video',
}

type AuthUser = { orgId: string; role: string; id: string }

function canManage(role: string): boolean {
  return ['owner', 'admin', 'manager'].includes(role)
}
function fail(reply: FastifyReply, status: number, message: string) {
  return reply.status(status).send({ error: message })
}
function guard(request: { user: unknown }, reply: FastifyReply): AuthUser | null {
  const u = request.user as AuthUser
  if (!canManage(u.role)) {
    fail(reply, 403, 'Không có quyền chỉnh thư viện tài liệu')
    return null
  }
  return u
}

export async function docLibraryRoutes(app: FastifyInstance): Promise<void> {
  await app.register(multipart, { limits: { fileSize: MAX_FILE_SIZE } })
  app.addHook('preHandler', authMiddleware)

  /** Hằng số cho giao diện — khỏi khai báo trùng ở frontend. */
  app.get('/api/v1/doc-library/meta', async () => ({
    kinds: ASSET_KINDS,
    visibilities: VISIBILITIES,
    maxFileSize: MAX_FILE_SIZE,
    allowedExtensions: Object.keys(EXT_KIND),
  }))

  // ── Thư mục ─────────────────────────────────────────────────────────
  app.get('/api/v1/doc-library/folders', async (request) => {
    const u = request.user as AuthUser
    return { folders: await listFolders(u.orgId) }
  })

  app.post('/api/v1/doc-library/folders', async (request, reply) => {
    const u = guard(request, reply); if (!u) return
    try {
      return { folder: await createFolder(u.orgId, request.body as never) }
    } catch (err) {
      return fail(reply, 400, err instanceof Error ? err.message : 'Không tạo được thư mục')
    }
  })

  app.patch<{ Params: { id: string } }>('/api/v1/doc-library/folders/:id', async (request, reply) => {
    const u = guard(request, reply); if (!u) return
    try {
      const folder = await updateFolder(u.orgId, request.params.id, request.body as never)
      if (!folder) return fail(reply, 404, 'Không tìm thấy thư mục')
      return { folder }
    } catch (err) {
      return fail(reply, 400, err instanceof Error ? err.message : 'Không sửa được thư mục')
    }
  })

  app.delete<{ Params: { id: string } }>('/api/v1/doc-library/folders/:id', async (request, reply) => {
    const u = guard(request, reply); if (!u) return
    return { deleted: await deleteFolder(u.orgId, request.params.id) }
  })

  // ── Tài nguyên ──────────────────────────────────────────────────────
  app.get<{
    Querystring: {
      folderId?: string; unfiled?: string; kind?: string; productCode?: string
      q?: string; visibility?: string; page?: string; pageSize?: string
    }
  }>('/api/v1/doc-library/assets', async (request) => {
    const u = request.user as AuthUser
    const qy = request.query
    const int = (v?: string) => {
      const n = Number.parseInt(v ?? '', 10)
      return Number.isFinite(n) ? n : undefined
    }
    return listAssets(u.orgId, {
      folderId: qy.folderId,
      unfiled: qy.unfiled === 'true',
      kind: qy.kind,
      productCode: qy.productCode,
      q: qy.q,
      visibility: qy.visibility,
      page: int(qy.page),
      pageSize: int(qy.pageSize),
    })
  })

  app.post('/api/v1/doc-library/assets', async (request, reply) => {
    const u = guard(request, reply); if (!u) return
    try {
      return { asset: await createAsset(u.orgId, request.body as never, u.id) }
    } catch (err) {
      return fail(reply, 400, err instanceof Error ? err.message : 'Không tạo được tài nguyên')
    }
  })

  app.patch<{ Params: { id: string } }>('/api/v1/doc-library/assets/:id', async (request, reply) => {
    const u = guard(request, reply); if (!u) return
    try {
      const asset = await updateAsset(u.orgId, request.params.id, request.body as never)
      if (!asset) return fail(reply, 404, 'Không tìm thấy tài nguyên')
      return { asset }
    } catch (err) {
      return fail(reply, 400, err instanceof Error ? err.message : 'Không sửa được tài nguyên')
    }
  })

  app.delete<{ Params: { id: string } }>('/api/v1/doc-library/assets/:id', async (request, reply) => {
    const u = guard(request, reply); if (!u) return
    return { deleted: await deleteAsset(u.orgId, request.params.id) }
  })

  /**
   * Tải tệp lên. Trả về URL + loại suy ra từ đuôi file, để giao diện điền sẵn
   * form tạo tài nguyên. Tách khỏi bước tạo bản ghi vì người dùng còn phải đặt
   * tiêu đề, chọn thư mục, gắn mã sản phẩm.
   */
  app.post('/api/v1/doc-library/upload', async (request, reply) => {
    const u = guard(request, reply); if (!u) return
    const file = await request.file()
    if (!file) return fail(reply, 400, 'Vui lòng chọn tệp')

    const ext = path.extname(file.filename || '').toLowerCase()
    const kind = EXT_KIND[ext]
    if (!kind) {
      return fail(reply, 400, `Định dạng không hỗ trợ. Chấp nhận: ${Object.keys(EXT_KIND).join(', ')}`)
    }
    const buffer = await file.toBuffer()
    if (buffer.length > MAX_FILE_SIZE) {
      return fail(reply, 400, 'Tệp tối đa 25MB. Video dung lượng lớn nên dán link thay vì tải lên.')
    }

    const filename = `${u.orgId}-${randomUUID().slice(0, 8)}${ext}`
    await writeFile(path.join(DOC_ASSETS_DIR, filename), buffer)
    return {
      url: `/uploads/doc-assets/${filename}`,
      kind,
      mimeType: file.mimetype,
      fileSize: buffer.length,
      originalName: file.filename,
    }
  })

  /**
   * Gửi tài nguyên đã chọn vào hội thoại.
   *
   * CHẶN Ở ĐÂY, không chỉ ở giao diện: chỉ tài nguyên `visibility = 'sales'`
   * mới được gửi ra khách. Ảnh đi qua đúng đường gửi ảnh của hệ thống
   * (sendImageCore) nên vẫn ra kênh Zalo như nhân viên gửi tay; phần chữ tạo
   * một tin văn bản. Giới hạn 20 mục mỗi lần để không spam khách.
   */
  app.post<{ Body: { conversationId?: string; assetIds?: string[] } }>(
    '/api/v1/doc-library/send',
    async (request, reply) => {
      const user = request.user as AuthUser
      const { conversationId, assetIds } = request.body || {}

      if (!conversationId?.trim()) return fail(reply, 400, 'Thiếu conversationId')
      if (!assetIds?.length) return fail(reply, 400, 'Chưa chọn tài liệu nào')

      const conv = await prisma.conversation.findFirst({
        where: { id: conversationId.trim(), orgId: user.orgId },
        select: { id: true },
      })
      if (!conv) return fail(reply, 404, 'Không tìm thấy hội thoại')

      const sentIds: string[] = []
      const skipped: Array<{ id: string; reason: string }> = []

      for (const id of assetIds.slice(0, 20)) {
        try {
          const a = await prisma.docAsset.findFirst({ where: { id, orgId: user.orgId } })
          if (!a) { skipped.push({ id, reason: 'Không tìm thấy tài liệu' }); continue }
          if (a.visibility !== 'sales') {
            skipped.push({ id, reason: 'Tài liệu nội bộ — không được gửi khách' })
            continue
          }

          // Ảnh: ảnh đại diện của bộ ảnh, hoặc tệp ảnh đơn.
          const image = a.images[0] ?? (a.kind === 'image' ? a.fileUrl : null)
          if (image) {
            const r = await sendImageCore({
              orgId: user.orgId,
              conversationId: conv.id,
              imageUrl: image,
              caption: a.title,
              sender: 'staff',
              repliedByUserId: user.id,
            })
            if (r.sent) sentIds.push(id)
            else skipped.push({ id, reason: r.error || 'Không gửi được ảnh' })
            continue
          }

          // Còn lại gửi dạng chữ: tiêu đề + mô tả/nội dung + link (nếu có).
          const link = a.sourceUrl || a.videoUrls[0] || a.fileUrl
          const body = [a.description, a.textContent].filter(Boolean).join('\n\n')
          const text = [`**${a.title}**`, body, link].filter(Boolean).join('\n\n')

          const msg = await prisma.message.create({
            data: {
              conversationId: conv.id,
              senderType: 'user',
              repliedByUserId: user.id,
              contentType: 'text',
              content: text,
              sentAt: new Date(),
            },
          })
          emitNewMessage(user.orgId, conv.id, transformMessageForFrontend(msg))
          sentIds.push(id)
        } catch (err) {
          logger.error({ err, assetId: id }, '[doc-library] không gửi được tài liệu')
          skipped.push({ id, reason: 'Lỗi hệ thống' })
        }
      }

      logger.info(
        { conversationId: conv.id, userId: user.id, sent: sentIds.length, skipped: skipped.length },
        '[doc-library] nhân viên gửi tài liệu vào hội thoại',
      )
      return { sent: sentIds.length, sentIds, skipped }
    },
  )
}