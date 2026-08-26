import { SenderType } from '../../shared/constants.js';
/**
 * For non-text messages we cannot feed `content` (a JSON blob from Zalo) to the
 * LLM verbatim — it's gibberish and pollutes the prompt. Substitute a concise
 * English marker so the model at least knows the customer sent an attachment
 * and can craft a context-appropriate reply (e.g. "Em đã nhận được hình
 * ảnh anh gửi…") instead of hallucinating about the JSON.
 *
 * Returns null for text messages (caller falls back to `content`).
 */
function renderNonTextContent(contentType) {
    switch (contentType) {
        case 'image': return '[image]';
        case 'video': return '[video]';
        case 'voice': return '[voice message]';
        case 'gif': return '[gif]';
        case 'file': return '[file attachment]';
        case 'sticker': return '[sticker]';
        case 'location': return '[location shared]';
        case 'link': return '[link]';
        case 'call': return '[phone call]';
        case 'bank_transfer': return '[bank transfer]';
        case 'bank_card': return '[bank card shared]';
        case 'contact_card': return '[contact card shared]';
        case 'birthday_notification': return '[birthday notification]';
        case 'qr_code': return '[QR code]';
        case 'poll': return '[poll]';
        case 'reminder': return '[reminder]';
        case 'note': return '[note]';
        case 'forwarded': return '[forwarded message]';
        case 'rich': return '[rich message]';
        case 'group_event': return null; // handled separately as system event
        default: return null;
    }
}
const VI_DIACRITICS = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
const VI_HINTS = [' khách ', ' chào ', ' tư vấn ', ' báo giá ', ' sản phẩm ', ' giúp ', ' nhé ', ' không ', ' bao nhiêu '];
export function detectLanguage(text) {
    if (VI_DIACRITICS.test(text))
        return 'vi';
    return VI_HINTS.some((h) => ` ${text.toLowerCase()} `.includes(h)) ? 'vi' : 'en';
}
export function escapeXmlBoundary(text) {
    return text.replace(/<\/?conversation_context>/gi, '');
}
export function buildContextBlock(messages, customerName) {
    const lines = messages.map((m) => {
        const author = m.senderType === SenderType.SELF ? 'staff' : m.senderType === SenderType.SYSTEM ? 'system' : m.senderName || 'customer';
        const marker = m.contentType === 'system_event' ? `[event: ${m.content || 'system'}]` : renderNonTextContent(m.contentType);
        const content = marker ?? escapeXmlBoundary(m.content || '(empty)');
        return `[${m.sentAt.toISOString()}] ${author}: ${content}`;
    });
    return ['<conversation_context>', `Customer: ${customerName}`, ...lines, '</conversation_context>'].join('\n');
}
export function parseSentiment(text) {
    try {
        const parsed = JSON.parse(text);
        const label = ['positive', 'negative', 'neutral'].includes(parsed.label)
            ? parsed.label
            : 'neutral';
        const confidence = Number.isFinite(parsed.confidence)
            ? Math.max(0, Math.min(1, parsed.confidence))
            : 0.4;
        return { label, confidence, reason: parsed.reason || '' };
    }
    catch {
        return { label: 'neutral', confidence: 0.4, reason: text.slice(0, 200) };
    }
}
/**
 * Coerce arbitrary JSON `painPoints`/`competitors` into a clean string array
 * (max 3, deduped, trimmed, non-empty). Defends against the LLM returning
 * objects, longer arrays, or whitespace-only strings.
 */
function sanitizeStringArray(raw, max = 3) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    const seen = new Set();
    for (const item of raw) {
        if (out.length >= max)
            break;
        const s = typeof item === 'string' ? item.trim() : '';
        if (!s)
            continue;
        const key = s.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(s.slice(0, 80));
    }
    return out;
}
export function parseLeadScore(text) {
    try {
        const parsed = JSON.parse(text);
        const score = Number.isFinite(parsed.score)
            ? Math.max(0, Math.min(100, Math.round(parsed.score)))
            : 0;
        const intent = ['cold', 'warm', 'hot'].includes(parsed.intent)
            ? parsed.intent
            : score >= 61 ? 'hot' : score >= 31 ? 'warm' : 'cold';
        return {
            score,
            intent,
            signals: Array.isArray(parsed.signals) ? parsed.signals.slice(0, 10) : [],
            summary: parsed.summary || '',
            painPoints: sanitizeStringArray(parsed.painPoints),
            competitors: sanitizeStringArray(parsed.competitors),
        };
    }
    catch {
        return { score: 0, intent: 'cold', signals: [], summary: text.slice(0, 200), painPoints: [], competitors: [] };
    }
}
//# sourceMappingURL=ai-helpers.js.map