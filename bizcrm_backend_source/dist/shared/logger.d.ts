/**
 * Shared logger — thin wrapper around pino for use outside Fastify routes.
 *
 * Inside route handlers, prefer `request.log` or `app.log`.
 * For standalone modules (cron jobs, pool managers, etc.) import this logger.
 */
import pino from 'pino';
export declare const logger: pino.Logger<never, boolean>;
