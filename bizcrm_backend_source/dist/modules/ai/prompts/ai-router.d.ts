/**
 * ai-router.ts — Prompt builder and response parser for the router (pass 1).
 *
 * Router decides: shouldReply, intents, ragQuery, needsKnowledge, handoff.
 * M1: structured-action JSON fallback (no native tool-calling yet — M2).
 * Parser is robust: extracts first JSON block, whitelists fields, falls back
 * to { shouldReply: false } on any parse failure.
 */
import type { HarnessContext, RouterDecision } from '../harness/harness-types.js';
export declare function buildRouterPrompt(ctx: HarnessContext, opts?: {
    hasTools?: boolean;
}): string;
export declare function parseRouterDecision(raw: string): RouterDecision;
