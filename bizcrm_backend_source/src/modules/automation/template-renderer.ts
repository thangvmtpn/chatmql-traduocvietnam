/**
 * template-renderer.ts — D6.5
 * Single source of truth for {{var}} substitution in MessageTemplate bodies.
 * Used by automation-engine (send_template action) and the /preview endpoint.
 *
 * Supported variable namespaces:
 *   {{contact.name}} | {{contact.fullName}} | {{contact.crmName}}
 *   {{contact.phone}} | {{contact.email}}
 *   {{contact.lifecycleStage}} | {{contact.source}}
 *   {{contact.status}}                     ← deprecated alias for lifecycleStage
 *   {{contact.firstName}}                  ← derived from fullName/crmName
 *   {{org.name}}
 *   {{user.name}} | {{user.email}}
 *   {{name}}                               ← legacy alias for contact.firstName
 *   {{company}}                            ← legacy alias for org.name
 *   {{date}} | {{time}} | {{datetime}}     ← rendered in vi-VN locale
 *
 * Unknown placeholders are left intact so authors can spot typos.
 */

export interface TemplateRenderContext {
  contact?: {
    fullName?: string | null
    crmName?: string | null
    phone?: string | null
    email?: string | null
    lifecycleStage?: string | null
    source?: string | null
  } | null
  org?: { name?: string | null } | null
  user?: { fullName?: string | null; email?: string | null } | null
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g

function firstName(value: string | null | undefined): string {
  if (!value) return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  const parts = trimmed.split(/\s+/)
  // Vietnamese names: last token is typically the given name
  return parts[parts.length - 1] ?? trimmed
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('vi-VN')
}
function formatTime(d: Date): string {
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}
function formatDateTime(d: Date): string {
  return `${formatDate(d)} ${formatTime(d)}`
}

function lookup(key: string, ctx: TemplateRenderContext): string | undefined {
  const now = new Date()

  // Special tokens
  if (key === 'date') return formatDate(now)
  if (key === 'time') return formatTime(now)
  if (key === 'datetime') return formatDateTime(now)

  // Legacy aliases used by older templates
  if (key === 'name') {
    const fn = ctx.contact?.crmName || ctx.contact?.fullName
    return firstName(fn) || undefined
  }
  if (key === 'company') return ctx.org?.name ?? undefined

  // Namespaced lookups
  const [ns, field] = key.split('.')
  if (!field) return undefined

  if (ns === 'contact' && ctx.contact) {
    const c = ctx.contact
    switch (field) {
      case 'name':
      case 'fullName':
        return c.fullName ?? c.crmName ?? undefined
      case 'crmName':
        return c.crmName ?? undefined
      case 'firstName':
        return firstName(c.crmName || c.fullName) || undefined
      case 'phone':
        return c.phone ?? undefined
      case 'email':
        return c.email ?? undefined
      case 'lifecycleStage':
        return c.lifecycleStage ?? undefined
      case 'status':
        // Deprecated alias — kept for back-compat with templates authored before the
        // status → lifecycleStage consolidation (2026-05-15). Remove after one release.
        return c.lifecycleStage ?? undefined
      case 'source':
        return c.source ?? undefined
    }
  }

  if (ns === 'org' && ctx.org) {
    if (field === 'name') return ctx.org.name ?? undefined
  }

  if (ns === 'user' && ctx.user) {
    if (field === 'name' || field === 'fullName') return ctx.user.fullName ?? undefined
    if (field === 'email') return ctx.user.email ?? undefined
  }

  return undefined
}

export function renderTemplate(body: string, ctx: TemplateRenderContext): string {
  return body.replace(PLACEHOLDER_RE, (match, key: string) => {
    const value = lookup(key, ctx)
    return value !== undefined && value !== null ? String(value) : match
  })
}

/**
 * Sample context used by the /preview endpoint when no real contact/user
 * is provided. Lets template authors see realistic output.
 */
export const SAMPLE_PREVIEW_CONTEXT: TemplateRenderContext = {
  contact: {
    fullName: 'Nguyễn Văn An',
    crmName: 'An (VIP)',
    phone: '0901 234 567',
    email: 'an@example.com',
    lifecycleStage: 'qualified',
    source: 'zalo',
  },
  org: { name: 'Cửa hàng demo' },
  user: { fullName: 'Sale Trần Bình', email: 'sale@example.com' },
}
