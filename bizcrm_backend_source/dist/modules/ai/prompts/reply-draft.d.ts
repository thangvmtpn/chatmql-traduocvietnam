/**
 * Reply-draft prompt — generates 3 tone-labeled reply suggestions.
 * Defenses: anti-leak, anti-jailbreak, scoped to <conversation_context>.
 * Output: strict JSON object — { "suggestions": [{ "tone": "concise"|"friendly"|"detailed", "text": "..." }, ...] }
 */
export type ReplyDraftTone = 'concise' | 'friendly' | 'detailed';
export interface ReplyDraftItem {
    tone: ReplyDraftTone;
    text: string;
}
export declare function buildReplyDraftPrompt(language: 'vi' | 'en'): string;
/**
 * Parse + validate the LLM JSON response. Returns null on malformed shape so
 * the service layer can surface a typed error (matches parseSentiment/parseLeadScore
 * graceful-fallback convention, but the caller treats null as a hard failure
 * because we cannot synthesize 3 distinct variants from one fallback string).
 */
export declare function parseReplyDraftSuggestions(raw: string): ReplyDraftItem[] | null;
