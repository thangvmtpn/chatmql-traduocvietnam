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
export function extractAvatarHash(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null

  // Match a 32-character hex string in the URL path (before file extension)
  // Pattern: /[0-9a-f]{32}\.(?:jpg|jpeg|png|webp)/
  const match = avatarUrl.match(/\/([0-9a-f]{32})\.\w+/i)
  if (match) return match[1].toLowerCase()

  // Fallback: just find any 32-char hex sequence in the URL
  const fallback = avatarUrl.match(/([0-9a-f]{32})/i)
  if (fallback) return fallback[1].toLowerCase()

  return null
}

/**
 * Detect the avatar source platform based on URL pattern.
 */
export function detectAvatarPlatform(avatarUrl: string | null | undefined): 'zalo_oa' | 'zalo_personal' | 'unknown' {
  if (!avatarUrl) return 'unknown'

  // Zalo OA: s120-ava-talk.zadn.vn (no number after s120-)
  if (/s\d+-ava-talk\.zadn\.vn/.test(avatarUrl) && !/s\d+-\d+-ava-talk/.test(avatarUrl)) {
    return 'zalo_oa'
  }

  // Zalo personal: s120-26-ava-talk.zadn.vn (has number-number pattern)
  if (/s\d+-\d+-ava-talk\.zadn\.vn/.test(avatarUrl)) {
    return 'zalo_personal'
  }

  return 'unknown'
}

/**
 * Groups contacts by their avatar hash, returning groups of 2+ contacts
 * that share the same avatar hash (potential duplicates).
 */
export function groupByAvatarHash<T extends { id: string; avatarUrl?: string | null }>(
  contacts: T[],
): Map<string, T[]> {
  const hashMap = new Map<string, T[]>()

  for (const contact of contacts) {
    const hash = extractAvatarHash(contact.avatarUrl)
    if (!hash) continue

    const existing = hashMap.get(hash)
    if (existing) {
      existing.push(contact)
    } else {
      hashMap.set(hash, [contact])
    }
  }

  // Remove groups with only 1 member (no duplicates)
  for (const [hash, group] of hashMap) {
    if (group.length < 2) hashMap.delete(hash)
  }

  return hashMap
}
