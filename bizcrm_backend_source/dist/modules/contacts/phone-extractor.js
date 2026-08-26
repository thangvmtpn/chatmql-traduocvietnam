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
 * Valid VN mobile prefixes after the leading 0 or 84:
 * 3x (Viettel), 5x (Vinaphone), 7x (Mobifone), 8x (Vinaphone), 9x (Viettel/Mobi)
 */
const VN_PHONE_REGEX_LOCAL = /(?:^|[^\d])(0[35789]\d{8})(?:[^\d]|$)/;
const VN_PHONE_REGEX_INTL = /(?:^|[^\d])(84[35789]\d{8})(?:[^\d]|$)/;
// Also catch numbers with dots/spaces/dashes as separators: "0912 649 954", "0912.649.954"
const VN_PHONE_REGEX_SEPARATED = /(?:^|[^\d])(0[35789]\d[\s.\-]?\d{3}[\s.\-]?\d{4})(?:[^\d]|$)/;
/**
 * Extract a Vietnamese phone number from a display name string.
 * Returns the raw matched phone (with separators stripped) or null.
 *
 * Only extracts if the phone is >= 10 digits after normalization.
 * Prefers the first match found.
 */
export function extractPhoneFromName(name) {
    if (!name)
        return null;
    // Try strict 10-digit local format first (most reliable)
    let match = name.match(VN_PHONE_REGEX_LOCAL);
    if (match)
        return match[1];
    // Try international 84xxx format
    match = name.match(VN_PHONE_REGEX_INTL);
    if (match)
        return match[1];
    // Try separated format (spaces/dots/dashes)
    match = name.match(VN_PHONE_REGEX_SEPARATED);
    if (match) {
        const cleaned = match[1].replace(/[\s.\-]/g, '');
        if (cleaned.length === 10 && /^0[35789]/.test(cleaned))
            return cleaned;
    }
    return null;
}
//# sourceMappingURL=phone-extractor.js.map