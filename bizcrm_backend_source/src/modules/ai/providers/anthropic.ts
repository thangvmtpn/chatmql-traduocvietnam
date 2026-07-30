/**
 * Anthropic Claude provider with prompt caching support.
 * Uses cache_control: ephemeral on the system block to reduce input tokens
 * by 80-90% for repeated system prompts (across the same org/session).
 */
import { config } from '../../../config/index.js'

export type AnthropicResult = {
  text: string
  tokensIn: number
  tokensOut: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

type AnthropicMessageResponse = {
  content?: Array<{ type: string; text?: string }>
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

export async function generateWithAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  userPrompt: string,
  options: { enableCaching?: boolean; maxTokens?: number } = {},
): Promise<AnthropicResult> {
  const enableCaching = options.enableCaching ?? true
  const maxTokens = options.maxTokens ?? 1024
  const url = `${baseUrl}/v1/messages`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs)

  // Cache the system block when caching is on. Reduces cost across calls
  // sharing the same system prompt within the 5-min ephemeral TTL window.
  const systemBlocks = enableCaching
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : system

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
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Anthropic request failed (${response.status}): ${body.slice(0, 200)}`)
    }

    const data = (await response.json()) as AnthropicMessageResponse
    const text = data.content?.find((item) => item.type === 'text')?.text?.trim() || ''
    if (!text) throw new Error('Anthropic returned empty content')

    return {
      text,
      tokensIn: data.usage?.input_tokens ?? 0,
      tokensOut: data.usage?.output_tokens ?? 0,
      cacheCreationTokens: data.usage?.cache_creation_input_tokens ?? 0,
      cacheReadTokens: data.usage?.cache_read_input_tokens ?? 0,
    }
  } finally {
    clearTimeout(timeout)
  }
}
