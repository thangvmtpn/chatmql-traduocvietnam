import { FbClient, type FbAttachmentType } from './fb-client.js';
export declare function getClient(accountId: string): Promise<FbClient>;
export declare function invalidateClient(accountId: string): void;
/** Mark an account's token as expired so the UI can prompt a reconnect. */
export declare function markTokenExpired(accountId: string): Promise<void>;
/** Graph error code 190 = OAuthException (token invalid/expired/revoked). */
export declare function isTokenExpiredError(err: unknown): boolean;
export declare function isFbCsWindowError(errorSubcode: number | undefined): boolean;
export interface FbSendResult {
    sent: boolean;
    messageId?: string;
    error?: string;
    errorCode?: string | number;
    errorSubcode?: number;
}
export declare function sendTextViaFb(accountId: string, psid: string, text: string): Promise<FbSendResult>;
export declare function sendAttachmentViaFb(accountId: string, psid: string, buffer: Uint8Array, filename: string, mimeType: string, type: FbAttachmentType): Promise<FbSendResult>;
