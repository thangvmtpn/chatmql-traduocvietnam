/**
 * OpenAI Chat Completions provider.
 * Supports json_object response_format for structured outputs.
 */
import { config } from '../../../config/index.js';
/**
 * Newer OpenAI models (o-series reasoning: o1/o3/o4…, and the gpt-5 family)
 * reject `max_tokens` and require `max_completion_tokens`. Older models
 * (gpt-4.1, gpt-4o, …) use `max_tokens`. Pick the right key per model so the
 * harness can run both generations.
 */
function tokenLimitParam(model, maxTokens) {
    const m = model.toLowerCase();
    const needsCompletionTokens = /^o\d/.test(m) || m.startsWith('gpt-5');
    return needsCompletionTokens ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens };
}
export async function generateWithOpenai(baseUrl, apiKey, model, system, userPrompt, options = {}) {
    const maxTokens = options.maxTokens ?? 1024;
    const url = `${baseUrl}/v1/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);
    // Gộp timeout của riêng lệnh gọi với ngân sách thời gian của cả lượt (nếu có):
    // hết ngân sách là HUỶ THẬT ở tầng HTTP, không để lệnh gọi chạy mồ côi.
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                ...tokenLimitParam(model, maxTokens),
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: userPrompt },
                ],
                ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
            }),
            signal,
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`OpenAI request failed (${response.status}): ${body.slice(0, 200)}`);
        }
        const data = (await response.json());
        const text = data.choices?.[0]?.message?.content?.trim() || '';
        if (!text)
            throw new Error('OpenAI returned empty content');
        return {
            text,
            tokensIn: data.usage?.prompt_tokens ?? 0,
            tokensOut: data.usage?.completion_tokens ?? 0,
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
export async function generateWithOpenaiMessages(baseUrl, apiKey, model, messages, tools, options = {}) {
    const maxTokens = options.maxTokens ?? 1024;
    const url = `${baseUrl}/v1/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);
    // Gộp timeout của riêng lệnh gọi với ngân sách thời gian của cả lượt (nếu có):
    // hết ngân sách là HUỶ THẬT ở tầng HTTP, không để lệnh gọi chạy mồ côi.
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
                model,
                ...tokenLimitParam(model, maxTokens),
                messages,
                ...(tools && tools.length > 0 ? { tools, tool_choice: options.toolChoice ?? 'auto' } : {}),
            }),
            signal,
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`OpenAI tool request failed (${response.status}): ${body.slice(0, 200)}`);
        }
        const data = (await response.json());
        const choice = data.choices?.[0];
        const msg = choice?.message;
        const toolCalls = (msg?.tool_calls ?? []).map((tc) => ({
            id: tc.id,
            name: tc.function?.name ?? '',
            arguments: tc.function?.arguments ?? '{}',
        }));
        return {
            content: msg?.content ?? null,
            toolCalls,
            tokensIn: data.usage?.prompt_tokens ?? 0,
            tokensOut: data.usage?.completion_tokens ?? 0,
            finishReason: choice?.finish_reason ?? null,
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=openai.js.map