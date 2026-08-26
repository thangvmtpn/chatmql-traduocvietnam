import type { HarnessResult } from './harness-types.js';
/** Create AiSuggestion + emit chat:ai-draft from an already-computed harness result. */
export declare function deliverSuggestDraft(orgId: string, convId: string, result: HarnessResult): Promise<void>;
/** Convenience: run the harness then deliver the draft. */
export declare function generateSuggestDraft(orgId: string, convId: string, turnText: string): Promise<void>;
