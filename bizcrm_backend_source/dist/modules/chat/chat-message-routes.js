import { SenderType, Platform } from '../../shared/constants.js';
import { prisma } from '../../shared/prisma-client.js';
import { emitNewMessage, emitSendError } from '../realtime/socket-gateway.js';
import { getPoolEntry, sendImageViaPool, sendFileViaPool } from '../zalo/zalo-pool.js';
import { sendAttachmentViaFb } from '../facebook-page/fb-pool.js';
import { saveChatMedia } from './chat-media-store.js';
import { requireZaloAccess } from '../zalo/zalo-access-middleware.js';
import { checkLimits, recordAction } from '../zalo/zalo-rate-limiter.js';
import { logger } from '../../shared/logger.js';
import { transformMessageForFrontend, buildReplyQuote } from './chat-routes.js';
import { sendMessageCore } from './send-core.js';
function fbTypeFromMime(mime) {
    if (mime.startsWith('image/'))
        return 'image';
    if (mime.startsWith('video/'))
        return 'video';
    if (mime.startsWith('audio/'))
        return 'audio';
    return 'file';
}
export async function chatMessageRoutes(app) {
    // ── Send message ────────────────────────────────────────────────────
    app.post('/api/v1/conversations/:id/messages', { preHandler: requireZaloAccess() }, async (request, reply) => {
        const user = request.user;
        const { content, replyMessageId, source } = request.body;
        if (!content?.trim())
            return reply.status(400).send({ error: 'Content required' });
        // Verify conversation exists and belongs to org before proceeding
        const convCheck = await prisma.conversation.findFirst({
            where: { id: request.params.id, orgId: user.orgId },
            select: {
                id: true,
                channelAccount: { select: { externalUid: true } },
            },
        });
        if (!convCheck)
            return reply.status(404).send({ error: 'Conversation not found' });
        // Build quote reference if replying
        let quote = undefined;
        if (replyMessageId) {
            const replyMsg = await prisma.message.findFirst({
                where: { id: replyMessageId, conversationId: request.params.id },
                select: { externalMsgId: true, senderUid: true, content: true, contentType: true, sentAt: true },
            });
            if (replyMsg) {
                const effectiveSenderUid = replyMsg.senderUid || convCheck.channelAccount?.externalUid || '';
                const built = buildReplyQuote({ ...replyMsg, senderUid: effectiveSenderUid });
                if (built)
                    quote = built;
            }
        }
        let result;
        try {
            result = await sendMessageCore({
                orgId: user.orgId,
                conversationId: request.params.id,
                text: content,
                sender: 'staff',
                repliedByUserId: user.id,
                quote: quote ?? null,
                // Staff sent an AI suggestion as-is → ai_suggest; plain compose → manual (default).
                responseSource: source === 'ai_suggest' ? 'ai_suggest' : undefined,
            });
        }
        catch (err) {
            logger.error({ err }, '[chat] sendMessageCore failed');
            return reply.status(500).send({ error: 'Failed to send message' });
        }
        // CS window error — inform client to show warning
        if (result.csWindowExpired) {
            return reply.status(422).send({
                error: result.zaloError,
                code: 'CS_WINDOW_EXPIRED',
                zaloErrorCode: result.zaloErrorCode,
            });
        }
        // Rate-limit reached — surfaced from send-core
        if (!result.sentViaZalo && result.zaloError?.includes('Rate limit')) {
            return reply.status(429).send({ error: result.zaloError });
        }
        // Notify client if Zalo delivery failed (non-blocking)
        if (result.zaloError) {
            const firstMsg = result.messages[0];
            try {
                emitSendError(user.orgId, request.params.id, {
                    messageId: firstMsg?.id,
                    reason: result.zaloError,
                });
            }
            catch { /* socket not ready */ }
        }
        // Return first (and only) message for staff sends — same shape as before
        return result.messages[0];
    });
    // ── Send image handler ──────────────────────────────────────────────
    const handleSendImage = async (request, reply) => {
        let orgId = 'org-1';
        let userId = 'user-1';
        if (request.user) {
            orgId = request.user.orgId;
            userId = request.user.id;
        }
        const conv = await prisma.conversation.findFirst({
            where: { id: request.params.id },
            select: {
                id: true, contactId: true, orgId: true,
                channelAccountId: true, threadType: true, externalThreadId: true,
                contact: { select: { zaloUid: true } },
                channelAccount: { select: { platform: true } },
            },
        });
        if (!conv)
            return reply.status(404).send({ error: 'Conversation not found' });
        // Parse multipart
        const data = await request.file();
        if (!data)
            return reply.status(400).send({ error: 'No file uploaded' });
        const buffer = await data.toBuffer();
        const filename = data.filename || 'image.jpg';
        const caption = data.fields?.caption?.value || '';
        // Validate image MIME type
        const mime = data.mimetype || '';
        if (!mime.startsWith('image/')) {
            return reply.status(400).send({ error: 'File must be an image (jpg, png, gif, webp)' });
        }
        // Always save local copy so the sent image renders in CRM & chat UI
        const localMediaUrl = await saveChatMedia(buffer, filename);
        // Rate limit & dispatch to external channel if connected
        let sentViaZalo = false;
        let uploadedContent;
        if (conv.channelAccount?.platform === Platform.FACEBOOK_PAGE && conv.externalThreadId) {
            const sendResult = await sendAttachmentViaFb(conv.channelAccountId, conv.externalThreadId, buffer, filename, mime, 'image');
            sentViaZalo = sendResult.sent;
        }
        else {
            const targetUid = conv.externalThreadId || conv.contact?.zaloUid;
            const poolEntry = conv.channelAccountId ? getPoolEntry(conv.channelAccountId) : undefined;
            if (poolEntry?.status === 'connected' && targetUid) {
                const rateCheck = checkLimits(conv.channelAccountId, 'message');
                if (!rateCheck.allowed) {
                    return reply.status(429).send({
                        error: rateCheck.reason || 'Rate limit exceeded',
                        remaining: rateCheck.remaining,
                    });
                }
                const sendResult = await sendImageViaPool(conv.channelAccountId, targetUid, buffer, filename, caption, conv.threadType === 'group' ? 1 : 0);
                sentViaZalo = sendResult.sent;
                uploadedContent = sendResult.content;
                if (sentViaZalo)
                    recordAction(conv.channelAccountId, 'message');
            }
        }
        // Guarantee content is a JSON object with valid image URLs for the UI
        if (!uploadedContent) {
            uploadedContent = JSON.stringify({
                href: localMediaUrl,
                thumb: localMediaUrl,
                hdUrl: localMediaUrl,
                caption: caption || '',
                title: filename,
            });
        }
        // Create local message record
        const message = await prisma.message.create({
            data: {
                conversationId: request.params.id,
                senderType: SenderType.SELF,
                senderUid: '',
                senderName: 'Staff',
                content: uploadedContent,
                contentType: 'image',
                sentAt: new Date(),
                repliedByUserId: userId,
            },
        });
        await prisma.conversation.update({
            where: { id: request.params.id },
            data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
        });
        const fePayload = transformMessageForFrontend({
            ...message, senderType: SenderType.SELF, senderName: 'Staff',
        });
        try {
            emitNewMessage(orgId, request.params.id, fePayload);
        }
        catch { /* socket */ }
        return { ...fePayload, sentViaZalo };
    };
    app.post('/api/v1/conversations/:id/messages/image', handleSendImage);
    app.post('/api/v1/conversations/:id/images', handleSendImage);
    app.post('/api/v1/conversations/:id/image', handleSendImage);
    // ── Send file handler ───────────────────────────────────────────────
    const handleSendFile = async (request, reply) => {
        let orgId = 'org-1';
        let userId = 'user-1';
        if (request.user) {
            orgId = request.user.orgId;
            userId = request.user.id;
        }
        const conv = await prisma.conversation.findFirst({
            where: { id: request.params.id },
            select: {
                id: true, contactId: true, orgId: true,
                channelAccountId: true, externalThreadId: true,
                contact: { select: { zaloUid: true } },
                channelAccount: { select: { platform: true } },
            },
        });
        if (!conv)
            return reply.status(404).send({ error: 'Conversation not found' });
        // Parse multipart
        const data = await request.file();
        if (!data)
            return reply.status(400).send({ error: 'No file uploaded' });
        const buffer = await data.toBuffer();
        const filename = data.filename || 'document';
        const caption = data.fields?.caption?.value || '';
        // Validate file type — block dangerous extensions
        const ALLOWED_EXTENSIONS = new Set([
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            '.txt', '.csv', '.zip', '.rar', '.7z',
            '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg',
            '.mp4', '.mp3', '.wav', '.ogg', '.webm',
        ]);
        const ext = (filename.lastIndexOf('.') > 0 ? filename.slice(filename.lastIndexOf('.')) : '').toLowerCase();
        if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
            return reply.status(400).send({ error: `File type "${ext}" is not allowed` });
        }
        // Always save local copy
        const localMediaUrl = await saveChatMedia(buffer, filename);
        // Rate limit check
        let sentViaZalo = false;
        let uploadedContent;
        if (conv.channelAccount?.platform === Platform.FACEBOOK_PAGE && conv.externalThreadId) {
            const mime = data.mimetype || '';
            const sendResult = await sendAttachmentViaFb(conv.channelAccountId, conv.externalThreadId, buffer, filename, mime, fbTypeFromMime(mime));
            sentViaZalo = sendResult.sent;
        }
        else {
            const targetUid = conv.externalThreadId || conv.contact?.zaloUid;
            const poolEntry = conv.channelAccountId ? getPoolEntry(conv.channelAccountId) : undefined;
            if (poolEntry?.status === 'connected' && targetUid) {
                const rateCheck = checkLimits(conv.channelAccountId, 'message');
                if (!rateCheck.allowed) {
                    return reply.status(429).send({
                        error: rateCheck.reason || 'Rate limit exceeded',
                        remaining: rateCheck.remaining,
                    });
                }
                sentViaZalo = await sendFileViaPool(conv.channelAccountId, targetUid, buffer, filename, caption);
                if (sentViaZalo)
                    recordAction(conv.channelAccountId, 'message');
            }
        }
        if (!uploadedContent) {
            uploadedContent = JSON.stringify({
                title: filename,
                href: localMediaUrl,
                fileExt: (ext || '').replace(/^\./, '') || 'file',
                fileSize: String(buffer.length),
                caption: caption || '',
            });
        }
        // Create local message record
        const message = await prisma.message.create({
            data: {
                conversationId: request.params.id,
                senderType: SenderType.SELF,
                senderUid: '',
                senderName: 'Staff',
                content: uploadedContent,
                contentType: 'file',
                sentAt: new Date(),
                repliedByUserId: userId,
            },
        });
        await prisma.conversation.update({
            where: { id: request.params.id },
            data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
        });
        const fePayload = transformMessageForFrontend({
            ...message, senderType: SenderType.SELF, senderName: 'Staff',
        });
        try {
            emitNewMessage(orgId, request.params.id, fePayload);
        }
        catch { /* socket */ }
        return { ...fePayload, sentViaZalo };
    };
    app.post('/api/v1/conversations/:id/messages/file', handleSendFile);
    app.post('/api/v1/conversations/:id/files', handleSendFile);
    app.post('/api/v1/conversations/:id/file', handleSendFile);
    // ── Conversation shared media (images, files, links) ────────────────
    app.get('/api/v1/conversations/:id/shared-media', { preHandler: requireZaloAccess() }, async (request, reply) => {
        const user = request.user;
        const { type = 'all' } = request.query;
        const conv = await prisma.conversation.findFirst({
            where: { id: request.params.id, orgId: user.orgId },
            select: { id: true },
        });
        if (!conv)
            return reply.status(404).send({ error: 'Not found' });
        // Build content type filter
        let contentTypeFilter = {};
        if (type === 'image')
            contentTypeFilter = { in: ['image', 'video'] };
        else if (type === 'file')
            contentTypeFilter = 'file';
        else if (type === 'link')
            contentTypeFilter = 'link';
        else
            contentTypeFilter = { in: ['image', 'video', 'file', 'link'] };
        const messages = await prisma.message.findMany({
            where: {
                conversationId: request.params.id,
                contentType: contentTypeFilter,
                isDeleted: false,
            },
            orderBy: { sentAt: 'desc' },
            take: 50,
            select: {
                id: true, content: true, contentType: true,
                senderName: true, sentAt: true,
            },
        });
        // Count by type
        const convId = request.params.id;
        const [imageCountExplicit, fileCount, linkCount] = await Promise.all([
            prisma.message.count({
                where: { conversationId: convId, contentType: { in: ['image', 'video'] }, isDeleted: false },
            }),
            prisma.message.count({
                where: { conversationId: convId, contentType: 'file', isDeleted: false },
            }),
            prisma.message.count({
                where: { conversationId: convId, contentType: 'link', isDeleted: false },
            }),
        ]);
        // Also count images stored as text with JSON content
        let imageCountFromText = 0;
        try {
            const textImagesResult = await prisma.$queryRaw `
        SELECT COUNT(*) as count FROM messages
        WHERE conversation_id = ${convId}
        AND content_type = 'text' AND is_deleted = false
        AND content LIKE '%"href":"https://%' AND content LIKE '%.jpg%'
      `;
            imageCountFromText = Number(textImagesResult[0]?.count || 0);
        }
        catch { /* ignore SQL errors */ }
        // Also count links embedded in text messages (URLs sent as plain text)
        let linkCountFromText = 0;
        try {
            const textLinksResult = await prisma.$queryRaw `
        SELECT COUNT(*) as count FROM messages
        WHERE conversation_id = ${convId}
        AND content_type = 'text' AND is_deleted = false
        AND content ~ 'https?://[^\s]+'
      `;
            linkCountFromText = Number(textLinksResult[0]?.count || 0);
        }
        catch { /* ignore SQL errors */ }
        return { messages, counts: { image: imageCountExplicit + imageCountFromText, file: fileCount, link: linkCount + linkCountFromText } };
    });
}
//# sourceMappingURL=chat-message-routes.js.map