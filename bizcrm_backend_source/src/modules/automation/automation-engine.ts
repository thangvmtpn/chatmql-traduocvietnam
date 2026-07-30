/**
 * automation-engine.ts — BizCRM Automation Engine (unified).
 *
 * W3-FIX: Refactored from 1003 LOC → ~370 LOC by extracting:
 *   - automation-types.ts   — Types, graph helpers, condition evaluator
 *   - automation-actions.ts — Action handler implementations + Zalo delivery
 *
 * This file retains:
 *   - DAG executor (executeFlowV2)
 *   - Dispatch modes (runAutomationRules)
 *   - BullMQ worker handlers (processTriggerJob, processDelayJob)
 *   - Legacy pollers (pollDelayJobs, pollTriggerJobs)
 */
import { prisma } from '../../shared/prisma-client.js'
import { logger } from '../../shared/logger.js'
import { enqueueTrigger, enqueueDelay } from '../../shared/queue.js'

// Re-export types and config so existing consumers don't need to change imports
export { ENGINE_CONFIG } from './automation-types.js'
export type { AutomationContext, FlowConfig, FlowNode, FlowEdge, FlowExecutionResult, NodeExecutionResult } from './automation-types.js'

import {
  ENGINE_CONFIG,
  buildAdjacency,
  getNextNodes,
  evaluateConditionNode,
  type AutomationContext,
  type FlowConfig,
  type FlowNode,
  type FlowExecutionResult,
  type NodeExecutionResult,
} from './automation-types.js'

import { executeNodeAction } from './automation-actions.js'

// ─── DAG Executor ────────────────────────────────────────────────────────────

/**
 * Execute a flow (DAG) for a given rule and context.
 * Traverses nodes in BFS order starting from the trigger.
 *
 * @param dryRun — When true, marks the run as a test in ActivityLog.
 *   Actions still execute so users can evaluate real results.
 */
