/**
 * suggest-delivery.ts — Persists an AiSuggestion and emits a 'chat:ai-draft'
 * socket event to the conversation room. Draft only — never sends to the customer.
 *
 * `deliverSuggestDraft` takes an ALREADY-COMPUTED harness result (no extra LLM
 * call). `generateSuggestDraft` is a convenience that runs the harness first.
 */
import { prisma } from '../../../shared/prisma-client.js';
import { logger } from '../../../shared/logger.js';
import { runHarness } from './reply-generator.js';
import { emitAiDraft } from '../../realtime/socket-gateway.js';
/** Create AiSuggestion + emit chat:ai-draft from an already-computed harness result. */
export async function deliverSuggestDraft(orgId, convId, result) {
    if (!result.reply) {
        logger.debug({ convId, runId: result.runId }, '[suggest] harness returned no reply (skipped/handoff)');
        return;
    }
    // Persist AiSuggestion for staff review / acceptance tracking
    const suggestion = await prisma.aiSuggestion.create({
        data: {
            orgId,
            conversationId: convId,
            type: 'auto_reply',
            content: result.reply,
            confidence: 0.8, // static for M1; later derive from router decision
        },
    });
    // Emit real-time draft to all users viewing this conversation
    emitAiDraft(orgId, convId, {
        suggestionId: suggestion.id,
        content: result.reply,
        confidence: suggestion.confidence,
    });
    logger.info({ convId, suggestionId: suggestion.id, runId: result.runId }, '[suggest] AI draft emitted');
}
/** Convenience: run the harness then deliver the draft. */
export async function generateSuggestDraft(orgId, convId, turnText) {
    const result = await runHarness(orgId, convId, turnText);
    await deliverSuggestDraft(orgId, convId, result);
}
//# sourceMappingURL=suggest-delivery.js.map