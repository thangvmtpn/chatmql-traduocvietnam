import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'
import { ALL_PRESETS, PRESET_MAP, buildFlowConfigFromPreset } from '../../shared/presets/index.js'
import { notFound, badRequest } from '../../shared/http-errors.js'

export async function cdpPresetRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  // ── LIST all preset packages (metadata only) ────────────────────
  app.get('/api/v1/cdp/presets', async () => ({
    presets: ALL_PRESETS.map(p => ({
      key: p.key, name: p.name, description: p.description, icon: p.icon,
      groupName: p.groupName,
      counts: {
        properties: p.properties.length,
        events: p.events.length,
        automations: p.automations.length,
      },
    })),
  }))

  // ── GET install status for current org (MUST be before /:key) ───
  app.get('/api/v1/cdp/presets/status', async (request) => {
    const { orgId } = request.user as { orgId: string }
    const props = await prisma.customProperty.findMany({
      where: { orgId }, select: { fieldKey: true },
    })
    const events = await prisma.cdpEventDefinition.findMany({
      where: { orgId }, select: { eventName: true },
    })
    const propKeys = new Set(props.map(p => p.fieldKey))
    const eventNames = new Set(events.map(e => e.eventName))

    const status: Record<string, { installed: boolean; propsInstalled: number; eventsInstalled: number }> = {}
    for (const preset of ALL_PRESETS) {
      const pi = preset.properties.filter(p => propKeys.has(p.fieldKey)).length
      const ei = preset.events.filter(e => eventNames.has(e.eventName)).length
      status[preset.key] = {
        installed: pi === preset.properties.length && ei === preset.events.length,
        propsInstalled: pi,
        eventsInstalled: ei,
      }
    }
    return { status }
  })

  // ── GET preset detail ───────────────────────────────────────────
  app.get<{ Params: { key: string } }>('/api/v1/cdp/presets/:key', async (request, reply) => {
    const preset = PRESET_MAP.get(request.params.key)
    if (!preset) return notFound(reply, 'Preset')
    return { preset }
  })

  // ── APPLY a preset ─────────────────────────────────────────────
  app.post<{
    Params: { key: string }
    Body: { selectedProperties?: string[]; selectedEvents?: string[]; selectedAutomations?: string[] }
  }>('/api/v1/cdp/presets/:key/apply', async (request, reply) => {
    const { orgId } = request.user as { orgId: string }
    const preset = PRESET_MAP.get(request.params.key)
    if (!preset) return notFound(reply, 'Preset')

    const { selectedProperties, selectedEvents, selectedAutomations } = request.body || {}

    const result = await prisma.$transaction(async (tx) => {
      // Get existing keys to skip duplicates
      const existingProps = await tx.customProperty.findMany({
        where: { orgId }, select: { fieldKey: true },
      })
      const existingEvents = await tx.cdpEventDefinition.findMany({
        where: { orgId }, select: { eventName: true },
      })
      const propKeySet = new Set(existingProps.map(p => p.fieldKey))
      const eventNameSet = new Set(existingEvents.map(e => e.eventName))

      const counts = { created: { props: 0, events: 0, automations: 0 }, skipped: { props: 0, events: 0 } }

      // Apply properties
      const propsToApply = selectedProperties
        ? preset.properties.filter(p => selectedProperties.includes(p.fieldKey))
        : preset.properties

      for (const p of propsToApply) {
        if (propKeySet.has(p.fieldKey)) { counts.skipped.props++; continue }
        await tx.customProperty.create({
          data: {
            orgId, name: p.name, fieldKey: p.fieldKey, fieldType: p.fieldType,
            options: p.options ?? [], isRequired: false,
            groupName: preset.groupName, description: p.description ?? null,
            sortOrder: p.sortOrder ?? 0,
          },
        })
        counts.created.props++
      }

      // Apply events
      const eventsToApply = selectedEvents
        ? preset.events.filter(e => selectedEvents.includes(e.eventName))
        : preset.events

      for (const e of eventsToApply) {
        if (eventNameSet.has(e.eventName)) { counts.skipped.events++; continue }
        await tx.cdpEventDefinition.create({
          data: {
            orgId, eventName: e.eventName, displayName: e.displayName,
            description: e.description ?? null, schema: {}, isActive: true,
          },
        })
        counts.created.events++
      }

      // Apply automations (v2 format — with flowConfig for DAG engine)
      const autoToApply = selectedAutomations
        ? preset.automations.filter(a => selectedAutomations.includes(a.name))
        : preset.automations

      for (const auto of autoToApply) {
        let templateId: string | undefined
        if (auto.templateName && auto.templateContent) {
          const tmpl = await tx.messageTemplate.create({
            data: {
              orgId, name: auto.templateName, content: auto.templateContent,
              category: 'preset',
            },
          })
          templateId = tmpl.id
        }

        // Resolve template placeholders for v1 compat field
        const actions = auto.actions.map(a =>
          a.params.templateId === '__preset__' && templateId ? { ...a, params: { ...a.params, templateId } } : a
        )

        // Build v2 flowConfig (DAG) so the unified engine can execute this rule
        const flowConfig = buildFlowConfigFromPreset(auto, templateId)

        await tx.automationRule.create({
          data: {
            orgId, name: auto.name, description: auto.description ?? null,
            trigger: auto.trigger, conditions: auto.conditions, actions,
            enabled: true, priority: 0,
            flowVersion: 2,
            flowConfig,
          },
        })
        counts.created.automations++
      }

      return counts
    })

    return reply.code(201).send(result)
  })

  // ── UNINSTALL a preset ──────────────────────────────────────────
  app.delete<{ Params: { key: string } }>('/api/v1/cdp/presets/:key/uninstall', async (request, reply) => {
    const { orgId } = request.user as { orgId: string }
    const preset = PRESET_MAP.get(request.params.key)
    if (!preset) return notFound(reply, 'Preset')

    const result = await prisma.$transaction(async (tx) => {
      const propFieldKeys = preset.properties.map(p => p.fieldKey)
      const eventNames = preset.events.map(e => e.eventName)
      const autoNames = preset.automations.map(a => a.name)

      // Delete property values first (FK), then properties
      const propsToDelete = await tx.customProperty.findMany({
        where: { orgId, fieldKey: { in: propFieldKeys } },
        select: { id: true },
      })
      const propIds = propsToDelete.map(p => p.id)
      if (propIds.length > 0) {
        await tx.contactPropertyValue.deleteMany({ where: { orgId, propertyId: { in: propIds } } })
        await tx.customProperty.deleteMany({ where: { orgId, id: { in: propIds } } })
      }

      // Delete events
      const deletedEvents = await tx.cdpEventDefinition.deleteMany({
        where: { orgId, eventName: { in: eventNames } },
      })

      // Delete automation rules matching preset names
      const deletedAutos = await tx.automationRule.deleteMany({
        where: { orgId, name: { in: autoNames } },
      })

      return { deleted: { props: propIds.length, events: deletedEvents.count, automations: deletedAutos.count } }
    })

    return { success: true, ...result }
  })
}