export async function executeFlowV2(
  ruleId: string,
  ruleName: string,
  flowConfig: FlowConfig,
  ctx: AutomationContext,
  dryRun = false,
): Promise<FlowExecutionResult> {
  const startTime = Date.now()
  const adj = buildAdjacency(flowConfig.edges)
  const nodeMap = new Map(flowConfig.nodes.map(n => [n.id, n]))
  const nodeResults: NodeExecutionResult[] = []
  const visited = new Set<string>()

  // BFS queue: start from trigger's outgoing edges
  let currentLevel: string[] = getNextNodes(adj, flowConfig.trigger.id)

  while (currentLevel.length > 0) {
    const nextLevel: string[] = []

    // Partition current level into parallel-safe (action/note) vs sequential (condition/delay)
    const parallelBatch: FlowNode[] = []
    const sequentialQueue: string[] = []

    for (const nodeId of currentLevel) {
      if (visited.has(nodeId) || nodeId === 'node_end') continue
      visited.add(nodeId)
      const node = nodeMap.get(nodeId)
      if (!node) continue

      // Disabled/WIP: pass-through
      if (node.status === 'disabled' || node.status === 'wip') {
        nodeResults.push({
          nodeId: node.id, nodeLabel: node.label,
          status: node.status === 'wip' ? 'wip' : 'skipped', durationMs: 0,
        })
        nextLevel.push(...getNextNodes(adj, nodeId))
        continue
      }

      // Condition & delay affect control flow → must run sequentially
      if (node.type === 'condition' || node.type === 'delay') {
        sequentialQueue.push(nodeId)
      } else {
        parallelBatch.push(node)
      }
    }

    // ── Execute action/note nodes in parallel (with concurrency limit) ──
    if (parallelBatch.length > 0) {
      const concurrency = ENGINE_CONFIG.MAX_PARALLEL_ACTIONS

      // Process in chunks of `concurrency` size
      for (let ci = 0; ci < parallelBatch.length; ci += concurrency) {
        const chunk = parallelBatch.slice(ci, ci + concurrency)
        const results = await Promise.allSettled(
          chunk.map(async (node) => {
            const nodeStart = Date.now()
            if (node.type === 'note' || !node.actionType) {
              return { nodeId: node.id, nodeLabel: node.label, status: 'skipped' as const, durationMs: 0 }
            }
            try {
              const output = await executeNodeAction(node.actionType, node.config, ctx)
              return { nodeId: node.id, nodeLabel: node.label, status: 'success' as const, durationMs: Date.now() - nodeStart, output }
            } catch (err: any) {
              logger.error({ err }, `[automation] Node ${node.id} (${node.actionType}) failed`)
              return { nodeId: node.id, nodeLabel: node.label, status: 'error' as const, durationMs: Date.now() - nodeStart, error: err.message || String(err) }
            }
          })
        )
        for (let i = 0; i < results.length; i++) {
          const r = results[i]
          if (r.status === 'fulfilled') {
            nodeResults.push(r.value)
          } else {
            nodeResults.push({ nodeId: chunk[i].id, nodeLabel: chunk[i].label, status: 'error', durationMs: 0, error: String(r.reason) })
          }
          nextLevel.push(...getNextNodes(adj, chunk[i].id))
        }
      }
    }

    // ── Execute condition/delay nodes sequentially ──
    for (const nodeId of sequentialQueue) {
      const node = nodeMap.get(nodeId)!
      const nodeStart = Date.now()

      if (node.type === 'condition') {
        const result = evaluateConditionNode(node, ctx)
        const branchLabel = result ? 'true' : 'false'
        nodeResults.push({
          nodeId: node.id, nodeLabel: node.label, status: 'success',
          durationMs: Date.now() - nodeStart, branchTaken: branchLabel,
        })
        const branchNextIds = getNextNodes(adj, nodeId, branchLabel)
        nextLevel.push(...(branchNextIds.length > 0 ? branchNextIds : getNextNodes(adj, nodeId)))
      } else if (node.type === 'delay') {
        const duration = Number(node.config?.duration || 0)
        const unit = String(node.config?.unit || 'seconds')
        let delayMs = duration * 1000
        if (unit === 'minutes') delayMs = duration * 60_000
        else if (unit === 'hours') delayMs = duration * 3600_000
        else if (unit === 'days') delayMs = duration * 86400_000

        if (dryRun) {
          nodeResults.push({ nodeId: node.id, nodeLabel: node.label, status: 'success', durationMs: 0 })
          nextLevel.push(...getNextNodes(adj, nodeId))
        } else {
          const MAX_INLINE_DELAY_MS = 30_000
          if (delayMs <= MAX_INLINE_DELAY_MS) {
            if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))
            nodeResults.push({ nodeId: node.id, nodeLabel: node.label, status: 'success', durationMs: Date.now() - nodeStart })
            nextLevel.push(...getNextNodes(adj, nodeId))
          } else {
            // Schedule deferred continuation via BullMQ delayed job
            const delayNextIds = getNextNodes(adj, nodeId)
            await enqueueDelay({
              orgId: ctx.orgId, ruleId,
              flowConfig: flowConfig as any,
              resumeFromNodeIds: delayNextIds,
              context: ctx as any,
              scheduledFor: new Date(Date.now() + delayMs).toISOString(),
            }, delayMs)
            nodeResults.push({ nodeId: node.id, nodeLabel: node.label, status: 'success', durationMs: Date.now() - nodeStart })
            logger.info(`[automation] Delay ${duration} ${unit} scheduled via BullMQ → ${new Date(Date.now() + delayMs).toISOString()}`)
            // Do NOT push next — BullMQ worker will resume
          }
        }
      }
    }

    currentLevel = nextLevel
  }

  const result: FlowExecutionResult = {
    ruleId,
    ruleName,
    totalNodes: flowConfig.nodes.length,
    executedNodes: nodeResults.filter(r => r.status === 'success').length,
    skippedNodes: nodeResults.filter(r => r.status === 'skipped' || r.status === 'wip').length,
    errorNodes: nodeResults.filter(r => r.status === 'error').length,
    nodeResults,
    durationMs: Date.now() - startTime,
    dryRun,
  }

  // Always log to ActivityLog — distinguish test_run vs flow_executed
  await prisma.activityLog.create({
    data: {
      orgId: ctx.orgId,
      entityType: 'automation',
      entityId: ruleId,
      action: dryRun ? 'test_run' : 'flow_executed',
      details: {
        trigger: flowConfig.trigger.type,
        isTestRun: dryRun,
        totalNodes: result.totalNodes,
        executedNodes: result.executedNodes,
        skippedNodes: result.skippedNodes,
        errorNodes: result.errorNodes,
        durationMs: result.durationMs,
        nodeResults: result.nodeResults.map(r => ({
          nodeId: r.nodeId,
          nodeLabel: r.nodeLabel,
          status: r.status,
          durationMs: r.durationMs,
          ...(r.branchTaken ? { branchTaken: r.branchTaken } : {}),
          ...(r.error ? { error: r.error } : {}),
          ...(r.output ? { output: r.output } : {}),
        })),
        context: {
          conversationId: ctx.conversationId,
          contactId: ctx.contactId,
          contactName: (ctx as Record<string, any>)['contact.fullName'] || null,
          contactPhone: (ctx as Record<string, any>)['contact.phone'] || null,
          messageText: (ctx as Record<string, any>).messageText || null,
          triggerData: (ctx as Record<string, any>).triggerData || null,
        },
      },
    },
  })

  return result
}

