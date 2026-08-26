/**
 * kb-routes.ts — Fastify plugin: KnowledgeEntry CRUD + approval, ContactMemory edit.
 * ACL: KB write = owner/admin. Memory edit = any authenticated member.
 * Registration: caller (app.ts via orchestrator) calls app.register(kbRoutes).
 */
import type { FastifyInstance } from 'fastify';
export default function kbRoutes(app: FastifyInstance): Promise<void>;
