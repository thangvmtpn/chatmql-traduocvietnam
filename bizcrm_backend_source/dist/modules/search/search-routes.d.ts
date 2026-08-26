/**
 * search-routes.ts — Global search across contacts, conversations, and messages.
 *
 * Uses PostgreSQL `unaccent()` extension so Vietnamese text is matched
 * regardless of diacritics:  "dat" → matches "đạt", "Đạt", "Dạt", etc.
 *
 * Prerequisite: CREATE EXTENSION IF NOT EXISTS unaccent;
 */
import type { FastifyInstance } from 'fastify';
export declare function searchRoutes(app: FastifyInstance): Promise<void>;
