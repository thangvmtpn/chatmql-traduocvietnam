/**
 * Pure helpers for AI service: language detection, prompt-injection guards,
 * conversation context builder, output parsers.
 */
import type { SentimentResult, LeadScoreResult } from './ai-service.js';
export type MessageContext = {
    senderType: string;
    senderName: string | null;
    content: string | null;
    contentType: string;
    sentAt: Date;
};
export declare function detectLanguage(text: string): 'vi' | 'en';
export declare function escapeXmlBoundary(text: string): string;
export declare function buildContextBlock(messages: MessageContext[], customerName: string): string;
export declare function parseSentiment(text: string): SentimentResult;
export declare function parseLeadScore(text: string): LeadScoreResult;
