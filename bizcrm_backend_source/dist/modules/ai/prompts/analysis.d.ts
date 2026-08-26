/**
 * Combined-analysis prompt — 1 call returns summary + sentiment + lead score.
 * Used by /ai/conversation-analyze to save round-trips when opening a conversation.
 */
export declare function buildAnalysisPrompt(language: 'vi' | 'en'): string;
