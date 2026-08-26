/**
 * auto-reply.ts — Prompt builder for the generator (pass 2).
 *
 * Grounded in L0 persona + playbook. Produces ONLY the reply text.
 * Reply may contain \n\n to split into multiple Zalo messages (DQ7 — split at caller).
 * Native save_memory tool: M3 seam left as TODO comment.
 */
import type { HarnessContext, RouterDecision } from '../harness/harness-types.js';
export declare function buildGeneratorPrompt(ctx: HarnessContext, decision: RouterDecision, toolScopeNote?: string): string;
/**
 * Agent variant (P3): the model fetches products/knowledge/FAQ via TOOL CALLS
 * instead of pre-injected RAG. Same persona/playbook/criteria grounding, but the
 * factual sections are replaced by an instruction to search before answering.
 */
export declare function buildAgentSystemPrompt(ctx: HarnessContext, decision: RouterDecision, toolScopeNote?: string): string;
