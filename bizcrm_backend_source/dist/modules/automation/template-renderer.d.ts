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
        fullName?: string | null;
        crmName?: string | null;
        phone?: string | null;
        email?: string | null;
        lifecycleStage?: string | null;
        source?: string | null;
    } | null;
    org?: {
        name?: string | null;
    } | null;
    user?: {
        fullName?: string | null;
        email?: string | null;
    } | null;
}
export declare function renderTemplate(body: string, ctx: TemplateRenderContext): string;
/**
 * Sample context used by the /preview endpoint when no real contact/user
 * is provided. Lets template authors see realistic output.
 */
export declare const SAMPLE_PREVIEW_CONTEXT: TemplateRenderContext;
