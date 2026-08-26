/**
 * AI configuration & usage queries — split from ai-service.ts to keep files small.
 */
import { prisma } from '../../shared/prisma-client.js';
import { config } from '../../config/index.js';
import { getAvailableProviders, getProviderConfig } from './provider-registry.js';
const VERIFY_TIMEOUT_MS = 15_000;
// Bootstrap defaults for a newly-onboarded org's AiConfig row. The org can
// change provider/model via Settings UI afterwards. Hardcoded (not env-driven)
// because AI provider config is owned by the UI, not deployment.
const BOOTSTRAP_PROVIDER = 'openai';
const BOOTSTRAP_MODEL = 'gpt-4.1-mini';
export async function getProviderApiKey(orgId, provider) {
    const setting = await prisma.appSetting.findFirst({
        where: { orgId, settingKey: `ai_${provider}_api_key` },
    });
    return setting?.valuePlain || '';
}
export async function saveProviderApiKey(orgId, provider, apiKey) {
    const trimmed = apiKey.trim();
    if (!trimmed)
        throw new Error('API key cannot be empty');
    if (trimmed.length < 8)
        throw new Error('API key seems too short');
    if (!getProviderConfig(provider))
        throw new Error(`Unknown provider: ${provider}`);
    return prisma.appSetting.upsert({
        where: { orgId_settingKey: { orgId, settingKey: `ai_${provider}_api_key` } },
        update: { valuePlain: trimmed },
        create: { orgId, settingKey: `ai_${provider}_api_key`, valuePlain: trimmed },
    });
}
/**
 * Verify an API key by probing the provider's /models endpoint.
 * Returns ok: true if the key is accepted, ok: false with a friendly error otherwise.
 * Uses GET /models (free, lightweight) where supported.
 */
