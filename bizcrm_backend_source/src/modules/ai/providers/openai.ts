/**
 * OpenAI Chat Completions provider.
 * Supports json_object response_format for structured outputs.
 */
import { config } from '../../../config/index.js'

/**
 * Newer OpenAI models (o-series reasoning: o1/o3/o4…, and the gpt-5 family)
 * reject `max_tokens` and require `max_completion_tokens`. Older models
 * (gpt-4.1, gpt-4o, …) use `max_tokens`. Pick the right key per model so the
 * harness can run both generations.
 */
function tokenLimitParam(model: string, maxTokens: number): Record<string, number> {
  const m = model.toLowerCase()
  const needsCompletionTokens = /^o\d/.test(m) || m.startsWith('gpt-5')
  return needsCompletionTokens ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }
}

export type OpenaiResult = {
  text: string
  tokensIn: number
  tokensOut: number
}

type OpenaiResponse = {
  choices?: Array<{ message?: { content?: string } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
}

export async function generateWithOpenai(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  userPrompt: string,
  options: { jsonMode?: boolean; maxTokens?: number } = {},
): Promise<OpenaiResult> {
  const maxTokens = options.maxTokens ?? 1024
  const url = `${baseUrl}/v1/chat/completions`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs)

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
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`OpenAI request failed (${response.status}): ${body.slice(0, 200)}`)
    }

    const data = (await response.json()) as OpenaiResponse
    const text = data.choices?.[0]?.message?.content?.trim() || ''
    if (!text) throw new Error('OpenAI returned empty content')

    return {
      text,
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
    }
  } finally {
    clearTimeout(timeout)
  }
}

// ── Tool-calling (function-calling) step ────────────────────────────────────────
// One round-trip of the agentic loop: send the running message list (+ tool schemas);
// the model either returns final text OR a set of tool_calls to execute.

export type OpenaiMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenaiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export type OpenaiToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }

export type OpenaiToolDef = {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export type OpenaiToolStep = {
  content: string | null
  toolCalls: Array<{ id: string; name: string; arguments: string }>
  tokensIn: number
  tokensOut: number
  finishReason: string | null
}

type OpenaiToolResponse = {
  choices?: Array<{ finish_reason?: string; message?: { content?: string | null; tool_calls?: OpenaiToolCall[] } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export async function generateWithOpenaiMessages(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: OpenaiMessage[],
  tools: OpenaiToolDef[] | undefined,
  options: { maxTokens?: number; toolChoice?: 'auto' | 'required' } = {},
): Promise<OpenaiToolStep> {
  const maxTokens = options.maxTokens ?? 1024
  const url = `${baseUrl}/v1/chat/completions`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.aiTimeoutMs)

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
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`OpenAI tool request failed (${response.status}): ${body.slice(0, 200)}`)
    }

    const data = (await response.json()) as OpenaiToolResponse
    const choice = data.choices?.[0]
    const msg = choice?.message
    const toolCalls = (msg?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function?.name ?? '',
      arguments: tc.function?.arguments ?? '{}',
    }))
    return {
      content: msg?.content ?? null,
      toolCalls,
      tokensIn: data.usage?.prompt_tokens ?? 0,
      tokensOut: data.usage?.completion_tokens ?? 0,
      finishReason: choice?.finish_reason ?? null,
    }
  } finally {
    clearTimeout(timeout)
  }
}
