/**
 * zalo-access-middleware.ts — Enforce Zalo account access control.
 *
 * Access model:
 * - owner/admin org roles bypass ACL entirely (full access to all conversations)
 * - manager: if has subordinates → sees own accounts + subordinates' accounts;
 *            if no subordinates → sees only own accounts (same as member)
 * - members must have an explicit ChannelAccountAccess entry
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
/**
 * Resolve all account IDs accessible by a manager (own + subordinates').
 * Caches result on request to avoid re-querying within same request lifecycle.
 */
declare function resolveManagerAccountIds(userId: string): Promise<Set<string>>;
/**
 * Creates a Fastify preHandler that enforces Zalo account access.
 * Owner / admin always pass. Manager uses subordinate-based scoping.
 * Members pass only if they have an entry in ChannelAccountAccess.
 *
 * @example
 * app.get('/api/v1/conversations/:id/messages', { preHandler: requireZaloAccess() }, handler)
 */
export declare function requireZaloAccess(): (request: FastifyRequest, reply: FastifyReply) => Promise<undefined>;
/**
 * Helper exported for use in conversation list queries.
 * Returns the set of channelAccountIds a manager can access.
 */
export { resolveManagerAccountIds };
