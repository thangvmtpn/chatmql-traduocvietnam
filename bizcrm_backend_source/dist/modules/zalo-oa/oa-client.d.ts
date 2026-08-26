export declare class OaApiError extends Error {
    code: number | string;
    raw?: unknown | undefined;
    constructor(code: number | string, msg: string, raw?: unknown | undefined);
}
export interface OaTextQuote {
    msgId: string;
    text: string;
}
export interface ZnsSendPayload {
    phone: string;
    templateId: string;
    templateData: Record<string, string | number>;
    trackingId: string;
    mode?: 'development' | 'production';
}
export interface ZnsTemplate {
    templateId: string;
    templateName: string;
    status: string;
    templateType?: string;
    params: Array<{
        name: string;
        require: boolean;
        type: string;
        maxLength?: number;
        minLength?: number;
        acceptNull?: boolean;
    }>;
    previewUrl?: string;
}
export interface OaTokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
export declare class OaClient {
    private accessToken;
    constructor(accessToken: string);
    sendText(uid: string, text: string, quote?: OaTextQuote): Promise<{
        messageId: string;
    }>;
    sendImage(uid: string, attachmentId: string, text?: string): Promise<{
        messageId: string;
    }>;
    sendFile(uid: string, fileToken: string): Promise<{
        messageId: string;
    }>;
    getFollowerProfile(uid: string): Promise<{
        displayName?: string;
        avatar?: string;
        phone?: string;
        gender?: string;
        address?: string;
        dob?: string;
    }>;
    getOaInfo(): Promise<{
        externalPageId: string;
        name: string;
        avatar?: string;
    }>;
    listZnsTemplates(): Promise<ZnsTemplate[]>;
    getTemplateDetail(templateId: string): Promise<ZnsTemplate>;
    sendZns(p: ZnsSendPayload): Promise<{
        msgId: string;
        sentTime: number;
    }>;
    private getOa;
    private postOa;
    private getZns;
    private postZns;
    private request;
}
export declare function exchangeCodeForToken(opts: {
    code: string;
    codeVerifier: string;
    appId: string;
    appSecret: string;
}): Promise<OaTokenPair>;
export declare function refreshAccessToken(opts: {
    refreshToken: string;
    appId: string;
    appSecret: string;
}): Promise<OaTokenPair>;
export declare function buildAuthorizeUrl(opts: {
    appId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
}): string;
