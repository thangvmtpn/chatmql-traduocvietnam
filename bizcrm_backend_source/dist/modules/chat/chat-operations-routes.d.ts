/**
 * chat-operations-routes.ts — Extended chat operations: undo (thu hồi), sticker.
 * Ported from ZaloCRM reference: uses zca-js undo() and sendSticker() APIs.
 */
import type { FastifyInstance } from 'fastify';
export declare function chatOperationsRoutes(app: FastifyInstance): Promise<void>;
