/** Find or create the per-org WEBCHAT channel that hosts all web conversations. */
export declare function getOrCreateWebChannel(orgId: string, ownerUserId: string): Promise<string>;
export type WebChatInbound = {
    orgId: string;
    ownerUserId: string;
    conversationId?: string;
    text: string;
    visitorName?: string;
    aiMode?: string;
};
/**
 * Deliver a visitor (customer) message into the real conversation pipeline.
 * Returns the conversation id (new or existing).
 */
export declare function deliverWebVisitorMessage(input: WebChatInbound): Promise<{
    conversationId: string;
    threadId: string;
}>;
