/**
 * Central AI provider registry — provider metadata only (baseUrl, model list,
 * capability flags). API keys are stored per-org in AppSetting and looked up
 * at call time via getProviderApiKey() in ai-config-service.ts; they are not
 * sourced from environment variables.
 *
 * Primary providers: openai, minimax. Anthropic + Gemini are optional alternates.
 */
import { config } from '../../config/index.js';
function model(title, value) {
    return value ? { title, value } : null;
}
function buildProviders() {
    return [
        {
            id: 'openai',
            name: 'OpenAI',
            baseUrl: config.openaiBaseUrl,
            supportsCaching: false,
            primary: true,
            models: [
                // GPT-4.1 series
                model('GPT-4.1', 'gpt-4.1'),
                model('GPT-4.1 Mini', 'gpt-4.1-mini'),
                model('GPT-4.1 Nano', 'gpt-4.1-nano'),
                // Current GPT-5 generation (May 2026)
                model('GPT-5.5 (flagship)', 'gpt-5.5'),
                model('GPT-5.5 Instant', 'gpt-5.5-instant'),
                model('GPT-5.4 Pro', 'gpt-5.4-pro'),
                model('GPT-5.4', 'gpt-5.4'),
                model('GPT-5.4 Mini', 'gpt-5.4-mini'),
                model('GPT-5.4 Nano', 'gpt-5.4-nano'),
                // Legacy (still functional)
                model('GPT-4o Mini (legacy)', 'gpt-4o-mini'),
                model('GPT-4o (legacy)', 'gpt-4o'),
            ].filter(Boolean),
        },
        {
            id: 'minimax',
            name: 'MiniMax',
            baseUrl: config.minimaxBaseUrl,
            supportsCaching: false,
            primary: true,
            models: [
                model('MiniMax-M2.7 (normal)', config.minimaxDefaultModel),
                model('MiniMax-M2 (fast)', config.minimaxFastModel),
                model('MiniMax-M1', 'MiniMax-M1'),
            ].filter(Boolean),
        },
        {
            id: 'anthropic',
            name: 'Anthropic Claude',
            baseUrl: config.anthropicBaseUrl,
            supportsCaching: true,
            primary: false,
            models: [
                // From env config
                model('Claude Sonnet 4', config.anthropicDefaultSonnetModel),
                model('Claude Haiku 4', config.anthropicDefaultHaikuModel),
                model('Claude Opus 4', config.anthropicDefaultOpusModel),
                // Additional models
                model('Claude 3.5 Sonnet', 'claude-3-5-sonnet-20241022'),
                model('Claude 3.5 Haiku', 'claude-3-5-haiku-20241022'),
            ].filter(Boolean),
        },
        {
            id: 'gemini',
            name: 'Google Gemini',
            baseUrl: config.geminiBaseUrl,
            supportsCaching: false,
            primary: false,
            models: [
                // Current Gemini 3.x generation (May 2026)
                model('Gemini 3.5 Flash (latest)', 'gemini-3.5-flash'),
                model('Gemini 3.1 Pro', 'gemini-3.1-pro'),
                model('Gemini 3.1 Flash-Lite', 'gemini-3.1-flash-lite'),
                // Stable Gemini 2.5 (retiring Oct 2026)
                model('Gemini 2.5 Pro', config.geminiDefaultProModel),
                model('Gemini 2.5 Flash', config.geminiDefaultFlashModel),
                model('Gemini 2.5 Flash-Lite', 'gemini-2.5-flash-lite'),
            ].filter(Boolean),
        },
    ];
}
const providers = buildProviders();
/** Returns all providers that have at least one model defined. Per-org key
 *  presence is the caller's responsibility (see hasOpenaiKey etc. in getAiConfig). */
export function getAvailableProviders() {
    return providers.filter((p) => p.models.length > 0);
}
/** Returns the static config for a provider, or undefined */
export function getProviderConfig(providerId) {
    return providers.find((p) => p.id === providerId);
}
//# sourceMappingURL=provider-registry.js.map