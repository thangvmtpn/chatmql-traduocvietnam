/**
 * avatar-hash.ts — Extract a stable identity hash from Zalo avatar URLs.
 *
 * Zalo avatar URLs for the SAME person share a common hash/filename across
 * different CDN variants:
 *
 *   Zalo OA:       https://s120-ava-talk.zadn.vn/1/a/6/6/5/120/386c16ac345f69ad2f64ffaa013e7db6.jpg
 *   Zalo Personal:  https://s120-26-ava-talk.zadn.vn/5/386c16ac345f69ad2f64ffaa013e7db6.jpg?key=...
 *
 * Both contain the same hash "386c16ac345f69ad2f64ffaa013e7db6". By extracting
 * this hash, we can detect that an OA follower contact and a personal chat
 * contact are the same person → suggest merging.
 *
 * IMPORTANT: This utility is internal; the UI should never expose the detection
 * method to end-users.
 */
/**
 * Extracts the avatar identity hash from a Zalo avatar URL.
 * Returns null if the URL doesn't match any known Zalo avatar pattern.
 *
 * The hash is a 32-char hex string (MD5) that's embedded in the URL path.
 */
export declare function extractAvatarHash(avatarUrl: string | null | undefined): string | null;
/**
 * Detect the avatar source platform based on URL pattern.
 */
export declare function detectAvatarPlatform(avatarUrl: string | null | undefined): 'zalo_oa' | 'zalo_personal' | 'unknown';
/**
 * Groups contacts by their avatar hash, returning groups of 2+ contacts
 * that share the same avatar hash (potential duplicates).
 */
export declare function groupByAvatarHash<T extends {
    id: string;
    avatarUrl?: string | null;
}>(contacts: T[]): Map<string, T[]>;
