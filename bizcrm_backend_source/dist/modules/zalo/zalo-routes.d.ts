/**
 * zalo-routes.ts — Zalo account management routes.
 * Ported from ZaloCRM. QR login + zca-js SDK integration deferred to D9.
 */
import type { FastifyInstance } from 'fastify';
export declare function zaloRoutes(app: FastifyInstance): Promise<void>;
