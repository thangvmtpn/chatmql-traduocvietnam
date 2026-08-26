export type TraceStep = 'assemble' | 'router' | 'retrieve' | 'generator' | 'tool' | 'critic' | 'error';
export type TraceLevel = 'info' | 'error';
export interface RecordStepInput {
    orgId: string;
    conversationId?: string;
    aiReplyRunId?: string;
    step: TraceStep;
    level?: TraceLevel;
    /** Raw payload — will be PII-redacted and size-capped before persist */
    payload: Record<string, unknown>;
    latencyMs?: number;
}
/**
 * Record a single harness step as AiTrace. Fire-and-forget — never throws.
 * Caller MUST NOT await this (or must catch errors themselves if they do).
 */
export declare function recordStep(input: RecordStepInput): void;
