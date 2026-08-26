/**
 * chat-message-routes.ts — Send text/image/file messages + shared media endpoint.
 * Extracted from chat-routes.ts for modularization.
 */
import type { FastifyInstance } from 'fastify';
export declare function chatMessageRoutes(app: FastifyInstance): Promise<void>;
