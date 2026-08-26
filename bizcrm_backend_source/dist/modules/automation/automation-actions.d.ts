import type { AutomationContext } from './automation-types.js';
/**
 * Execute a single action node by type.
 */
export declare function executeNodeAction(actionType: string, config: Record<string, unknown>, ctx: AutomationContext): Promise<Record<string, any> | undefined>;
/**
 * Send a text message for the given automation context via sendMessageCore.
 * Creates the Message record + emits socket + triggers automation rules.
 * Silently logs on failure (automation should not fail because of delivery).
 */
export declare function trySendViaZalo(ctx: AutomationContext, text: string): Promise<void>;
