import { OaClient, type ZnsSendPayload, type OaTextQuote } from './oa-client.js';
export declare function getClient(accountId: string): Promise<OaClient>;
export declare function refreshIfNeeded(accountId: string): Promise<void>;
export declare function invalidateClient(accountId: string): void;
/** Force token refresh regardless of tokenExpiresAt, then clear the cached client. */
export declare function forceRefresh(accountId: string): Promise<void>;
export declare function sendTextViaOa(accountId: string, uid: string, text: string, quote?: OaTextQuote): Promise<{
    sent: boolean;
    messageId?: string;
    error?: string;
    errorCode?: string | number;
}>;
export declare function sendImageViaOa(accountId: string, uid: string, attachmentId: string, text?: string): Promise<{
    sent: boolean;
    messageId?: string;
    error?: string;
}>;
export declare function sendFileViaOa(accountId: string, uid: string, fileToken: string): Promise<{
    sent: boolean;
    messageId?: string;
    error?: string;
}>;
export declare function sendZnsViaOa(accountId: string, payload: ZnsSendPayload): Promise<{
    sent: boolean;
    msgId?: string;
    sentTime?: number;
    error?: string;
    errorCode?: string | number;
}>;
export declare function isCsWindowError(errorCode: string | number | undefined): boolean;
