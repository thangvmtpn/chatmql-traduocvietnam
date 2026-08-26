/**
 * Central environment config — single source of truth for all process.env reads.
 * Default values are dev-friendly. Production must override via .env.
 */
function env(key, fallback = '') {
    return process.env[key] ?? fallback;
}
function envInt(key, fallback) {
    const value = process.env[key];
    if (!value)
        return fallback;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}
export const config = {
    port: envInt('PORT', 4520),
    nodeEnv: env('NODE_ENV', 'development'),
    jwtSecret: env('JWT_SECRET', 'dev-secret-change-me'),
    databaseUrl: env('DATABASE_URL'),
    // ── AI ────────────────────────────────────────────────────────────
    // Provider API keys, default provider, and default model are configured
    // via the Settings UI per-org (AppSetting + AiConfig tables), not env vars.
    aiDailyLimit: envInt('AI_DAILY_LIMIT', 500),
    aiTimeoutMs: envInt('AI_TIMEOUT_MS', 30_000),
    // OpenAI (primary) — endpoint + model list shown in the picker
    openaiBaseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com'),
    openaiDefaultModel: env('OPENAI_MODEL', 'gpt-4.1-mini'),
    openaiDefaultPlusModel: env('OPENAI_PLUS_MODEL', 'gpt-4o'),
    // MiniMax (primary, OpenAI-compatible API)
    minimaxBaseUrl: env('MINIMAX_BASE_URL', 'https://api.minimaxi.com'),
    minimaxDefaultModel: env('MINIMAX_MODEL', 'MiniMax-M2.7'),
    minimaxFastModel: env('MINIMAX_FAST_MODEL', 'MiniMax-M2'),
    // Anthropic (optional)
    anthropicBaseUrl: env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com'),
    anthropicDefaultOpusModel: env('ANTHROPIC_OPUS_MODEL', 'claude-opus-4-5'),
    anthropicDefaultSonnetModel: env('ANTHROPIC_SONNET_MODEL', 'claude-sonnet-4-6'),
    anthropicDefaultHaikuModel: env('ANTHROPIC_HAIKU_MODEL', 'claude-haiku-4-5'),
    // Gemini (optional)
    geminiBaseUrl: env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com'),
    geminiDefaultProModel: env('GEMINI_PRO_MODEL', 'gemini-2.5-pro'),
    geminiDefaultFlashModel: env('GEMINI_FLASH_MODEL', 'gemini-2.5-flash'),
    // ── Zalo ──────────────────────────────────────────────────────────
    zaloCallbackUrl: env('ZALO_CALLBACK_URL'),
};
//# sourceMappingURL=index.js.map