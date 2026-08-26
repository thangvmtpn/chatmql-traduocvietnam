import type { Job } from 'bullmq';
import { type ZnsSendJobData } from '../../shared/queue.js';
/** Worker handler — process one ZNS recipient. */
export declare function processZnsSendJob(job: Job<ZnsSendJobData>): Promise<void>;
/**
 * Materialize recipient rows from campaign.contactIds, normalize phones,
 * enqueue one job per valid recipient. Skip contacts without phone.
 */
export declare function startCampaign(campaignId: string): Promise<{
    enqueued: number;
    skipped: number;
}>;
/** Cancel a running campaign. Pending jobs are skipped when the worker picks them up. */
export declare function cancelCampaign(campaignId: string): Promise<void>;
