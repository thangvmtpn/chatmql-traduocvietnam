/**
 * One-shot migration: copy Contact.metadata.aiInsights → new ai* columns.
 *
 * Safe to run multiple times (idempotent — skips contacts that already have
 * aiAnalyzedAt populated). Run via: npx tsx prisma/migrate-ai-insights.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface AiInsights {
  summary?: string
  sentimentLabel?: string
  sentimentConfidence?: number
  intent?: string
  score?: number
  signalTypes?: string[]
  painPoints?: string[]
  competitors?: string[]
  analyzedAt?: string
  conversationId?: string
}

async function main() {
  const BATCH = 500
  let migrated = 0
  let skipped = 0
  let offset = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const contacts = await prisma.contact.findMany({
      where: { aiAnalyzedAt: null },
      select: { id: true, metadata: true },
      take: BATCH,
      skip: offset,
    })
    if (contacts.length === 0) break

    for (const contact of contacts) {
      const meta = contact.metadata as Record<string, unknown> | null
      if (!meta || typeof meta !== 'object') { skipped++; continue }
      const ai = meta.aiInsights as AiInsights | undefined
      if (!ai || !ai.analyzedAt) { skipped++; continue }

      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          aiSummary: ai.summary ?? null,
          aiSentimentLabel: ai.sentimentLabel ?? null,
          aiSentimentConfidence: ai.sentimentConfidence ?? null,
          aiIntent: ai.intent ?? null,
          leadScore: ai.score ?? 0,
          aiPainPoints: ai.painPoints ?? [],
          aiCompetitors: ai.competitors ?? [],
          aiSignals: (ai.signalTypes ?? []).map((t) => ({ type: t })),
          aiAnalyzedAt: new Date(ai.analyzedAt),
          aiConversationId: ai.conversationId ?? null,
        },
      })
      migrated++
    }

    if (contacts.length < BATCH) break
    offset += BATCH
  }

  console.log(`✅ Migration complete: ${migrated} migrated, ${skipped} skipped`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
