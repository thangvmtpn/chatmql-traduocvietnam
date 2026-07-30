/**
 * Centralized HTTP error response helpers.
 * Replaces 89+ inline reply.code(4xx).send({ error: '...' }) patterns.
 */
import type { FastifyReply } from 'fastify'

export function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: message })
}

export function unauthorized(reply: FastifyReply, message = 'Unauthorized') {
  return reply.code(401).send({ error: message })
}

export function forbidden(reply: FastifyReply, message = 'Forbidden') {
  return reply.code(403).send({ error: message })
}

export function notFound(reply: FastifyReply, entity = 'Resource') {
  return reply.code(404).send({ error: `${entity} not found` })
}

export function conflict(reply: FastifyReply, message: string) {
  return reply.code(409).send({ error: message })
}

export function serverError(reply: FastifyReply, message = 'Internal server error') {
  return reply.code(500).send({ error: message })
}
