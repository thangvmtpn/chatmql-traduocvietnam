/**
 * Shared logger — thin wrapper around pino for use outside Fastify routes.
 *
 * Inside route handlers, prefer `request.log` or `app.log`.
 * For standalone modules (cron jobs, pool managers, etc.) import this logger.
 */
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
})
