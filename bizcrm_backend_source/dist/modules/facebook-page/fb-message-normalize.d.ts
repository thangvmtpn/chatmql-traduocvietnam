export interface FbAttachment {
    type?: string;
    payload?: {
        url?: string;
        coordinates?: {
            lat?: number;
            long?: number;
        };
    };
}
export interface FbMessage {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: FbAttachment[];
}
export interface NormalizedContent {
    contentType: string;
    content: string;
    attachments: any[];
}
/** Best-effort file extension from a URL path (before any query string). */
export declare function fileExtFromUrl(url: string): string;
export declare function mapContentType(msg?: FbMessage): NormalizedContent;
