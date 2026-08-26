import { type ReplyDraftTone } from './prompts/reply-draft.js';
import { type GenerateRaw } from './ai-pricing.js';
export type AiTaskType = 'reply_draft' | 'summary' | 'sentiment' | 'lead_score';
export type LoggedTaskType = AiTaskType | 'conversation_analysis' | 'ai_cdp' | 'ai_router' | 'auto_reply' | 'ai_master' | 'embedding';
export type SentimentResult = {
    label: 'positive' | 'neutral' | 'negative';
    confidence: number;
    reason: string;
};
export type ConversationAnalysis = {
    summary: string;
    sentiment: SentimentResult;
    leadScore: LeadScoreResult;
};
export type LeadScoreResult = {
    score: number;
    intent: 'cold' | 'warm' | 'hot';
    signals: Array<{
        type: string;
        strength: number;
        evidence: string;
    }>;
    summary: string;
    /** Customer pain points the AI extracted from the conversation (max 3). */
    painPoints: string[];
    /** Competitor brand names mentioned by the customer (max 3). */
    competitors: string[];
};
export { getAiConfig, updateAiConfig, getAiUsage, getAvailableProviders, } from './ai-config-service.js';
export declare function dispatchProvider(provider: string, apiKey: string, model: string, system: string, userPrompt: string, options?: {
    jsonMode?: boolean;
    maxTokens?: number;
}): Promise<GenerateRaw>;
export declare function logUsage(input: {
    orgId: string;
    provider: string;
    model: string;
    type: LoggedTaskType;
    conversationId?: string;
    contactId?: string;
    raw: GenerateRaw;
    feature?: string;
    aiReplyRunId?: string;
}): Promise<void>;
export declare function generateAiOutput(input: {
    orgId: string;
    conversationId: string;
    type: Exclude<AiTaskType, 'lead_score'>;
}): Promise<SentimentResult | {
    suggestions: {
        suggestionId: string;
        tone: ReplyDraftTone;
        text: string;
    }[];
    summary?: undefined;
} | {
    summary: string;
    suggestions?: undefined;
}>;
export type AnalyzeOptions = {
    forceFresh?: boolean;
};
/**
 * Combined analysis: 1 LLM call returns summary + sentiment + lead score
 * (+ painPoints/competitors). Results are persisted directly to Contact
 * columns (ai_summary, ai_sentiment_label, etc.) so they survive across
 * sessions and are available immediately on page load.
 *
 * The frontend reads Contact fields for initial display and only calls this
 * endpoint when the user explicitly clicks "Phân tích khách hàng" or
 * "Phân tích lại".
 *
 * Logs ONE AiUsage row per call. Creates 3 AiSuggestion rows for
 * history/usage tracking.
 */
export declare function analyzeConversation(input: {
    orgId: string;
    conversationId: string;
}, options?: AnalyzeOptions): Promise<ConversationAnalysis & {
    fromCache: boolean;
}>;
export declare function scoreLeadFromConversation(input: {
    orgId: string;
    conversationId: string;
}): Promise<LeadScoreResult>;
