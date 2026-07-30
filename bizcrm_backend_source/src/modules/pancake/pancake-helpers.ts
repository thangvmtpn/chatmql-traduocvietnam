/**
 * pancake-helpers.ts — Shared utilities for Pancake integration.
 *
 * Centralizes HTML stripping, timestamp parsing, and attachment mapping
 * to avoid DRY violations between sync and webhook handler.
 */

// ─── HTML Stripping ──────────────────────────────────────────────────────────

/** Strip HTML tags from Pancake message content (they wrap text in <div> tags). */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')          // <br> → newline
    .replace(/<\/div>\s*<div[^>]*>/gi, '\n') // </div><div> → newline
    .replace(/<[^>]+>/g, '')                 // Strip all remaining tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

// ─── Timestamp Parsing ───────────────────────────────────────────────────────

/**
 * Parse Pancake timestamp — handles:
 *   - Unix seconds (number < 10^12, e.g. 1718700000)
 *   - Unix milliseconds (number >= 10^12, e.g. 1718700000000)
 *   - ISO/date string (e.g. "2026-06-13T07:56:29.000000")
 *   - Fallback to now
 */
export function parsePancakeTime(raw: unknown): Date {
  if (!raw) return new Date()
  if (typeof raw === 'number') {
    return new Date(raw < 1e12 ? raw * 1000 : raw)
  }
  if (typeof raw === 'string') {
    const num = Number(raw)
    if (!isNaN(num) && num > 0) {
      return new Date(num < 1e12 ? num * 1000 : num)
    }
    const d = new Date(raw)
    if (!isNaN(d.getTime())) return d
  }
  return new Date()
}

// ─── Attachment Helpers ──────────────────────────────────────────────────────

export function mapAttachmentType(attachments?: Array<{ type: string; [k: string]: unknown }>): string {
  if (!attachments || attachments.length === 0) return 'text'
  const type = attachments[0]?.type?.toLowerCase()
  switch (type) {
    case 'image': return 'image'
    case 'video': return 'video'
    case 'audio': return 'voice'
    case 'file':  return 'file'
    case 'gif':   return 'gif'
    default:      return 'text'
  }
}

export function extractAttachments(raw?: Array<{ type: string; url?: string; payload?: { url?: string }; [k: string]: unknown }>): any[] {
  if (!raw || raw.length === 0) return []
  return raw.map(a => ({
    type: a.type,
    url: a.url || a.payload?.url || null,
  })).filter(a => a.url)
}
