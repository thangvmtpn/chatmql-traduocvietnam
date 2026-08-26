interface ZnsContact {
    id: string;
    fullName?: string | null;
    zaloUid?: string | null;
}
/**
 * Find (or create) the OA conversation for a contact so a ZNS send always has a
 * timeline to land on. Mirrors oa-webhook.ts insertSystemMessage's resolve logic
 * (match by external thread uid OR contact+threadType, else create).
 */
export declare function resolveOrCreateOaConversation(accountId: string, orgId: string, contact: ZnsContact): Promise<string>;
interface CreateZnsMessageArgs {
    conversationId: string;
    orgId: string;
    znsLogId: string;
    externalMsgId?: string | null;
    templateId: string;
    templateData: Record<string, unknown>;
    trackingId: string;
    templateName?: string | null;
    sentByUserId?: string | null;
    sentAt?: Date;
}
/**
 * Append a zns_template Message linked to its ZnsLog, bump the conversation,
 * and emit it so the chat reflects the send. Returns the new message id.
 */
export declare function createZnsMessage(args: CreateZnsMessageArgs): Promise<string>;
export {};
