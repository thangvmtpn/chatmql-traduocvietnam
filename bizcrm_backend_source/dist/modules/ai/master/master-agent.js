/**
 * master-agent.ts — AI Master conversational agent (Logic Editor).
 *
 * The Master uses structured-action parsing (NOT native tool-calling):
 * the LLM is instructed to emit a JSON block inside its reply whenever it
 * wants to propose a logic change. We parse that block deterministically.
 *
 * This is simpler than native tool-calling and avoids provider API
 * differences. Native tool-calling is explicitly deferred.
 *
 * Proposal block format (inside assistant reply text):
 *   <<<PROPOSAL
 *   { "proposal": { "targetType": "logic_doc", "targetSubtype": "playbook",
 *     "currentValue": "...", "proposedValue": "...", "rationale": "..." } }
 *   PROPOSAL>>>
 *
 * Session lifecycle: openSession → sendMasterMessage (1..N) → session auto-closed.
 * Proposals are created in status='pending'; humans apply them via logic-proposal-service.
 */
import { prisma } from '../../../shared/prisma-client.js';
import { getProviderConfig } from '../provider-registry.js';
import { generateWithAnthropic } from '../providers/anthropic.js';
import { generateWithGemini } from '../providers/gemini.js';
import { generateWithOpenai } from '../providers/openai.js';
import { getAiConfig, getEffectiveConfigForTask, getProviderApiKey } from '../ai-config-service.js';
import { getActiveLogicContext } from '../logic-doc-service.js';
import { listScenarios } from '../scenario-service.js';
import { createProposal } from './logic-proposal-service.js';
import { getToolsConfig, TOOL_NAMES } from '../tools-config-service.js';
import { logUsage } from '../ai-service.js';
// ── Structured-action proposal block markers ────────────────────────────
const PROPOSAL_START = '<<<PROPOSAL';
const PROPOSAL_END = 'PROPOSAL>>>';
// Master output budget. gpt-5.x/o-series count reasoning tokens AGAINST this, and a
// scenario proposal carries a full {name,description,content} document — at 2000 the
// reply got truncated right at the closing delimiter, so parseProposalBlock found no
// `PROPOSAL>>>` and silently dropped the proposal. Keep generous headroom.
const MASTER_MAX_TOKENS = 8000;
/**
 * Escape raw control chars (newline/CR/tab) that appear INSIDE JSON string
 * literals. LLMs frequently emit multi-line content (policy docs, scenario
 * content) with literal newlines inside a JSON string, which is invalid JSON and
 * makes JSON.parse throw — silently dropping the proposal. This repairs that one
 * failure mode without touching structural whitespace between tokens.
 */
function escapeControlsInJsonStrings(s) {
    let out = '';
    let inStr = false;
    let esc = false;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (esc) {
            out += ch;
            esc = false;
            continue;
        }
        if (ch === '\\') {
            out += ch;
            esc = true;
            continue;
        }
        if (ch === '"') {
            inStr = !inStr;
            out += ch;
            continue;
        }
        if (inStr && ch === '\n') {
            out += '\\n';
            continue;
        }
        if (inStr && ch === '\r') {
            out += '\\r';
            continue;
        }
        if (inStr && ch === '\t') {
            out += '\\t';
            continue;
        }
        out += ch;
    }
    return out;
}
/**
 * Parse the proposal JSON, tolerating the ways LLMs mangle it:
 *   1) clean JSON;
 *   2) raw newlines/tabs inside string values (escapeControlsInJsonStrings);
 *   3) a markdown ```json fence;
 *   4) the WHOLE block over-escaped, e.g. {\"proposal\": …} — reversed by
 *      wrapping it as a JSON string and parsing one level off.
 * First strategy that yields an object wins; returns null if all fail.
 */
function parseLenientProposalJson(raw) {
    const fenced = raw.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    const tryParse = (s) => {
        try {
            return JSON.parse(s);
        }
        catch {
            return null;
        }
    };
    const direct = tryParse(fenced) ?? tryParse(escapeControlsInJsonStrings(fenced));
    if (direct)
        return direct;
    if (fenced.includes('\\"')) {
        try {
            const wrapped = '"' + fenced.replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';
            const inner = JSON.parse(wrapped);
            const un = tryParse(inner) ?? tryParse(escapeControlsInJsonStrings(inner));
            if (un)
                return un;
        }
        catch { /* fall through */ }
    }
    return null;
}
/**
 * Parse a structured proposal block from the raw LLM text.
 * Returns null if no block found or if JSON is malformed.
 */