// ─── Dispatch modes ───────────────────────────────────────────────────────────

export type DispatchMode = 'sync' | 'queue'

/**
 * Run all matching automation rules for a given trigger + context.
 *
 * @param mode — Execution mode:
 *   - 'sync'  : Execute inline, await result (for test-run UI or when caller needs result)
 *   - 'queue' : Push to BullMQ queue, processed by worker (default)
 */
export async function runAutomationRules(
  trigger: string,
  ctx: AutomationContext,
  mode: DispatchMode = 'queue',
): Promise<{ matched: number; executed: number }> {
  // ── Queue mode: persist and return immediately ──
  if (mode === 'queue') {
    await enqueueTrigger({ trigger, context: ctx })
    return { matched: -1, executed: -1 } // -1 = deferred (unknown yet)
  }

  // ── Sync mode: execute inline ──
  return executeTriggerSync(trigger, ctx)
}

/** Execute a trigger synchronously — find matching rules and run flows inline */
async function executeTriggerSync(
  trigger: string,
  ctx: AutomationContext,
): Promise<{ matched: number; executed: number }> {
  const rules = await prisma.automationRule.findMany({
    where: { orgId: ctx.orgId, enabled: true, trigger },
    orderBy: { createdAt: 'asc' },
  })

  if (rules.length === 0) return { matched: 0, executed: 0 }

  logger.info({ trigger, orgId: ctx.orgId, contactId: ctx.contactId, rulesFound: rules.length }, '[automation] executeTriggerSync')

  // Hydrate contact data for condition evaluators and templates
  if (ctx.contactId && !(ctx as Record<string, any>)['contact.id']) {
    const contact = await prisma.contact.findFirst({
      where: { id: ctx.contactId, orgId: ctx.orgId },
      select: {
        id: true, fullName: true, crmName: true, phone: true,
        email: true, lifecycleStage: true, source: true,
      },
    })
    if (contact) {
      const pCtx = ctx as Record<string, any>
      pCtx['contact.id'] = contact.id
      pCtx['contact.fullName'] = contact.fullName || contact.crmName || ''
      pCtx['contact.phone'] = contact.phone || ''
      pCtx['contact.email'] = contact.email || ''
      pCtx['contact.lifecycleStage'] = contact.lifecycleStage || 'subscriber'
      pCtx['contact.status'] = contact.lifecycleStage || 'subscriber' // deprecated alias
      pCtx['contact.source'] = contact.source || ''
    }
  }

  let matched = 0
  let executed = 0

  for (const rule of rules) {
    const flowConfig = (rule as any).flowConfig as Record<string, any> | null

    if (flowConfig && flowConfig.trigger && Array.isArray(flowConfig.nodes)) {
      // conversation_idle: only fire for the threshold that matches the rule config
      if (trigger === 'conversation_idle') {
        const ruleThreshold = (flowConfig.trigger as any).config?.threshold || '30m' // default matches UI
        const ctxThreshold = ctx.triggerData?.idleThreshold
        if (ctxThreshold && ruleThreshold !== ctxThreshold) continue
      }

      try {
        const result = await executeFlowV2(rule.id, rule.name, flowConfig as any, ctx)
        matched++
        executed += result.executedNodes
        await prisma.automationRule.update({
          where: { id: rule.id },
          data: { runCount: { increment: 1 }, lastRunAt: new Date() },
        })
        logger.info({ ruleId: rule.id, executed: result.executedNodes, errors: result.errorNodes }, '[automation] flow executed')
      } catch (err) {
        logger.error({ err }, `[automation] flow ${rule.id} failed`)
      }
    } else {
      logger.warn({ ruleId: rule.id }, '[automation] Rule has no valid flowConfig — skipped')
    }
  }

  return { matched, executed }
}

