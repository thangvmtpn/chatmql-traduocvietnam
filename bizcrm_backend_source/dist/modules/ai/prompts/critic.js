/**
 * critic.ts — Verify-before-send reviewer (P6).
 *
 * A cheap second-opinion pass: given the customer message, the drafted reply,
 * the quality criteria, and the grounding the reply should rest on, decide
 * whether the reply is safe to send or should be handed off to a human.
 * Fail-OPEN on parse errors (don't block legit replies on critic infra issues).
 */
export function buildCriticPrompt(input) {
    const parts = [];
    parts.push(`Bạn là người KIỂM DUYỆT chất lượng câu trả lời của AI chăm sóc khách hàng. Hãy đánh giá NGHIÊM KHẮC.

Trả về DUY NHẤT một JSON:
{ "ok": boolean, "action": "send" | "handoff", "reason": string }

Quy tắc đánh giá (ok=false + action="handoff" nếu vi phạm bất kỳ):
1. BỊA ĐẶT: câu trả lời nêu sự thật/giá/con số/thời gian/chính sách KHÔNG có trong "Dữ liệu nền". (Lời chào, câu hỏi làm rõ, diễn đạt lại dữ liệu nền thì OK.)
2. Vi phạm tiêu chí chất lượng / chính sách bên dưới.
3. Cam kết điều shop không thể đảm bảo, hoặc nội dung nhạy cảm cần người thật.
Nếu chỉ là câu hỏi làm rõ / xin thêm thông tin / không khẳng định sự thật nào → ok=true, action="send".`);
    if (input.criteria)
        parts.push(`\n## Tiêu chí chất lượng\n${input.criteria}`);
    parts.push(`\n## Dữ liệu nền (nguồn sự thật AI ĐƯỢC dùng)\n${input.grounding || '(không có dữ liệu nền — mọi khẳng định sự thật đều là bịa)'}`);
    parts.push(`\n## Tin nhắn khách\n${input.customerMessage}`);
    parts.push(`\n## Câu trả lời của AI (cần kiểm duyệt)\n${input.reply}`);
    parts.push(`\nChỉ xuất JSON, không giải thích thêm.`);
    return parts.join('\n');
}
export function parseCriticVerdict(raw) {
    const FALLBACK = { ok: true, action: 'send', reason: 'critic parse fallback (fail-open)' };
    try {
        let obj;
        try {
            obj = JSON.parse(raw.trim());
        }
        catch {
            const m = raw.match(/\{[\s\S]*\}/);
            if (!m)
                return FALLBACK;
            obj = JSON.parse(m[0]);
        }
        const o = obj;
        const ok = typeof o.ok === 'boolean' ? o.ok : true;
        const action = o.action === 'handoff' ? 'handoff' : 'send';
        const reason = typeof o.reason === 'string' ? o.reason : '';
        // Reconcile: not ok ⇒ handoff.
        return { ok: ok && action === 'send', action: ok && action === 'send' ? 'send' : 'handoff', reason };
    }
    catch {
        return FALLBACK;
    }
}
//# sourceMappingURL=critic.js.map