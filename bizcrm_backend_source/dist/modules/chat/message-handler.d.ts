export interface IncomingMessage {
    accountId: string;
    senderUid: string;
    senderName: string;
    content: string;
    contentType: string;
    msgId: string;
    timestamp: number;
    isSelf: boolean;
    threadId: string;
    threadType: 'user' | 'group';
    groupName?: string;
    attachments?: any[];
    quote?: unknown;
    albumKey?: string | null;
    albumIndex?: number | null;
    albumTotal?: number | null;
    isBackfill?: boolean;
    identityField?: 'zaloUid' | 'fbPsid';
    source?: string;
}
export interface HandleMessageResult {
    message: {
        id: string;
        conversationId: string;
        externalMsgId: string | null;
        senderType: string;
        senderUid: string | null;
        senderName: string | null;
        content: string | null;
        contentType: string;
        attachments: any;
        albumKey: string | null;
        albumIndex: number | null;
        albumTotal: number | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        sentAt: Date;
        repliedByUserId: string | null;
        createdAt: Date;
    };
    conversationId: string;
    orgId: string;
    contactId: string | null;
}
export declare function handleIncomingMessage(msg: IncomingMessage): Promise<HandleMessageResult | null>;
export declare function enrichContactFromZalo(accountId: string, externalUid: string, contactId: string): Promise<{
    phone?: string;
    avatarUrl?: string;
    displayName?: string;
} | null>;
export declare function handleMessageUndo(accountId: string, externalMsgId: string): Promise<void>;
