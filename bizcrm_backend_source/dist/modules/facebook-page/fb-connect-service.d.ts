import { type FbPage } from './fb-client.js';
export interface ConnectPagesResult {
    connected: number;
    conflicts: number;
}
/**
 * Upsert each page as a FACEBOOK_PAGE ChannelAccount for the org and subscribe
 * it to our webhook. Skips pages already owned by a different active channel
 * (e.g. Pancake) to avoid clobbering them.
 */
export declare function connectPagesForOrg(orgId: string, userId: string, pages: FbPage[]): Promise<ConnectPagesResult>;
