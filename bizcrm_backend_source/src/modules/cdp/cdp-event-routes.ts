import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'
import type { Prisma } from '@prisma/client'
import { badRequest, notFound } from '../../shared/http-errors.js'
import { runAutomationRules } from '../automation/automation-engine.js'
import { logger } from '../../shared/logger.js'
import Ajv from 'ajv'

const ajv = new Ajv({ allErrors: true, removeAdditional: false })

export async function cdpEventRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  // ── TRACK event (internal — JWT auth) ───────────────────────────
  app.post<{
    Body: {
      contactId: string
      eventName: string
      properties?: Record<string, unknown>
      source?: string
      sessionId?: string
      timestamp?: string
    }
  }>('/api/v1/cdp/events', async (request, reply) => {
    const user = request.user as { orgId: string }
    const { contactId, eventName, properties, source, sessionId, timestamp } = request.body

    if (!contactId || !eventName?.trim()) {
      return badRequest(reply, 'contactId and eventName are required')
    }

    // Verify contact belongs to org
    const contact = await prisma.contact.findFirst({
      where: { id: contactId, orgId: user.orgId },
      select: { id: true },
    })
    if (!contact) return notFound(reply, 'Contact')

    // Get schema definition if exists
    const definition = await prisma.cdpEventDefinition.findFirst({
      where: { orgId: user.orgId, eventName: eventName, isActive: true },
    })

    if (definition && definition.schema) {
      try {
        const validate = ajv.compile(definition.schema as object)
        const valid = validate(properties ?? {})
        if (!valid) {
          return reply.code(400).send({ 
            error: 'Event payload validation failed', 
            details: validate.errors 
          })
        }
      } catch (err: any) {
        app.log.error(`Schema validation failed for ${eventName}: ${err.message}`)
      }
    }

    const event = await prisma.cdpEvent.create({
      data: {
        orgId: user.orgId,
        contactId,
        eventName: eventName.trim(),
        properties: (properties ?? {}) as Prisma.InputJsonValue,
        source: source || 'api',
        sessionId: sessionId || null,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      },
    })

    // Also update contact lastActivity
    await prisma.contact.update({
      where: { id: contactId },
      data: { lastActivity: new Date() },
    })

    // Fire automation rules matching this event name (fire-and-forget)
    runAutomationRules(eventName.trim(), {
      orgId: user.orgId,
      contactId,
      triggerData: properties as Record<string, any>,
    }).catch(err => logger.error({ err }, `[automation] cdp event ${eventName} trigger error`))

    // Also fire generic 'event_tracked' trigger for rules listening to any event
    runAutomationRules('event_tracked', {
      orgId: user.orgId,
      contactId,
      triggerData: {
        eventName: eventName.trim(),
        ...(properties as Record<string, any> || {}),
      },
    }).catch(err => logger.error({ err }, `[automation] event_tracked trigger error`))

    return reply.code(201).send({ event })
  })

  // ── BATCH TRACK events ──────────────────────────────────────────
  app.post<{
    Body: {
      events: {
        contactId: string
        eventName: string
        properties?: Record<string, unknown>
        source?: string
        timestamp?: string
      }[]
    }
  }>('/api/v1/cdp/events/batch', async (request, reply) => {
    const user = request.user as { orgId: string }
    const { events } = request.body

    if (!events?.length) return badRequest(reply, 'events array is required')
    if (events.length > 100) return badRequest(reply, 'Max 100 events per batch')

    // Fetch all relevant active definitions
    const eventNames = [...new Set(events.map(e => e.eventName.trim()))]
    const definitions = await prisma.cdpEventDefinition.findMany({
      where: { orgId: user.orgId, eventName: { in: eventNames }, isActive: true },
    })

    const defMap = new Map()
    for (const def of definitions) {
      if (def.schema) {
        try {
          defMap.set(def.eventName, ajv.compile(def.schema as object))
        } catch (err: any) {
          app.log.error(`Failed to compile schema for ${def.eventName}: ${err.message}`)
        }
      }
    }

    // Validate all events
    const validEvents = []
    const invalidEvents = []

    for (let i = 0; i < events.length; i++) {
      const e = events[i]
      const validate = defMap.get(e.eventName.trim())
      if (validate) {
        const isValid = validate(e.properties ?? {})
        if (!isValid) {
          invalidEvents.push({ index: i, eventName: e.eventName, errors: validate.errors })
          continue
        }
      }
      validEvents.push(e)
    }

    if (validEvents.length === 0) {
      return reply.code(400).send({ error: 'All events failed schema validation', details: invalidEvents })
    }

    const created = await prisma.cdpEvent.createMany({
      data: validEvents.map(e => ({
        orgId: user.orgId,
        contactId: e.contactId,
        eventName: e.eventName.trim(),
        properties: (e.properties ?? {}) as Prisma.InputJsonValue,
        source: e.source || 'api',
        timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
      })),
    })

    if (invalidEvents.length > 0) {
      return reply.code(207).send({ 
        message: 'Partial success', 
        created: created.count,
        failed: invalidEvents.length,
        details: invalidEvents 
      })
    }

    return reply.code(201).send({ created: created.count })
  })

  // ── QUERY events (with filters) ────────────────────────────────
  app.get<{
    Querystring: {
      contactId?: string
      eventName?: string
      from?: string
      to?: string
      source?: string
      limit?: string
      offset?: string
    }
  }>('/api/v1/cdp/events', async (request) => {
    const user = request.user as { orgId: string }
    const { contactId, eventName, from, to, source, limit = '50', offset = '0' } = request.query

    const where: any = { orgId: user.orgId }
    if (contactId) where.contactId = contactId
    if (eventName) where.eventName = eventName
    if (source) where.source = source
    if (from || to) {
      where.timestamp = {}
      if (from) where.timestamp.gte = new Date(from)
      if (to) where.timestamp.lte = new Date(to)
    }

    const [events, total] = await Promise.all([
      prisma.cdpEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: Math.min(parseInt(limit), 200),
        skip: parseInt(offset),
        include: {
          contact: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      }),
      prisma.cdpEvent.count({ where }),
    ])

    return { events, total }
  })

  // ── GET events for a specific contact ───────────────────────────
  app.get<{
    Params: { contactId: string }
    Querystring: { limit?: string; offset?: string }
  }>('/api/v1/contacts/:contactId/events', async (request, reply) => {
    const user = request.user as { orgId: string }
    const { contactId } = request.params
    const { limit = '50', offset = '0' } = request.query

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, orgId: user.orgId },
      select: { id: true },
    })
    if (!contact) return notFound(reply, 'Contact')

    const [events, total] = await Promise.all([
      prisma.cdpEvent.findMany({
        where: { contactId, orgId: user.orgId },
        orderBy: { timestamp: 'desc' },
        take: Math.min(parseInt(limit) || 50, 200),
        skip: parseInt(offset) || 0,
      }),
      prisma.cdpEvent.count({ where: { contactId, orgId: user.orgId } }),
    ])

    return { events, total }
  })

  // ── EVENT STATS (aggregation) ───────────────────────────────────
  app.get<{
    Querystring: { contactId?: string; days?: string }
  }>('/api/v1/cdp/events/stats', async (request) => {
    const user = request.user as { orgId: string }
    const { contactId, days = '30' } = request.query

    const since = new Date()
    since.setDate(since.getDate() - parseInt(days))

    const where: any = { orgId: user.orgId, timestamp: { gte: since } }
    if (contactId) where.contactId = contactId

    const events = await prisma.cdpEvent.groupBy({
      by: ['eventName'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    })

    const totalEvents = await prisma.cdpEvent.count({ where })

    return {
      totalEvents,
      byEventName: events.map(e => ({ name: e.eventName, count: e._count.id })),
      period: `${days} days`,
    }
  })

  // ── UNIFIED TIMELINE ────────────────────────────────────────────
  // Merge messages, notes, appointments, events, lifecycle logs
  app.get<{
    Params: { contactId: string }
    Querystring: { limit?: string; offset?: string }
  }>('/api/v1/contacts/:contactId/timeline', async (request, reply) => {
    const user = request.user as { orgId: string }
    const { contactId } = request.params
    const limitParsed = Math.min(parseInt(request.query.limit || '50') || 50, 200)
    const offsetParsed = parseInt(request.query.offset || '0') || 0

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, orgId: user.orgId },
      select: { id: true },
    })
    if (!contact) return notFound(reply, 'Contact')

    // Fetch all types in parallel
    const [messages, notes, appointments, cdpEvents, lifecycleLogs] = await Promise.all([
      prisma.message.findMany({
        where: { conversation: { contactId, orgId: user.orgId } },
        orderBy: { sentAt: 'desc' },
        take: limitParsed,
        select: {
          id: true, content: true, contentType: true, senderType: true,
          senderName: true, sentAt: true,
        },
      }),
      prisma.note.findMany({
        where: { contactId, orgId: user.orgId },
        orderBy: { createdAt: 'desc' },
        take: limitParsed,
        include: { createdBy: { select: { fullName: true } } },
      }),
      prisma.appointment.findMany({
        where: { contactId, orgId: user.orgId },
        orderBy: { appointmentDate: 'desc' },
        take: limitParsed,
        include: { assignedUser: { select: { fullName: true } } },
      }),
      prisma.cdpEvent.findMany({
        where: { contactId, orgId: user.orgId },
        orderBy: { timestamp: 'desc' },
        take: limitParsed,
      }),
      prisma.lifecycleLog.findMany({
        where: { contactId, orgId: user.orgId },
        orderBy: { createdAt: 'desc' },
        take: limitParsed,
      }),
    ])

    // Unify into timeline items
    type TimelineItem = { type: string; timestamp: string; data: any }
    const items: TimelineItem[] = []

    messages.forEach(m => items.push({
      type: 'message',
      timestamp: m.sentAt.toISOString(),
      data: m,
    }))
    notes.forEach(n => items.push({
      type: 'note',
      timestamp: n.createdAt.toISOString(),
      data: { ...n, authorName: n.createdBy?.fullName || 'Unknown' },
    }))
    appointments.forEach(a => items.push({
      type: 'appointment',
      timestamp: a.appointmentDate.toISOString(),
      data: { ...a, assignedName: a.assignedUser?.fullName || null },
    }))
    cdpEvents.forEach(e => items.push({
      type: 'event',
      timestamp: e.timestamp.toISOString(),
      data: e,
    }))
    lifecycleLogs.forEach(l => items.push({
      type: 'lifecycle',
      timestamp: l.createdAt.toISOString(),
      data: l,
    }))

    // Sort by timestamp descending, then paginate
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    const paginated = items.slice(offsetParsed, offsetParsed + limitParsed)

    return { items: paginated, total: items.length }
  })
}
