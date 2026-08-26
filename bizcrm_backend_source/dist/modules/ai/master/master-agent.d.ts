export interface CaseContext {
    conversationId: string;
    customerName: string | null;
    customerMessage: string | null;
    flaggedReply: string | null;
    feedbackText: string | null;
    feedbackCategory: string | null;
    transcript: string[];
    routerDecision: unknown | null;
    responderSystemPrompt: string | null;
    kbUsed: string[];
    toolCalls: Array<{
        name: string;
        result: string;
    }>;
}
export declare function loadCaseContext(orgId: string, opts: {
    conversationId?: string | null;
    aiReplyRunId?: string | null;
    messageId?: string | null;
}): Promise<CaseContext | null>;
export interface OrgInventory {
    productCategories: Array<{
        id: string;
        name: string;
    }>;
    knowledgeCategories: Array<{
        id: string;
        name: string;
        kind: string;
    }>;
    products: Array<{
        id: string;
        name: string;
    }>;
    kbEntries: Array<{
        id: string;
        label: string;
        format: string;
        categoryId: string | null;
    }>;
    scenarios: Array<{
        id: string;
        name: string;
        description: string;
        loadMode: string;
        enabled: boolean;
    }>;
}
export declare function loadOrgInventory(orgId: string): Promise<OrgInventory>;
export interface OpenSessionInput {
    orgId: string;
    openedByUserId: string;
    contextConversationId?: string;
    seedFeedbackId?: string;
}
export interface MasterSessionRow {
    id: string;
    orgId: string;
    openedByUserId: string;
    contextConversationId: string | null;
    seedFeedbackId: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
}
/**
 * Open a new AI Master session.
 * Optionally seeded from a feedback box entry or tied to a conversation.
 */
export declare function openSession(input: OpenSessionInput): Promise<MasterSessionRow>;
export interface SendMasterMessageResult {
    reply: string;
    proposalId?: string;
}
/**
 * Send a user message to the Master and get a reply.
 *
 * Steps:
 *  1. Load session + prior messages (history)
 *  2. Resolve active logic context (getActiveLogicContext)
 *  3. Load seed feedback text if session has seedFeedbackId
 *  4. Build system prompt + conversation history as a single user prompt
 *  5. Call the ai_master provider
 *  6. Parse structured proposal block (if any) → create AiLogicProposal
 *  7. Persist user + assistant messages
 *  8. Return { reply (clean), proposalId? }
 */
export declare function sendMasterMessage(sessionId: string, orgId: string, userText: string): Promise<SendMasterMessageResult>;
/**
 * Close a session (status='closed'). Idempotent.
 */
export declare function closeSession(sessionId: string, orgId: string): Promise<void>;
/**
 * Get a session with its messages (for UI display).
 */
export declare function getSession(sessionId: string, orgId: string): Promise<({
    messages: {
        id: string;
        createdAt: Date;
        role: string;
        content: string | null;
        toolName: string | null;
        toolData: import("@prisma/client/runtime/library").JsonValue;
    }[];
} & {
    id: string;
    orgId: string;
    createdAt: Date;
    status: string;
    updatedAt: Date;
    openedByUserId: string;
    contextConversationId: string | null;
    seedFeedbackId: string | null;
}) | null>;
