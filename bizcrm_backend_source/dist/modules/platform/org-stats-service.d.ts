export type OrgStats = {
    users: number;
    contacts: number;
    conversations: number;
};
/** Per-org counts for a given set of orgIds. Missing orgs default to zero. */
export declare function getOrgStatsMap(orgIds: string[]): Promise<Map<string, OrgStats>>;
/** System-wide totals across all organizations. */
export declare function getGlobalTotals(): Promise<{
    users: number;
    contacts: number;
    conversations: number;
}>;
