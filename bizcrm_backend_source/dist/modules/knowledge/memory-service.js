/**
 * memory-service.ts — ContactMemory CRUD + AI write-back (applyMemoryUpdates).
 * Thread memory = per-contact facts (L3). Global KB via kb-service.
 */
import { prisma } from '../../shared/prisma-client.js';
import { findSimilarEntry, createKbEntry } from './kb-service.js';
// Active facts limit per contact (prevent bloat)
const MAX_ACTIVE_FACTS = 30;
// ── Normalization for dedup ───────────────────────────────────────────────────
function normalize(s) {
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
// ── Queries ───────────────────────────────────────────────────────────────────
export async function listContactMemory(orgId, contactId, onlyActive = false) {
    return prisma.contactMemory.findMany({
        where: { orgId, contactId, ...(onlyActive ? { isActive: true } : {}) },
        orderBy: { createdAt: 'desc' },
    });
}
/**
 * Returns all active facts for L3 injection.
 */
export async function getThreadMemory(orgId, contactId) {
    return prisma.contactMemory.findMany({
        where: { orgId, contactId, isActive: true },
        orderBy: { createdAt: 'asc' },
    });
}
export async function getMemoryFact(orgId, id) {
    const row = await prisma.contactMemory.findFirst({ where: { id, orgId } });
    return row;
}
// ── Mutations ─────────────────────────────────────────────────────────────────
export async function updateMemoryFact(orgId, id, patch) {
    const row = await prisma.contactMemory.findFirst({ where: { id, orgId } });
    if (!row)
        return null;
    const updated = await prisma.contactMemory.update({
        where: { id },
        data: {
            ...(patch.content !== undefined ? { content: patch.content.trim() } : {}),
            ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
            ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
        },
    });
    return updated;
}
export async function deleteMemoryFact(orgId, id) {
    const row = await prisma.contactMemory.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!row)
        return false;
    await prisma.contactMemory.delete({ where: { id } });
    return true;
}
// ── Write-back ────────────────────────────────────────────────────────────────
/**
 * Applies memory updates from AI envelope:
 * - scope=thread → ContactMemory (dedup by normalized content)
 * - scope=global → KnowledgeEntry (dedup via findSimilarEntry; risk→status)
 * Does NOT block the caller — call fire-and-forget or await per design.
 */
export async function applyMemoryUpdates(orgId, convId, contactId, updates) {
    for (const u of updates) {
        try {
            if (u.scope === 'thread') {
                await applyThreadUpdate(orgId, contactId, u);
            }
            else {
                await applyGlobalUpdate(orgId, convId, u);
            }
        }
        catch (err) {
            // Non-critical — log but don't bubble up to caller
            console.error('[memory-service] applyMemoryUpdates error', { scope: u.scope, kind: u.kind, err });
        }
    }
}
async function applyThreadUpdate(orgId, contactId, u) {
    const normContent = normalize(u.content);
    // Dedup: check active facts for normalized equality
    const existing = await prisma.contactMemory.findMany({
        where: { orgId, contactId, isActive: true },
        select: { id: true, content: true },
        take: MAX_ACTIVE_FACTS + 10,
    });
    const duplicate = existing.find((e) => normalize(e.content) === normContent);
    if (duplicate)
        return; // already known
    // Enforce limit: soft cap — if over limit, skip (don't delete old facts)
    const activeCount = existing.length;
    if (activeCount >= MAX_ACTIVE_FACTS)
        return;
    await prisma.contactMemory.create({
        data: {
            orgId,
            contactId,
            kind: u.kind,
            content: u.content.trim(),
            source: 'ai_extracted',
            confidence: u.confidence ?? 0.7,
            isActive: true,
        },
    });
}
async function applyGlobalUpdate(orgId, convId, u) {
    // Dedup: check if similar content already exists in KB
    const existingId = await findSimilarEntry(orgId, u.content);
    if (existingId)
        return; // already in KB, skip
    const title = u.title ?? `[AI] ${u.kind}: ${u.content.slice(0, 60)}`;
    const type = u.type ?? u.kind;
    await createKbEntry(orgId, {
        type,
        title,
        content: u.content.trim(),
        risk: u.risk,
        source: 'ai_extracted',
        confidence: u.confidence ?? 0.5,
    }, 'ai');
}
//# sourceMappingURL=memory-service.js.map