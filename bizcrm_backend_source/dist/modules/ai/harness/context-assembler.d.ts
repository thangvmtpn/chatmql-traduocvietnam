import type { HarnessContext } from './harness-types.js';
export declare function assembleContext(orgId: string, convId: string, turnText: string, aiReplyRunId?: string, opts?: {
    skipRag?: boolean;
    minScore?: number;
}): Promise<HarnessContext>;
