import type { HarnessOptions, HarnessResult } from './harness-types.js';
export declare function runHarness(orgId: string, convId: string, turnText: string, mode?: string, // 'suggest' | 'auto' (validated upstream; manual never reaches here)
opts?: HarnessOptions): Promise<HarnessResult>;
