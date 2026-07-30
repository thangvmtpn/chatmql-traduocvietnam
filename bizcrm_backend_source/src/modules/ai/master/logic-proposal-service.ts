/**
 * logic-proposal-service.ts — List and apply AI logic proposals.
 * Proposals are created by the AI Master agent (master-agent.ts) and must
 * be confirmed by a human before being applied. NEVER auto-applied.
 *
 * Apply flow per targetType:
 *   logic_doc          → upsertLogicDoc (versioned, changedBy='ai_master')
 *   knowledge_entry    → create/update KB entry (createKbEntry/updateKbEntry); title from
 *                        the content's first heading; risk='sensitive' for price/policy subtypes
 *   thread_memory      → NOT supported (no contact target) — throws
 *   prompt_version     → NOT supported (deferred) — throws
 */
import { prisma } from '../../../shared/prisma-client.js'
import { logger } from '../../../shared/logger.js'
import { upsertLogicDoc, isValidDocType } from '../logic-doc-service.js'
import { createKbEntry, updateKbEntry, deleteKbEntry } from '../../knowledge/kb-service.js'
import { createProduct, updateProduct, deleteProduct } from '../../products/product-service.js'
import { createScenario, updateScenario, deleteScenario } from '../scenario-service.js'
import { updateFeedbackStatus } from '../feedback-service.js'
import { applyToolsPatch } from '../tools-config-service.js'

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied'
export type ProposalTargetType = 'logic_doc' | 'knowledge_entry' | 'thread_memory' | 'prompt_version' | 'product' | 'guardrail' | 'scenario' | 'retrieval_tuning'

const VALID_STATUSES: ProposalStatus[] = ['pending', 'approved', 'rejected', 'applied']
const VALID_TARGET_TYPES: ProposalTargetType[] = [
  'logic_doc',
  'knowledge_entry',
  'thread_memory',
  'prompt_version',
  'product',
  'guardrail',
  'scenario',
  'retrieval_tuning',
]

export interface AiLogicProposalRow {
  id: string
  orgId: string
  feedbackId: string | null
  masterSessionId: string | null
  source: string
  targetType: string
  targetSubtype: string | null
  targetId: string | null
  currentValue: string | null
  proposedValue: string
  rationale: string
  status: string
  createdByAi: boolean
  reviewedBy: string | null
  appliedRef: string | null
  createdAt: Date
}

const PROPOSAL_SELECT = {
  id: true,
  orgId: true,
  feedbackId: true,
  masterSessionId: true,
  source: true,
  targetType: true,
  targetSubtype: true,
  targetId: true,
  currentValue: true,
  proposedValue: true,
  rationale: true,
  status: true,
  createdByAi: true,
  reviewedBy: true,
  appliedRef: true,
  createdAt: true,
} as const

/**
 * List proposals for an org, optionally filtered by status.
 */
