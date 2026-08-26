/**
 * slug.ts — Vietnamese-aware slugify + per-org unique slug helper.
 */
import { prisma } from '../../shared/prisma-client.js';
export function slugify(input) {
    const s = (input || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // strip diacritics
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'd')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return s || 'item';
}
/** Generate a slug unique within the org for the given model (appends -2, -3…). */
export async function uniqueSlug(orgId, name, model, excludeId) {
    const base = slugify(name);
    let candidate = base;
    let n = 1;
    // Bounded loop — practically resolves in 1-2 iterations.
    for (let i = 0; i < 50; i++) {
        const where = { orgId, slug: candidate };
        if (excludeId)
            where.id = { not: excludeId };
        const existing = await prisma[model].findFirst({ where, select: { id: true } });
        if (!existing)
            return candidate;
        n += 1;
        candidate = `${base}-${n}`;
    }
    return `${base}-${Date.now()}`;
}
//# sourceMappingURL=slug.js.map