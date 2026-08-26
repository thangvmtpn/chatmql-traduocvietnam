/**
 * Rule-based lead score (0–100). Deterministic, no LLM.
 * Complements the AI scorer at POST /api/v1/ai/score-lead — use this for
 * contacts that haven't been AI-analyzed yet, or to cross-check the AI score.
 *
 * Ported from references/zalocrm/backend/src/modules/contacts/lead-scoring.ts.
 *
 * Score components:
 *   +10 per message in last 7d (cap +40)
 *   +20 if a future appointment with status='scheduled' exists
 *   +30 if Contact.lifecycleStage === 'qualified'
 *   −10 if lastActivity > 14 days ago
 *   −20 if lastActivity > 30 days ago
 *
 * Clamped to [0, 100].
 */
export interface LeadScoreResult {
    score: number;
    /** Max of contact.updatedAt, latest message.sentAt, and the next scheduled appointment date. */
    lastActivity: Date;
}
export declare function computeLeadScore(contactId: string): Promise<LeadScoreResult>;
