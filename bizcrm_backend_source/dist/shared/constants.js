/**
 * Platform, SenderType, and ContentType constants.
 *
 * All magic strings for message sender types, content types, and platform
 * identifiers are centralized here to prevent typos and ensure consistency
 * across the entire codebase.
 */
// ── Platform ────────────────────────────────────────────────────────
// Stored as Int in DB for index performance on high-volume message tables.
// Number gaps reserved for future sub-types within each platform.
export const Platform = {
    ZALO_OA: 1,
    ZALO_USER: 2,
    FACEBOOK_PAGE: 10, // native Meta Messenger Platform (official)
    INSTAGRAM: 11, // reserved
    TELEGRAM: 12, // reserved
    WEBCHAT: 20,
    PANCAKE_FB: 30, // Pancake — Facebook page
    PANCAKE_IG: 31, // Pancake — Instagram
    PANCAKE_TIKTOK: 32, // Pancake — TikTok
    PANCAKE_OTHER: 39, // Pancake — other/unknown sub-platform
};
/** Human-readable labels for each platform */
export const PlatformLabel = {
    [Platform.ZALO_OA]: 'Zalo OA',
    [Platform.ZALO_USER]: 'Zalo Cá nhân',
    [Platform.FACEBOOK_PAGE]: 'Facebook Page',
    [Platform.INSTAGRAM]: 'Instagram',
    [Platform.TELEGRAM]: 'Telegram',
    [Platform.WEBCHAT]: 'Webchat',
    [Platform.PANCAKE_FB]: 'Pancake (Facebook)',
    [Platform.PANCAKE_IG]: 'Pancake (Instagram)',
    [Platform.PANCAKE_TIKTOK]: 'Pancake (TikTok)',
    [Platform.PANCAKE_OTHER]: 'Pancake',
};
/** Check if a platform ID belongs to the Pancake family */
export function isPancakePlatform(platform) {
    return platform >= 30 && platform <= 39;
}
/** Check if a platform ID is the native (official) Facebook Page channel */
export function isFacebookPage(platform) {
    return platform === Platform.FACEBOOK_PAGE;
}
/** Map Pancake's platform string to our PlatformId */
export function pancakePlatformToId(pancakePlatform) {
    switch (pancakePlatform) {
        case 'facebook': return Platform.PANCAKE_FB;
        case 'instagram_official': return Platform.PANCAKE_IG;
        case 'tiktok': return Platform.PANCAKE_TIKTOK;
        default: return Platform.PANCAKE_OTHER;
    }
}
// ── Sender Type ─────────────────────────────────────────────────────
// Who sent the message — determines bubble alignment in chat UI.
export const SenderType = {
    SELF: 'self', // CRM staff or OA reply → right side
    CONTACT: 'contact', // Customer / end-user   → left side
    SYSTEM: 'system', // Platform events        → centered
};
// ── Response Source ─────────────────────────────────────────────────
// Who produced an outbound reply (Message.responseSource). null = none
// (e.g. automation/system send or legacy). Shown as a badge in the chat UI.
export const ResponseSource = {
    MANUAL: 'manual', // a staff member typed & sent it
    AI_AUTO: 'ai_auto', // AI sent it automatically (auto mode)
    AI_SUGGEST: 'ai_suggest', // AI drafted it; staff approved & sent (suggest mode)
};
// ── Content Type ────────────────────────────────────────────────────
// What the message contains — determines rendering in MessageBubble.
export const ContentType = {
    TEXT: 'text',
    IMAGE: 'image',
    FILE: 'file',
    STICKER: 'sticker',
    VOICE: 'voice',
    VIDEO: 'video',
    GIF: 'gif',
    LINK: 'link',
    LOCATION: 'location',
    CONTACT_CARD: 'contact_card',
    CALL: 'call',
    POLL: 'poll',
    NOTE: 'note',
    REMINDER: 'reminder',
    FORWARDED: 'forwarded',
    RICH: 'rich',
    QR_CODE: 'qr_code',
    BANK_TRANSFER: 'bank_transfer',
    ZNS_TEMPLATE: 'zns_template',
    GROUP_EVENT: 'group_event',
    SYSTEM_EVENT: 'system_event',
};
// ── Actor Kind ──────────────────────────────────────────────────────
// Derived (NOT stored) classification of a conversation item by its role —
// "who/what produced it". Single source of truth for chat UI grouping &
// filtering: khách / hệ thống / trợ lý (AI | nhân viên) / ZNS.
export const ActorKind = {
    CONTACT: 'contact', // khách / end-user
    SYSTEM: 'system', // sự kiện hệ thống
    AI: 'ai', // trợ lý AI
    STAFF: 'staff', // nhân viên
    ZNS: 'zns', // ZNS template
};
/**
 * Derive the actor kind of a message from its sender/content signals.
 * Order matters: a ZNS template is sent with senderType='self', so it MUST be
 * checked before the staff/AI branch or it would be mislabeled as staff.
 */
export function deriveActorKind(m) {
    if (m.contentType === ContentType.ZNS_TEMPLATE)
        return ActorKind.ZNS;
    if (m.senderType === SenderType.CONTACT)
        return ActorKind.CONTACT;
    if (m.senderType === SenderType.SYSTEM ||
        m.contentType === ContentType.SYSTEM_EVENT ||
        m.contentType === ContentType.GROUP_EVENT) {
        return ActorKind.SYSTEM;
    }
    if (m.aiGenerated ||
        m.responseSource === ResponseSource.AI_AUTO ||
        m.responseSource === ResponseSource.AI_SUGGEST) {
        return ActorKind.AI;
    }
    return ActorKind.STAFF; // senderType='self', manual reply
}
//# sourceMappingURL=constants.js.map