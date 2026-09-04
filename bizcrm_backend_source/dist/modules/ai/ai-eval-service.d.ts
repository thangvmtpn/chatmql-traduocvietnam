export declare class EvalBusyError extends Error {
}
export type EvalCaseInput = {
    name?: string;
    question?: string;
    criteria?: string;
    conversationId?: string | null;
    botId?: string | null;
    enabled?: boolean;
    sortOrder?: number;
};
export declare function listCases(orgId: string): Promise<{
    id: string;
    orgId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    conversationId: string | null;
    enabled: boolean;
    criteria: string;
    sortOrder: number;
    question: string;
    botId: string | null;
}[]>;
export declare function createCase(orgId: string, input: EvalCaseInput): Promise<{
    id: string;
    orgId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    conversationId: string | null;
    enabled: boolean;
    criteria: string;
    sortOrder: number;
    question: string;
    botId: string | null;
}>;
export declare function updateCase(orgId: string, id: string, input: EvalCaseInput): Promise<{
    id: string;
    orgId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    conversationId: string | null;
    enabled: boolean;
    criteria: string;
    sortOrder: number;
    question: string;
    botId: string | null;
}>;
export declare function deleteCase(orgId: string, id: string): Promise<{
    deleted: boolean;
}>;
export declare function listRuns(orgId: string, limit?: number): Promise<{
    id: string;
    orgId: string;
    note: string | null;
    status: string;
    model: string | null;
    failed: number;
    total: number;
    trigger: string;
    proposalId: string | null;
    passed: number;
    errored: number;
    startedAt: Date;
    finishedAt: Date | null;
}[]>;
export declare function getRun(orgId: string, id: string): Promise<{
    run: {
        id: string;
        orgId: string;
        note: string | null;
        status: string;
        model: string | null;
        failed: number;
        total: number;
        trigger: string;
        proposalId: string | null;
        passed: number;
        errored: number;
        startedAt: Date;
        finishedAt: Date | null;
    };
    results: {
        id: string;
        createdAt: Date;
        reason: string;
        latencyMs: number | null;
        reply: string | null;
        question: string;
        runId: string;
        caseId: string;
        caseName: string;
        verdict: string;
    }[];
} | null>;
export type RunEvalOptions = {
    trigger: 'manual' | 'proposal';
    proposalId?: string | null;
};
/**
 * Tạo run + khởi động runner ở chế độ fire-and-forget.
 * Trả về row AiEvalRun ngay (client poll GET /runs/:id để xem tiến độ).
 */
export declare function runEval(orgId: string, userId: string, opts: RunEvalOptions): Promise<{
    id: string;
    orgId: string;
    note: string | null;
    status: string;
    model: string | null;
    failed: number;
    total: number;
    trigger: string;
    proposalId: string | null;
    passed: number;
    errored: number;
    startedAt: Date;
    finishedAt: Date | null;
}>;
