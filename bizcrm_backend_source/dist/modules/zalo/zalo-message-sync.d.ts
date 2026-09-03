/**
 * Register custom APIs into zca-js instance (e.g. getUserChatHistory).
 */
export declare function registerCustomApis(api: any): void;
/**
 * Sync recent group messages for one account.
 */
export declare function syncGroupMessages(api: any, accountId: string): Promise<number>;
/**
 * Sync recent 1-1 user messages for one account.
 */
export declare function syncUserMessages(api: any, accountId: string): Promise<number>;
/**
 * Deep backfill for a single conversation (Group or 1-1 User) with pagination.
 */
export declare function backfillConversation(api: any, accountId: string, threadId: string, threadType?: 'user' | 'group', maxMessages?: number): Promise<{
    inserted: number;
    skipped: number;
    total: number;
}>;
/**
 * Backfill all conversations for an account.
 */
export declare function backfillAllAccountConversations(api: any, accountId: string, orgId: string, maxMessages?: number): Promise<{
    totalConversations: number;
    totalInserted: number;
    totalSkipped: number;
    errors: any[];
}>;
/**
 * Quét theo DANH SÁCH BẠN BÈ — kéo lịch sử cả những người CHƯA có hội thoại.
 *
 * backfillAllAccountConversations chỉ đi qua hội thoại đã có trong CSDL, nên
 * khách từng chat trước khi kết nối ChatMQL rồi im lặng sẽ không bao giờ được
 * kéo về. Hàm này duyệt bạn bè đã đồng bộ lúc kết nối (ChannelContact), bỏ qua
 * ai đã có hội thoại, và thử kéo lịch sử cho phần còn lại. Người nào thật sự
 * có tin thì handleIncomingMessage tự tạo hội thoại + liên hệ; ai không có tin
 * thì không tạo gì cả, nên không sinh rác.
 */
export declare function backfillFriendThreads(api: any, accountId: string, orgId: string, maxMessages?: number, maxFriends?: number): Promise<{
    scanned: number;
    withHistory: number;
    totalInserted: number;
    errors: any[];
}>;
/** Start periodic group & user sync for an account. */
export declare function startMessageSync(api: any, accountId: string): void;
/** Stop periodic sync for an account. */
export declare function stopMessageSync(accountId: string): void;