function parseProposalBlock(text) {
    const startIdx = text.indexOf(PROPOSAL_START);
    if (startIdx === -1)
        return null;
    const endIdx = text.indexOf(PROPOSAL_END, startIdx);
    if (endIdx === -1)
        return null;
    const raw = text.slice(startIdx + PROPOSAL_START.length, endIdx).trim();
    const parsed = parseLenientProposalJson(raw);
    if (parsed) {
        const p = parsed.proposal;
        if (!p || typeof p !== 'object')
            return null;
        const obj = p;
        // proposedValue is usually a string (markdown doc/content). For structured
        // targets (e.g. guardrail) the model may emit a JSON object — accept & stringify it.
        let proposedValue;
        if (typeof obj.proposedValue === 'string') {
            proposedValue = obj.proposedValue;
            // Some models double-escape newlines (\\n) → a literal "\n" survives parsing
            // and pollutes the stored doc + the derived title. If the value has escape
            // sequences but no real newlines, restore them.
            if (!/[\n\r]/.test(proposedValue) && /\\[nrt]/.test(proposedValue)) {
                proposedValue = proposedValue.replace(/\\r\\n|\\r|\\n/g, '\n').replace(/\\t/g, '\t');
            }
        }
        else if (obj.proposedValue && typeof obj.proposedValue === 'object') {
            proposedValue = JSON.stringify(obj.proposedValue);
        }
        else {
            // Fallback: some models emit a structured target (scenario/guardrail/retrieval_tuning)
            // by SPREADING its fields at the proposal top level instead of nesting them under
            // proposedValue. Recover by treating the remaining non-meta keys as the value object.
            const META = new Set(['targetType', 'targetSubtype', 'targetId', 'currentValue', 'rationale', 'proposedValue']);
            const rest = {};
            for (const [k, v] of Object.entries(obj))
                if (!META.has(k))
                    rest[k] = v;
            if (Object.keys(rest).length === 0)
                return null;
            proposedValue = JSON.stringify(rest);
        }
        if (!proposedValue.trim())
            return null;
        if (typeof obj.rationale !== 'string' || !obj.rationale)
            return null;
        if (typeof obj.targetType !== 'string' || !obj.targetType)
            return null;
        return {
            targetType: obj.targetType,
            targetSubtype: typeof obj.targetSubtype === 'string' ? obj.targetSubtype : undefined,
            targetId: typeof obj.targetId === 'string' ? obj.targetId : undefined,
            currentValue: typeof obj.currentValue === 'string' ? obj.currentValue : undefined,
            proposedValue,
            rationale: obj.rationale,
        };
    }
    return null;
}
/**
 * Strip the PROPOSAL block from text for the displayed reply.
 * The user sees a clean message; the block is parsed separately.
 */
