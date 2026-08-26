import { prisma } from '../../../shared/prisma-client.js';
import { logger } from '../../../shared/logger.js';
// ── Constants ──────────────────────────────────────────────────────────────────
// 64 KB hard cap on JSON payload. Prompts (system+user) and raw model output are
// intentionally stored for debugging, so the cap is generous; retention purge keeps
// long-term growth bounded. Only owner/admin can read traces.
const PAYLOAD_MAX_BYTES = 65_536;
// When truncation IS needed, keep this many chars per oversized field so the
// prompt/output stays mostly readable (vs the old 500-char floor that nuked it).
const TRUNCATE_FIELD_CHARS = 8_000;
const DEFAULT_RETENTION_INFO_DAYS = 14;
const DEFAULT_RETENTION_ERROR_DAYS = 90;
// Cache AiConfig retention values per org (in-process, 5-min TTL)
const configCache = new Map();
const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
// ── PII redaction ──────────────────────────────────────────────────────────────
// VN phone shapes only (avoid nuking Zalo UIDs / order ids / timestamps):
//   0xxxxxxxxx (10 digits), +84xxxxxxxxx, 84xxxxxxxxx — optional spaces/dots/dashes
const PHONE_REGEX = /(?:\+?84|0)(?:[\s.\-]?\d){9}\b/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
function redactString(value) {
    return value
        .replace(PHONE_REGEX, '[PHONE]')
        .replace(EMAIL_REGEX, '[EMAIL]');
}
function redactValue(value, depth = 0) {
    if (depth > 6)
        return value; // prevent deep recursion on malformed payloads
    if (typeof value === 'string')
        return redactString(value);
    if (Array.isArray(value))
        return value.map(v => redactValue(v, depth + 1));
    if (value !== null && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = redactValue(v, depth + 1);
        }
        return out;
    }
    return value;
}
// ── Payload size cap ───────────────────────────────────────────────────────────
function capPayload(payload) {
    const raw = JSON.stringify(payload);
    if (raw.length <= PAYLOAD_MAX_BYTES)
        return payload;
    // Truncate the largest string fields until we're under the limit.
    // Includes the snake_case fields the harness records (system_prompt/user_prompt/raw_output).
    const capped = { ...payload };
    const TRUNCATE_FIELDS = [
        'system_prompt', 'user_prompt', 'raw_output',
        'prompt', 'rawOutput', 'systemPrompt', 'context', 'content', 'text',
    ];
    for (const field of TRUNCATE_FIELDS) {
        const v = capped[field];
        if (typeof v === 'string' && v.length > TRUNCATE_FIELD_CHARS) {
            capped[field] = v.slice(0, TRUNCATE_FIELD_CHARS) + '…[truncated]';
            if (JSON.stringify(capped).length <= PAYLOAD_MAX_BYTES)
                break;
        }
    }
    // Last resort: stringify then slice
    const final = JSON.stringify(capped);
    if (final.length > PAYLOAD_MAX_BYTES) {
        capped['_truncated'] = true;
        return { _truncated: true, _partial: final.slice(0, PAYLOAD_MAX_BYTES - 30) };
    }
    return capped;
}
// ── Retention config helper ────────────────────────────────────────────────────
async function getRetentionDays(orgId) {
    const cached = configCache.get(orgId);
    if (cached && Date.now() - cached.ts < CONFIG_CACHE_TTL_MS) {
        return { info: cached.info, error: cached.error };
    }
    try {
        const cfg = await prisma.aiConfig.findUnique({
            where: { orgId },
            select: { traceRetentionDays: true, traceErrorRetentionDays: true },
        });
        const info = cfg?.traceRetentionDays ?? DEFAULT_RETENTION_INFO_DAYS;
        const error = cfg?.traceErrorRetentionDays ?? DEFAULT_RETENTION_ERROR_DAYS;
        configCache.set(orgId, { info, error, ts: Date.now() });
        return { info, error };
    }
    catch {
        return { info: DEFAULT_RETENTION_INFO_DAYS, error: DEFAULT_RETENTION_ERROR_DAYS };
    }
}
/**
 * Record a single harness step as AiTrace. Fire-and-forget — never throws.
 * Caller MUST NOT await this (or must catch errors themselves if they do).
 */
export function recordStep(input) {
    // Intentionally NOT awaited — fire-and-forget
    _persistStep(input).catch(err => {
        logger.warn({ err, step: input.step, orgId: input.orgId }, '[trace-recorder] failed to persist trace step');
    });
}
async function _persistStep(input) {
    const level = input.level ?? 'info';
    const retention = await getRetentionDays(input.orgId);
    const retentionDays = level === 'error' ? retention.error : retention.info;
    const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
    // Redact PII then cap size
    const redacted = redactValue(input.payload);
    const safePayload = capPayload(redacted);
    await prisma.aiTrace.create({
        data: {
            orgId: input.orgId,
            conversationId: input.conversationId ?? null,
            aiReplyRunId: input.aiReplyRunId ?? null,
            step: input.step,
            level,
            payload: safePayload,
            latencyMs: input.latencyMs ?? null,
            expiresAt,
        },
    });
}
//# sourceMappingURL=trace-recorder.js.map