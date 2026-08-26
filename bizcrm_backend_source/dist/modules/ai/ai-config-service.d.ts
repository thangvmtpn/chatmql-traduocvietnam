import { getAvailableProviders } from './provider-registry.js';
export declare function getProviderApiKey(orgId: string, provider: string): Promise<string>;
export declare function saveProviderApiKey(orgId: string, provider: string, apiKey: string): Promise<{
    id: string;
    orgId: string;
    createdAt: Date;
    updatedAt: Date;
    settingKey: string;
    valuePlain: string | null;
    valueEncrypted: import("@prisma/client/runtime/library").Bytes | null;
}>;
/**
 * Verify an API key by probing the provider's /models endpoint.
 * Returns ok: true if the key is accepted, ok: false with a friendly error otherwise.
 * Uses GET /models (free, lightweight) where supported.
 */
export declare function verifyProviderApiKey(provider: string, apiKey: string): Promise<{
    ok: true;
} | {
    ok: false;
    status: number;
    error: string;
}>;
export declare function deleteProviderApiKey(orgId: string, provider: string): Promise<import("@prisma/client").Prisma.BatchPayload>;
export declare function getAiConfig(orgId: string): Promise<{
    hasOpenaiKey: boolean;
    hasMinimaxKey: boolean;
    hasAnthropicKey: boolean;
    hasGeminiKey: boolean;
    availableProviders: import("./provider-registry.js").ProviderDef[];
    schedule: ScheduleConfig;
    isAfterHours: boolean;
    id: string;
    orgId: string;
    createdAt: Date;
    updatedAt: Date;
    provider: string;
    model: string;
    maxDaily: number;
    enabled: boolean;
    taskOverrides: import("@prisma/client/runtime/library").JsonValue;
    defaultAiMode: string;
    autoReplyEnabled: boolean;
    debounceSeconds: number;
    prefilterKeywords: string | null;
    ragTopK: number;
    ragMinScore: number | null;
    embeddingProvider: string | null;
    embeddingModel: string | null;
    allowedProductCategoryIds: string[];
    allowedKnowledgeCategoryIds: string[];
    traceRetentionDays: number;
    traceErrorRetentionDays: number;
    verifyBeforeSend: boolean;
    autoLearnEnabled: boolean;
    autoLearnIntervalDays: number;
}>;
export type AiTaskType = 'reply_draft' | 'summary' | 'sentiment' | 'lead_score' | 'ai_cdp' | 'ai_router' | 'auto_reply' | 'ai_master';
export type TaskOverride = {
    provider?: string | null;
    model?: string | null;
};
export type TaskOverrides = Partial<Record<AiTaskType, TaskOverride>>;
export declare function isValidTaskType(t: string): t is AiTaskType;
export declare function updateAiConfig(orgId: string, input: {
    provider?: string;
    model?: string;
    maxDaily?: number;
    enabled?: boolean;
    taskOverrides?: TaskOverrides;
    defaultAiMode?: string;
    autoReplyEnabled?: boolean;
    debounceSeconds?: number;
    prefilterKeywords?: string | null;
    ragTopK?: number;
    embeddingProvider?: string | null;
    embeddingModel?: string | null;
    allowedProductCategoryIds?: string[];
    allowedKnowledgeCategoryIds?: string[];
    traceRetentionDays?: number;
    traceErrorRetentionDays?: number;
    verifyBeforeSend?: boolean;
    autoLearnEnabled?: boolean;
    autoLearnIntervalDays?: number;
}): Promise<{
    id: string;
    orgId: string;
    createdAt: Date;
    updatedAt: Date;
    provider: string;
    model: string;
    maxDaily: number;
    enabled: boolean;
    taskOverrides: import("@prisma/client/runtime/library").JsonValue;
    defaultAiMode: string;
    autoReplyEnabled: boolean;
    debounceSeconds: number;
    prefilterKeywords: string | null;
    ragTopK: number;
    ragMinScore: number | null;
    embeddingProvider: string | null;
    embeddingModel: string | null;
    allowedProductCategoryIds: string[];
    allowedKnowledgeCategoryIds: string[];
    traceRetentionDays: number;
    traceErrorRetentionDays: number;
    verifyBeforeSend: boolean;
    autoLearnEnabled: boolean;
    autoLearnIntervalDays: number;
}>;
export type ScheduleConfig = {
    enabled: boolean;
    startHour: number;
    endHour: number;
    daytimeMode: 'suggest' | 'manual';
    nighttimeMode: 'auto' | 'suggest';
    timezone: string;
};
export declare const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig;
/**
 * Check if the given date/time falls in the after-hours window (e.g. 18:00 -> 08:00 next day).
 */
