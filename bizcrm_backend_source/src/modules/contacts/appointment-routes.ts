import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../auth/auth-middleware.js'
import { prisma } from '../../shared/prisma-client.js'
import { runAutomationRules } from '../automation/automation-engine.js'
import { logger } from '../../shared/logger.js'
import dayjs from 'dayjs'

export async function appointmentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware)

  // GET /api/v1/appointments — list with filters
  app.get<{
    Querystring: { dateFrom?: string; dateTo?: string; status?: string; contactId?: string }
  }>('/api/v1/appointments', async (request) => {
    const user = request.user as { orgId: string }
    const { dateFrom, dateTo, status, contactId } = request.query

    const where: any = { orgId: user.orgId }
    if (status) where.status = status
    if (contactId) where.contactId = contactId
    if (dateFrom || dateTo) {
      where.appointmentDate = {}
      if (dateFrom) where.appointmentDate.gte = new Date(dateFrom)
      if (dateTo) where.appointmentDate.lte = new Date(dateTo)
    }

    const appointments = await prisma.appointment.findMany({
      where,
      orderBy: { appointmentDate: 'asc' },
      include: { contact: { select: { id: true, fullName: true, phone: true } } },
    })

    return { appointments, total: appointments.length }
  })

  // GET /api/v1/appointments/today
  app.get('/api/v1/appointments/today', async (request) => {
    const user = request.user as { orgId: string }
    const start = dayjs().startOf('day').toDate()
    const end = dayjs().endOf('day').toDate()

    const appointments = await prisma.appointment.findMany({
      where: { orgId: user.orgId, appointmentDate: { gte: start, lte: end } },
      orderBy: { appointmentDate: 'asc' },
      include: { contact: { select: { id: true, fullName: true, phone: true } } },
    })
    return { appointments }
  })

  // GET /api/v1/appointments/upcoming
  app.get('/api/v1/appointments/upcoming', async (request) => {
    const user = request.user as { orgId: string }
    const appointments = await prisma.appointment.findMany({
      where: {
        orgId: user.orgId,
        appointmentDate: { gt: new Date() },
        status: 'scheduled',
      },
      orderBy: { appointmentDate: 'asc' },
      take: 20,
      include: { contact: { select: { id: true, fullName: true, phone: true } } },
    })
    return { appointments }
  })

  // GET /api/v1/appointments/stats — KPI overview
  app.get('/api/v1/appointments/stats', async (request) => {
    const user = request.user as { orgId: string }
    const todayStart = dayjs().startOf('day').toDate()
    const todayEnd = dayjs().endOf('day').toDate()

    const [todayCount, upcomingCount, completedCount, cancelledCount, overdueCount, totalCount] = await Promise.all([
      // Today
      prisma.appointment.count({
        where: { orgId: user.orgId, appointmentDate: { gte: todayStart, lte: todayEnd }, status: { not: 'cancelled' } },
      }),
      // Upcoming (future, still scheduled)
      prisma.appointment.count({
        where: { orgId: user.orgId, appointmentDate: { gt: todayEnd }, status: 'scheduled' },
      }),
      // Completed (all time)
      prisma.appointment.count({
        where: { orgId: user.orgId, status: 'completed' },
      }),
      // Cancelled (all time)
      prisma.appointment.count({
        where: { orgId: user.orgId, status: 'cancelled' },
      }),
      // Overdue: past date + still scheduled
      prisma.appointment.count({
        where: { orgId: user.orgId, appointmentDate: { lt: todayStart }, status: 'scheduled' },
      }),
      // Total (all time)
      prisma.appointment.count({
        where: { orgId: user.orgId },
      }),
    ])

    return {
      today: todayCount,
      upcoming: upcomingCount,
      completed: completedCount,
      cancelled: cancelledCount,
      overdue: overdueCount,
      total: totalCount,
    }
  })

  // GET /api/v1/appointments/overdue — list overdue appointments
  app.get('/api/v1/appointments/overdue', async (request) => {
    const user = request.user as { orgId: string }
    const todayStart = dayjs().startOf('day').toDate()

    const appointments = await prisma.appointment.findMany({
      where: {
        orgId: user.orgId,
        appointmentDate: { lt: todayStart },
        status: 'scheduled',
      },
      orderBy: { appointmentDate: 'desc' },
      include: { contact: { select: { id: true, fullName: true, phone: true } } },
    })
    return { appointments }
  })

  // POST /api/v1/appointments
  app.post<{
    Body: { contactId?: string; appointmentDate: string; appointmentTime?: string; type?: string; status?: string; notes?: string }
  }>('/api/v1/appointments', async (request) => {
    const user = request.user as { orgId: string }
    const data: any = {
      orgId: user.orgId,
      appointmentDate: new Date(request.body.appointmentDate),
      appointmentTime: request.body.appointmentTime ?? null,
      type: request.body.type ?? 'other',
      status: request.body.status ?? 'scheduled',
      notes: request.body.notes ?? null,
    }
    if (request.body.contactId) {
      data.contactId = request.body.contactId
    }
    const appointment = await prisma.appointment.create({ data })

    // Fire automation trigger for appointment creation
    if (request.body.contactId) {
      runAutomationRules('appointment_created', {
        orgId: user.orgId,
        contactId: request.body.contactId,
        triggerData: { type: data.type, notes: data.notes },
      }).catch(err => logger.error({ err }, '[automation] appointment_created trigger failed'))
    }

    return appointment
  })

  // PUT /api/v1/appointments/:id
  app.put<{
    Params: { id: string }
    Body: Partial<{ appointmentDate: string; appointmentTime: string; type: string; status: string; notes: string }>
  }>('/api/v1/appointments/:id', async (request, reply) => {
    const user = request.user as { orgId: string }
    const existing = await prisma.appointment.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
    })
    if (!existing) return reply.status(404).send({ error: 'Appointment not found' })

    const data: any = { ...request.body }
    if (data.appointmentDate) data.appointmentDate = new Date(data.appointmentDate)

    return prisma.appointment.update({ where: { id: request.params.id }, data })
  })

  // DELETE /api/v1/appointments/:id
  app.delete<{ Params: { id: string } }>('/api/v1/appointments/:id', async (request, reply) => {
    const user = request.user as { orgId: string }
    const existing = await prisma.appointment.findFirst({
      where: { id: request.params.id, orgId: user.orgId },
    })
    if (!existing) return reply.status(404).send({ error: 'Appointment not found' })

    await prisma.appointment.delete({ where: { id: request.params.id } })
    return { ok: true }
  })
}
