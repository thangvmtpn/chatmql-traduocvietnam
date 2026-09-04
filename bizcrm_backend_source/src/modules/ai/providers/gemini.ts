/**
 * Google Gemini provider.
 * Returns text + token counts (prompt + candidates) when available.
 */
import { config } from '../../../config/index.js'

export type GeminiResult = {
  text: string
  tokensIn: number
  tokensOut: number
}

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
  }
}

export async function generateWithGemini(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  userPrompt: string,
  options: { jsonMode?: boolean; maxTokens?: number; signal?: AbortSignal } = {},
): Promise<GeminiResult> {
  const maxTokens = options.maxTokens ?? 1024
  const url = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs)
  // Gộp timeout của riêng lệnh gọi với ngân sách thời gian của cả lượt (nếu có):
  // hết ngân sách là HUỶ THẬT ở tầng HTTP, không để lệnh gọi chạy mồ côi.
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal

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
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Gemini request failed (${response.status}): ${body.slice(0, 200)}`)
    }

    const data = (await response.json()) as GeminiResponse
    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim() || ''
    if (!text) throw new Error('Gemini returned empty content')

    return {
      text,
      tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
      tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
    }
  } finally {
    clearTimeout(timeout)
  }
}