export declare function isAfterHours(date?: Date, timezone?: string, startHour?: number, endHour?: number): boolean;
export declare function getAiScheduleConfig(orgId: string): Promise<ScheduleConfig>;
export declare function saveAiScheduleConfig(orgId: string, cfg: Partial<ScheduleConfig>): Promise<{
    id: string;
    orgId: string;
    createdAt: Date;
    updatedAt: Date;
    settingKey: string;
    valuePlain: string | null;
    valueEncrypted: import("@prisma/client/runtime/library").Bytes | null;
}>;
export type AiReplyConfig = {
    defaultAiMode: string;
    autoReplyEnabled: boolean;
    debounceSeconds: number;
    prefilterKeywords: string | null;
    schedule: ScheduleConfig;
    ragTopK: number;
    embeddingProvider: string | null;
    embeddingModel: string | null;
    traceRetentionDays: number;
    traceErrorRetentionDays: number;
    autoLearnEnabled: boolean;
    autoLearnIntervalDays: number;
};
/**
 * Get the auto-reply configuration for an org.
 * Creates a default AiConfig row if none exists.
 */
export declare function getAiReplyConfig(orgId: string): Promise<AiReplyConfig>;
/**
 * Resolve effective AI mode for a conversation.
 * - If org master switch is off → 'manual' always
 * - If conversation mode is explicitly 'manual' → 'manual'
 * - If schedule is enabled:
 *     - After hours (e.g. after 18h) → nighttimeMode ('auto')
 *     - Daytime (e.g. 08:00 - 18:00) → daytimeMode ('suggest')
 * - Otherwise: convAiMode ?? defaultAiMode
 */
export declare function resolveConversationMode(input: {
    orgId: string;
    autoReplyEnabled: boolean;
    defaultAiMode: string;
    convAiMode?: string | null;
    schedule?: ScheduleConfig;
    currentTime?: Date;
}): string;
/**
 * Bulk-apply the org's default AI mode to ALL existing conversations.
 * Backs the "áp dụng cho cả hội thoại hiện tại" choice in AI config — it
 * overwrites per-conversation overrides by design (the dialog says so).
 */
export declare function applyDefaultModeToAllConversations(orgId: string, mode: string): Promise<number>;
/**
 * Resolve effective provider+model for a given task.
 * Order of precedence: task override → org default.
 */
export declare function getEffectiveConfigForTask(cfg: {
    provider: string;
    model: string;
    taskOverrides?: unknown;
}, taskType: AiTaskType): {
    provider: string;
    model: string;
};
export type AiUsageSeriesPoint = {
    date: string;
    calls: number;
    tokensIn: number;
    tokensOut: number;
    cacheReadTokens: number;
    costUsd: number;
};
export declare function getAiUsage(orgId: string, days?: number): Promise<{
    callsToday: number;
    tokensIn: number;
    tokensOut: number;
    cacheReadTokens: number;
    costUsd: number;
    maxDaily: number;
    remaining: number;
    enabled: boolean;
    byType: Record<string, number>;
    series: AiUsageSeriesPoint[];
    days: number;
}>;
export declare function ensureQuota(orgId: string, maxDaily: number): Promise<void>;
export { getAvailableProviders };