export async function verifyProviderApiKey(provider, apiKey) {
    const def = getProviderConfig(provider);
    if (!def)
        return { ok: false, status: 400, error: `Unknown provider: ${provider}` };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    const baseUrl = def.baseUrl;
    try {
        let url;
        let headers = {};
        if (provider === 'openai' || provider === 'minimax') {
            url = `${baseUrl}/v1/models`;
            headers = { authorization: `Bearer ${apiKey}` };
        }
        else if (provider === 'anthropic') {
            url = `${baseUrl}/v1/models`;
            headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
        }
        else if (provider === 'gemini') {
            url = `${baseUrl}/v1beta/models?key=${encodeURIComponent(apiKey)}`;
        }
        else {
            return { ok: false, status: 400, error: `Verification not supported for ${provider}` };
        }
        const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
        const rawBody = await response.text().catch(() => '');
        if (response.ok) {
            // MiniMax returns HTTP 200 even on auth failure — error is encoded in
            // `base_resp.status_code` (0 = success, non-zero = error). Parse the body to detect.
            if (provider === 'minimax') {
                try {
                    const parsed = JSON.parse(rawBody);
                    const code = parsed.base_resp?.status_code;
                    if (code !== undefined && code !== 0) {
                        return {
                            ok: false,
                            status: 401,
                            error: parsed.base_resp?.status_msg || `MiniMax đã từ chối key (mã ${code})`,
                        };
                    }
                }
                catch {
                    /* if body isn't JSON, treat HTTP 200 as success */
                }
            }
            return { ok: true };
        }
        const body = rawBody.slice(0, 300);
        const friendly = response.status === 401 || response.status === 403
            ? 'API key không hợp lệ hoặc không có quyền'
            : response.status === 429
                ? 'API key bị rate-limit (kiểm tra hạn mức của tài khoản)'
                : response.status === 404
                    ? `Endpoint không tồn tại — kiểm tra base URL provider`
                    : `${provider} trả về lỗi ${response.status}: ${body || 'không có message'}`;
        return { ok: false, status: response.status, error: friendly };
    }
    catch (err) {
        const isAbort = err.name === 'AbortError';
        return {
            ok: false,
            status: 0,
            error: isAbort
                ? `Provider không phản hồi trong ${VERIFY_TIMEOUT_MS / 1000}s — kiểm tra mạng/proxy`
                : `Không kết nối được provider: ${err.message || String(err)}`,
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
export async function deleteProviderApiKey(orgId, provider) {
    return prisma.appSetting.deleteMany({
        where: { orgId, settingKey: `ai_${provider}_api_key` },
    });
}
export async function getAiConfig(orgId) {
    let aiConfig = await prisma.aiConfig.findUnique({ where: { orgId } });
    if (!aiConfig) {
        aiConfig = await prisma.aiConfig.create({
            data: {
                orgId,
                provider: BOOTSTRAP_PROVIDER,
                model: BOOTSTRAP_MODEL,
                maxDaily: config.aiDailyLimit,
                enabled: true,
            },
        });
    }
    const availableProviders = getAvailableProviders();
    // Single batched lookup beats 4 round-trips when settings are stored per-org
    const settings = await prisma.appSetting.findMany({
        where: {
            orgId,
            settingKey: { in: ['ai_openai_api_key', 'ai_minimax_api_key', 'ai_anthropic_api_key', 'ai_gemini_api_key'] },
        },
        select: { settingKey: true, valuePlain: true },
    });
    const fromDb = (key) => !!settings.find((s) => s.settingKey === key)?.valuePlain;
    const hasOpenaiKey = fromDb('ai_openai_api_key');
    const hasMinimaxKey = fromDb('ai_minimax_api_key');
    const hasAnthropicKey = fromDb('ai_anthropic_api_key');
    const hasGeminiKey = fromDb('ai_gemini_api_key');
    const schedule = await getAiScheduleConfig(orgId);
    return {
        ...aiConfig,
        hasOpenaiKey,
        hasMinimaxKey,
        hasAnthropicKey,
        hasGeminiKey,
        availableProviders,
        schedule,
        isAfterHours: isAfterHours(new Date(), schedule.timezone, schedule.startHour, schedule.endHour),
    };
}
const VALID_TASK_TYPES = ['reply_draft', 'summary', 'sentiment', 'lead_score', 'ai_cdp', 'ai_router', 'auto_reply', 'ai_master'];
export function isValidTaskType(t) {
    return VALID_TASK_TYPES.includes(t);
}
export async function updateAiConfig(orgId, input) {
    // Sanitize taskOverrides — strip unknown task types, drop empty entries
    const cleanOverrides = input.taskOverrides
        ? Object.fromEntries(Object.entries(input.taskOverrides)
            .filter(([k, v]) => isValidTaskType(k) && v && (v.provider || v.model))
            .map(([k, v]) => [k, { provider: v?.provider || undefined, model: v?.model || undefined }]))
        : undefined;
    // Validate auto-reply fields
    const validModes = ['manual', 'auto', 'suggest'];
    if (input.defaultAiMode !== undefined && !validModes.includes(input.defaultAiMode)) {
        throw new Error(`defaultAiMode must be one of: ${validModes.join(', ')}`);
    }
    if (input.debounceSeconds !== undefined && (input.debounceSeconds < 0 || input.debounceSeconds > 60)) {
        throw new Error('debounceSeconds must be between 0 and 60');
    }
    // Validate M3 fields
    if (input.ragTopK !== undefined && (input.ragTopK < 1 || input.ragTopK > 50)) {
        throw new Error('ragTopK must be between 1 and 50');
    }
    if (input.traceRetentionDays !== undefined && input.traceRetentionDays < 1) {
        throw new Error('traceRetentionDays must be at least 1');
    }
    if (input.traceErrorRetentionDays !== undefined && input.traceErrorRetentionDays < 1) {
        throw new Error('traceErrorRetentionDays must be at least 1');
    }
    if (input.autoLearnIntervalDays !== undefined && input.autoLearnIntervalDays < 1) {
        throw new Error('autoLearnIntervalDays must be at least 1');
    }
    // Sanitize guardrail allow-lists: keep only non-empty unique strings
    const cleanIds = (arr) => arr === undefined ? undefined : [...new Set(arr.filter((s) => typeof s === 'string' && s.trim()))];
    const allowedProductCategoryIds = cleanIds(input.allowedProductCategoryIds);
    const allowedKnowledgeCategoryIds = cleanIds(input.allowedKnowledgeCategoryIds);
    return prisma.aiConfig.upsert({
        where: { orgId },
        create: {
            orgId,
            provider: input.provider || BOOTSTRAP_PROVIDER,
            model: input.model || BOOTSTRAP_MODEL,
            maxDaily: input.maxDaily ?? config.aiDailyLimit,
            enabled: input.enabled ?? true,
            taskOverrides: cleanOverrides ?? {},
            defaultAiMode: input.defaultAiMode ?? 'manual',
            autoReplyEnabled: input.autoReplyEnabled ?? false,
            debounceSeconds: input.debounceSeconds ?? 5,
            prefilterKeywords: input.prefilterKeywords ?? null,
            ragTopK: input.ragTopK ?? 5,
            embeddingProvider: input.embeddingProvider ?? null,
            embeddingModel: input.embeddingModel ?? null,
            allowedProductCategoryIds: allowedProductCategoryIds ?? [],
            allowedKnowledgeCategoryIds: allowedKnowledgeCategoryIds ?? [],
            traceRetentionDays: input.traceRetentionDays ?? 14,
            traceErrorRetentionDays: input.traceErrorRetentionDays ?? 90,
            verifyBeforeSend: input.verifyBeforeSend ?? false,
            autoLearnEnabled: input.autoLearnEnabled ?? false,
            autoLearnIntervalDays: input.autoLearnIntervalDays ?? 7,
        },
        update: {
            provider: input.provider,
            model: input.model,
            maxDaily: input.maxDaily,
            enabled: input.enabled,
            ...(cleanOverrides !== undefined ? { taskOverrides: cleanOverrides } : {}),
            ...(input.defaultAiMode !== undefined ? { defaultAiMode: input.defaultAiMode } : {}),
            ...(input.autoReplyEnabled !== undefined ? { autoReplyEnabled: input.autoReplyEnabled } : {}),
            ...(input.debounceSeconds !== undefined ? { debounceSeconds: input.debounceSeconds } : {}),
            ...(input.prefilterKeywords !== undefined ? { prefilterKeywords: input.prefilterKeywords } : {}),
            ...(input.ragTopK !== undefined ? { ragTopK: input.ragTopK } : {}),
            ...(input.embeddingProvider !== undefined ? { embeddingProvider: input.embeddingProvider } : {}),
            ...(input.embeddingModel !== undefined ? { embeddingModel: input.embeddingModel } : {}),
            ...(allowedProductCategoryIds !== undefined ? { allowedProductCategoryIds } : {}),
            ...(allowedKnowledgeCategoryIds !== undefined ? { allowedKnowledgeCategoryIds } : {}),
            ...(input.traceRetentionDays !== undefined ? { traceRetentionDays: input.traceRetentionDays } : {}),
            ...(input.traceErrorRetentionDays !== undefined ? { traceErrorRetentionDays: input.traceErrorRetentionDays } : {}),
            ...(input.verifyBeforeSend !== undefined ? { verifyBeforeSend: input.verifyBeforeSend } : {}),
            ...(input.autoLearnEnabled !== undefined ? { autoLearnEnabled: input.autoLearnEnabled } : {}),
            ...(input.autoLearnIntervalDays !== undefined ? { autoLearnIntervalDays: input.autoLearnIntervalDays } : {}),
        },
    });
}
export const DEFAULT_SCHEDULE_CONFIG = {
    enabled: true,
    startHour: 18,
    endHour: 8,
    daytimeMode: 'suggest',
    nighttimeMode: 'auto',
    timezone: 'Asia/Ho_Chi_Minh',
};
/**
 * Check if the given date/time falls in the after-hours window (e.g. 18:00 -> 08:00 next day).
 */
export function isAfterHours(date = new Date(), timezone = 'Asia/Ho_Chi_Minh', startHour = 18, endHour = 8) {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: 'numeric',
            minute: 'numeric',
            hour12: false,
        });
        const parts = formatter.formatToParts(date);
        const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
        const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
        const timeInMinutes = hour * 60 + minute;
        const startMinutes = startHour * 60;
        const endMinutes = endHour * 60;
        if (startMinutes > endMinutes) {
            // Overnight window: e.g. 18:00 (1080m) to 08:00 (480m) next day
            return timeInMinutes >= startMinutes || timeInMinutes < endMinutes;
        }
        else {
            return timeInMinutes >= startMinutes && timeInMinutes < endMinutes;
        }
    }
    catch {
        const utcHours = date.getUTCHours() + 7;
        const vnHour = utcHours >= 24 ? utcHours - 24 : utcHours;
        return vnHour >= 18 || vnHour < 8;
    }
}
export async function getAiScheduleConfig(orgId) {
    const setting = await prisma.appSetting.findFirst({
        where: { orgId, settingKey: 'ai_auto_reply_schedule' },
    });
    if (!setting?.valuePlain)
        return DEFAULT_SCHEDULE_CONFIG;
    try {
        const parsed = JSON.parse(setting.valuePlain);
        return { ...DEFAULT_SCHEDULE_CONFIG, ...parsed };
    }
    catch {
        return DEFAULT_SCHEDULE_CONFIG;
    }
}
export async function saveAiScheduleConfig(orgId, cfg) {
    const current = await getAiScheduleConfig(orgId);
    const updated = { ...current, ...cfg };
    return prisma.appSetting.upsert({
        where: { orgId_settingKey: { orgId, settingKey: 'ai_auto_reply_schedule' } },
        update: { valuePlain: JSON.stringify(updated) },
        create: { orgId, settingKey: 'ai_auto_reply_schedule', valuePlain: JSON.stringify(updated) },
    });
}
/**
 * Get the auto-reply configuration for an org.
 * Creates a default AiConfig row if none exists.
 */
