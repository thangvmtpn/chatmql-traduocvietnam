/**
 * phone-extractor.ts — Extract Vietnamese phone numbers from contact names.
 *
 * Many Zalo users embed their phone number in their display name, e.g.:
 *   "Anh Thảo An Giang - 0912649954"
 *   "Anh Tuân Bình Phước 0987501506"
 *   "Anh Dũng HN 0986293893"
 *
 * This module provides a regex-based extractor that catches:
 *   - 10-digit VN mobile: 0[35789]xxxxxxxx
 *   - International format: 84[35789]xxxxxxxx
 *   - With optional separators: spaces, dots, dashes
 *
 * It does NOT clean/modify the name — only extracts the phone part.
 */
/**
 * Extract a Vietnamese phone number from a display name string.
 * Returns the raw matched phone (with separators stripped) or null.
 *
 * Only extracts if the phone is >= 10 digits after normalization.
 * Prefers the first match found.
 */
export declare function extractPhoneFromName(name: string | null | undefined): string | null;
