/**
 * pre-filter.ts — Pass 0: cheap keyword/regex guard before any LLM call.
 *
 * Reads AiConfig.prefilterKeywords (comma-separated keywords/simple regex).
 * If any keyword matches the turn text → trigger handoff immediately.
 * No LLM involved — designed to be sub-millisecond.
 */
import { getAiReplyConfig } from '../ai-config-service.js'

export interface PreFilterResult {
  handoff: boolean
  reason?: string
}

/**
 * Builds a combined regex from comma-separated keyword/pattern list.
 * Each token is treated as a literal keyword (case-insensitive) or
 * a regex if wrapped in / /. Invalid patterns are skipped.
 */
function buildPatterns(raw: string): RegExp[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((token) => {
      // If wrapped in slashes, treat as regex
      const regexMatch = token.match(/^\/(.+)\/([gimsuy]*)$/)
      if (regexMatch) {
        try {
          return new RegExp(regexMatch[1], regexMatch[2] || 'i')
        } catch {
          return null
        }
      }
      // Literal keyword — escape for regex
      return new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    })
    .filter((r): r is RegExp => r !== null)
}

export async function runPreFilter(
  orgId: string,
  turnText: string,
): Promise<PreFilterResult> {
  const cfg = await getAiReplyConfig(orgId)
  const keywords = cfg.prefilterKeywords?.trim()
  if (!keywords) return { handoff: false }

  const patterns = buildPatterns(keywords)
  for (const pattern of patterns) {
    if (pattern.test(turnText)) {
      return {
        handoff: true,
        reason: `Pre-filter matched pattern: ${pattern.source}`,
      }
    }
  }

  return { handoff: false }
}