export async function getAiReplyConfig(orgId) {
    let cfg = await prisma.aiConfig.findUnique({ where: { orgId } });
    if (!cfg) {
        cfg = await prisma.aiConfig.create({
            data: {
                orgId,
                provider: BOOTSTRAP_PROVIDER,
                model: BOOTSTRAP_MODEL,
                maxDaily: config.aiDailyLimit,
                enabled: true,
            },
        });
    }
    const schedule = await getAiScheduleConfig(orgId);
    return {
        defaultAiMode: cfg.defaultAiMode,
        autoReplyEnabled: cfg.autoReplyEnabled,
        debounceSeconds: cfg.debounceSeconds,
        prefilterKeywords: cfg.prefilterKeywords ?? null,
        schedule,
        ragTopK: cfg.ragTopK,
        embeddingProvider: cfg.embeddingProvider ?? null,
        embeddingModel: cfg.embeddingModel ?? null,
        traceRetentionDays: cfg.traceRetentionDays,
        traceErrorRetentionDays: cfg.traceErrorRetentionDays,
        autoLearnEnabled: cfg.autoLearnEnabled,
        autoLearnIntervalDays: cfg.autoLearnIntervalDays,
    };
}
/**
 * Resolve effective AI mode for a conversation.
 * - If org master switch is off → 'manual' always
 * - If conversation mode is explicitly 'manual' → 'manual'
 * - If schedule is enabled:
 *     - After hours (e.g. after 18h) → nighttimeMode ('auto')
 *     - Daytime (e.g. 08:00 - 18:00) → daytimeMode ('suggest')
 * - Otherwise: convAiMode ?? defaultAiMode
 */
