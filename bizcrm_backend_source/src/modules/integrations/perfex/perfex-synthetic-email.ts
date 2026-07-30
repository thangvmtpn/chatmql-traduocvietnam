// Synthetic email generation for contacts with no real email.
// Perfex requires a unique email on every contact/lead. When biz-crm has none,
// we synthesize a deterministic, unique, NON-deliverable address from the contact's
// source provider + a stable token. Always paired with donotsendwelcomeemail='on'.

/** Maps raw biz-crm `source` strings to a canonical provider key. */
export function normalizeSource(src?: string | null): string {
  const s = (src ?? '').trim().toLowerCase();
  if (!s) return 'other';
  const alias: Record<string, string> = {
    zalo: 'zalo', zalo_oa: 'zalo', zalooa: 'zalo',
    facebook: 'facebook', fb: 'facebook', messenger: 'facebook',
    tiktok: 'tiktok', tt: 'tiktok',
    instagram: 'instagram', ig: 'instagram',
    telegram: 'telegram', tele: 'telegram',
    linkedin: 'linkedin',
    youtube: 'youtube', yt: 'youtube',
    twitter: 'twitter', x: 'twitter',
    viber: 'viber',
    whatsapp: 'whatsapp', wa: 'whatsapp',
    line: 'line',
    wechat: 'wechat',
    website: 'web', web: 'web',
    google: 'google', gt: 'google', 'google ads': 'google',
    'ai bot': 'ai', ai: 'ai',
    'giới thiệu': 'referral', referral: 'referral',
    manual: 'manual', system: 'system',
    khác: 'other', cn: 'other',
  };
  return alias[s] ?? 'other';
}

// Official click-to-chat / profile short-domains (web-verified, May 2026).
// Non-mailbox profile domains → safe placeholders. NO public mailbox providers
// (gmail.com etc.) which would risk hitting a stranger's inbox.
const PROVIDER_DOMAIN: Record<string, string> = {
  zalo: 'zalo.me',
  facebook: 'facebook.com',
  tiktok: 'tiktok.com',
  instagram: 'instagram.com',
  telegram: 't.me',
  linkedin: 'linkedin.com',
  youtube: 'youtube.com',
  twitter: 'x.com',
  viber: 'viber.com',
  whatsapp: 'wa.me',
  line: 'line.me',
  wechat: 'wechat.com',
  // web / google / ai / referral / manual / system / other → no safe provider → fallback domain
};

function digitsOnly(s?: string | null): string {
  return (s ?? '').replace(/\D/g, '');
}

/** Sanitize the email local part to RFC-safe chars. */
function safeLocal(s: string): string {
  return s.replace(/[^a-z0-9._-]/gi, '').replace(/^[.]+|[.]+$/g, '') || 'x';
}

export interface SyntheticEmailInput {
  id: string;
  source?: string | null;
  phone?: string | null;
  zaloUid?: string | null;
}

/**
 * Deterministic, unique, non-deliverable email.
 * token = zaloUid → phone digits → contact uuid (uuid guarantees uniqueness).
 * Provider sources use their profile domain ('{token}@zalo.me'); sources with no
 * safe provider use '{source}.{token}@{fallbackDomain}'.
 */
export function synthesizeEmail(input: SyntheticEmailInput, fallbackDomain: string): string {
  const key = normalizeSource(input.source);
  const token = input.zaloUid?.trim() || digitsOnly(input.phone) || input.id;
  const providerDomain = PROVIDER_DOMAIN[key];
  const domain = providerDomain ?? fallbackDomain;
  const local = providerDomain ? safeLocal(token) : `${key}.${safeLocal(token)}`;
  return `${local}@${domain}`.toLowerCase();
}

// Domains that are NEVER real mailbox providers → safe to treat as synthetic by domain alone.
// Profile/short-link domains only. Mailbox-capable provider domains (facebook.com, x.com,
// linkedin.com, youtube.com, instagram.com, tiktok.com, viber.com, wechat.com) are EXCLUDED
// because a real person could legitimately have an email there.
const UNAMBIGUOUS_SYNTHETIC_DOMAINS = new Set(['zalo.me', 't.me', 'wa.me', 'line.me']);

/**
 * Heuristic: was `email` produced by synthesizeEmail? Domain-only check, so it is a FALLBACK
 * signal. Phase 03 self-healing MUST prefer the authoritative `Contact.metadata.syntheticEmail`
 * flag (set when a synthetic email is generated); use this only for contacts created before the
 * flag existed. Intentionally conservative to avoid misclassifying real corporate emails.
 */
export function isSyntheticEmail(email: string | null | undefined, fallbackDomain: string): boolean {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return domain === fallbackDomain.toLowerCase() || UNAMBIGUOUS_SYNTHETIC_DOMAINS.has(domain);
}
