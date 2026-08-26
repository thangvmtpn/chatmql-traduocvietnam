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
};
// ─── Graph helpers ───────────────────────────────────────────────────────────
/** Build adjacency list from edges, grouped by source + optional label */
export function buildAdjacency(edges) {
    const adj = new Map();
    for (const edge of edges) {
        const list = adj.get(edge.source) || [];
        list.push(edge);
        adj.set(edge.source, list);
    }
    return adj;
}
/** Get next node IDs from a source, optionally filtered by branch label */
export function getNextNodes(adj, sourceId, branchLabel) {
    const edges = adj.get(sourceId) || [];
    if (branchLabel !== undefined) {
        return edges.filter(e => e.label === branchLabel).map(e => e.target);
    }
    return edges.map(e => e.target);
}
// ─── Condition evaluator ─────────────────────────────────────────────────────
function evaluateCondition(field, op, value, ctx) {
    const getValue = (f) => {
        const [obj, key] = f.split('.');
        if (obj === 'message')
            return ctx.messageText ?? '';
        if (obj === 'trigger')
            return ctx.triggerData?.[key];
        if (obj === 'contact')
            return ctx[`contact.${key}`] ?? ctx.triggerData?.[key];
        return ctx[f];
    };
    const actual = getValue(field);
    const expected = value;
    switch (op) {
        case 'eq': return String(actual) === String(expected);
        case 'neq': return String(actual) !== String(expected);
        case 'contains': return String(actual).toLowerCase().includes(String(expected).toLowerCase());
        case 'gte': return Number(actual) >= Number(expected);
        case 'lte': return Number(actual) <= Number(expected);
        case 'exists': return actual !== undefined && actual !== null && actual !== '';
        case 'not_exists': return actual === undefined || actual === null || actual === '';
        default: return false;
    }
}
/** Evaluate a condition node's rules with AND/OR logic */
export function evaluateConditionNode(node, ctx) {
    const rules = node.config?.rules || [];
    const logic = node.config?.logic || 'and';
    if (rules.length === 0)
        return true;
    if (logic === 'or') {
        return rules.some(r => evaluateCondition(r.field, r.op, r.value, ctx));
    }
    return rules.every(r => evaluateCondition(r.field, r.op, r.value, ctx));
}
//# sourceMappingURL=automation-types.js.map