// ─── BullMQ Worker Handlers ──────────────────────────────────────────────────

/**
 * Process a trigger job from BullMQ.
 * Called by the trigger worker initialized in app.ts.
 */
export async function processTriggerJob(trigger: string, ctx: AutomationContext): Promise<{ matched: number; executed: number }> {
  return executeTriggerSync(trigger, ctx)
}

/**
 * Process a delay job from BullMQ.
 * Resumes BFS execution from the saved node IDs.
 */
export async function processDelayJob(data: {
  orgId: string; ruleId: string; flowConfig: any
  resumeFromNodeIds: string[]; context: any
}): Promise<void> {
  const flowConfig = data.flowConfig as FlowConfig
  const ctx = data.context as AutomationContext

  // Hydrate contact data for condition evaluators (same as executeTriggerSync).
  // Delay jobs may resume hours/days later — contact data may have changed,
  // so always re-fetch fresh data instead of relying on serialized context.
  if (ctx.contactId && !(ctx as Record<string, any>)['contact.id']) {
    const contact = await prisma.contact.findFirst({
      where: { id: ctx.contactId, orgId: ctx.orgId },
      select: {
        id: true, fullName: true, crmName: true, phone: true,
        email: true, lifecycleStage: true, source: true,
      },
    })
    if (contact) {
      const pCtx = ctx as Record<string, any>
      pCtx['contact.id'] = contact.id
      pCtx['contact.fullName'] = contact.fullName || contact.crmName || ''
      pCtx['contact.phone'] = contact.phone || ''
      pCtx['contact.email'] = contact.email || ''
      pCtx['contact.lifecycleStage'] = contact.lifecycleStage || 'subscriber'
      pCtx['contact.status'] = contact.lifecycleStage || 'subscriber'
      pCtx['contact.source'] = contact.source || ''
    }
  }

  const adj = buildAdjacency(flowConfig.edges)
  const nodeMap = new Map(flowConfig.nodes.map(n => [n.id, n]))
  const visited = new Set<string>()
  const queue = [...data.resumeFromNodeIds]
  const nodeResults: NodeExecutionResult[] = []

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId) || nodeId === 'node_end') continue
    visited.add(nodeId)
    const node = nodeMap.get(nodeId)
    if (!node) continue
    const nodeStart = Date.now()

    if (node.status === 'disabled' || node.status === 'wip') {
      nodeResults.push({ nodeId: node.id, nodeLabel: node.label, status: node.status === 'wip' ? 'wip' : 'skipped', durationMs: 0 })
      queue.push(...getNextNodes(adj, nodeId))
      continue
    }

    switch (node.type) {
      case 'action': {
        if (!node.actionType) { queue.push(...getNextNodes(adj, nodeId)); break }
        try {
          const output = await executeNodeAction(node.actionType, node.config, ctx)
          nodeResults.push({ nodeId: node.id, nodeLabel: node.label, status: 'success', durationMs: Date.now() - nodeStart, output })
        } catch (err: any) {
          logger.error({ err }, `[automation:delay-resume] Node ${node.id} failed`)
          nodeResults.push({ nodeId: node.id, nodeLabel: node.label, status: 'error', durationMs: Date.now() - nodeStart, error: err.message })
        }
        queue.push(...getNextNodes(adj, nodeId))
        break
      }
      case 'condition': {
        const result = evaluateConditionNode(node, ctx)
        const branchLabel = result ? 'true' : 'false'
        nodeResults.push({ nodeId: node.id, nodeLabel: node.label, status: 'success', durationMs: Date.now() - nodeStart, branchTaken: branchLabel })
        const branchNext = getNextNodes(adj, nodeId, branchLabel)
        queue.push(...(branchNext.length > 0 ? branchNext : getNextNodes(adj, nodeId)))
        break
      }
      case 'delay': {
        const dur = Number(node.config?.duration || 0)
        const u = String(node.config?.unit || 'seconds')
        let ms = dur * 1000
        if (u === 'minutes') ms = dur * 60_000
        else if (u === 'hours') ms = dur * 3600_000
        else if (u === 'days') ms = dur * 86400_000
        if (ms <= ENGINE_CONFIG.MAX_INLINE_DELAY_MS) {
          if (ms > 0) await new Promise(r => setTimeout(r, ms))
          nodeResults.push({ nodeId: node.id, nodeLabel: node.label, status: 'success', durationMs: Date.now() - nodeStart })
          queue.push(...getNextNodes(adj, nodeId))
        } else {
          const nextIds = getNextNodes(adj, nodeId)
          await enqueueDelay({
            orgId: ctx.orgId, ruleId: data.ruleId,
            flowConfig: flowConfig as any, resumeFromNodeIds: nextIds,
            context: ctx as any, scheduledFor: new Date(Date.now() + ms).toISOString(),
          }, ms)
          nodeResults.push({ nodeId: node.id, nodeLabel: node.label, status: 'success', durationMs: Date.now() - nodeStart })
        }
        break
      }
      default:
        queue.push(...getNextNodes(adj, nodeId))
    }
  }
  logger.info({ ruleId: data.ruleId, nodesExecuted: nodeResults.length }, '[automation] Delay job resumed via BullMQ')
}

