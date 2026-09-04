/**
 * Google Gemini provider.
 * Returns text + token counts (prompt + candidates) when available.
 */
import { config } from '../../../config/index.js';
export async function generateWithGemini(baseUrl, apiKey, model, system, userPrompt, options = {}) {
    const maxTokens = options.maxTokens ?? 1024;
    const url = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs);
    // Gộp timeout của riêng lệnh gọi với ngân sách thời gian của cả lượt (nếu có):
    // hết ngân sách là HUỶ THẬT ở tầng HTTP, không để lệnh gọi chạy mồ côi.
    const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: system }] },
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                generationConfig: {
                    temperature: 0.4,
                    maxOutputTokens: maxTokens,
                    ...(options.jsonMode ? { responseMimeType: 'application/json' } : {}),
                },
            }),
            signal,
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`Gemini request failed (${response.status}): ${body.slice(0, 200)}`);
        }
        const data = (await response.json());
        const text = data.candidates?.[0]?.content?.parts
            ?.map((part) => part.text || '')
            .join('')
            .trim() || '';
        if (!text)
            throw new Error('Gemini returned empty content');
        return {
            text,
            tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
            tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=gemini.js.map