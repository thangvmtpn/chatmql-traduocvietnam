/**
 * ai-cdp.ts — AI-CDP: Multi-output AI analysis for automation engine.
 *
 * Single AI call → parses JSON → applies multiple outputs:
 *  - lifecycle stage
 *  - lead score
 *  - sentiment (label + confidence)
 *  - intent (cold/warm/hot)
 *  - tags (additive only)
 *  - profile fields
 *  - CDP custom properties
 *
 * Called by automation-actions.ts case 'ai_cdp'.
 */
import { getProviderConfig } from './provider-registry.js';
import { generateWithGemini } from './providers/gemini.js';
import { generateWithOpenai } from './providers/openai.js';
import { generateWithAnthropic } from './providers/anthropic.js';
import { estimateCost } from './ai-pricing.js';
import { prisma } from '../../shared/prisma-client.js';
import { logger } from '../../shared/logger.js';
// ─── Constants ───────────────────────────────────────────────────────
const VALID_STAGES = [
    'subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist',
];
const VALID_INTENTS = ['cold', 'warm', 'hot'];
const VALID_SENTIMENTS = ['positive', 'neutral', 'negative'];
const PROFILE_ALLOWED = ['fullName', 'phone', 'email', 'jobTitle', 'source', 'notes'];
const DEFAULT_CONFIG = {
    analysis: { messageCount: 20, confidenceThreshold: 0.7, customPrompt: '' },
    outputs: {
        lifecycle: { enabled: true, allowDowngrade: false },
        leadScore: { enabled: true },
        sentiment: { enabled: true },
        intent: { enabled: true },
        tags: { enabled: false, allowedTags: [] },
        profile: { enabled: false, fields: [] },
        customProperties: { enabled: false, propertyIds: [] },
    },
    audit: { enabled: true },
};
// ─── Transcript Formatter (strip Zalo special event noise) ───────────
// Well-known Zalo rich message actions → Vietnamese labels
const RICH_ACTION_MAP = {
    'zinstant.bankcard': 'Thẻ ngân hàng',
    'zinstant.transfer': 'Chuyển khoản',
    'recommened.calltime': 'Cuộc gọi',
    'recommened.misscall': 'Cuộc gọi nhỡ',
    'show.profile': 'Xem hồ sơ',
    'msginfo.actionlist': 'Nhắc nhở',
    'zinvite.miniapp': 'MiniApp',
    'znotif.reminder': 'Nhắc lịch',
};
/** Safely parse JSON, return null on failure. */
function safeParse(s) {
    try {
        return JSON.parse(s);
    }
    catch {
        return null;
    }
}
/**
 * Extract Vietnamese custom message label from Zalo structured content.
 * Zalo templates often have: { params: { item: { pcItem: { customMsg: { vi: "..." } } } } }
 * or directly: { customMsg: { vi: "..." } }
 */
