export { ENGINE_CONFIG } from './automation-types.js';
export type { AutomationContext, FlowConfig, FlowNode, FlowEdge, FlowExecutionResult, NodeExecutionResult } from './automation-types.js';
import { type AutomationContext, type FlowConfig, type FlowExecutionResult } from './automation-types.js';
/**
 * Execute a flow (DAG) for a given rule and context.
 * Traverses nodes in BFS order starting from the trigger.
 *
 * @param dryRun — When true, marks the run as a test in ActivityLog.
 *   Actions still execute so users can evaluate real results.
 */
export declare function executeFlowV2(ruleId: string, ruleName: string, flowConfig: FlowConfig, ctx: AutomationContext, dryRun?: boolean): Promise<FlowExecutionResult>;
export type DispatchMode = 'sync' | 'queue';
/**
 * Run all matching automation rules for a given trigger + context.
 *
 * @param mode — Execution mode:
 *   - 'sync'  : Execute inline, await result (for test-run UI or when caller needs result)
 *   - 'queue' : Push to BullMQ queue, processed by worker (default)
 */
export declare function runAutomationRules(trigger: string, ctx: AutomationContext, mode?: DispatchMode): Promise<{
    matched: number;
    executed: number;
}>;
/**
 * Process a trigger job from BullMQ.
 * Called by the trigger worker initialized in app.ts.
 */
export declare function processTriggerJob(trigger: string, ctx: AutomationContext): Promise<{
    matched: number;
    executed: number;
}>;
/**
 * Process a delay job from BullMQ.
 * Resumes BFS execution from the saved node IDs.
 */
export declare function processDelayJob(data: {
    orgId: string;
    ruleId: string;
    flowConfig: any;
    resumeFromNodeIds: string[];
    context: any;
}): Promise<void>;
export declare function pollDelayJobs(): Promise<number>;
/**
 * Poll for pending AutomationTriggerJobs and execute them.
 * Should be called periodically (e.g., every 10s via setInterval).
 */
export declare function pollTriggerJobs(): Promise<number>;
