/**
 * automation-types.ts — Shared types, graph helpers, and condition evaluator
 * for the automation engine.
 *
 * Extracted from automation-engine.ts (W3-FIX) to keep each file under 500 LOC.
 */
export declare const ENGINE_CONFIG: {
    /** Max action nodes executed concurrently within a single BFS level */
    MAX_PARALLEL_ACTIONS: number;
    /** Max trigger jobs processed per poll cycle */
    MAX_TRIGGER_JOBS_PER_POLL: number;
    /** Max delay jobs processed per poll cycle */
    MAX_DELAY_JOBS_PER_POLL: number;
    /** Inline delay threshold in ms (above this → DB job) */
    MAX_INLINE_DELAY_MS: number;
};
export interface AutomationContext {
    orgId: string;
    conversationId?: string;
    contactId?: string;
    messageText?: string;
    triggerData?: Record<string, any>;
}
export interface FlowTrigger {
    id: string;
    type: string;
    label: string;
    config: Record<string, unknown>;
}
export interface FlowNode {
    id: string;
    type: 'action' | 'condition' | 'delay' | 'note';
    actionType?: string;
    label: string;
    config: Record<string, unknown>;
    status: 'active' | 'wip' | 'disabled';
    branches?: {
        true: string[];
        false: string[];
    };
}
export interface FlowEdge {
    source: string;
    target: string;
    label?: string;
}
export interface FlowConfig {
    version: string;
    trigger: FlowTrigger;
    nodes: FlowNode[];
    edges: FlowEdge[];
}
export interface NodeExecutionResult {
    nodeId: string;
    nodeLabel: string;
    status: 'success' | 'skipped' | 'error' | 'wip';
    durationMs: number;
    error?: string;
    branchTaken?: 'true' | 'false';
    /** Output data from the action (e.g., AI-CDP analysis result, tags added, etc.) */
    output?: Record<string, any>;
}
export interface FlowExecutionResult {
    ruleId: string;
    ruleName: string;
    totalNodes: number;
    executedNodes: number;
    skippedNodes: number;
    errorNodes: number;
    nodeResults: NodeExecutionResult[];
    durationMs: number;
    dryRun?: boolean;
}
/** Build adjacency list from edges, grouped by source + optional label */
export declare function buildAdjacency(edges: FlowEdge[]): Map<string, FlowEdge[]>;
/** Get next node IDs from a source, optionally filtered by branch label */
export declare function getNextNodes(adj: Map<string, FlowEdge[]>, sourceId: string, branchLabel?: string): string[];
/** Evaluate a condition node's rules with AND/OR logic */
export declare function evaluateConditionNode(node: FlowNode, ctx: AutomationContext): boolean;
