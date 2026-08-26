/**
 * chat-routes.ts — REST API for conversations and messages.
 * Ported from ZaloCRM with adaptations for BizCRM.
 */
import type { FastifyInstance } from 'fastify';
import { type ActorKindValue } from '../../shared/constants.js';
/** Build a SendMessageQuote compatible with zca-js sendMessage API */
export declare function buildReplyQuote(message: {
    externalMsgId: string | null;
    senderUid: string | null;
    content: string | null;
    contentType: string;
    sentAt: Date;
}): {
    content: string;
    msgType: string;
    propertyExt: {};
    uidFrom: string;
    msgId: string;
    cliMsgId: string;
    ts: string;
    ttl: number;
} | null;
/**
 * Convert the DB-shaped `quote` JSON into the `reply` shape the frontend renders.
 * Apply at every place a message is returned to the client (HTTP response + socket emit)
 * so the quote box appears live, not just after a /messages refetch on reload.
 */
export declare function transformMessageForFrontend<T extends {
    quote?: unknown;
    contentType?: string;
    content?: string | null;
}>(message: T): Omit<T, 'quote'> & {
    reply: {
        msgId: string;
        cliMsgId?: string;
        content: string;
        msgType: string;
        uidFrom: string;
        ts: string;
    } | null;
    actorKind: ActorKindValue;
};
export declare function chatRoutes(app: FastifyInstance): Promise<void>;