export async function listProposals(
  orgId: string,
  status?: ProposalStatus,
  limit = 50,
  offset = 0,
): Promise<AiLogicProposalRow[]> {
  if (status && !VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`)
  }
  return prisma.aiLogicProposal.findMany({
    where: {
      orgId,
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
    skip: offset,
    select: PROPOSAL_SELECT,
  })
}

/**
 * Create a new proposal (used internally by the Master agent).
 */
export async function createProposal(input: {
  orgId: string
  feedbackId?: string
  masterSessionId?: string
  source: string
  targetType: ProposalTargetType
  targetSubtype?: string
  targetId?: string
  currentValue?: string
  proposedValue: string
  rationale: string
}): Promise<AiLogicProposalRow> {
  if (!VALID_TARGET_TYPES.includes(input.targetType)) {
    throw new Error(`Invalid targetType. Must be one of: ${VALID_TARGET_TYPES.join(', ')}`)
  }
  const proposedValue = input.proposedValue.trim()
  if (!proposedValue) throw new Error('proposedValue cannot be empty')
  const rationale = input.rationale.trim()
  if (!rationale) throw new Error('rationale cannot be empty')

  return prisma.aiLogicProposal.create({
    data: {
      orgId: input.orgId,
      feedbackId: input.feedbackId ?? null,
      masterSessionId: input.masterSessionId ?? null,
      source: input.source,
      targetType: input.targetType,
      targetSubtype: input.targetSubtype ?? null,
      targetId: input.targetId ?? null,
      currentValue: input.currentValue ?? null,
      proposedValue,
      rationale,
      status: 'pending',
      createdByAi: true,
    },
    select: PROPOSAL_SELECT,
  })
}

/**
 * Reject a proposal. Sets status='rejected', records reviewedBy, fires ActivityLog.
 */
export async function rejectProposal(
  proposalId: string,
  orgId: string,
  reviewedBy: string,
): Promise<{ proposalId: string }> {
  const proposal = await prisma.aiLogicProposal.findFirst({
    where: { id: proposalId, orgId },
  })
  if (!proposal) throw new Error(`Proposal ${proposalId} not found`)
  if (proposal.status === 'applied') throw new Error('Cannot reject an already-applied proposal')
  if (proposal.status === 'rejected') throw new Error('Proposal already rejected')

  await prisma.aiLogicProposal.update({
    where: { id: proposalId },
    data: { status: 'rejected', reviewedBy },
  })

  prisma.activityLog.create({
    data: {
      orgId,
      action: 'ai_logic_proposal.rejected',
      entityType: 'AiLogicProposal',
      entityId: proposalId,
      details: { targetType: proposal.targetType, targetSubtype: proposal.targetSubtype, reviewedBy },
    },
  }).catch((err: unknown) => logger.error({ err, proposalId }, '[master] activityLog write failed'))

  return { proposalId }
}

/**
 * Apply a proposal — GATED: must be called only after explicit human confirmation.
 *
 * Behaviour per targetType:
 *   logic_doc       → upsertLogicDoc with changedBy='ai_master' (versioned)
 *   knowledge_entry → stub (KB service not yet in scope for this phase)
 *   thread_memory   → stub (contact-memory service not yet in scope for this phase)
 *   prompt_version  → stub (AiPromptVersion management deferred)
 *
 * Always writes ActivityLog. Sets proposal status='applied', appliedRef.
 */
export async function applyProposal(
  proposalId: string,
  orgId: string,
  reviewedBy: string,
): Promise<{ proposalId: string; appliedRef: string | null }> {
  const proposal = await prisma.aiLogicProposal.findFirst({
    where: { id: proposalId, orgId },
  })

  if (!proposal) throw new Error(`Proposal ${proposalId} not found`)
  if (proposal.status === 'applied') throw new Error('Proposal already applied')
  if (proposal.status === 'rejected') throw new Error('Cannot apply a rejected proposal')

  let appliedRef: string | null = null

  // ── Apply by targetType ───────────────────────────────────────────────
  if (proposal.targetType === 'logic_doc') {
    const subtype = proposal.targetSubtype
    if (!subtype || !isValidDocType(subtype)) {
      throw new Error(
        `logic_doc proposal requires a valid targetSubtype (index|persona|playbook|handoff_rules|mechanism|criteria). Got: ${subtype}`,
      )
    }
    const updated = await upsertLogicDoc(
      orgId,
      subtype,
      proposal.proposedValue,
      'ai_master',
      `AI Master proposal ${proposalId}: ${proposal.rationale.slice(0, 120)}`,
    )
    appliedRef = updated.id
  } else if (proposal.targetType === 'knowledge_entry' && proposal.targetSubtype === 'delete') {
    // XÓA một mục Kiến thức/FAQ — proposedValue chỉ là lý do, không ghi nội dung.
    if (!proposal.targetId) throw new Error('knowledge_entry delete proposal requires targetId')
    const deleted = await deleteKbEntry(orgId, proposal.targetId)
    if (!deleted) throw new Error('Knowledge entry not found (already deleted?)')
    appliedRef = proposal.targetId
    logger.info({ proposalId, appliedRef }, '[master] knowledge_entry deleted')
  } else if (proposal.targetType === 'knowledge_entry') {
    // Derive risk from targetSubtype (price / policy → sensitive; else low)
    const SENSITIVE_SUBTYPES = new Set(['price', 'policy'])
    const risk = SENSITIVE_SUBTYPES.has(proposal.targetSubtype ?? '') ? 'sensitive' : 'low'

    // Title: prefer the first markdown heading in the content, else its first
    // non-empty line, else fall back to the rationale. (Content-derived titles
    // are far more useful for a KB entry than the rationale.)
    const contentLines = (proposal.proposedValue ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
    const heading = contentLines.find((l) => l.startsWith('#'))
    const rawTitle = heading?.replace(/^#+\s*/, '')
      ?? contentLines[0]
      ?? (proposal.rationale ?? '').split('\n').find((l) => l.trim())
      ?? 'AI knowledge entry'
    const title = rawTitle.trim().slice(0, 120)

    if (proposal.targetId) {
      // Update existing entry
      const updated = await updateKbEntry(
        orgId,
        proposal.targetId,
        { content: proposal.proposedValue, risk, changeNote: `AI Master proposal ${proposalId}` },
        'ai_master',
      )
      appliedRef = updated?.id ?? null
    } else {
      // Create new entry. A "faq" subtype becomes a real FAQ (format qa);
      // anything else is a knowledge article.
      const isFaq = proposal.targetSubtype === 'faq'
      const entry = await createKbEntry(orgId, {
        type: isFaq ? 'faq' : 'fact',
        format: isFaq ? 'qa' : 'article',
        title,
        content: proposal.proposedValue,
        risk,
        source: `ai_master:${proposalId}`,
      }, 'ai_master')
      appliedRef = entry.id
    }
    logger.info({ proposalId, appliedRef }, '[master] knowledge_entry applied to KB')
  } else if (proposal.targetType === 'product') {
    // Master can add/update/remove products.
    //   targetSubtype='delete' + targetId → remove
    //   targetId (no delete)             → update with a JSON patch (only changed fields)
    //   otherwise                        → create from proposedValue (JSON product, or "Name\nDescription")
    if (proposal.targetSubtype === 'delete') {
      if (!proposal.targetId) throw new Error('product delete proposal requires targetId')
      await deleteProduct(orgId, proposal.targetId)
      appliedRef = proposal.targetId
    } else if (proposal.targetId) {
      let patch: Record<string, unknown>
      try {
        patch = JSON.parse(proposal.proposedValue) as Record<string, unknown>
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('not object')
      } catch {
        throw new Error('product update proposal: proposedValue must be a JSON object containing only the fields to change (e.g. {"price":250000})')
      }
      const updated = await updateProduct(orgId, proposal.targetId, patch as any)
      if (!updated) throw new Error('Product not found')
      appliedRef = proposal.targetId
    } else {
      let input: Record<string, unknown> & { name: string }
      try {
        const parsed = JSON.parse(proposal.proposedValue)
        if (parsed && typeof parsed === 'object' && typeof parsed.name === 'string' && parsed.name.trim()) {
          input = parsed
        } else throw new Error('no name')
      } catch {
        const lines = proposal.proposedValue.split('\n').map((l) => l.trim()).filter(Boolean)
        input = {
          name: (lines[0] ?? 'Sản phẩm mới').slice(0, 200),
          description: lines.slice(1).join('\n') || null,
        }
      }
      const p = await createProduct(orgId, { ...input, source: 'ai_master' } as any, undefined)
      appliedRef = p.id
    }
    logger.info({ proposalId, appliedRef }, '[master] product applied')
  } else if (proposal.targetType === 'guardrail') {
    // Patch the per-function tools config (AiLogicDoc 'tools'). The responder
    // enforces each tool's guardrail at the RAG layer (code, not prompt), so the
    // AI cannot over-reach regardless of its prompt.
    // proposedValue (JSON), either shape:
    //   per-tool: { "search_products": {enabled?, guardrail:{categoryIds:[...]}}, ... }
    //             (optionally nested under "tools")
    //   legacy:   { allowedProductCategoryIds:[...], allowedKnowledgeCategoryIds:[...] }
    appliedRef = await applyGuardrailPatch(orgId, proposal.proposedValue)
    logger.info({ proposalId, appliedRef }, '[master] guardrail applied to tools doc')
  } else if (proposal.targetType === 'scenario') {
    // Modular logic scenario (skill): add / update / remove.
    //   targetSubtype='delete' + targetId → remove
    //   targetId (no delete)             → update (JSON patch of changed fields)
    //   otherwise                        → create (JSON {name, description, content, loadMode?})
    if (proposal.targetSubtype === 'delete') {
      if (!proposal.targetId) throw new Error('scenario delete proposal requires targetId')
      const ok = await deleteScenario(orgId, proposal.targetId)
      if (!ok) throw new Error('Scenario not found (already deleted?)')
      appliedRef = proposal.targetId
    } else {
      let data: Record<string, unknown>
      try {
        data = JSON.parse(proposal.proposedValue) as Record<string, unknown>
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not object')
      } catch {
        throw new Error('scenario proposal: proposedValue must be a JSON object {name, description, content, loadMode?}')
      }
      if (proposal.targetId) {
        const updated = await updateScenario(orgId, proposal.targetId, { ...data, changeNote: `AI Master proposal ${proposalId}` } as any, 'ai_master')
        if (!updated) throw new Error('Scenario not found')
        appliedRef = proposal.targetId
      } else {
        if (typeof data.name !== 'string' || typeof data.description !== 'string' || typeof data.content !== 'string') {
          throw new Error('scenario create requires name, description and content')
        }
        const created = await createScenario(orgId, data as any, 'ai_master')
        appliedRef = created.id
      }
    }
    logger.info({ proposalId, appliedRef }, '[master] scenario applied')
  } else if (proposal.targetType === 'retrieval_tuning') {
    // Tune RAG retrieval knobs: ragMinScore (0..1 cosine threshold) and/or ragTopK.
    // proposedValue = JSON {"ragMinScore":0.4,"ragTopK":6} (either field optional).
    let patch: { ragMinScore?: unknown; ragTopK?: unknown }
    try {
      patch = JSON.parse(proposal.proposedValue) as { ragMinScore?: unknown; ragTopK?: unknown }
      if (!patch || typeof patch !== 'object') throw new Error('not object')
    } catch {
      throw new Error('retrieval_tuning proposal: proposedValue must be JSON {"ragMinScore"?:0..1,"ragTopK"?:1..50}')
    }
    const data: { ragMinScore?: number; ragTopK?: number } = {}
    if (patch.ragMinScore !== undefined) {
      const v = Number(patch.ragMinScore)
      if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error('ragMinScore must be between 0 and 1')
      data.ragMinScore = v
    }
    if (patch.ragTopK !== undefined) {
      const v = Number(patch.ragTopK)
      if (!Number.isInteger(v) || v < 1 || v > 50) throw new Error('ragTopK must be an integer between 1 and 50')
      data.ragTopK = v
    }
    if (Object.keys(data).length === 0) throw new Error('retrieval_tuning: nothing to change (set ragMinScore and/or ragTopK)')
    await prisma.aiConfig.update({ where: { orgId }, data })
    appliedRef = 'ai_config'
    logger.info({ proposalId, data }, '[master] retrieval_tuning applied')
  } else if (proposal.targetType === 'thread_memory') {
    // NOT supported: AiLogicProposal has no contactId, so we can't resolve which
    // contact's memory to target. Throw so the proposal is NOT falsely marked applied.
    throw new Error('thread_memory proposals are not supported yet (no contact target). Edit contact memory directly.')
  } else if (proposal.targetType === 'prompt_version') {
    // NOT supported yet: AiPromptVersion management service is deferred.
    throw new Error('prompt_version proposals are not supported yet (prompt-version service deferred).')
  } else {
    throw new Error(`Unknown targetType: ${proposal.targetType}`)
  }

  // ── Mark proposal applied ─────────────────────────────────────────────
  await prisma.aiLogicProposal.update({
    where: { id: proposalId },
    data: {
      status: 'applied',
      reviewedBy,
      appliedRef,
    },
  })

  // Close the loop: the staff feedback that seeded this proposal is now resolved.
  if (proposal.feedbackId) {
    await updateFeedbackStatus(proposal.feedbackId, orgId, 'applied').catch(
      (err: unknown) => logger.error({ err, proposalId }, '[master] feedback status update failed'),
    )
  }

  // ── ActivityLog (fire-and-forget) ─────────────────────────────────────
  prisma.activityLog.create({
    data: {
      orgId,
      action: 'ai_logic_proposal.applied',
      entityType: 'AiLogicProposal',
      entityId: proposalId,
      details: {
        targetType: proposal.targetType,
        targetSubtype: proposal.targetSubtype,
        appliedRef,
        reviewedBy,
        rationale: proposal.rationale.slice(0, 200),
      },
    },
  }).catch((err: unknown) => logger.error({ err, proposalId }, '[master] activityLog write failed'))

  return { proposalId, appliedRef }
}

/** Merge a guardrail/tools patch into the org's tools doc (AiLogicDoc 'tools'). */
async function applyGuardrailPatch(orgId: string, proposedValue: string): Promise<string> {
  let patch: Record<string, unknown>
  try {
    patch = JSON.parse(proposedValue) as Record<string, unknown>
  } catch {
    throw new Error('guardrail proposal: proposedValue must be JSON (per-tool patch or {allowedProductCategoryIds,allowedKnowledgeCategoryIds})')
  }
  await applyToolsPatch(orgId, patch, 'ai_master')
  return 'tools_doc'
}
