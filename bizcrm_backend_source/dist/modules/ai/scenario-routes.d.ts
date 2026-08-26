/**
 * scenario-routes.ts — CRUD for modular logic SCENARIOS (skills).
 * Reads: any authenticated user. Writes: owner/admin only.
 * Endpoints under /api/v1/ai/scenarios.
 */
import type { FastifyInstance } from 'fastify';
export declare function scenarioRoutes(app: FastifyInstance): Promise<void>;
