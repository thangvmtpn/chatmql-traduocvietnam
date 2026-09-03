/**
 * pancake-helpers.ts — Shared utilities for Pancake integration.
 *
 * Centralizes HTML stripping, timestamp parsing, and attachment mapping
 * to avoid DRY violations between sync and webhook handler.
 */
/** Strip HTML tags from Pancake message content (they wrap text in <div> tags). */
export declare function stripHtml(html: string): string;
/**
 * Parse Pancake timestamp — handles:
 *   - Unix seconds (number < 10^12, e.g. 1718700000)
 *   - Unix milliseconds (number >= 10^12, e.g. 1718700000000)
 *   - ISO/date string (e.g. "2026-06-13T07:56:29.000000")
 *   - Fallback to now
 */
export declare function parsePancakeTime(raw: unknown): Date;
export declare function mapAttachmentType(attachments?: Array<{
    type: string;
    [k: string]: unknown;
}>): string;
export declare function extractAttachments(raw?: Array<{
    type: string;
    url?: string;
    payload?: {
        url?: string;
    };
    [k: string]: unknown;
}>): any[];
export declare function serializePancakeNotes(raw: unknown): string | null;
