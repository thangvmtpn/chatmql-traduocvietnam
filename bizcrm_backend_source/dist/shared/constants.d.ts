/**
 * Platform, SenderType, and ContentType constants.
 *
 * All magic strings for message sender types, content types, and platform
 * identifiers are centralized here to prevent typos and ensure consistency
 * across the entire codebase.
 */
export declare const Platform: {
    readonly ZALO_OA: 1;
    readonly ZALO_USER: 2;
    readonly FACEBOOK_PAGE: 10;
    readonly INSTAGRAM: 11;
    readonly TELEGRAM: 12;
    readonly WEBCHAT: 20;
    readonly PANCAKE_FB: 30;
    readonly PANCAKE_IG: 31;
    readonly PANCAKE_TIKTOK: 32;
    readonly PANCAKE_OTHER: 39;
    readonly TIKTOK_SHOP: 40;
};
export type PlatformId = (typeof Platform)[keyof typeof Platform];
/** Human-readable labels for each platform */
export declare const PlatformLabel: Record<number, string>;
/** Check if a platform ID belongs to the Pancake family */
export declare function isPancakePlatform(platform: number): boolean;
/** Check if a platform ID is the native (official) Facebook Page channel */
export declare function isFacebookPage(platform: number): boolean;
/** Check if a platform ID is the native (official) TikTok Shop channel */
export declare function isTikTokShop(platform: number): boolean;
/** Map Pancake's platform string to our PlatformId */
export declare function pancakePlatformToId(pancakePlatform: string): number;
export declare const SenderType: {
    readonly SELF: "self";
    readonly CONTACT: "contact";
    readonly SYSTEM: "system";
};
export type SenderTypeValue = (typeof SenderType)[keyof typeof SenderType];
export declare const ResponseSource: {
    readonly MANUAL: "manual";
    readonly AI_AUTO: "ai_auto";
    readonly AI_SUGGEST: "ai_suggest";
};
export type ResponseSourceValue = (typeof ResponseSource)[keyof typeof ResponseSource];
export declare const ContentType: {
    readonly TEXT: "text";
    readonly IMAGE: "image";
    readonly FILE: "file";
    readonly STICKER: "sticker";
    readonly VOICE: "voice";
    readonly VIDEO: "video";
    readonly GIF: "gif";
    readonly LINK: "link";
    readonly LOCATION: "location";
    readonly CONTACT_CARD: "contact_card";
    readonly CALL: "call";
    readonly POLL: "poll";
    readonly NOTE: "note";
    readonly REMINDER: "reminder";
    readonly FORWARDED: "forwarded";
    readonly RICH: "rich";
    readonly QR_CODE: "qr_code";
    readonly BANK_TRANSFER: "bank_transfer";
    readonly ZNS_TEMPLATE: "zns_template";
    readonly GROUP_EVENT: "group_event";
    readonly SYSTEM_EVENT: "system_event";
};
export type ContentTypeValue = (typeof ContentType)[keyof typeof ContentType];
export declare const ActorKind: {
    readonly CONTACT: "contact";
    readonly SYSTEM: "system";
    readonly AI: "ai";
    readonly STAFF: "staff";
    readonly ZNS: "zns";
};
export type ActorKindValue = (typeof ActorKind)[keyof typeof ActorKind];
/**
 * Derive the actor kind of a message from its sender/content signals.
 * Order matters: a ZNS template is sent with senderType='self', so it MUST be
 * checked before the staff/AI branch or it would be mislabeled as staff.
 */
export declare function deriveActorKind(m: {
    senderType?: string | null;
    contentType?: string | null;
    aiGenerated?: boolean | null;
    responseSource?: string | null;
}): ActorKindValue;