function stripProposalBlock(text) {
    const startIdx = text.indexOf(PROPOSAL_START);
    if (startIdx === -1)
        return text;
    const endIdx = text.indexOf(PROPOSAL_END, startIdx);
    if (endIdx === -1)
        return text;
    return (text.slice(0, startIdx) + text.slice(endIdx + PROPOSAL_END.length)).trim();
}
// ── Provider dispatch (mirrors ai-service.ts dispatchProvider) ───────────
async function dispatchProvider(provider, apiKey, model, system, userPrompt, maxTokens = 2000) {
    const def = getProviderConfig(provider);
    if (!def?.baseUrl)
        throw new Error(`Unknown provider: ${provider}`);
    const { baseUrl } = def;
    if (provider === 'openai' || provider === 'minimax') {
        return generateWithOpenai(baseUrl, apiKey, model, system, userPrompt, { maxTokens });
    }
    if (provider === 'anthropic') {
        return generateWithAnthropic(baseUrl, apiKey, model, system, userPrompt, {
            enableCaching: true,
            maxTokens,
        });
    }
    if (provider === 'gemini') {
        return generateWithGemini(baseUrl, apiKey, model, system, userPrompt, { maxTokens });
    }
    throw new Error(`Unsupported provider: ${provider}`);
}
function truncate(s, max) {
    return s.length <= max ? s : s.slice(0, max) + '…[cắt bớt]';
}
export async function loadCaseContext(orgId, opts) {
    let runId = opts.aiReplyRunId ?? null;
    let conversationId = opts.conversationId ?? null;
    // Resolve the AI reply run (the specific reply under review) + conversation.
    if (!runId && opts.messageId) {
        const msg = await prisma.message.findFirst({
            where: { id: opts.messageId },
            select: { aiReplyRunId: true, conversationId: true },
        });
        runId = msg?.aiReplyRunId ?? null;
        conversationId = conversationId ?? msg?.conversationId ?? null;
    }
    if (!runId && conversationId) {
        // Prefer the latest run that ACTUALLY produced a reply, so a failed/skipped/
        // handoff run (e.g. provider 429) doesn't yield an empty case. Fall back to
        // the latest run of any status when none produced a reply.
        const withReply = await prisma.aiReplyRun.findFirst({
            where: { orgId, conversationId, status: { in: ['drafted', 'sent'] } },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        });
        const anyRun = withReply ?? (await prisma.aiReplyRun.findFirst({
            where: { orgId, conversationId },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        }));
        runId = anyRun?.id ?? null;
    }
    if (!conversationId && runId) {
        const run = await prisma.aiReplyRun.findFirst({
            where: { id: runId, orgId }, select: { conversationId: true },
        });
        conversationId = run?.conversationId ?? null;
    }
    if (!conversationId)
        return null;
    const [conv, recent, traces] = await Promise.all([
        prisma.conversation.findFirst({
            where: { id: conversationId, orgId },
            select: { contact: { select: { fullName: true } } },
        }),
        prisma.message.findMany({
            where: { conversationId, isDeleted: false, contentType: 'text' },
            orderBy: { sentAt: 'desc' },
            take: 12,
            select: { senderType: true, content: true },
        }),
        runId
            ? prisma.aiTrace.findMany({
                where: { orgId, aiReplyRunId: runId },
                orderBy: { createdAt: 'asc' },
                select: { step: true, payload: true },
            })
            : Promise.resolve([]),
    ]);
    const transcript = recent
        .reverse()
        .map((m) => `${m.senderType === 'contact' ? 'Khách' : 'AI/NV'}: ${(m.content ?? '').trim()}`)
        .filter((l) => l.length > 6);
    let customerMessage = null;
    let flaggedReply = null;
    let routerDecision = null;
    let responderSystemPrompt = null;
    let kbUsed = [];
    const toolCalls = [];
    for (const t of traces) {
        const p = (t.payload ?? {});
        if (t.step === 'assemble') {
            if (typeof p.tin_khach === 'string')
                customerMessage = p.tin_khach;
            // tri_thuc_KB_dung is now {tieu_de, diem}[] (was string[]) — accept both,
            // and surface the relevance score so the Master can judge retrieval quality.
            if (Array.isArray(p.tri_thuc_KB_dung)) {
                kbUsed = p.tri_thuc_KB_dung
                    .map((x) => typeof x === 'string' ? x : (x?.tieu_de ? `${x.tieu_de}${x.diem != null ? ` (độ liên quan ${x.diem})` : ''}` : null))
                    .filter((x) => typeof x === 'string');
            }
        }
        else if (t.step === 'router') {
            routerDecision = p.decision ?? routerDecision;
        }
        else if (t.step === 'tool') {
            // Agent mode: what the responder actually fetched/did via function calls.
            // Append per-hit relevance scores (ket_qua_diem) so the Master can see ranking.
            if (typeof p.ten_cong_cu === 'string') {
                const scoreNote = Array.isArray(p.ket_qua_diem) && p.ket_qua_diem.length
                    ? ' [độ liên quan: ' + p.ket_qua_diem.map((h) => `${h.label}=${h.score ?? 'từ khóa'}`).join('; ') + ']'
                    : '';
                toolCalls.push({ name: p.ten_cong_cu, result: (typeof p.ket_qua === 'string' ? p.ket_qua : '') + scoreNote });
            }
        }
        else if (t.step === 'generator') {
            if (typeof p.reply === 'string')
                flaggedReply = p.reply;
            if (typeof p.system_prompt === 'string')
                responderSystemPrompt = p.system_prompt;
        }
    }
    return {
        conversationId,
        customerName: conv?.contact?.fullName ?? null,
        customerMessage,
        flaggedReply,
        feedbackText: null,
        feedbackCategory: null,
        transcript,
        routerDecision,
        responderSystemPrompt,
        kbUsed,
        toolCalls,
    };
}
export async function loadOrgInventory(orgId) {
    const [productCategories, knowledgeCategories, products, kbEntries, scenarios] = await Promise.all([
        prisma.productCategory.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 100 }),
        prisma.knowledgeCategory.findMany({ where: { orgId }, select: { id: true, name: true, kind: true }, orderBy: { name: 'asc' }, take: 100 }),
        prisma.product.findMany({ where: { orgId, status: 'active' }, select: { id: true, name: true }, orderBy: { updatedAt: 'desc' }, take: 40 }),
        prisma.knowledgeEntry.findMany({ where: { orgId, status: 'active' }, select: { id: true, title: true, content: true, format: true, categoryId: true }, orderBy: { updatedAt: 'desc' }, take: 40 }),
        listScenarios(orgId),
    ]);
    return {
        productCategories,
        knowledgeCategories,
        products,
        kbEntries: kbEntries.map((e) => ({
            id: e.id,
            label: (e.title?.trim() || e.content.slice(0, 60)),
            format: e.format,
            categoryId: e.categoryId,
        })),
        scenarios: scenarios.map((s) => ({ id: s.id, name: s.name, description: s.description, loadMode: s.loadMode, enabled: s.enabled })),
    };
}
function buildInventorySection(inv) {
    const catName = new Map(inv.knowledgeCategories.map((c) => [c.id, c.name]));
    const lines = [
        '\n\n## Kho hiện có (tham chiếu ID để CẬP NHẬT/XOÁ đúng — và TRÁNH tạo trùng)',
        inv.productCategories.length
            ? `### Danh mục sản phẩm\n${inv.productCategories.map((c) => `- ${c.name} (id: ${c.id})`).join('\n')}` : '',
        inv.knowledgeCategories.length
            ? `### Nhóm kiến thức/FAQ\n${inv.knowledgeCategories.map((c) => `- ${c.name} [${c.kind === 'faq' ? 'FAQ' : 'Kiến thức'}] (id: ${c.id})`).join('\n')}` : '',
        inv.products.length
            ? `### Sản phẩm (mới nhất)\n${inv.products.map((p) => `- ${p.name} (id: ${p.id})`).join('\n')}` : '',
        inv.kbEntries.length
            ? `### Tri thức/FAQ hiện có (mới nhất)\n${inv.kbEntries.map((e) => `- [${e.format === 'qa' ? 'FAQ' : 'KT'}] ${e.label}${e.categoryId ? ` — nhóm: ${catName.get(e.categoryId) ?? e.categoryId}` : ''} (id: ${e.id})`).join('\n')}` : '',
        inv.scenarios.length
            ? `### Kịch bản (skill) hiện có\n${inv.scenarios.map((s) => `- [${s.loadMode}${s.enabled ? '' : ', TẮT'}] ${s.name} — ${s.description} (id: ${s.id})`).join('\n')}` : '',
    ].filter(Boolean);
    return lines.join('\n');
}
function buildMasterSystemPrompt(logicContext, seedFeedbackText, caseContext, inventory, tools, retrieval) {
    const logicSection = [
        logicContext.index ? `## Logic Index\n${logicContext.index}` : '',
        logicContext.criteria ? `## Tiêu chí chất lượng (Criteria — guardrails responder phải tuân)\n${logicContext.criteria}` : '',
        logicContext.persona ? `## Persona\n${logicContext.persona}` : '',
        logicContext.playbook ? `## Playbook\n${logicContext.playbook}` : '',
        logicContext.handoff_rules ? `## Handoff Rules\n${logicContext.handoff_rules}` : '',
        logicContext.mechanism ? `## Mechanism\n${logicContext.mechanism}` : '',
    ]
        .filter(Boolean)
        .join('\n\n');
    const feedbackSection = seedFeedbackText
        ? `\n\n## Seed Feedback\nThe session was opened from this staff feedback:\n"${seedFeedbackText}"`
        : '';
    // The concrete case under review — the heart of "improve from this conversation".
    // Gives the Master the real customer turn, the flagged reply, the router decision,
    // the KB used, and the EXACT responder prompt so it can pinpoint the logic flaw.
    let caseSection = '';
    if (caseContext) {
        const cc = caseContext;
        const lines = [
            '\n\n## Trường hợp đang xem xét (CASE CỤ THỂ — phân tích dựa trên đây)',
            cc.customerName ? `- Khách hàng: ${cc.customerName}` : '',
            cc.feedbackCategory ? `- Loại góp ý: ${cc.feedbackCategory}` : '',
            cc.customerMessage ? `- Tin nhắn khách kích hoạt: "${truncate(cc.customerMessage, 600)}"` : '',
            cc.flaggedReply ? `- Câu trả lời AI bị góp ý: "${truncate(cc.flaggedReply, 800)}"` : '',
            cc.kbUsed.length ? `- KB mà AI đã dùng: ${cc.kbUsed.join(', ')}` : '',
            cc.toolCalls.length
                ? `- Công cụ (function) AI đã gọi:\n${cc.toolCalls.map((t) => `  • ${t.name} → ${truncate(t.result, 200)}`).join('\n')}`
                : (cc.kbUsed.length ? '' : '- AI chưa tra cứu KB/công cụ nào'),
            cc.routerDecision ? `- Router quyết định: ${truncate(JSON.stringify(cc.routerDecision), 500)}` : '',
            cc.transcript.length ? `\n### Hội thoại gần đây\n${cc.transcript.join('\n')}` : '',
            cc.responderSystemPrompt
                ? `\n### Prompt mà AI responder ĐÃ DÙNG để tạo câu trả lời trên (soi lỗi logic ở đây)\n${truncate(cc.responderSystemPrompt, 3000)}`
                : '',
        ].filter(Boolean);
        caseSection = lines.join('\n');
    }
    const inventorySection = inventory ? buildInventorySection(inventory) : '';
    // Current per-function tools config (enabled + guardrail) — resolved to names.
    let guardrailSection = '';
    if (tools) {
        const names = new Map([
            ...(inventory?.productCategories ?? []).map((c) => [c.id, c.name]),
            ...(inventory?.knowledgeCategories ?? []).map((c) => [c.id, c.name]),
        ]);
        const fmt = (ids) => ids.length === 0 ? 'TẤT CẢ (không giới hạn)' : ids.map((id) => `${names.get(id) ?? id} (${id})`).join(', ');
        guardrailSection =
            `\n\n## Function/tool của AI phản hồi (config cứng — guardrail enforced ở tầng RAG, AI KHÔNG vượt được)\n` +
                TOOL_NAMES.map((n) => `- ${n}: ${tools[n].enabled ? 'BẬT' : 'TẮT'} · phạm vi: ${fmt(tools[n].guardrail.categoryIds)}`).join('\n');
    }
    const retrievalSection = retrieval
        ? `\n\n## Tham số tra cứu RAG hiện tại (áp dụng cho search_* và chọn kịch bản auto)\n- ragTopK: ${retrieval.ragTopK} (số kết quả tối đa mỗi lần tra)\n- ragMinScore: ${retrieval.ragMinScore ?? 'mặc định 0.35'} (ngưỡng cosine — hit dưới ngưỡng bị loại khỏi grounding). Nâng nếu AI hay lấy nhầm dữ liệu lạc đề; hạ nếu AI bỏ sót dữ liệu đúng.`
        : '';
    return `You are the AI Master, a logic editor agent. Your role is to help staff improve the AI responder's behavior by analyzing feedback and proposing targeted logic changes.

You have access to the current logic configuration below. When a concrete case is provided, ALWAYS ground your diagnosis in that real conversation, the flagged reply, and the exact responder prompt that produced it — identify which part of the logic (persona/playbook/handoff/KB) caused the issue before proposing a fix.

## Chẩn đoán đúng TẦNG (quan trọng — tránh đề xuất vô dụng)
Hệ thống ĐÃ ép responder gọi công cụ tra cứu (search_products/knowledge/faq) cho mọi câu hỏi cần dữ liệu (sản phẩm/giá/chính sách). Vì vậy:
- KHÔNG đề xuất sửa playbook/persona kiểu "hãy nhớ tra cứu KB trước khi trả lời" — đó là prose mềm, KHÔNG ép được hành vi và hệ thống đã lo việc gọi công cụ rồi.
- Nếu AI liệt kê sản phẩm/danh mục KHÔNG có thật → nguyên nhân thường là: (a) THIẾU dữ liệu trong kho → đề xuất targetType "product" hoặc "knowledge_entry" để bổ sung dữ liệu thật; (b) sai phạm vi tool → đề xuất "guardrail"; (c) kỷ luật độ chính xác → đề xuất logic_doc subtype "criteria".
- "AI chưa tra cứu công cụ/KB nào" trong case = đã được khắc phục ở tầng cơ chế; hãy tập trung vào dữ liệu/criteria, đừng chỉ chỉnh chữ.
- CHỌN ĐÚNG TẦNG (đừng mặc định scenario cho mọi thứ):
  • Quy tắc PHONG CÁCH/CHẤT LƯỢNG áp dụng MỌI câu trả lời (ngắn gọn, đi thẳng vấn đề, độ chính xác, khi nào chuyển người, không bịa) → "logic_doc" subtype "criteria". Giọng điệu/xưng hô → "logic_doc" subtype "persona". KHÔNG tạo scenario cho mấy thứ này. VD SAI thường gặp: feedback "trả lời ngắn gọn hơn / đừng dài dòng / thân thiện hơn" → PHẢI sửa criteria (hoặc persona), TUYỆT ĐỐI KHÔNG tạo scenario kiểu "Trả lời giá ngắn gọn" (đó là quy tắc chung, không phải 1 luồng tình huống riêng). Việc một góp ý xuất hiện khi khách hỏi giá KHÔNG biến nó thành scenario — nó vẫn là quy tắc áp dụng mọi câu.
  • MỘT SỰ THẬT cụ thể còn thiếu (có ship COD không, phí ship, bảo hành mấy tháng, thông số 1 sản phẩm) → "knowledge_entry" (faq/policy), KHÔNG phải scenario.
  • MỘT QUY TRÌNH/TÌNH HUỐNG bán hàng riêng, nhiều bước, hoặc 1 NHÓM HÀNG cần cách xử lý/dữ liệu riêng (quy trình mua sỉ, đổi trả & hoàn tiền, đặt lịch hẹn, tư vấn theo nhu cầu/ngân sách, upsell phụ kiện, tư vấn chọn theo nhóm sản phẩm) → "scenario" (loadMode "auto"). Đây là khi NÊN dùng scenario.
  • PLAYBOOK vs SCENARIO (rất hay nhầm — đọc kỹ): một QUY TRÌNH BÁN HÀNG CỤ THỂ nhiều bước, lặp lại theo TÌNH HUỐNG (vd "tư vấn theo ngân sách", "upsell phụ kiện khi mua điện thoại", "mua sỉ") → PHẢI là targetType "scenario" (nạp khi gặp đúng tình huống, generator bám sát hơn). TUYỆT ĐỐI KHÔNG nhét nó thành 1 section trong logic_doc/playbook. Doc playbook (tên hiển thị "Kịch bản (playbook)") chỉ là ĐỊNH HƯỚNG CHUNG luôn-bật cho mọi câu — nhồi nhiều quy trình cụ thể vào đó làm prompt phình + generator dễ bỏ sót. Đừng để chữ "kịch bản" trong tên playbook đánh lừa: kịch bản bán hàng mới = scenario.
  • Sai phạm vi/chất lượng tra cứu (lấy nhầm dữ liệu lạc đề, hoặc bỏ sót dữ liệu đúng đã có) → "retrieval_tuning" hoặc "guardrail".
  Quy tắc nhanh: feedback nói "trả lời thế nào" (phong cách/độ chính xác) = criteria/persona; "thiếu 1 thông tin" = knowledge_entry; "cần một quy trình/luồng xử lý riêng cho 1 loại tình huống" = scenario.
- **Mâu thuẫn persona ↔ catalog:** nếu persona/playbook ghi cứng NGÀNH HÀNG (vd "shop mỹ phẩm") khác với sản phẩm thật trong kho (xem "Kho hiện có" bên dưới), AI sẽ phủ nhận sản phẩm thật. Sửa bằng đề xuất logic_doc subtype "persona": giữ NGUYÊN giọng điệu/xưng hô nhưng BỎ mọi khẳng định ngành hàng/loại sản phẩm cụ thể (sự thật sản phẩm do catalog quyết định, không phải persona). Đừng nói shop bán/không bán gì trong persona.

${logicSection}${feedbackSection}${caseSection}${inventorySection}${guardrailSection}${retrievalSection}

## Proposal Format
When you are ready to propose a logic change, include EXACTLY ONE block in your reply using this format:

<<<PROPOSAL
{
  "proposal": {
    "targetType": "logic_doc",
    "targetSubtype": "playbook",
    "currentValue": "current text (optional)",
    "proposedValue": "the COMPLETE updated document — see CRITICAL rule below",
    "rationale": "why this change will fix the issue"
  }
}
PROPOSAL>>>

Allowed targetType values: logic_doc, knowledge_entry, product, guardrail, scenario, retrieval_tuning

For SCENARIO (kịch bản tình huống), proposedValue MUST be a JSON OBJECT (not prose) — emit EXACTLY this shape:
<<<PROPOSAL
{
  "proposal": {
    "targetType": "scenario",
    "proposedValue": {
      "name": "Tên kịch bản ngắn gọn",
      "description": "Khi nào nạp kịch bản này (tình huống/ý định khách kích hoạt)",
      "content": "Quy trình từng bước:\\n1) ...\\n2) ...\\n3) ...",
      "loadMode": "auto"
    },
    "rationale": "vì sao kịch bản này khắc phục vấn đề"
  }
}
PROPOSAL>>>
name + description + content là BẮT BUỘC và PHẢI nằm TRONG proposedValue (đừng đặt ở top level của proposal).

For logic_doc, targetSubtype must be one of: index, persona, playbook, handoff_rules, mechanism, criteria
Prefer targetSubtype "criteria" for accuracy/quality issues (e.g. AI invented info, replied without KB, should have handed off).

For guardrail — CONFIGURE the responder's functions/tools (enable/disable + per-tool data scope).
Each tool's guardrail is enforced in code at the RAG layer, so the responder CANNOT over-reach
beyond it regardless of its prompt. Tools: search_products (sản phẩm/giá), search_knowledge (kiến thức + FAQ).
Use this when staff want to restrict/turn off a capability (e.g. "AI chỉ tư vấn nhóm Điện thoại",
"tắt tra cứu sản phẩm", "FAQ chỉ dùng nhóm X").
- proposedValue = a JSON object PATCHING the tools you want to change, using category IDs from
  "Kho hiện có" above:
  {"search_products":{"enabled":true,"guardrail":{"categoryIds":["<productCatId>"]}},
   "search_knowledge":{"guardrail":{"categoryIds":["<knowledgeCatId>"]}}}
- categoryIds: [] = NO limit (all). enabled:false = turn the tool OFF. Omit a tool to leave it unchanged.
- search_products uses PRODUCT category ids; search_knowledge uses KNOWLEDGE category ids.
- Use REAL ids from the inventory; never invent ids.

NGUỒN DỮ LIỆU của responder (2 nguồn, tra qua công cụ): Sản phẩm (search_products) · Kiến thức & FAQ (search_knowledge — tra cả bài viết lẫn câu hỏi thường gặp trong một lần). Bạn được đề xuất THÊM / SỬA / XÓA dữ liệu ở cả hai nguồn — mọi đề xuất đều do người duyệt.

For knowledge_entry — Kiến thức (bài viết) + FAQ mà responder tra cứu qua RAG
(use this when staff give concrete info so the AI can answer instead of handing off,
or when an entry is wrong/outdated/duplicated):
- targetSubtype: "faq" (câu hỏi thường gặp) | "product" | "price" | "policy" (bài viết kiến thức).
- THÊM (create): OMIT targetId; proposedValue = nội dung markdown. Với "faq" hãy BẮT ĐẦU bằng dòng "# <câu hỏi>" (dòng đó thành câu hỏi/tiêu đề).
- SỬA (update): set targetId = id từ "Kho hiện có"; proposedValue = TOÀN BỘ nội dung mới của mục đó (thay thế nội dung cũ).
- XÓA (delete): set targetSubtype="delete" và targetId = id từ "Kho hiện có"; proposedValue = lý do ngắn (vd: thông tin lỗi thời, trùng lặp). Đề xuất XÓA khi phát hiện entry sai/lỗi thời gây AI trả lời sai.
- proposedValue here is the entry content (NOT a whole-document rule like logic_doc).

For product — catalog sản phẩm (responder báo giá từ đây qua search_products). THÊM / SỬA / XÓA:
- THÊM (create): omit targetId; proposedValue = JSON {"name","description","keywords","price","priceMax","priceType"} (chỉ "name" bắt buộc; priceType: fixed|range|contact|free|description — range dùng price=từ + priceMax=đến), HOẶC plain text (dòng đầu = tên, phần sau = mô tả).
- SỬA (update): set targetId = productId từ "Kho hiện có"; proposedValue = JSON object CHỈ chứa các field cần đổi (vd {"price":250000} hay {"description":"..."}).
- XÓA (delete): set targetSubtype="delete" và targetId=<productId>; proposedValue = lý do ngắn.

For scenario — KỊCH BẢN (skill) modular: một tình huống/quy trình xử lý ĐỘC LẬP (vd "đổi trả & hoàn tiền", "khiếu nại trễ đơn", "tư vấn chọn size"). Dùng khi một LOẠI tình huống lặp lại cần cách xử lý riêng — tốt hơn nhồi vào playbook. Mỗi kịch bản có description (mô tả ngắn khi nào dùng) + content (hướng dẫn chi tiết).
- loadMode: "auto" = chỉ nạp khi câu khách khớp ngữ nghĩa với description (mặc định, tiết kiệm token); "always" = luôn áp dụng mọi lượt (chỉ cho logic nền như giọng điệu).
- KHÔNG dùng scenario cho: quy tắc phong cách/độ chính xác chung (→ criteria), giọng điệu (→ persona), hay một sự thật đơn lẻ (→ knowledge_entry). Scenario là một LUỒNG XỬ LÝ có nhiều bước / dữ liệu riêng cho một loại tình huống, KHÔNG phải nơi chứa quy tắc chung.
- THÊM (create): OMIT targetId; proposedValue = JSON {"name","description","content","loadMode"}. description hãy viết bằng TỪ KHÁCH HAY DÙNG để khớp ngữ cảnh tốt; content = hướng dẫn xử lý.
- SỬA (update): targetId = scenario id từ "Kho hiện có"; proposedValue = JSON CHỈ field cần đổi (vd {"content":"..."} hoặc {"loadMode":"always"}).
- XÓA (delete): targetSubtype="delete" + targetId; proposedValue = lý do ngắn.

For retrieval_tuning — chỉnh THAM SỐ tra cứu RAG (xem "Tham số tra cứu RAG hiện tại"). Dùng khi case cho thấy vấn đề CHẤT LƯỢNG TRA CỨU: AI lấy nhầm dữ liệu lạc đề (→ nâng ragMinScore), hoặc bỏ sót dữ liệu đúng đã có trong kho (→ hạ ragMinScore / tăng ragTopK). Dấu hiệu trong case: dòng "độ liên quan" của công cụ cho thấy hit sai điểm cao, hoặc hit đúng bị loại.
- proposedValue = JSON {"ragMinScore":0.4} và/hoặc {"ragTopK":6}. ragMinScore trong [0..1]; ragTopK nguyên [1..50]. Chỉ ghi field cần đổi.

CRITICAL — proposedValue for logic_doc:
- It REPLACES THE WHOLE document. So proposedValue MUST be the ENTIRE updated document:
  take the CURRENT content of that doc (shown in the logic sections above), keep ALL its
  existing sections/headings, and apply ONLY your change. NEVER return just the changed
  fragment — doing so silently deletes every other rule (e.g. style + safety sections).
- Do not weaken the accuracy guardrails: "general guidance" must still come from playbook/KB;
  if the shop's real products/prices are unknown, ask or hand off rather than inventing.

IMPORTANT:
- Only emit a proposal block when you have a specific, concrete change ready.
- Always explain your reasoning BEFORE the block in plain language.
- The proposal will NOT be applied automatically — a human must confirm it.
- You are discussing with internal staff (owner/admin). Be concise and technical.
- Language: match the staff's language (Vietnamese or English).`;
}
/**
 * Open a new AI Master session.
 * Optionally seeded from a feedback box entry or tied to a conversation.
 */
