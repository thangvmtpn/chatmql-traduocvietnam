import type { HarnessContext } from './harness-types.js';
import { type ContextBudgets } from './budgets.js';
export declare function assembleContext(orgId: string, convId: string, turnText: string, aiReplyRunId?: string, opts?: {
    skipRag?: boolean;
    minScore?: number;
    budgets?: ContextBudgets;
    historyBefore?: Date;
}): Promise<HarnessContext>;
