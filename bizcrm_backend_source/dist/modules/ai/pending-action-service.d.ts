export type PendingActionType = 'request_appointment';
export type PendingActionStatus = 'pending' | 'confirmed' | 'rejected';
/** Record a pending action from a responder tool call. Resolves contactId from the conversation. */
export declare function recordPendingAction(input: {
    orgId: string;
    conversationId?: string | null;
    type: PendingActionType;
    payload: Record<string, unknown>;
}): Promise<{
    id: string;
    summary: string;
}>;
export declare function listPendingActions(orgId: string, status?: PendingActionStatus, limit?: number): Promise<{
    id: string;
    orgId: string;
    createdAt: Date;
    status: string;
    updatedAt: Date;
    contactId: string | null;
    type: string;
    conversationId: string | null;
    summary: string | null;
    payload: import("@prisma/client/runtime/library").JsonValue;
    reviewedBy: string | null;
    executedRef: string | null;
}[]>;
export declare function rejectAction(id: string, orgId: string, reviewedBy: string): Promise<boolean>;
/**
 * Confirm + execute a pending action. Only 'pending' actions can be confirmed.
 * Execution per type. Returns the created entity ref (or null).
 */
export declare function confirmAction(id: string, orgId: string, reviewedBy: string): Promise<{
    ok: boolean;
    executedRef: string | null;
    error?: string;
}>;
