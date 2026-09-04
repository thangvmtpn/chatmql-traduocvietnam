/**
 * budgets.ts — Ngân sách ký tự cho từng lớp ngữ cảnh (HarnessContext), THEO MODEL.
 *
 * Vì sao có 2 bậc (tier)?
 *   - `base`: model context nhỏ / chi phí token đắt → giữ đúng các con số cũ
 *     để kiểm soát chi phí và không tràn context window.
 *   - `large`: model long-context (GPT-4o/4.1/5, o3/o4, Claude, Gemini, MiniMax,
 *     DeepSeek, Qwen...) chịu được prompt dài với chi phí chấp nhận được →
 *     nới ngân sách ~4× để KHÔNG cắt xén tài liệu train (persona, playbook,
 *     tài liệu logic) — cắt ngầm làm AI "quên" phần huấn luyện mà người soạn
 *     không hề hay biết.
 *
 * Người soạn tài liệu xem được ngân sách hiệu lực qua GET /api/v1/ai/context-budgets
 * (FE hiển thị bộ đếm ký tự + cảnh báo vượt ngân sách ngay trong editor).
 */
export interface ContextBudgets {
    /** L0 — tổng tài liệu logic (chỉ để tham chiếu/hiển thị; từng doc dùng các field dưới) */
    l0Total: number;
    /** L0 — tài liệu persona (và personaPrompt riêng của bot) */
    persona: number;
    /** L0 — tài liệu playbook (và playbookPrompt riêng của bot); criteria dùng chung mức này */
    playbook: number;
    /** L0 — các doc còn lại: index, handoff_rules, mechanism (mỗi doc) */
    index: number;
    /** L0b — tổng kịch bản (scenario) nạp vào một lượt */
    l0bScenarios: number;
    /** L1 — tổng snippet tri thức (KB RAG) */
    l1Kb: number;
    /** L2 — hồ sơ khách hàng (aiSummary) */
    l2Contact: number;
    /** L3 — tổng ghi nhớ hội thoại (memory facts) */
    l3Memory: number;
    /** L5 — tổng tin nhắn gần đây */
    l5Messages: number;
    /** L6 — tin nhắn của lượt hiện tại */
    l6Turn: number;
    /** L1b — tổng snippet sản phẩm (product RAG) */
    products: number;
}
export type BudgetTier = 'base' | 'large';
/**
 * Chọn bậc ngân sách cho model. Env AI_CONTEXT_BUDGET_TIER=base|large thắng
 * mọi auto-detect (dùng khi vận hành muốn ép một bậc cho toàn hệ thống).
 */
export declare function resolveBudgetTier(model?: string | null): BudgetTier;
/** Ngân sách hiệu lực cho model (null/unknown → bậc `base` an toàn chi phí). */
export declare function getContextBudgets(model?: string | null): ContextBudgets;
/** Cắt chuỗi theo ngân sách, thêm '…' khi bị cắt (dùng chung cho mọi lớp). */
export declare function truncate(s: string, maxChars: number): string;