export function resolveConversationMode(input) {
    if (!input.autoReplyEnabled)
        return 'manual';
    if (input.convAiMode === 'manual')
        return 'manual';
    if (input.schedule?.enabled) {
        const afterHours = isAfterHours(input.currentTime, input.schedule.timezone || 'Asia/Ho_Chi_Minh', input.schedule.startHour ?? 18, input.schedule.endHour ?? 8);
        if (afterHours) {
            return input.convAiMode ?? input.schedule.nighttimeMode ?? 'auto';
        }
        else {
            return input.schedule.daytimeMode ?? 'suggest';
        }
    }
    return input.convAiMode ?? input.defaultAiMode;
}
/**
 * Bulk-apply the org's default AI mode to ALL existing conversations.
 * Backs the "áp dụng cho cả hội thoại hiện tại" choice in AI config — it
 * overwrites per-conversation overrides by design (the dialog says so).
 */
export async function applyDefaultModeToAllConversations(orgId, mode) {
    const res = await prisma.conversation.updateMany({
        where: { orgId },
        data: { aiMode: mode, aiModeReason: 'bulk: áp dụng chế độ mặc định từ Cấu hình AI' },
    });
    return res.count;
}
/**
 * Resolve effective provider+model for a given task.
 * Order of precedence: task override → org default.
 */
