export interface PreFilterResult {
    handoff: boolean;
    reason?: string;
}
export declare function runPreFilter(orgId: string, turnText: string): Promise<PreFilterResult>;