// ─── Legacy pollers (kept for fallback, no longer called from app.ts) ────────
export async function pollDelayJobs(): Promise<number> {
  const now = new Date()
  const jobs = await prisma.automationDelayJob.findMany({
    where: { status: 'pending', executeAt: { lte: now } },
    take: 20,
    orderBy: { executeAt: 'asc' },
  })

  if (jobs.length === 0) return 0

  let processed = 0
  for (const job of jobs) {
    try {
      // Mark as running to prevent double-pickup
      await prisma.automationDelayJob.update({
        where: { id: job.id },
        data: { status: 'running' },
      })

      const flowConfig = job.flowConfig as unknown as FlowConfig
      const ctx = job.context as unknown as AutomationContext
      const resumeNodeIds = job.resumeFromNodeIds as string[]

      // Resume BFS from the delay node's outgoing edges
      const adj = buildAdjacency(flowConfig.edges)
      const nodeMap = new Map(flowConfig.nodes.map(n => [n.id, n]))
      const visited = new Set<string>()
      const bfsQueue = [...resumeNodeIds]
      const nodeResults: NodeExecutionResult[] = []

      while (bfsQueue.length > 0) {
        const nodeId = bfsQueue.shift()!
        if (visited.has(nodeId) || nodeId === 'node_end') continue
        visited.add(nodeId)

        const node = nodeMap.get(nodeId)
        if (!node) continue

        const nodeStart = Date.now()

        if (node.status === 'disabled' || node.status === 'wip') {
          nodeResults.push({ nodeId: node.id, nodeLabel: node.label, status: node.status === 'wip' ? 'wip' : 'skipped', durationMs: 0 })
          bfsQueue.push(...getNextNodes(adj, nodeId))
          continue
        }

        switch (node.type) {
          case 'action': {
            if (!node.actionType) { bfsQueue.push(...getNextNodes(adj, nodeId)); break }
            try {
              await executeNodeAction(node.actionType, node.config, ctx)
              nodeResults.push({ nodeId: node.id, nodeLabel: node.label, status: 'success', durationMs: Date.now() - nodeStart })
            } catch (err: any) {
              logger.error({ err }, `[automation:delay-resume] Node ${node.id} failed`)
              nodeResults.push({ nodeId: node.id, nodeLabel: node.label, status: 'error', durationMs: Date.now() - nodeStart, error: err.message })
            }
            bfsQueue.push(...getNextNodes(adj, nodeId))
            break
          }
          case 'condition': {
            const result = evaluateConditionNode(node, ctx)
            const branchLabel = result ? 'true' : 'false'
            nodeResults.push({ nodeId: node.id, nodeLabel: node.label, status: 'success', durationMs: Date.now() - nodeStart, branchTaken: branchLabel })
            const branchNext = getNextNodes(adj, nodeId, branchLabel)
            bfsQueue.push(...(branchNext.length > 0 ? branchNext : getNextNodes(adj, nodeId)))
            break
          }
          case 'delay': {
            // Nested delays: schedule another deferred job
            const dur = Number(node.config?.duration || 0)
            const u = String(node.config?.unit || 'seconds')
            let ms = dur * 1000
            if (u === 'minutes') ms = dur * 60_000
            else if (u === 'hours') ms = dur * 3600_000
            else if (u === 'days') ms = dur * 86400_000
            if (ms <= 30_000) {
              if (ms > 0) await new Promise(r => setTimeout(r, ms))
              nodeResults.push({ nodeId: node.id, nodeLabel: node.label, status: 'success', durationMs: Date.now() - nodeStart })
              bfsQueue.push(...getNextNodes(adj, nodeId))
            } else {
              const nextIds = getNextNodes(adj, nodeId)
              await prisma.automationDelayJob.create({
                data: { orgId: ctx.orgId, ruleId: job.ruleId, flowConfig: flowConfig as any, resumeFromNodeIds: nextIds, context: ctx as any, executeAt: new Date(Date.now() + ms), status: 'pending' },
              })
              nodeResults.push({ nodeId: node.id, nodeLabel: node.label, status: 'success', durationMs: Date.now() - nodeStart })
            }
            break
          }
          default:
            bfsQueue.push(...getNextNodes(adj, nodeId))
        }
      }

      // Mark job done
      await prisma.automationDelayJob.update({
        where: { id: job.id },
        data: { status: 'done' },
      })
      processed++

      logger.info({ jobId: job.id, ruleId: job.ruleId, nodesExecuted: nodeResults.length }, '[automation] Delay job resumed')
    } catch (err: any) {
      logger.error({ err, jobId: job.id }, '[automation] Delay job failed')
      await prisma.automationDelayJob.update({
        where: { id: job.id },
        data: { status: 'failed' },
      }).catch(() => {})
    }
  }

  return processed
}

