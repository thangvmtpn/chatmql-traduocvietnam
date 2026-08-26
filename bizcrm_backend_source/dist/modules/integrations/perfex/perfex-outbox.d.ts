import type { LocalType } from './perfex-types.js';
export interface EnqueueInput {
    orgId: string;
    localType: LocalType;
    localId: string;
    op: 'upsert' | 'delete';
}
export declare function enqueueSync(input: EnqueueInput): Promise<void>;
