import { Platform } from '../../shared/constants.js'
import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'
import { computeLeadScore } from './lead-scoring.js'
import { applyAutoTags } from './auto-tagger.js'
import { runAutomationRules } from '../automation/automation-engine.js'
import { emitDomainEvent } from '../../shared/domain-events.js'
import { changeLifecycleStage, isValidStage } from '../cdp/lifecycle-service.js'
import { badRequest, notFound } from '../../shared/http-errors.js'
import { resolveZaloAlias } from '../zalo/zalo-alias.js'
import { extractAvatarHash, groupByAvatarHash } from './avatar-hash.js'
import { extractPhoneFromName } from './phone-extractor.js'

/**
 * Per the Phân quyền matrix: members see only contacts assigned to
 * themselves ("Của mình"); manager / admin / owner see all org contacts.
 */
function memberScopeFilter(user: { id: string; role: string }) {
  return user.role === 'member' ? { assignedUserId: user.id } : {}
}

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  // All contact routes require auth
  app.addHook('preHandler', authMiddleware)

  // GET /api/v1/contacts — list with filters + pagination
  app.get<{
    Querystring: { page?: string; limit?: string; search?: string; source?: string; lifecycleStage?: string; companyId?: string; assignedUserId?: string }
  }>('/api/v1/contacts', async (request) => {
    const user = request.user as { id: string; orgId: string; role: string }
    const { page = '1', limit = '20', search, source, lifecycleStage, companyId, assignedUserId } = request.query

    const pageNum = Math.max(1, parseInt(page))
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)))
    const skip = (pageNum - 1) * limitNum

    const where: any = { orgId: user.orgId, mergedInto: null, isGroup: false, deletedAt: null, ...memberScopeFilter(user) }
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ]
    }
    if (source) where.source = { in: (source as string).split(',') }
    if (lifecycleStage) where.lifecycleStage = { in: (lifecycleStage as string).split(',') }
    if (companyId) where.companyId = companyId
    // Member scope wins over the query filter — they can only ever filter inside their own contacts
    if (assignedUserId && user.role !== 'member') where.assignedUserId = { in: (assignedUserId as string).split(',') }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedUser: { select: { fullName: true } },
          company: { select: { id: true, name: true } },
          _count: { select: { conversations: true } },
        },
      }),
      prisma.contact.count({ where }),
    ])

    return { contacts, total, page: pageNum, limit: limitNum }
  })

  // GET /api/v1/contacts/:id — single contact
  app.get<{ Params: { id: string } }>('/api/v1/contacts/:id', async (request, reply) => {
    const user = request.user as { id: string; orgId: string; role: string }
    const contact = await prisma.contact.findFirst({
      where: { id: request.params.id, orgId: user.orgId, ...memberScopeFilter(user) },
      include: {
        assignedUser: { select: { fullName: true } },
        company: { select: { id: true, name: true, industry: true, website: true } },
        mergedFrom: {
          select: { id: true, fullName: true, phone: true, zaloUid: true, source: true, createdAt: true },
          where: { mergedInto: request.params.id },
        },
        conversations: {
          select: {
            id: true,
            displayName: true,
            threadType: true,
            lastMessageAt: true,
            unreadCount: true,
            channelAccount: { select: { id: true, displayName: true } },
            messages: {
              select: { content: true, contentType: true, senderType: true, sentAt: true },
              orderBy: { sentAt: 'desc' },
              take: 1,
            },
          },
          orderBy: { lastMessageAt: 'desc' },
          take: 20,
        },
        _count: { select: { conversations: true } },
      },
    })
    if (!contact) return reply.status(404).send({ error: 'Contact not found' })
    return contact
  })

  // POST /api/v1/contacts — create. For members, contact is auto-assigned
  // to themselves so it stays inside their "Của mình" scope.
  app.post<{
    Body: { fullName?: string; phone?: string; email?: string; source?: string; lifecycleStage?: string; companyId?: string; jobTitle?: string; isPrimaryContact?: boolean; notes?: string; tags?: string[] }
  }>('/api/v1/contacts', async (request) => {
    const user = request.user as { id: string; orgId: string; role: string }
    const contact = await prisma.contact.create({
      data: {
        orgId: user.orgId,
        ...request.body,
        tags: request.body.tags ?? [],
        ...(user.role === 'member' ? { assignedUserId: user.id } : {}),
      },
    })

    // Fire contact_created automation (fire-and-forget)
    runAutomationRules('contact_created', {
      orgId: user.orgId,
      contactId: contact.id,
      triggerData: {
        contactName: contact.fullName,
        contactPhone: contact.phone,
        source: contact.source,
      },
    }).catch(err => app.log.error({ err }, '[automation] contact_created from manual create failed'))

    emitDomainEvent({ type: 'contact.created', orgId: user.orgId, id: contact.id })
    return contact
  })

  // PUT /api/v1/contacts/:id — update
  app.put<{
    Params: { id: string }
    Body: Partial<{ fullName: string; phone: string; email: string; source: string; lifecycleStage: string; companyId: string | null; jobTitle: string; isPrimaryContact: boolean; notes: string; tags: string[]; assignedUserId: string }>
  }>('/api/v1/contacts/:id', async (request, reply) => {
    const user = request.user as { id: string; orgId: string; role: string }
    const existing = await prisma.contact.findFirst({
      where: { id: request.params.id, orgId: user.orgId, ...memberScopeFilter(user) },
    })
    if (!existing) return reply.status(404).send({ error: 'Contact not found' })

    // Members can't reassign contacts away from themselves
    const body = { ...request.body }
    if (user.role === 'member') delete body.assignedUserId

    // Lifecycle changes go through the shared service (writes LifecycleLog,
    // emits CdpEvent, fires `lifecycle_changed` automation). Strip from the
    // bulk update body and apply after the main update.
    const stageChange = body.lifecycleStage && body.lifecycleStage !== existing.lifecycleStage
      ? body.lifecycleStage
      : null
    delete body.lifecycleStage

    const contact = await prisma.contact.update({
      where: { id: request.params.id },
      data: {
        ...body,
        lastActivity: new Date(),
      },
    })

    if (stageChange) {
      await changeLifecycleStage({
        orgId: user.orgId,
        contactId: contact.id,
        toStage: stageChange,
        changedBy: user.id,
        reason: null,
      })
    }

    // ── Trigger: tag_added / tag_removed ─────────────────────────
    if (body.tags) {
      const oldTags = new Set(Array.isArray(existing.tags) ? existing.tags as string[] : [])
      const newTags = new Set(body.tags)

      for (const tag of newTags) {
        if (!oldTags.has(tag)) {
          runAutomationRules('tag_added', {
            orgId: user.orgId,
            contactId: contact.id,
            triggerData: { tag },
          }).catch(err => app.log.error({ err }, '[automation] tag_added trigger failed'))
        }
      }
      for (const tag of oldTags) {
        if (!newTags.has(tag)) {
          runAutomationRules('tag_removed', {
            orgId: user.orgId,
            contactId: contact.id,
            triggerData: { tag },
          }).catch(err => app.log.error({ err }, '[automation] tag_removed trigger failed'))
        }
      }
    }

    // When the stage changed, changeLifecycleStage already emitted contact.updated — avoid a dup.
    if (!stageChange) emitDomainEvent({ type: 'contact.updated', orgId: user.orgId, id: contact.id })
    return contact
  })

  // DELETE /api/v1/contacts/:id
  app.delete<{ Params: { id: string } }>('/api/v1/contacts/:id', async (request, reply) => {
    const user = request.user as { id: string; orgId: string; role: string }
    const existing = await prisma.contact.findFirst({
      where: { id: request.params.id, orgId: user.orgId, ...memberScopeFilter(user) },
    })
    if (!existing) return reply.status(404).send({ error: 'Contact not found' })

    // Soft delete — preserve data for conversation history
    await prisma.contact.update({ where: { id: request.params.id }, data: { deletedAt: new Date() } })
    emitDomainEvent({ type: 'contact.deleted', orgId: user.orgId, id: request.params.id })
    return { ok: true }
  })

  // POST /api/v1/contacts/:id/convert — manual Lead → Customer conversion.
  // Thin wrapper around the lifecycle service. Default target stage is
  // 'customer'; the caller can pass a different valid stage if needed.
  app.post<{ Params: { id: string }; Body: { toStage?: string; reason?: string } }>(
    '/api/v1/contacts/:id/convert',
    async (request, reply) => {
      const user = request.user as { id: string; orgId: string; role: string }
      const toStage = (request.body?.toStage ?? 'customer').trim()
      if (!isValidStage(toStage)) return badRequest(reply, `Invalid stage: ${toStage}`)

      const existing = await prisma.contact.findFirst({
        where: { id: request.params.id, orgId: user.orgId, ...memberScopeFilter(user) },
        select: { id: true },
      })
      if (!existing) return notFound(reply, 'Contact')

      try {
        const result = await changeLifecycleStage({
          orgId: user.orgId,
          contactId: request.params.id,
          toStage,
          changedBy: user.id,
          reason: request.body?.reason ?? null,
        })
        return result
      } catch (err: any) {
        if (err.message === 'Contact not found') return notFound(reply, 'Contact')
        throw err
      }
    }
  )

  // POST /api/v1/contacts/:id/recompute-score — rule-based scorer.
  // Sibling of POST /api/v1/ai/score-lead: that one runs an LLM, this one is
  // deterministic and free. Use this for contacts that haven't been AI-scored
  // yet, or to cross-check the AI output.
  app.post<{ Params: { id: string } }>('/api/v1/contacts/:id/recompute-score', async (request, reply) => {
    const user = request.user as { id: string; orgId: string; role: string }
    const existing = await prisma.contact.findFirst({
      where: { id: request.params.id, orgId: user.orgId, ...memberScopeFilter(user) },
      select: { id: true },
    })
    if (!existing) return reply.status(404).send({ error: 'Contact not found' })

    try {
      const { score, lastActivity } = await computeLeadScore(request.params.id)
      const tags = await applyAutoTags(request.params.id, score, lastActivity)
      const contact = await prisma.contact.update({
        where: { id: request.params.id },
        data: { leadScore: score, lastActivity, tags },
      })
      return contact
    } catch (err) {
      app.log.error({ err, contactId: request.params.id }, '[contacts] recompute-score failed')
      return reply.status(500).send({ error: 'Failed to recompute lead score' })
    }
  })

  // POST /api/v1/contacts/:id/sync-zalo
  app.post<{ Params: { id: string } }>('/api/v1/contacts/:id/sync-zalo', async (request, reply) => {
    const user = request.user as { id: string; orgId: string; role: string }
    const contact = await prisma.contact.findFirst({
      where: { id: request.params.id, orgId: user.orgId, ...memberScopeFilter(user) },
    })
    if (!contact) return reply.status(404).send({ error: 'Contact not found' })
    if (!contact.zaloUid) return reply.status(400).send({ error: 'Contact has no Zalo UID' })

    const conv = await prisma.conversation.findFirst({
      where: { contactId: contact.id },
      select: {
        channelAccountId: true,
        channelAccount: { select: { platform: true } },
      },
    })
    if (!conv?.channelAccountId) return reply.status(400).send({ error: 'No connected Zalo account available' })

    const isOa = conv.channelAccount?.platform === Platform.ZALO_OA

    try {
      let updateData: any = {}

      if (isOa) {
        // ── OA account: use Zalo OA REST API ──
        const { getClient, forceRefresh } = await import('../zalo-oa/oa-pool.js')
        const { OaApiError } = await import('../zalo-oa/oa-client.js')

        const fetchProfile = async () => {
          const client = await getClient(conv.channelAccountId)
          return client.getFollowerProfile(contact.zaloUid!)
        }

        let profile: Awaited<ReturnType<typeof fetchProfile>>
        try {
          profile = await fetchProfile()
        } catch (err) {
          // Auto-retry once if token expired (e.g. after re-connect with stale cache)
          const isExpired = err instanceof OaApiError && ['-216', '-230', '-32'].includes(String(err.code))
          if (!isExpired) throw err
          await forceRefresh(conv.channelAccountId)
          profile = await fetchProfile()
        }

        if (!profile.displayName && !profile.avatar) {
          return reply.status(400).send({ error: 'Could not fetch profile from Zalo OA' })
        }

        if (profile.displayName) updateData.fullName = profile.displayName
        if (profile.avatar) updateData.avatarUrl = profile.avatar
        if (profile.phone && !contact.phone) updateData.phone = profile.phone

      } else {
        // ── Personal account: use zca-js pool ──
        const { getPoolEntry } = await import('../zalo/zalo-pool.js')
        const entry = getPoolEntry(conv.channelAccountId)
        if (!entry?.api || typeof entry.api.getUserInfo !== 'function') {
          return reply.status(400).send({ error: 'No connected Zalo account available' })
        }

        const info = await entry.api.getUserInfo(contact.zaloUid)
        const profile = info?.changed_profiles?.[contact.zaloUid]
        if (!profile) return reply.status(400).send({ error: 'Could not fetch profile from Zalo' })

        // ── Name resolution: alias (biệt danh) > displayName > zaloName ──
        const customAlias = await resolveZaloAlias(conv.channelAccountId, contact.zaloUid)

        const bestName = customAlias || profile.displayName || profile.zaloName
        if (bestName) updateData.fullName = bestName
        if (profile.avatar) updateData.avatarUrl = profile.avatar
        if (profile.phoneNumber && !contact.phone) updateData.phone = profile.phoneNumber
      }

      if (Object.keys(updateData).length === 0) {
        return { success: true, contact, message: 'No new data to update' }
      }

      const updated = await prisma.contact.update({
        where: { id: contact.id },
        data: updateData
      })

      // Also update displayName on all conversations for this contact
      if (updateData.fullName) {
        await prisma.conversation.updateMany({
          where: { contactId: contact.id, threadType: 'user' },
          data: { displayName: updateData.fullName as string },
        })
      }

      // Also try to update the ZaloFriend cache (personal accounts only)
      if (!isOa && (updateData.fullName || updateData.avatarUrl)) {
        await prisma.channelContact.updateMany({
          where: { friendUid: contact.zaloUid, channelAccountId: conv.channelAccountId },
          data: {
            displayName: updateData.fullName || undefined,
            avatarUrl: updateData.avatarUrl || undefined,
          }
        })
      }

      return { success: true, contact: updated }
    } catch (err: any) {
      request.log.error({ err, contactId: contact.id }, '[sync-zalo] failed')
      return reply.status(500).send({ error: err.message || 'Sync failed' })
    }
  })

  // ── Merge Contacts ──────────────────────────────────────────────

  /** POST /api/v1/contacts/merge — merge multiple contacts into one primary.
   *  Moves all conversations, appointments, notes, CDP events to the primary.
   *  Body: { primaryId: string, mergeIds: string[] } */
  app.post<{
    Body: { primaryId: string; mergeIds: string[] }
  }>('/api/v1/contacts/merge', async (request, reply) => {
    const user = request.user as { id: string; orgId: string; role: string }
    const { primaryId, mergeIds } = request.body

    if (!primaryId || !mergeIds?.length) {
      return reply.status(400).send({ error: 'primaryId and mergeIds are required' })
    }
    if (mergeIds.includes(primaryId)) {
      return reply.status(400).send({ error: 'primaryId cannot be in mergeIds' })
    }

    // Verify all contacts belong to the same org
    const allIds = [primaryId, ...mergeIds]
    const contacts = await prisma.contact.findMany({
      where: { id: { in: allIds }, orgId: user.orgId },
      select: { id: true, fullName: true },
    })
    if (contacts.length !== allIds.length) {
      return reply.status(404).send({ error: 'One or more contacts not found' })
    }

    // Perform merge in a transaction
    await prisma.$transaction(async (tx) => {
      // Snapshot original display name on conversations BEFORE re-assigning contact
      for (const mergeId of mergeIds) {
        const mc = contacts.find(c => c.id === mergeId)
        if (mc?.fullName) {
          await tx.conversation.updateMany({
            where: { contactId: mergeId, displayName: null },
            data: { displayName: mc.fullName },
          })
        }
      }

      // Move all conversations from merge contacts to primary
      await tx.conversation.updateMany({
        where: { contactId: { in: mergeIds } },
        data: { contactId: primaryId },
      })

      // Move appointments
      await tx.appointment.updateMany({
        where: { contactId: { in: mergeIds } },
        data: { contactId: primaryId },
      })

      // Move CDP events
      await tx.cdpEvent.updateMany({
        where: { contactId: { in: mergeIds } },
        data: { contactId: primaryId },
      })

      // Move lifecycle logs
      await tx.lifecycleLog.updateMany({
        where: { contactId: { in: mergeIds } },
        data: { contactId: primaryId },
      })

      // Move custom property values (skip duplicates — same property for same contact)
      const existingProps = await tx.contactPropertyValue.findMany({
        where: { contactId: primaryId },
        select: { propertyId: true },
      })
      const existingPropIds = new Set(existingProps.map(p => p.propertyId))

      // Only move property values that don't already exist on primary
      for (const mergeId of mergeIds) {
        const valuesToMove = await tx.contactPropertyValue.findMany({
          where: { contactId: mergeId, propertyId: { notIn: [...existingPropIds] } },
        })
        for (const v of valuesToMove) {
          await tx.contactPropertyValue.update({
            where: { id: v.id },
            data: { contactId: primaryId },
          })
          existingPropIds.add(v.propertyId)
        }
        // Delete remaining duplicates
        await tx.contactPropertyValue.deleteMany({ where: { contactId: mergeId } })
      }

      // Mark merge contacts as merged + soft delete
      await tx.contact.updateMany({
        where: { id: { in: mergeIds } },
        data: { mergedInto: primaryId, deletedAt: new Date() },
      })
    })

    for (const mergeId of mergeIds) emitDomainEvent({ type: 'contact.deleted', orgId: user.orgId, id: mergeId })
    emitDomainEvent({ type: 'contact.updated', orgId: user.orgId, id: primaryId })

    const primary = await prisma.contact.findUnique({
      where: { id: primaryId },
      include: { assignedUser: { select: { fullName: true } }, conversations: { select: { id: true } } },
    })

    return { ok: true, primary, mergedCount: mergeIds.length }
  })

  // ── Duplicate Detection ──────────────────────────────────────────

  /** GET /api/v1/contacts/duplicates — list unresolved duplicate groups */
  app.get<{
    Querystring: { page?: string; limit?: string; resolved?: string }
  }>('/api/v1/contacts/duplicates', async (request) => {
    const user = request.user as { orgId: string }
    const { page = '1', limit = '20', resolved = 'false' } = request.query

    const groups = await prisma.duplicateGroup.findMany({
      where: { orgId: user.orgId, resolved: resolved === 'true' },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    })

    // Enrich each group with its contacts
    const enriched = await Promise.all(
      groups.map(async (g) => {
        const contacts = await prisma.contact.findMany({
          where: { id: { in: g.contactIds }, orgId: user.orgId },
          select: {
            id: true, fullName: true, phone: true, email: true,
            avatarUrl: true, source: true, lifecycleStage: true, zaloUid: true,
            leadScore: true, createdAt: true, lastActivity: true,
            _count: { select: { conversations: true } },
          },
        })
        return { ...g, contacts }
      })
    )

    const total = await prisma.duplicateGroup.count({
      where: { orgId: user.orgId, resolved: resolved === 'true' },
    })

    return { groups: enriched, total }
  })

  /** POST /api/v1/contacts/duplicates/:groupId/merge — merge a duplicate group */
  app.post<{
    Params: { groupId: string }
    Body: { primaryContactId: string }
  }>('/api/v1/contacts/duplicates/:groupId/merge', async (request, reply) => {
    const user = request.user as { id: string; orgId: string; role: string }
    const { groupId } = request.params
    const { primaryContactId } = request.body

    const group = await prisma.duplicateGroup.findFirst({
      where: { id: groupId, orgId: user.orgId, resolved: false },
    })
    if (!group) return reply.status(404).send({ error: 'Duplicate group not found' })
    if (!group.contactIds.includes(primaryContactId)) {
      return reply.status(400).send({ error: 'Primary contact not in this group' })
    }

    const mergeIds = group.contactIds.filter(id => id !== primaryContactId)

    // Reuse the merge logic
    await prisma.$transaction(async (tx) => {
      // Snapshot original display name on conversations before re-assigning
      const mergeContacts = await tx.contact.findMany({
        where: { id: { in: mergeIds } },
        select: { id: true, fullName: true },
      })
      for (const mc of mergeContacts) {
        if (mc.fullName) {
          await tx.conversation.updateMany({
            where: { contactId: mc.id, displayName: null },
            data: { displayName: mc.fullName },
          })
        }
      }

      await tx.conversation.updateMany({
        where: { contactId: { in: mergeIds } },
        data: { contactId: primaryContactId },
      })
      await tx.appointment.updateMany({
        where: { contactId: { in: mergeIds } },
        data: { contactId: primaryContactId },
      })
      await tx.cdpEvent.updateMany({
        where: { contactId: { in: mergeIds } },
        data: { contactId: primaryContactId },
      })
      await tx.lifecycleLog.updateMany({
        where: { contactId: { in: mergeIds } },
        data: { contactId: primaryContactId },
      })
      await tx.contactPropertyValue.deleteMany({
        where: { contactId: { in: mergeIds } },
      })
      await tx.contact.updateMany({
        where: { id: { in: mergeIds } },
        data: { mergedInto: primaryContactId, deletedAt: new Date() },
      })
      await tx.duplicateGroup.update({
        where: { id: groupId },
        data: { resolved: true },
      })
    })

    return { ok: true, mergedCount: mergeIds.length }
  })

  // ── Scan for duplicate contacts ──────────────────────────────────────

  /** POST /api/v1/contacts/duplicates/scan — scan all org contacts for
   *  duplicates by avatar-hash, normalized phone, and email.
   *  Returns the number of new groups created. */
  app.post('/api/v1/contacts/duplicates/scan', async (request) => {
    const user = request.user as { orgId: string }

    // Fetch all non-deleted, non-merged contacts
    const allContacts = await prisma.contact.findMany({
      where: {
        orgId: user.orgId,
        deletedAt: null,
        mergedInto: null,
        isGroup: false,
      },
      select: { id: true, avatarUrl: true, phone: true, email: true, createdAt: true },
    })

    // Fetch ALL existing unresolved groups (any matchType) so we don't create duplicates
    const existingGroups = await prisma.duplicateGroup.findMany({
      where: { orgId: user.orgId, resolved: false },
      select: { contactIds: true },
    })
    const existingKeys = new Set(
      existingGroups.map(g => [...g.contactIds].sort().join(','))
    )

    /** Helper: normalize phone by stripping +84/0 prefix → 9-digit core */
    const normalizePhone = (phone: string | null): string | null => {
      if (!phone) return null
      let p = phone.replace(/[\s\-().]/g, '')
      if (p.startsWith('+84')) p = p.slice(3)
      else if (p.startsWith('84') && p.length > 9) p = p.slice(2)
      else if (p.startsWith('0')) p = p.slice(1)
      return p.length >= 9 ? p : null
    }

    /** Helper: create group if key is new */
    const tryCreate = async (ids: string[], matchType: string, confidence: number) => {
      const sorted = [...ids].sort()
      const key = sorted.join(',')
      if (existingKeys.has(key)) return false
      existingKeys.add(key)
      await prisma.duplicateGroup.create({
        data: { orgId: user.orgId, contactIds: sorted, matchType, confidence, resolved: false },
      })
      return true
    }

    let created = 0

    // ── 1. Avatar-hash matching ──────────────────────────────────────
    const contactsWithAvatar = allContacts.filter(c => c.avatarUrl)
    const hashGroups = groupByAvatarHash(contactsWithAvatar)

    for (const [, group] of hashGroups) {
      group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      if (await tryCreate(group.map(c => c.id), 'avatar', 0.85)) created++
    }

    // ── 2. Phone matching (normalized) ───────────────────────────────
    const phoneMap = new Map<string, typeof allContacts>()
    for (const c of allContacts) {
      const norm = normalizePhone(c.phone)
      if (!norm) continue
      const existing = phoneMap.get(norm)
      if (existing) existing.push(c)
      else phoneMap.set(norm, [c])
    }
    for (const [, group] of phoneMap) {
      if (group.length < 2) continue
      group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      if (await tryCreate(group.map(c => c.id), 'phone', 0.95)) created++
    }

    // ── 3. Email matching (case-insensitive) ─────────────────────────
    const emailMap = new Map<string, typeof allContacts>()
    for (const c of allContacts) {
      if (!c.email) continue
      const norm = c.email.trim().toLowerCase()
      if (!norm || !norm.includes('@')) continue
      const existing = emailMap.get(norm)
      if (existing) existing.push(c)
      else emailMap.set(norm, [c])
    }
    for (const [, group] of emailMap) {
      if (group.length < 2) continue
      group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      if (await tryCreate(group.map(c => c.id), 'email', 0.90)) created++
    }

    return { ok: true, scanned: allContacts.length, newGroups: created }
  })

  /** POST /api/v1/contacts/duplicates/:groupId/dismiss — mark a group as
   *  resolved without merging ("not duplicates" / "skip"). */
  app.post<{
    Params: { groupId: string }
  }>('/api/v1/contacts/duplicates/:groupId/dismiss', async (request, reply) => {
    const user = request.user as { orgId: string }
    const group = await prisma.duplicateGroup.findFirst({
      where: { id: request.params.groupId, orgId: user.orgId, resolved: false },
    })
    if (!group) return reply.status(404).send({ error: 'Duplicate group not found' })

    await prisma.duplicateGroup.update({
      where: { id: group.id },
      data: { resolved: true },
    })

    return { ok: true }
  })

  // ── Phone Extraction from Names ──────────────────────────────────────

  /** POST /api/v1/contacts/extract-phones — scan contacts with empty phone
   *  field and extract Vietnamese phone numbers from their fullName.
   *  Body: { dryRun?: boolean, excludeIds?: string[] } — default true (preview only).
   *  When applying (dryRun=false), excludeIds are skipped.
   *  Returns the list of matches and how many were updated (if not dry-run). */
  app.post<{
    Body: { dryRun?: boolean; excludeIds?: string[] }
  }>('/api/v1/contacts/extract-phones', async (request) => {
    const user = request.user as { orgId: string }
    const dryRun = request.body?.dryRun !== false // default to true
    const excludeIds = new Set(request.body?.excludeIds ?? [])

    // Fetch all contacts with no phone that haven't been merged/deleted
    const contacts = await prisma.contact.findMany({
      where: {
        orgId: user.orgId,
        phone: null,
        deletedAt: null,
        mergedInto: null,
        isGroup: false,
      },
      select: { id: true, fullName: true },
    })

    const matches: { id: string; fullName: string; extractedPhone: string }[] = []

    for (const c of contacts) {
      const phone = extractPhoneFromName(c.fullName)
      if (phone) {
        matches.push({ id: c.id, fullName: c.fullName || '', extractedPhone: phone })
      }
    }

    let updated = 0
    if (!dryRun && matches.length > 0) {
      // Filter out excluded contacts
      const toApply = matches.filter(m => !excludeIds.has(m.id))

      // Apply in batches of 50 to avoid long transactions
      for (let i = 0; i < toApply.length; i += 50) {
        const batch = toApply.slice(i, i + 50)
        const results = await prisma.$transaction(
          batch.map(m => prisma.contact.updateMany({
            where: { id: m.id, phone: null },
            data: { phone: m.extractedPhone },
          }))
        )
        updated += results.reduce((sum, r) => sum + r.count, 0)
      }
    }

    return {
      ok: true,
      dryRun,
      scanned: contacts.length,
      matched: matches.length,
      updated,
      matches: dryRun ? matches : undefined,
    }
  })
}