function extractCustomMsg(obj) {
    if (!obj || typeof obj !== 'object')
        return null;
    const direct = obj.customMsg?.vi || obj.customMsg?.en;
    if (direct)
        return direct;
    const nested = obj.params?.item;
    if (typeof nested === 'string') {
        const parsed = safeParse(nested);
        return parsed?.pcItem?.customMsg?.vi || parsed?.customMsg?.vi || null;
    }
    if (typeof nested === 'object') {
        return nested?.pcItem?.customMsg?.vi || nested?.customMsg?.vi || null;
    }
    return null;
}
/** Format duration in seconds to human-readable Vietnamese. */
function formatDuration(seconds) {
    if (seconds <= 0)
        return '';
    if (seconds < 60)
        return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}p${secs}s` : `${mins}p`;
}
/**
 * Convert message content to a clean, AI-friendly transcript line.
 * Text messages pass through as-is. Special events (bank_card, sticker,
 * - Text: pass through verbatim
 * - Sticker: simple label (can't determine emotion)
 * - All others: extract maximum useful detail from JSON content
 */
function formatMessageForTranscript(contentType, content) {
    if (!content)
        return `(${contentType})`;
    switch (contentType) {
        // ── Text: pass through verbatim ──
        case 'text':
            return content;
        // ── Sticker: skip entirely — can't determine emotion/meaning ──
        case 'sticker':
            return null;
        // ── Image: check for caption ──
        case 'image': {
            const d = safeParse(content);
            if (d?.caption || d?.desc)
                return `[Hình ảnh: ${(d.caption || d.desc).slice(0, 60)}]`;
            if (d?.title)
                return `[Hình ảnh: ${d.title.slice(0, 60)}]`;
            return '[Hình ảnh]';
        }
        // ── Video: check for duration/title ──
        case 'video': {
            const d = safeParse(content);
            if (d?.duration)
                return `[Video: ${formatDuration(d.duration)}]`;
            if (d?.title)
                return `[Video: ${d.title.slice(0, 60)}]`;
            return '[Video]';
        }
        // ── Voice: check for duration ──
        case 'voice': {
            const d = safeParse(content);
            if (d?.duration || d?.dur)
                return `[Tin nhắn thoại: ${formatDuration(d.duration || d.dur)}]`;
            return '[Tin nhắn thoại]';
        }
        case 'gif':
            return '[GIF]';
        // ── File: extract filename ──
        case 'file': {
            const d = safeParse(content);
            const name = d?.fileName || d?.name || d?.title || '';
            return name ? `[Tệp: ${name.slice(0, 60)}]` : '[Tệp đính kèm]';
        }
        // ── Call: duration + missed detection ──
        case 'call': {
            const d = safeParse(content);
            if (!d)
                return '[Cuộc gọi]';
            const isMissed = d.action === 'recommened.misscall' || d.dur === 0 || d.callType?.includes('miss');
            if (isMissed)
                return '[Cuộc gọi nhỡ]';
            const dur = d.dur || d.callDuration || d.duration || 0;
            return dur > 0 ? `[Cuộc gọi: ${formatDuration(dur)}]` : '[Cuộc gọi]';
        }
        // ── Bank card: extract bank/label from Zalo template ──
        case 'bank_card': {
            const d = safeParse(content);
            if (!d)
                return '[Thẻ ngân hàng]';
            const label = extractCustomMsg(d);
            if (label)
                return `[${label}]`;
            const bank = d.bankName || d.bankCode || '';
            return bank ? `[Thẻ ngân hàng: ${bank}]` : '[Thẻ ngân hàng]';
        }
        // ── Bank transfer: extract amount/bank ──
        case 'bank_transfer': {
            const d = safeParse(content);
            if (!d)
                return '[Chuyển khoản]';
            const label = extractCustomMsg(d);
            if (label)
                return `[${label}]`;
            const parts = [];
            if (d.bankName || d.bankCode)
                parts.push(d.bankName || d.bankCode);
            if (d.amount)
                parts.push(`${Number(d.amount).toLocaleString('vi-VN')}đ`);
            return parts.length > 0 ? `[Chuyển khoản: ${parts.join(' - ')}]` : '[Chuyển khoản]';
        }
        // ── Location: extract description/address ──
        case 'location': {
            const d = safeParse(content);
            if (!d)
                return '[Chia sẻ vị trí]';
            const desc = d.desc || d.description || d.address || d.title || '';
            return desc ? `[Vị trí: ${desc.slice(0, 80)}]` : '[Chia sẻ vị trí]';
        }
        // ── Link: extract title + domain ──
        case 'link': {
            const d = safeParse(content);
            if (d) {
                const title = d.title || d.desc || '';
                const href = d.href || d.url || '';
                if (title)
                    return `[Link: ${title.slice(0, 80)}]`;
                if (href) {
                    try {
                        return `[Link: ${new URL(href).hostname}]`;
                    }
                    catch { /* invalid url */ }
                    return `[Link: ${href.slice(0, 80)}]`;
                }
                return '[Chia sẻ link]';
            }
            // Plain URL string
            if (content.startsWith('http')) {
                try {
                    return `[Link: ${new URL(content).hostname}]`;
                }
                catch { /* invalid */ }
                return `[Link: ${content.slice(0, 80)}]`;
            }
            return '[Chia sẻ link]';
        }
        // ── Contact card: extract name ──
        case 'contact_card': {
            const d = safeParse(content);
            if (!d)
                return '[Danh thiếp]';
            const name = d.title || d.dName || d.displayName || d.name || '';
            const phone = d.phone || d.params?.phone || '';
            if (name && phone)
                return `[Danh thiếp: ${name} - ${phone}]`;
            if (name)
                return `[Danh thiếp: ${name}]`;
            return '[Danh thiếp]';
        }
        // ── Birthday notification: extract title ──
        case 'birthday_notification': {
            const d = safeParse(content);
            const title = d?.title || '';
            return title ? `[${title.slice(0, 80)}]` : '[Thông báo sinh nhật]';
        }
        // ── Group events: extract display text ──
        case 'group_event': {
            const d = safeParse(content);
            if (!d)
                return '[Sự kiện nhóm]';
            return `[Sự kiện nhóm: ${d.displayText || d.label || d.eventType || 'unknown'}]`;
        }
        // ── Reminder / todo ──
        case 'reminder': {
            const d = safeParse(content);
            const title = d?.title || d?.content || d?.text || '';
            return title ? `[Nhắc nhở: ${title.slice(0, 60)}]` : '[Nhắc nhở]';
        }
        // ── Poll ──
        case 'poll': {
            const d = safeParse(content);
            const question = d?.question || d?.title || '';
            return question ? `[Bình chọn: ${question.slice(0, 60)}]` : '[Bình chọn]';
        }
        case 'qr_code':
            return '[Mã QR]';
        case 'note':
            return '[Ghi chú]';
        case 'forwarded':
            return '[Tin chuyển tiếp]';
        // ── Rich / unknown Zalo structured messages ──
        case 'rich': {
            const d = safeParse(content);
            if (!d)
                return '[Tin nhắn đặc biệt]';
            // 1. Known action mapping
            const action = d.action || '';
            const knownLabel = RICH_ACTION_MAP[action];
            if (knownLabel) {
                const customLabel = extractCustomMsg(d);
                return customLabel ? `[${knownLabel}: ${customLabel.slice(0, 60)}]` : `[${knownLabel}]`;
            }
            // 2. Extract customMsg.vi (Zalo template Vietnamese label)
            const customLabel = extractCustomMsg(d);
            if (customLabel)
                return `[${customLabel.slice(0, 60)}]`;
            // 3. Title
            if (d.title)
                return `[${d.title.slice(0, 60)}]`;
            // 4. Action name as fallback
            if (action)
                return `[Zalo: ${action}]`;
            return '[Tin nhắn đặc biệt]';
        }
        // ── Fallback: if content looks like JSON blob, summarize; else pass through ──
        default: {
            if (content.startsWith('{') || content.startsWith('[')) {
                return `(${contentType})`;
            }
            return content;
        }
    }
}
// ─── Prompt Builder ──────────────────────────────────────────────────
function buildSystemPrompt(cfg, currentContact, customPropertyDefs) {
    const parts = [];
    // Base — Customer 360 AI Identity
    parts.push(`Bạn là Customer 360 AI — chuyên gia phân tích khách hàng trong hệ thống CRM/CDP.
