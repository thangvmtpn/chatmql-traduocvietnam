/**
 * critic.ts — Verify-before-send reviewer (P6).
 *
 * A cheap second-opinion pass: given the customer message, the drafted reply,
 * the quality criteria, and the grounding the reply should rest on, decide
 * whether the reply is safe to send or should be handed off to a human.
 * Fail-OPEN on parse errors (don't block legit replies on critic infra issues).
 */
export type CriticVerdict = {
    ok: boolean;
    action: 'send' | 'handoff';
    reason: string;
};
export declare function buildCriticPrompt(input: {
    customerMessage: string;
    reply: string;
    criteria: string | null;
    grounding: string;
}): string;
export declare function parseCriticVerdict(raw: string): CriticVerdict;