export function getEffectiveConfigForTask(cfg, taskType) {
    const overrides = (cfg.taskOverrides ?? {});
    const override = overrides[taskType];
    return {
        provider: override?.provider || cfg.provider,
        model: override?.model || cfg.model,
    };
}
function isoDate(d) {
    return d.toISOString().slice(0, 10);
}
export async function getAiUsage(orgId, days = 1) {
    const cfg = await getAiConfig(orgId);
    const safeDays = Math.max(1, Math.min(90, Math.floor(days)));
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    // Today bucket (used by existing UI panels)
    const todayUsages = await prisma.aiUsage.findMany({
        where: { orgId, createdAt: { gte: startOfDay } },
        select: { tokensIn: true, tokensOut: true, cacheReadTokens: true, costUsd: true, type: true },
    });
    const tokensIn = todayUsages.reduce((s, u) => s + u.tokensIn, 0);
    const tokensOut = todayUsages.reduce((s, u) => s + u.tokensOut, 0);
    const cacheReadTokens = todayUsages.reduce((s, u) => s + (u.cacheReadTokens ?? 0), 0);
    const costUsd = todayUsages.reduce((s, u) => s + Number(u.costUsd ?? 0), 0);
    const byType = {};
    for (const u of todayUsages)
        byType[u.type] = (byType[u.type] || 0) + 1;
    // "Lượt gọi" / quota counts LLM calls only — embeddings are logged for cost
    // visibility but must not burn the daily call budget (3-4 embeds per reply turn).
    const llmCalls = todayUsages.filter((u) => u.type !== 'embedding').length;
    // Daily series for the chart (D5.14). Only computed when days > 1 to avoid extra query.
    let series = [];
    if (safeDays > 1) {
        const seriesStart = new Date();
        seriesStart.setHours(0, 0, 0, 0);
        seriesStart.setDate(seriesStart.getDate() - (safeDays - 1));
        const seriesUsages = await prisma.aiUsage.findMany({
            where: { orgId, createdAt: { gte: seriesStart } },
            select: { createdAt: true, tokensIn: true, tokensOut: true, cacheReadTokens: true, costUsd: true },
        });
        const buckets = new Map();
        // Pre-fill every day in range so the chart has a continuous x-axis even
        // for days with zero calls.
        for (let i = 0; i < safeDays; i += 1) {
            const d = new Date(seriesStart);
            d.setDate(seriesStart.getDate() + i);
            const key = isoDate(d);
            buckets.set(key, { date: key, calls: 0, tokensIn: 0, tokensOut: 0, cacheReadTokens: 0, costUsd: 0 });
        }
        for (const u of seriesUsages) {
            const key = isoDate(u.createdAt);
            const bucket = buckets.get(key);
            if (!bucket)
                continue;
            bucket.calls += 1;
            bucket.tokensIn += u.tokensIn;
            bucket.tokensOut += u.tokensOut;
            bucket.cacheReadTokens += u.cacheReadTokens ?? 0;
            bucket.costUsd += Number(u.costUsd ?? 0);
        }
        series = Array.from(buckets.values()).map((b) => ({
            ...b,
            costUsd: Number(b.costUsd.toFixed(4)),
        }));
    }
    return {
        callsToday: llmCalls,
        tokensIn,
        tokensOut,
        cacheReadTokens,
        costUsd: Number(costUsd.toFixed(4)),
        maxDaily: cfg.maxDaily,
        remaining: Math.max(0, cfg.maxDaily - llmCalls),
        enabled: cfg.enabled,
        byType,
        series, // empty unless days > 1
        days: safeDays,
    };
}
export async function ensureQuota(orgId, maxDaily) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    // type != 'embedding': quota covers LLM calls only (embeds are logged for cost).
    const used = await prisma.aiUsage.count({
        where: { orgId, createdAt: { gte: startOfDay }, type: { not: 'embedding' } },
    });
    if (used >= maxDaily)
        throw new Error('AI daily quota exceeded');
}
export { getAvailableProviders };
//# sourceMappingURL=ai-config-service.js.map