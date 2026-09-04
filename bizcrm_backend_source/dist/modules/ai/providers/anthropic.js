/**
 * Anthropic Claude provider with prompt caching support.
 * Uses cache_control: ephemeral on the system block to reduce input tokens
 * by 80-90% for repeated system prompts (across the same org/session).
 */
import { config } from '../../../config/index.js';
export async function generateWithAnthropic(baseUrl, apiKey, model, system, userPrompt, options = {}) {
    const enableCaching = options.enableCaching ?? true;
    const maxTokens = options.maxTokens ?? 1024;
    const url = `${baseUrl}/v1/messages`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);
    // Gộp timeout của riêng lệnh gọi với ngân sách thời gian của cả lượt (nếu có):
    // hết ngân sách là HUỶ THẬT ở tầng HTTP, không để lệnh gọi chạy mồ côi.
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    // Cache the system block when caching is on. Reduces cost across calls
    // sharing the same system prompt within the 5-min ephemeral TTL window.
    const systemBlocks = enableCaching
        ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
        : system;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                system: systemBlocks,
                messages: [{ role: 'user', content: userPrompt }],
            }),
            signal,
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`Anthropic request failed (${response.status}): ${body.slice(0, 200)}`);
        }
        const data = (await response.json());
        const text = data.content?.find((item) => item.type === 'text')?.text?.trim() || '';
        if (!text)
            throw new Error('Anthropic returned empty content');
        return {
            text,
            tokensIn: data.usage?.input_tokens ?? 0,
            tokensOut: data.usage?.output_tokens ?? 0,
            cacheCreationTokens: data.usage?.cache_creation_input_tokens ?? 0,
            cacheReadTokens: data.usage?.cache_read_input_tokens ?? 0,
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=anthropic.js.map