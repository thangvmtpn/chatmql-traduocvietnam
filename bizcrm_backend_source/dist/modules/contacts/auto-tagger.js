import { prisma } from '../../shared/prisma-client.js';
/**
 * auto-tagger.ts — Computes auto-tags for a contact based on its lead score
 * and activity. Preserves user-defined tags; replaces the auto-tag set on
 * every run so a contact that just dropped to cold-lead loses its old
 * hot-lead tag automatically.
 *
 * Ported from references/zalocrm/backend/src/modules/contacts/auto-tagger.ts.
 *
 * Auto-tag rules:
 *   score ≥ 70 → 'hot-lead'
 *   score ≥ 40 → 'warm-lead'
 *   else       → 'cold-lead'
 *
 *   lastActivity > 30d → 'inactive-30d'
 *   lastActivity > 14d → 'inactive-14d' (mutually exclusive with -30d)
 *
 *   future scheduled appointment → 'has-appointment'
 */
const AUTO_TAGS = [
    'hot-lead',
    'warm-lead',
    'cold-lead',
    'inactive-14d',
    'inactive-30d',
    'has-appointment',
];
export async function applyAutoTags(contactId, score, lastActivity) {
    const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { tags: true },
    });
    const raw = contact?.tags;
    const existingTags = Array.isArray(raw) ? raw : [];
    // Keep user-defined tags; auto-tags get rebuilt from scratch every run.
    const userTags = existingTags.filter((t) => !AUTO_TAGS.includes(t));
    const newAutoTags = [];
    if (score >= 70)
        newAutoTags.push('hot-lead');
    else if (score >= 40)
        newAutoTags.push('warm-lead');
    else
        newAutoTags.push('cold-lead');
    if (lastActivity) {
        const daysSince = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 30)
            newAutoTags.push('inactive-30d');
        else if (daysSince > 14)
            newAutoTags.push('inactive-14d');
    }
    const futureApt = await prisma.appointment.findFirst({
        where: {
            contactId,
            status: 'scheduled',
            appointmentDate: { gte: new Date() },
        },
        select: { id: true },
    });
    if (futureApt)
        newAutoTags.push('has-appointment');
    return [...new Set([...userTags, ...newAutoTags])];
}
//# sourceMappingURL=auto-tagger.js.map