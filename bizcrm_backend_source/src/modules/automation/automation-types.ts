/**
 * automation-types.ts — Shared types, graph helpers, and condition evaluator
 * for the automation engine.
 *
 * Extracted from automation-engine.ts (W3-FIX) to keep each file under 500 LOC.
 */

// ─── Engine Configuration ─────────────────────────────────────────────────────

export const ENGINE_CONFIG = {
  /** Max action nodes executed concurrently within a single BFS level */
  MAX_PARALLEL_ACTIONS: parseInt(process.env.AUTOMATION_MAX_PARALLEL || '5'),
  /** Max trigger jobs processed per poll cycle */
  MAX_TRIGGER_JOBS_PER_POLL: parseInt(process.env.AUTOMATION_TRIGGER_BATCH || '20'),
  /** Max delay jobs processed per poll cycle */
  MAX_DELAY_JOBS_PER_POLL: 20,
  /** Inline delay threshold in ms (above this → DB job) */
  MAX_INLINE_DELAY_MS: 30_000,
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutomationContext {
  orgId: string
  conversationId?: string
  contactId?: string
  messageText?: string
  triggerData?: Record<string, any>
}

export interface FlowTrigger {
  id: string
  type: string
  label: string
  config: Record<string, unknown>
}

export interface FlowNode {
  id: string
  type: 'action' | 'condition' | 'delay' | 'note'
  actionType?: string
  label: string
  config: Record<string, unknown>
  status: 'active' | 'wip' | 'disabled'
  branches?: { true: string[]; false: string[] }
}

export interface FlowEdge {
  source: string
  target: string
  label?: string  // 'true' | 'false' for condition branches
}

export interface FlowConfig {
  version: string
  trigger: FlowTrigger
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export interface NodeExecutionResult {
  nodeId: string
  nodeLabel: string
  status: 'success' | 'skipped' | 'error' | 'wip'
  durationMs: number
  error?: string
  branchTaken?: 'true' | 'false'
  /** Output data from the action (e.g., AI-CDP analysis result, tags added, etc.) */
  output?: Record<string, any>
}

export interface FlowExecutionResult {
  ruleId: string
  ruleName: string
  totalNodes: number
  executedNodes: number
  skippedNodes: number
  errorNodes: number
  nodeResults: NodeExecutionResult[]
  durationMs: number
  dryRun?: boolean
}

// ─── Graph helpers ───────────────────────────────────────────────────────────

/** Build adjacency list from edges, grouped by source + optional label */
export function buildAdjacency(edges: FlowEdge[]): Map<string, FlowEdge[]> {
  const adj = new Map<string, FlowEdge[]>()
  for (const edge of edges) {
    const list = adj.get(edge.source) || []
    list.push(edge)
    adj.set(edge.source, list)
  }
  return adj
}

/** Get next node IDs from a source, optionally filtered by branch label */
export function getNextNodes(adj: Map<string, FlowEdge[]>, sourceId: string, branchLabel?: string): string[] {
  const edges = adj.get(sourceId) || []
  if (branchLabel !== undefined) {
    return edges.filter(e => e.label === branchLabel).map(e => e.target)
  }
  return edges.map(e => e.target)
}

// ─── Condition evaluator ─────────────────────────────────────────────────────

function evaluateCondition(
  field: string, op: string, value: unknown,
  ctx: AutomationContext & Record<string, any>
): boolean {
  const getValue = (f: string): any => {
    const [obj, key] = f.split('.')
    if (obj === 'message') return ctx.messageText ?? ''
    if (obj === 'trigger') return ctx.triggerData?.[key]
    if (obj === 'contact') return ctx[`contact.${key}`] ?? ctx.triggerData?.[key]
    return ctx[f]
  }

  const actual = getValue(field)
  const expected = value

  switch (op) {
    case 'eq':       return String(actual) === String(expected)
    case 'neq':      return String(actual) !== String(expected)
    case 'contains': return String(actual).toLowerCase().includes(String(expected).toLowerCase())
    case 'gte':      return Number(actual) >= Number(expected)
    case 'lte':      return Number(actual) <= Number(expected)
    case 'exists':   return actual !== undefined && actual !== null && actual !== ''
    case 'not_exists': return actual === undefined || actual === null || actual === ''
    default:         return false
  }
}

/** Evaluate a condition node's rules with AND/OR logic */
export function evaluateConditionNode(node: FlowNode, ctx: AutomationContext): boolean {
  const rules = (node.config?.rules as Array<{ field: string; op: string; value: unknown }>) || []
  const logic = (node.config?.logic as string) || 'and'

  if (rules.length === 0) return true

  if (logic === 'or') {
    return rules.some(r => evaluateCondition(r.field, r.op, r.value, ctx as any))
  }
  return rules.every(r => evaluateCondition(r.field, r.op, r.value, ctx as any))
}