export async function openSession(input) {
    return prisma.aiMasterSession.create({
        data: {
            orgId: input.orgId,
            openedByUserId: input.openedByUserId,
            contextConversationId: input.contextConversationId ?? null,
            seedFeedbackId: input.seedFeedbackId ?? null,
            status: 'active',
        },
        select: {
            id: true,
            orgId: true,
            openedByUserId: true,
            contextConversationId: true,
            seedFeedbackId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
        },
    });
}
/**
 * Send a user message to the Master and get a reply.
 *
 * Steps:
 *  1. Load session + prior messages (history)
 *  2. Resolve active logic context (getActiveLogicContext)
 *  3. Load seed feedback text if session has seedFeedbackId
 *  4. Build system prompt + conversation history as a single user prompt
 *  5. Call the ai_master provider
 *  6. Parse structured proposal block (if any) → create AiLogicProposal
 *  7. Persist user + assistant messages
 *  8. Return { reply (clean), proposalId? }
 */
export async function sendMasterMessage(sessionId, orgId, userText) {
    const trimmedText = userText.trim();
    if (!trimmedText)
        throw new Error('Message cannot be empty');
    if (trimmedText.length > 8000)
        throw new Error('Message exceeds 8000 characters');
    // ── Load session (org-scoped — prevents cross-tenant access) ─────────────
    const session = await prisma.aiMasterSession.findFirst({
        where: { id: sessionId, orgId },
        include: {
            messages: {
                orderBy: { createdAt: 'asc' },
                select: { role: true, content: true, createdAt: true },
            },
        },
    });
    if (!session)
        throw new Error(`Session ${sessionId} not found`);
    if (session.status !== 'active')
        throw new Error('Session is closed');
    // ── Resolve AI config for ai_master task ──────────────────────────────
    const cfg = await getAiConfig(session.orgId);
    if (!cfg.enabled)
        throw new Error('AI is disabled for this organization');
    const { provider, model } = getEffectiveConfigForTask(cfg, 'ai_master');
    const apiKey = await getProviderApiKey(session.orgId, provider);
    if (!apiKey)
        throw new Error(`AI provider key for "${provider}" is not configured`);
    // ── Load context in parallel ──────────────────────────────────────────
    const [logicContext, seedFeedback, inventory, toolsCfg] = await Promise.all([
        getActiveLogicContext(session.orgId),
        session.seedFeedbackId
            ? prisma.aiFeedback.findFirst({
                where: { id: session.seedFeedbackId, orgId: session.orgId },
                select: { text: true, category: true, conversationId: true, aiReplyRunId: true, messageId: true },
            })
            : Promise.resolve(null),
        loadOrgInventory(session.orgId),
        getToolsConfig(session.orgId),
    ]);
    // ── Load the concrete case under review (conversation + flagged reply + trace) ──
    // Prefer the feedback's precise links; fall back to the session's conversation.
    let caseContext = null;
    const caseConvId = seedFeedback?.conversationId ?? session.contextConversationId;
    if (caseConvId || seedFeedback?.aiReplyRunId || seedFeedback?.messageId) {
        caseContext = await loadCaseContext(session.orgId, {
            conversationId: caseConvId,
            aiReplyRunId: seedFeedback?.aiReplyRunId ?? null,
            messageId: seedFeedback?.messageId ?? null,
        });
        if (caseContext && seedFeedback) {
            caseContext.feedbackText = seedFeedback.text;
            caseContext.feedbackCategory = seedFeedback.category ?? null;
        }
    }
    // ── Build system prompt ───────────────────────────────────────────────
    const systemPrompt = buildMasterSystemPrompt(logicContext, seedFeedback?.text, caseContext, inventory, toolsCfg, { ragTopK: cfg.ragTopK, ragMinScore: cfg.ragMinScore ?? null });
    // ── Build conversation history as continuation in user prompt ─────────
    // We send the full history as a transcript so the LLM sees prior context.
    // Format: <role>: <content> separated by newlines.
    // Cap to the last 20 turns to bound prompt size / cost on long sessions
    const historyLines = session.messages
        .filter((m) => m.content)
        .slice(-20)
        .map((m) => `${m.role === 'user' ? 'Staff' : 'Master'}: ${m.content}`)
        .join('\n\n');
    const userPrompt = historyLines
        ? `${historyLines}\n\nStaff: ${trimmedText}`
        : `Staff: ${trimmedText}`;
    // ── Call AI Master provider ───────────────────────────────────────────
    const raw = await dispatchProvider(provider, apiKey, model, systemPrompt, userPrompt, MASTER_MAX_TOKENS);
    // Usage/cost accounting — the Master was invisible in the AI usage stats.
    logUsage({
        orgId: session.orgId,
        provider,
        model,
        type: 'ai_master',
        conversationId: session.contextConversationId ?? undefined,
        raw,
        feature: 'master',
    }).catch(() => { });
    const rawReply = raw.text.trim();
    // ── Parse structured proposal block ──────────────────────────────────
    const proposalBlock = parseProposalBlock(rawReply);
    const cleanReply = proposalBlock ? stripProposalBlock(rawReply) : rawReply;
    // ── Persist proposal (if any) ─────────────────────────────────────────
    let proposalId;
    if (proposalBlock) {
        const proposal = await createProposal({
            orgId: session.orgId,
            masterSessionId: sessionId,
            feedbackId: session.seedFeedbackId ?? undefined,
            source: 'master_session',
            targetType: proposalBlock.targetType,
            targetSubtype: proposalBlock.targetSubtype,
            targetId: proposalBlock.targetId,
            currentValue: proposalBlock.currentValue,
            proposedValue: proposalBlock.proposedValue,
            rationale: proposalBlock.rationale,
        });
        proposalId = proposal.id;
    }
    // ── Persist messages (user + assistant) ──────────────────────────────
    await prisma.aiMasterMessage.createMany({
        data: [
            { sessionId, role: 'user', content: trimmedText },
            {
                sessionId,
                role: 'assistant',
                content: cleanReply,
                // Store proposal block metadata in toolData if a proposal was created
                ...(proposalId
                    ? {
                        toolName: 'propose_logic_change',
                        toolData: { proposalId, targetType: proposalBlock?.targetType },
                    }
                    : {}),
            },
        ],
    });
    // ── Bump session updatedAt ────────────────────────────────────────────
    await prisma.aiMasterSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
    });
    return { reply: cleanReply, proposalId };
}
/**
 * Close a session (status='closed'). Idempotent.
 */
export async function closeSession(sessionId, orgId) {
    await prisma.aiMasterSession.updateMany({
        where: { id: sessionId, orgId },
        data: { status: 'closed' },
    });
}
/**
 * Get a session with its messages (for UI display).
 */
export async function getSession(sessionId, orgId) {
    return prisma.aiMasterSession.findFirst({
        where: { id: sessionId, orgId },
        include: {
            messages: {
                orderBy: { createdAt: 'asc' },
                select: {
                    id: true,
                    role: true,
                    content: true,
                    toolName: true,
                    toolData: true,
                    createdAt: true,
                },
            },
        },
    });
}
//# sourceMappingURL=master-agent.js.map