// ─── Trigger Job Poller ───────────────────────────────────────────────────────

/**
 * Poll for pending AutomationTriggerJobs and execute them.
 * Should be called periodically (e.g., every 10s via setInterval).
 */
export async function pollTriggerJobs(): Promise<number> {
  const jobs = await prisma.automationTriggerJob.findMany({
    where: { status: 'pending' },
    take: ENGINE_CONFIG.MAX_TRIGGER_JOBS_PER_POLL,
    orderBy: { createdAt: 'asc' },
  })

  if (jobs.length === 0) return 0

  let processed = 0
  for (const job of jobs) {
    try {
      // Mark as running to prevent double-pickup
      await prisma.automationTriggerJob.update({
        where: { id: job.id },
        data: { status: 'running', attempts: { increment: 1 } },
      })

      const ctx = job.context as unknown as AutomationContext
      const result = await executeTriggerSync(job.trigger, ctx)

      await prisma.automationTriggerJob.update({
        where: { id: job.id },
        data: { status: 'done' },
      })
      processed++

      logger.info({ jobId: job.id, trigger: job.trigger, matched: result.matched, executed: result.executed }, '[automation] Trigger job processed')
    } catch (err: any) {
      logger.error({ err, jobId: job.id }, '[automation] Trigger job failed')
      await prisma.automationTriggerJob.update({
        where: { id: job.id },
        data: { status: 'failed', error: String(err.message || err) },
      }).catch(() => {})
    }
  }

  return processed
}