Nhiệm vụ: Đọc lịch sử hội thoại, xây dựng hồ sơ 360° về khách hàng để hỗ trợ đội sales/CSKH.
Phân tích dựa trên bằng chứng thực tế trong hội thoại. Không bịa thông tin.

NGUYÊN TẮC QUAN TRỌNG:
1. Trả về JSON thuần, không markdown, không \`\`\`.
2. CHỈ trả về các trường có giá trị MỚI hoặc THAY ĐỔI so với giá trị hiện tại.
3. Nếu giá trị hiện tại vẫn đúng → BỎ QUA field đó, KHÔNG đưa vào JSON.
4. Luôn trả: "confidence", "reason", "summary" (vì summary cần cập nhật theo ngữ cảnh mới).
5. Các field khác: chỉ trả khi có thay đổi thực sự.`);
    // Confidence
    parts.push(`\nTrường "confidence" (0.0-1.0): mức độ tự tin tổng thể.`);
    // Enabled outputs
    const outputFields = ['"confidence": <0-1>', '"reason": "<nhận định tổng hợp về khách hàng>"'];
    // ── CUSTOMER SUMMARY (always on — core of 360°) ──
    parts.push(`\n[CUSTOMER SUMMARY]
Viết tóm tắt ngắn gọn (2-4 câu) về khách hàng dựa trên hội thoại.
Bao gồm: họ là ai, quan tâm gì, mức độ tương tác, điểm nổi bật.
Viết theo phong cách CRM insight — hữu ích cho sales/CSKH khi đọc lướt.
Tóm tắt hiện tại: ${currentContact.aiSummary || '(chưa có)'}`);
    outputFields.push('"summary": "<tóm tắt khách hàng 360°>"');
    if (cfg.outputs.lifecycle.enabled) {
        const downgradeRule = cfg.outputs.lifecycle.allowDowngrade
            ? 'Có thể nâng hoặc hạ stage'
            : 'CHỈ được nâng stage, KHÔNG được hạ dưới stage hiện tại';
        parts.push(`\n[LIFECYCLE]
Đánh giá vị trí khách hàng trong phễu bán hàng.
Stages: ${VALID_STAGES.join(' → ')}
Stage hiện tại: ${currentContact.lifecycleStage}
${downgradeRule}
Nếu không đủ bằng chứng để thay đổi, giữ stage hiện tại.`);
        outputFields.push('"lifecycle": { "stage": "<stage>", "reason": "<lý do>" }');
    }
    if (cfg.outputs.leadScore.enabled) {
        parts.push(`\n[LEAD SCORE]
Chấm điểm tiềm năng mua hàng từ 0-100.
  0-20: Lạnh — chưa quan tâm sản phẩm/dịch vụ
  21-40: Ấm nhẹ — có hỏi thăm nhưng chưa rõ nhu cầu
  41-60: Ấm — đang tìm hiểu, so sánh, hỏi giá
  61-80: Nóng — có timeline, hỏi chi tiết, yêu cầu demo/báo giá
  81-100: Rất nóng — sẵn sàng mua, đã chốt hoặc quay lại mua thêm
Điểm hiện tại: ${currentContact.leadScore ?? 0}`);
        outputFields.push('"leadScore": <0-100>');
    }
    if (cfg.outputs.sentiment.enabled) {
        parts.push(`\n[SENTIMENT]
Đánh giá thái độ/cảm xúc khách hàng trong tương tác gần nhất.
  positive: Hài lòng, vui vẻ, tích cực, cảm ơn
  neutral: Bình thường, trung lập, hỏi thông tin
  negative: Không hài lòng, phàn nàn, thất vọng
Kèm confidence (0-1) và lý do ngắn gọn.
Giá trị hiện tại: ${currentContact.aiSentimentLabel || '(chưa phân tích)'}`);
        outputFields.push('"sentiment": { "label": "<positive|neutral|negative>", "confidence": <0-1>, "reason": "<lý do>" }');
    }
    if (cfg.outputs.intent.enabled) {
        parts.push(`\n[INTENT]
Xác định mức độ quan tâm mua hàng:
  cold: Chưa có nhu cầu rõ ràng, chat xã giao
  warm: Đang tìm hiểu, hỏi thông tin, so sánh
  hot: Sẵn sàng hành động, hỏi giá/thanh toán/đặt hàng
Giá trị hiện tại: ${currentContact.aiIntent || '(chưa phân tích)'}`);
        outputFields.push('"intent": "<cold|warm|hot>"');
    }
    if (cfg.outputs.tags.enabled && cfg.outputs.tags.allowedTags.length > 0) {
        const currentTags = currentContact.tags.length > 0 ? currentContact.tags.join(', ') : '(chưa có)';
        parts.push(`\n[TAGS]
Gán nhãn phân loại khách hàng. CHỈ chọn từ danh sách:
${cfg.outputs.tags.allowedTags.join(', ')}
Tags hiện tại: ${currentTags}
Trả mảng rỗng nếu không phù hợp. KHÔNG tạo tag mới.`);
        outputFields.push('"tags": ["<tag1>", "<tag2>"]');
    }
    // ── PAIN POINTS (Customer 360 — Sales Intelligence) ──
    const currentPainPoints = Array.isArray(currentContact.aiPainPoints) && currentContact.aiPainPoints.length > 0
        ? currentContact.aiPainPoints.join('; ') : '(chưa phát hiện)';
    parts.push(`\n[PAIN POINTS]
Phát hiện vấn đề/khó khăn/nỗi đau khách hàng đề cập trong hội thoại.
Ví dụ: "Giá quá cao", "Giao hàng chậm", "Khó sử dụng", "Cần hỗ trợ kỹ thuật"
Pain points hiện tại: ${currentPainPoints}
Trả mảng rỗng [] nếu không phát hiện. Mỗi item là 1 câu ngắn.`);
    outputFields.push('"painPoints": ["<vấn đề 1>", "<vấn đề 2>"]');
    // ── COMPETITOR INTELLIGENCE ──
    const currentCompetitors = Array.isArray(currentContact.aiCompetitors) && currentContact.aiCompetitors.length > 0
        ? currentContact.aiCompetitors.join('; ') : '(chưa phát hiện)';
    parts.push(`\n[COMPETITORS]
Phát hiện đối thủ/sản phẩm cạnh tranh khách hàng đề cập hoặc so sánh.
Ví dụ: tên thương hiệu, sản phẩm đối thủ, dịch vụ thay thế.
Đối thủ đã biết: ${currentCompetitors}
Trả mảng rỗng [] nếu không phát hiện.`);
    outputFields.push('"competitors": ["<đối thủ 1>"]');
    // ── BUYING SIGNALS ──
    const currentSignals = Array.isArray(currentContact.aiSignals) && currentContact.aiSignals.length > 0
        ? currentContact.aiSignals.join('; ') : '(chưa phát hiện)';
    parts.push(`\n[BUYING SIGNALS]
Phát hiện tín hiệu mua hàng hoặc tín hiệu quan trọng từ khách.
Ví dụ: "Hỏi giá sỉ", "Yêu cầu báo giá", "Muốn dùng thử", "Giới thiệu cho bạn", "Quay lại sau thời gian dài"
Tín hiệu hiện tại: ${currentSignals}
Trả mảng rỗng [] nếu không phát hiện. Mỗi item là 1 tín hiệu ngắn gọn.`);
    outputFields.push('"signals": ["<tín hiệu 1>"]');
    if (cfg.outputs.profile.enabled && cfg.outputs.profile.fields.length > 0) {
        const currentVals = cfg.outputs.profile.fields.map(f => {
            const val = currentContact[f];
            return `  ${f}: ${val || '(trống)'}`;
        }).join('\n');
        parts.push(`\n[PROFILE]
Trích xuất thông tin cá nhân nếu khách hàng đề cập trực tiếp.
Giá trị hiện tại:
${currentVals}
Chỉ cập nhật khi có bằng chứng RÕ RÀNG (khách nói SĐT, email, tên...).
Field cho phép: ${cfg.outputs.profile.fields.join(', ')}`);
        outputFields.push('"profile": { "<field>": "<value>" }');
    }
    if (cfg.outputs.customProperties.enabled && customPropertyDefs.length > 0) {
        const propLines = customPropertyDefs.map(p => {
            let line = `  - ${p.fieldKey} (${p.fieldType}): ${p.description || 'Trích xuất từ hội thoại'}`;
            if (p.currentValue) {
                line += `\n    Giá trị hiện tại: ${p.currentValue}`;
            }
            if (p.options.length > 0) {
                line += `\n    Giá trị hợp lệ: ${p.options.map(o => o.value).join(', ')}`;
                line += `\n    CHỈ chọn từ danh sách trên, KHÔNG tạo giá trị mới.`;
            }
            return line;
        }).join('\n');
        parts.push(`\n[CUSTOM PROPERTIES]
Trích xuất các thuộc tính tùy chỉnh:
${propLines}
Chỉ trả các property có giá trị tìm thấy. Bỏ qua nếu không tìm thấy.`);
        outputFields.push('"customProperties": { "<fieldKey>": "<value>" }');
    }
    // Custom prompt
    if (cfg.analysis.customPrompt) {
        parts.push(`\n[HƯỚNG DẪN BỔ SUNG]\n${cfg.analysis.customPrompt}`);
    }
    // Response format
    parts.push(`\n[RESPONSE FORMAT]
Trả về JSON duy nhất. Các trường có thể có:
{
  ${outputFields.join(',\n  ')}
}

LƯU Ý: CHỈ đưa field vào JSON khi giá trị KHÁC với "giá trị hiện tại" đã ghi ở trên.
- Bắt buộc: "confidence", "reason", "summary"
- Các field khác: BỎ QUA nếu giá trị không thay đổi.
- Ví dụ: nếu leadScore hiện tại = 30 và bạn vẫn đánh giá 30 → KHÔNG đưa "leadScore" vào JSON.
- Ví dụ: nếu intent hiện tại = "cold" và vẫn cold → KHÔNG đưa "intent" vào JSON.`);
    return parts.join('\n');
}
// ─── Main Function ───────────────────────────────────────────────────
export async function runAiCdp(input) {
    const cfg = mergeConfig(input.config);
    // 1. Fetch recent messages
    const messageCount = Math.max(5, Math.min(50, cfg.analysis.messageCount));
    const recentMessages = await prisma.message.findMany({
        where: { conversationId: input.conversationId },
        orderBy: { sentAt: 'desc' },
        take: messageCount,
        select: { content: true, senderType: true, sentAt: true, contentType: true },
    });
    if (recentMessages.length === 0) {
        logger.info('[ai-cdp] No messages found, skipping');
        return { applied: {}, skipped: { _all: 'No messages found' }, confidence: 0 };
    }
    const transcript = recentMessages.reverse()
        .map((m) => {
        const formatted = formatMessageForTranscript(m.contentType, m.content);
        if (formatted === null)
            return null; // Skip (e.g. sticker)
        return `[${m.senderType}] ${formatted}`;
    })
        .filter(Boolean)
        .join('\n');
    // 2. Fetch current contact
    const contact = await prisma.contact.findUnique({
        where: { id: input.contactId },
        select: {
            fullName: true, phone: true, email: true, jobTitle: true,
            source: true, notes: true, lifecycleStage: true, tags: true,
            leadScore: true, crmName: true,
            aiSentimentLabel: true, aiIntent: true,
            aiSummary: true, aiPainPoints: true, aiCompetitors: true, aiSignals: true,
        },
    });
    if (!contact) {
        logger.warn('[ai-cdp] Contact not found');
        return { applied: {}, skipped: { _all: 'Contact not found' }, confidence: 0 };
    }
    // 3. Fetch CDP custom property definitions from DB (resolve propertyIds)
    const customPropertyDefs = [];
    if (cfg.outputs.customProperties.enabled && cfg.outputs.customProperties.propertyIds.length > 0) {
        const dbProps = await prisma.customProperty.findMany({
            where: {
                id: { in: cfg.outputs.customProperties.propertyIds },
                orgId: input.orgId,
            },
            select: { id: true, fieldKey: true, fieldType: true, options: true, description: true },
        });
        // Fetch current values for these properties
        const currentPropValues = await prisma.contactPropertyValue.findMany({
            where: {
                contactId: input.contactId,
                propertyId: { in: dbProps.map(p => p.id) },
            },
            select: { propertyId: true, value: true },
        });
        const propValueMap = new Map(currentPropValues.map(v => [v.propertyId, v.value]));
        for (const dbProp of dbProps) {
            customPropertyDefs.push({
                fieldKey: dbProp.fieldKey,
                fieldType: dbProp.fieldType,
                options: (Array.isArray(dbProp.options) ? dbProp.options : []),
                description: dbProp.description || '',
                propertyId: dbProp.id,
                currentValue: propValueMap.get(dbProp.id) || null,
            });
        }
    }
    // 4. Build prompt
    const systemPrompt = buildSystemPrompt(cfg, {
        lifecycleStage: contact.lifecycleStage || 'subscriber',
        fullName: contact.fullName,
        phone: contact.phone,
        email: contact.email,
        jobTitle: contact.jobTitle,
        source: contact.source,
        notes: contact.notes,
        tags: Array.isArray(contact.tags) ? contact.tags : [],
        leadScore: contact.leadScore,
        aiSentimentLabel: contact.aiSentimentLabel,
        aiIntent: contact.aiIntent,
        aiSummary: contact.aiSummary,
        aiPainPoints: Array.isArray(contact.aiPainPoints) ? contact.aiPainPoints : [],
        aiCompetitors: Array.isArray(contact.aiCompetitors) ? contact.aiCompetitors : [],
        aiSignals: Array.isArray(contact.aiSignals) ? contact.aiSignals : [],
    }, customPropertyDefs);
    const userPrompt = `Khách hàng: ${contact.fullName || contact.crmName || 'Unknown'}

Lịch sử hội thoại gần đây (${recentMessages.length} tin nhắn):
${transcript}

Phân tích Customer 360° cho khách hàng trên. Đưa ra insights hữu ích cho sales/CSKH.`;
    // 5. Call AI
    const providerConfig = getProviderConfig(input.provider);
    const baseUrl = providerConfig?.baseUrl || '';
    const model = input.model || providerConfig?.models?.[0]?.value || 'gpt-4.1-mini';
    let raw;
    if (input.provider === 'gemini') {
        raw = await generateWithGemini(baseUrl, input.apiKey, model, systemPrompt, userPrompt, {
            jsonMode: true, maxTokens: 2500,
        });
    }
    else if (input.provider === 'anthropic') {
        raw = await generateWithAnthropic(baseUrl, input.apiKey, model, systemPrompt, userPrompt, {
            maxTokens: 2500,
        });
    }
    else {
        raw = await generateWithOpenai(baseUrl, input.apiKey, model, systemPrompt, userPrompt, {
            jsonMode: true, maxTokens: 2500,
        });
    }
    // 6. Parse response
    let result;
    try {
        // Strip markdown fences if present
        let text = raw.text.trim();
        if (text.startsWith('```')) {
            text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        }
        result = JSON.parse(text);
    }
    catch {
        logger.error({ text: raw.text.slice(0, 200) }, '[ai-cdp] Failed to parse AI response as JSON');
        return { applied: {}, skipped: { _all: 'Failed to parse AI JSON response' }, confidence: 0 };
    }
    const confidence = Math.min(1, Math.max(0, Number(result.confidence) || 0));
    const threshold = cfg.analysis.confidenceThreshold;
    // 7. Apply outputs
    const applied = {};
    const skipped = {};
    if (confidence < threshold) {
        logger.info({ confidence, threshold }, '[ai-cdp] Confidence below threshold, skipping all outputs');
        skipped._all = `confidence ${confidence} < threshold ${threshold}`;
    }
    else {
        const contactUpdate = {};
        // 7a. Lifecycle
        if (cfg.outputs.lifecycle.enabled && result.lifecycle?.stage) {
            const suggested = result.lifecycle.stage.toLowerCase();
            const current = contact.lifecycleStage || 'subscriber';
            if (!VALID_STAGES.includes(suggested)) {
                skipped.lifecycle = `Invalid stage: ${suggested}`;
            }
            else if (suggested === current) {
                skipped.lifecycle = `Không thay đổi (${current})`;
            }
            else {
                const currentIdx = VALID_STAGES.indexOf(current);
                const suggestedIdx = VALID_STAGES.indexOf(suggested);
                if (cfg.outputs.lifecycle.allowDowngrade || suggestedIdx >= currentIdx) {
                    try {
                        const { changeLifecycleStage } = await import('../cdp/lifecycle-service.js');
                        await changeLifecycleStage({
                            orgId: input.orgId,
                            contactId: input.contactId,
                            toStage: suggested,
                            changedBy: 'ai_cdp',
                        });
                        applied.lifecycle = { from: current, to: suggested, reason: result.lifecycle.reason };
                        logger.info({ contactId: input.contactId, from: current, to: suggested }, '[ai-cdp] lifecycle updated');
                    }
                    catch (err) {
                        logger.error({ err: err.message }, '[ai-cdp] lifecycle change failed');
                        skipped.lifecycle = err.message;
                    }
                }
                else {
                    skipped.lifecycle = `Would downgrade ${current}→${suggested}, blocked`;
                }
            }
        }
        // 7b. Lead Score
        if (cfg.outputs.leadScore.enabled && result.leadScore != null) {
            const score = Math.max(0, Math.min(100, Math.round(Number(result.leadScore))));
            const currentScore = contact.leadScore ?? 0;
            if (score !== currentScore) {
                contactUpdate.leadScore = score;
                applied.leadScore = { from: currentScore, to: score };
            }
            else {
                skipped.leadScore = `Không thay đổi (${score})`;
            }
        }
        // 7c. Sentiment
        if (cfg.outputs.sentiment.enabled && result.sentiment?.label) {
            const label = result.sentiment.label.toLowerCase();
            if (!VALID_SENTIMENTS.includes(label)) {
                skipped.sentiment = `Invalid label: ${label}`;
            }
            else {
                const currentLabel = contact.aiSentimentLabel || '';
                const newConfidence = Math.min(1, Math.max(0, Number(result.sentiment.confidence) || 0));
                if (label !== currentLabel) {
                    contactUpdate.aiSentimentLabel = label;
                    contactUpdate.aiSentimentConfidence = newConfidence;
                    applied.sentiment = { from: currentLabel || '(chưa có)', to: label, confidence: newConfidence };
                }
                else {
                    // Label same — still update confidence if changed
                    contactUpdate.aiSentimentConfidence = newConfidence;
                    skipped.sentiment = `Không thay đổi (${label})`;
                }
                // Always update reason if provided
                if (result.sentiment.reason && typeof result.sentiment.reason === 'string') {
                    contactUpdate.aiSentimentReason = result.sentiment.reason.trim();
                }
            }
        }
        // 7d. Intent
        if (cfg.outputs.intent.enabled && result.intent) {
            const intent = String(result.intent).toLowerCase();
            if (!VALID_INTENTS.includes(intent)) {
                skipped.intent = `Invalid intent: ${intent}`;
            }
            else {
                const currentIntent = contact.aiIntent || '';
                if (intent !== currentIntent) {
                    contactUpdate.aiIntent = intent;
                    applied.intent = { from: currentIntent || '(chưa có)', to: intent };
                }
                else {
                    skipped.intent = `Không thay đổi (${intent})`;
                }
            }
        }
        // 7e. Tags (additive only)
        if (cfg.outputs.tags.enabled && Array.isArray(result.tags) && result.tags.length > 0) {
            const currentTags = Array.isArray(contact.tags) ? contact.tags : [];
            const allowed = new Set(cfg.outputs.tags.allowedTags);
            const validNewTags = result.tags.filter(t => allowed.has(t) && !currentTags.includes(t));
            if (validNewTags.length > 0) {
                contactUpdate.tags = [...currentTags, ...validNewTags];
                applied.tags = validNewTags;
            }
            else {
                skipped.tags = `Không có tag mới (hiện tại: ${currentTags.join(', ')})`;
            }
        }
        // 7f. Profile fields
        if (cfg.outputs.profile.enabled && result.profile && typeof result.profile === 'object') {
            const allowedFields = new Set(cfg.outputs.profile.fields.filter(f => PROFILE_ALLOWED.includes(f)));
            const profileChanges = {};
            const profileSkipped = [];
            for (const [field, value] of Object.entries(result.profile)) {
                if (allowedFields.has(field) && value && typeof value === 'string' && value.trim()) {
                    const currentVal = contact[field];
                    if (!currentVal || currentVal !== value.trim()) {
                        contactUpdate[field] = value.trim();
                        profileChanges[field] = value.trim();
                    }
                    else {
                        profileSkipped.push(field);
                    }
                }
            }
            if (Object.keys(profileChanges).length > 0) {
                applied.profile = profileChanges;
            }
            if (profileSkipped.length > 0) {
                skipped.profile = `Không thay đổi: ${profileSkipped.join(', ')}`;
            }
        }
        // ── Customer 360° Outputs ──
        // 7g. Customer Summary (always-on — but compare)
        if (result.summary && typeof result.summary === 'string' && result.summary.trim()) {
            const newSummary = result.summary.trim();
            const currentSummary = contact.aiSummary || '';
            if (newSummary !== currentSummary) {
                contactUpdate.aiSummary = newSummary;
                applied.summary = newSummary;
            }
            else {
                skipped.summary = 'Không thay đổi';
            }
        }
        // 7h. Pain Points
        if (Array.isArray(result.painPoints)) {
            const validPainPoints = result.painPoints.filter((p) => typeof p === 'string' && p.trim()).map((p) => p.trim());
            const currentPP = Array.isArray(contact.aiPainPoints) ? contact.aiPainPoints : [];
            const ppChanged = JSON.stringify(validPainPoints.sort()) !== JSON.stringify([...currentPP].sort());
            if (validPainPoints.length > 0 && ppChanged) {
                contactUpdate.aiPainPoints = validPainPoints;
                applied.painPoints = validPainPoints;
            }
            else if (validPainPoints.length === 0 && currentPP.length === 0) {
                skipped.painPoints = 'Không phát hiện';
            }
            else if (!ppChanged) {
                skipped.painPoints = 'Không thay đổi';
            }
        }
        // 7i. Competitors
        if (Array.isArray(result.competitors)) {
            const validCompetitors = result.competitors.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim());
            const currentComp = Array.isArray(contact.aiCompetitors) ? contact.aiCompetitors : [];
            const compChanged = JSON.stringify(validCompetitors.sort()) !== JSON.stringify([...currentComp].sort());
            if (validCompetitors.length > 0 && compChanged) {
                contactUpdate.aiCompetitors = validCompetitors;
                applied.competitors = validCompetitors;
            }
            else if (validCompetitors.length === 0 && currentComp.length === 0) {
                skipped.competitors = 'Không phát hiện';
            }
            else if (!compChanged) {
                skipped.competitors = 'Không thay đổi';
            }
        }
        // 7j. Buying Signals
        if (Array.isArray(result.signals)) {
            const validSignals = result.signals.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim());
            const currentSig = Array.isArray(contact.aiSignals) ? contact.aiSignals : [];
            const sigChanged = JSON.stringify(validSignals.sort()) !== JSON.stringify([...currentSig].sort());
            if (validSignals.length > 0 && sigChanged) {
                contactUpdate.aiSignals = validSignals;
                applied.signals = validSignals;
            }
            else if (validSignals.length === 0 && currentSig.length === 0) {
                skipped.signals = 'Không phát hiện';
            }
            else if (!sigChanged) {
                skipped.signals = 'Không thay đổi';
            }
        }
        // 7k. Timestamp & conversation reference (always update when we run analysis)
        contactUpdate.aiAnalyzedAt = new Date();
        contactUpdate.aiConversationId = input.conversationId;
        // Apply contact update in one call
        if (Object.keys(contactUpdate).length > 0) {
            await prisma.contact.update({
                where: { id: input.contactId },
                data: contactUpdate,
            });
            logger.info({ contactId: input.contactId, fields: Object.keys(contactUpdate) }, '[ai-cdp] contact updated');
        }
        // 7g. Custom properties (upsert each)
        if (cfg.outputs.customProperties.enabled && result.customProperties && typeof result.customProperties === 'object') {
            const propApplied = {};
            for (const def of customPropertyDefs) {
                const value = result.customProperties[def.fieldKey];
                if (value == null || String(value).trim() === '')
                    continue;
                const strVal = String(value).trim();
                // Validate select fields
                if ((def.fieldType === 'single_select' || def.fieldType === 'multi_select') && def.options.length > 0) {
                    const validValues = def.options.map(o => o.value);
                    if (!validValues.includes(strVal)) {
                        skipped[`customProp.${def.fieldKey}`] = `Invalid select value: ${strVal}`;
                        continue;
                    }
                }
                await prisma.contactPropertyValue.upsert({
                    where: {
                        contactId_propertyId: {
                            contactId: input.contactId,
                            propertyId: def.propertyId,
                        },
                    },
                    create: {
                        orgId: input.orgId,
                        contactId: input.contactId,
                        propertyId: def.propertyId,
                        value: strVal,
                    },
                    update: { value: strVal },
                });
                propApplied[def.fieldKey] = strVal;
            }
            if (Object.keys(propApplied).length > 0) {
                applied.customProperties = propApplied;
            }
        }
    }
    // 8. Audit trail
    if (cfg.audit.enabled) {
        await prisma.aiSuggestion.create({
            data: {
                orgId: input.orgId,
                conversationId: input.conversationId,
                type: 'ai_cdp',
                content: JSON.stringify({
                    outputs: applied,
                    skipped,
                    reason: result.reason || '',
                }),
                confidence,
                accepted: confidence >= threshold,
            },
        });
    }
    // 9. Usage tracking
    await prisma.aiUsage.create({
        data: {
            orgId: input.orgId,
            provider: input.provider,
            model,
            type: 'ai_cdp',
            conversationId: input.conversationId,
            contactId: input.contactId,
            tokensIn: raw.tokensIn,
            tokensOut: raw.tokensOut,
            cacheReadTokens: raw.cacheReadTokens ?? 0,
            cacheCreationTokens: raw.cacheCreationTokens ?? 0,
            costUsd: estimateCost(model, raw),
        },
    });
    logger.info({
        contactId: input.contactId,
        appliedKeys: Object.keys(applied),
        skippedKeys: Object.keys(skipped),
        confidence,
        tokens: { in: raw.tokensIn, out: raw.tokensOut },
    }, '[ai-cdp] completed');
    return {
        applied,
        skipped,
        confidence,
        processData: {
            provider: input.provider,
            model,
            tokensIn: raw.tokensIn,
            tokensOut: raw.tokensOut,
            cacheReadTokens: raw.cacheReadTokens ?? 0,
            costUsd: estimateCost(model, raw),
            confidenceThreshold: threshold,
            messageCount: recentMessages.length,
            transcriptLength: transcript.length,
            transcriptPreview: transcript.slice(0, 500) + (transcript.length > 500 ? '...' : ''),
            systemPrompt,
            userPrompt,
            rawAiResponse: raw.text,
            contactSnapshot: {
                fullName: contact.fullName || contact.crmName || '',
                phone: contact.phone || '',
                email: contact.email || '',
                lifecycleStage: contact.lifecycleStage || 'subscriber',
                leadScore: contact.leadScore ?? null,
            },
            customPropertyDefs: customPropertyDefs.map(d => ({
                fieldKey: d.fieldKey,
                fieldType: d.fieldType,
                optionCount: d.options.length,
            })),
            enabledOutputs: {
                lifecycle: cfg.outputs.lifecycle.enabled,
                leadScore: cfg.outputs.leadScore.enabled,
                sentiment: cfg.outputs.sentiment.enabled,
                intent: cfg.outputs.intent.enabled,
                tags: cfg.outputs.tags.enabled,
                profile: cfg.outputs.profile.enabled,
                customProperties: cfg.outputs.customProperties.enabled,
            },
        },
    };
}
// ─── Helpers ─────────────────────────────────────────────────────────
function mergeConfig(partial) {
    if (!partial)
        return DEFAULT_CONFIG;
    return {
        analysis: { ...DEFAULT_CONFIG.analysis, ...partial.analysis },
        outputs: {
            lifecycle: { ...DEFAULT_CONFIG.outputs.lifecycle, ...partial.outputs?.lifecycle },
            leadScore: { ...DEFAULT_CONFIG.outputs.leadScore, ...partial.outputs?.leadScore },
            sentiment: { ...DEFAULT_CONFIG.outputs.sentiment, ...partial.outputs?.sentiment },
            intent: { ...DEFAULT_CONFIG.outputs.intent, ...partial.outputs?.intent },
            tags: { ...DEFAULT_CONFIG.outputs.tags, ...partial.outputs?.tags },
            profile: { ...DEFAULT_CONFIG.outputs.profile, ...partial.outputs?.profile },
            customProperties: { ...DEFAULT_CONFIG.outputs.customProperties, ...partial.outputs?.customProperties },
        },
        audit: { ...DEFAULT_CONFIG.audit, ...partial.audit },
    };
}
//# sourceMappingURL=ai-cdp.js.map