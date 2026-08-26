export declare const CHAT_MEDIA_DIR: string;
/** Write an outbound media buffer to served storage; returns an absolute URL. */
export declare function saveChatMedia(buffer: Buffer, filename: string): Promise<string>;
