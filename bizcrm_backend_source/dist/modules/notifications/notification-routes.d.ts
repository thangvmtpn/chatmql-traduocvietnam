/**
 * notification-routes.ts — REST API for in-app notifications.
 * Lists, marks as read, and marks all as read.
 */
import type { FastifyInstance } from 'fastify';
export declare function notificationRoutes(app: FastifyInstance): Promise<void>;
