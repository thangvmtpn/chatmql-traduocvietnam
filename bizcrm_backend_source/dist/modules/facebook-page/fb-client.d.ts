export type FbAttachmentType = 'image' | 'video' | 'audio' | 'file';
export declare class FbApiError extends Error {
    code: number | string;
    subcode?: number | undefined;
    raw?: unknown | undefined;
    constructor(code: number | string, msg: string, subcode?: number | undefined, raw?: unknown | undefined);
}
export interface FbTokenResult {
    accessToken: string;
    expiresIn: number;
}
export interface FbPage {
    id: string;
    name: string;
    accessToken: string;
    avatarUrl?: string;
}
export declare class FbClient {
    private pageToken;
    constructor(pageToken: string);
    /** Send a text message to a PSID via the Send API. */
    sendText(psid: string, text: string): Promise<{
        messageId: string;
    }>;
    /**
     * Send a media attachment by uploading the raw bytes (multipart). Uploading
     * the buffer directly means we don't need a public URL Facebook can reach, so
     * this works in local dev too (unlike sending by payload.url).
     */
    sendAttachment(psid: string, buffer: Uint8Array, filename: string, mimeType: string, type: FbAttachmentType): Promise<{
        messageId: string;
    }>;
    /** Fetch a customer's public profile (name + avatar) scoped to the page. */
    getUserProfile(psid: string): Promise<{
        name?: string;
        avatar?: string;
    }>;
    private get;
    private post;
}
export declare function buildAuthorizeUrl(opts: {
    appId: string;
    redirectUri: string;
    state: string;
    scopes: string[];
}): string;
/** Exchange an authorization code for a short-lived USER access token. */
export declare function exchangeCodeForToken(opts: {
    code: string;
    redirectUri: string;
    appId: string;
    appSecret: string;
}): Promise<FbTokenResult>;
/** Exchange a short-lived user token for a long-lived one (~60 days). */
export declare function exchangeForLongLivedToken(opts: {
    userToken: string;
    appId: string;
    appSecret: string;
}): Promise<FbTokenResult>;
/** List the pages the user administers, each with its own page access token. */
export declare function getPages(userToken: string): Promise<FbPage[]>;
/** Subscribe our app to a page's webhook events (messages, postbacks, …). */
export declare function subscribePageWebhook(pageId: string, pageToken: string): Promise<void>;
