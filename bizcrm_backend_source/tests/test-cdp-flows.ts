/**
 * CDP Preset Automation — E2E Test Framework
 *
 * Reusable structure to test ANY preset automation flow:
 *   1. Setup  — find org/user/contact/conversation
 *   2. Install — create template + rule (simulates preset install)
 *   3. Execute — run the DAG engine
 *   4. Assert — verify DB output and side effects
 *   5. Cleanup — remove test data
 *
 * Usage:
 *   npx tsx tests/test-cdp-flows.ts
 *   npx tsx tests/test-cdp-flows.ts --flow=birthday   # run specific flow
 */
import { prisma } from '../src/shared/prisma-client.js'
import { buildFlowConfigFromPreset } from '../src/shared/presets/types.js'
import { executeFlowV2 } from '../src/modules/automation/automation-engine.js'
import { renderTemplate } from '../src/modules/automation/template-renderer.js'
import type { AutomationContext, FlowConfig } from '../src/modules/automation/automation-types.js'
import type { PresetAutomation } from '../src/shared/presets/types.js'

// ── Preset imports ────────────────────────────────────────────────────
import { zaloPersonalPreset } from '../src/shared/presets/zalo-personal.js'
import { zaloOaPreset } from '../src/shared/presets/zalo-oa.js'
import { ecommercePreset } from '../src/shared/presets/ecommerce.js'
import { b2bPreset } from '../src/shared/presets/b2b.js'

// ── Logger ────────────────────────────────────────────────────────────
const PASS = '✅'
const FAIL = '❌'
const INFO = '📋'
const DATA = '📊'

function log(emoji: string, msg: string, data?: any) {
  const ts = new Date().toISOString().slice(11, 19)
  console.log(`[${ts}] ${emoji} ${msg}`)
  if (data) console.log(JSON.stringify(data, null, 2))
}

// ── Test context (shared across flows) ────────────────────────────────
interface TestContext {
  orgId: string
  orgName: string
  userId: string
  contactId: string
  contactName: string
  conversationId: string
}

// ── Flow test definition ──────────────────────────────────────────────
interface FlowTest {
  name: string
  presetKey: string
  automation: PresetAutomation
  /** Build the automation context for this flow */
  buildCtx: (tc: TestContext) => AutomationContext
  /** Assertions to run AFTER flow execution */
  assertions: (result: Awaited<ReturnType<typeof executeFlowV2>>, tc: TestContext) => Promise<FlowAssertionResult>
}

interface FlowAssertionResult {
  passed: boolean
  checks: { label: string; passed: boolean; detail?: string }[]
}

// ═══════════════════════════════════════════════════════════════════════
//  FLOW DEFINITIONS — add new flows here
// ═══════════════════════════════════════════════════════════════════════

const ALL_FLOWS: FlowTest[] = [
  // ── ① Birthday greeting (personalized) ──────────────────────────
  {
    name: 'birthday-personalized',
    presetKey: 'zalo-personal',
    automation: zaloPersonalPreset.automations[0],
    buildCtx: (tc) => ({
      orgId: tc.orgId,
      contactId: tc.contactId,
      conversationId: tc.conversationId,
      triggerData: { birthday: '2000-05-17' },
    }),
    assertions: async (result, tc) => {
      const checks: FlowAssertionResult['checks'] = []

      // Check 1: Execution succeeded
      checks.push({
        label: 'Flow executed at least 1 node',
        passed: result.executedNodes > 0,
        detail: `executedNodes=${result.executedNodes}`,
      })

      // Check 2: No errors
      checks.push({
        label: 'No error nodes',
        passed: result.errorNodes === 0,
        detail: result.nodeResults.filter(n => n.status === 'error').map(n => n.error).join('; '),
      })

      // Check 3: Message was created in conversation
      const lastMsg = await prisma.message.findFirst({
        where: { conversationId: tc.conversationId },
        orderBy: { sentAt: 'desc' },
        select: { content: true, senderType: true },
      })
      checks.push({
        label: 'Message created in DB',
        passed: !!lastMsg,
        detail: lastMsg ? `content: "${lastMsg.content?.slice(0, 80)}..."` : 'No message found',
      })

      // Check 4: Personalization — contains contact name
      checks.push({
        label: `Personalized with contact name "${tc.contactName}"`,
        passed: lastMsg?.content?.includes(tc.contactName) ?? false,
        detail: lastMsg?.content?.includes(tc.contactName)
          ? 'Name found in message ✓'
          : `Name "${tc.contactName}" NOT found in: "${lastMsg?.content?.slice(0, 100)}"`,
      })

      // Check 5: Personalization — contains org name
      checks.push({
        label: `Personalized with org name "${tc.orgName}"`,
        passed: lastMsg?.content?.includes(tc.orgName) ?? false,
        detail: lastMsg?.content?.includes(tc.orgName)
          ? 'Org name found in message ✓'
          : `Org "${tc.orgName}" NOT found in message`,
      })

      // Check 6: senderType = SELF
      checks.push({
        label: 'senderType = SELF',
        passed: lastMsg?.senderType === 'self',
        detail: `senderType = ${lastMsg?.senderType}`,
      })

      return { passed: checks.every(c => c.passed), checks }
    },
  },

  // ── ② OA Welcome (personalized template) ────────────────────────
  {
    name: 'oa-welcome-personalized',
    presetKey: 'zalo-oa',
    automation: zaloOaPreset.automations[0], // "Chào mừng Follow OA"
    buildCtx: (tc) => ({
      orgId: tc.orgId,
      contactId: tc.contactId,
      conversationId: tc.conversationId,
    }),
    assertions: async (result, tc) => {
      const checks: FlowAssertionResult['checks'] = []

      checks.push({
        label: 'Flow executed at least 1 node',
        passed: result.executedNodes > 0,
      })

      checks.push({
        label: 'No error nodes',
        passed: result.errorNodes === 0,
        detail: result.nodeResults.filter(n => n.status === 'error').map(n => n.error).join('; '),
      })

      const lastMsg = await prisma.message.findFirst({
        where: { conversationId: tc.conversationId },
        orderBy: { sentAt: 'desc' },
        select: { content: true, senderType: true },
      })

      checks.push({
        label: 'Message created in DB',
        passed: !!lastMsg,
      })

      checks.push({
        label: `Personalized with contact name "${tc.contactName}"`,
        passed: lastMsg?.content?.includes(tc.contactName) ?? false,
        detail: lastMsg?.content?.slice(0, 120),
      })

      checks.push({
        label: `Personalized with org name "${tc.orgName}"`,
        passed: lastMsg?.content?.includes(tc.orgName) ?? false,
      })

      return { passed: checks.every(c => c.passed), checks }
    },
  },

  // ── ③ OA follow → update_property ──────────────────────────────
  {
    name: 'oa-follow-status-update',
    presetKey: 'zalo-oa',
    automation: zaloOaPreset.automations[2], // "Đánh dấu đã follow OA"
    buildCtx: (tc) => ({
      orgId: tc.orgId,
      contactId: tc.contactId,
    }),
    assertions: async (result, tc) => {
      const checks: FlowAssertionResult['checks'] = []

      checks.push({
        label: 'Flow executed at least 1 node',
        passed: result.executedNodes > 0,
      })

      checks.push({
        label: 'No error nodes',
        passed: result.errorNodes === 0,
        detail: result.nodeResults.filter(n => n.status === 'error').map(n => n.error).join('; '),
      })

      // Check property value was set
      const prop = await prisma.customProperty.findFirst({
        where: { orgId: tc.orgId, fieldKey: 'oa_follow_status' },
        select: { id: true },
      })

      if (prop) {
        const val = await prisma.contactPropertyValue.findUnique({
          where: { contactId_propertyId: { contactId: tc.contactId, propertyId: prop.id } },
          select: { value: true },
        })
        checks.push({
          label: 'oa_follow_status property set to "true"',
          passed: val?.value === 'true',
          detail: `value = ${val?.value ?? '(not found)'}`,
        })
      } else {
        checks.push({
          label: 'oa_follow_status property exists',
          passed: false,
          detail: 'Property not installed — install zalo-oa preset first',
        })
      }

      return { passed: checks.every(c => c.passed), checks }
    },
  },

  // ── ④ B2B follow-up appointment ────────────────────────────────
  {
    name: 'b2b-followup-appointment',
    presetKey: 'b2b',
    automation: b2bPreset.automations[0], // "Nhắc follow-up khách B2B mới"
    buildCtx: (tc) => ({
      orgId: tc.orgId,
      contactId: tc.contactId,
    }),
    assertions: async (result, tc) => {
      const checks: FlowAssertionResult['checks'] = []

      checks.push({
        label: 'Flow executed at least 1 node',
        passed: result.executedNodes > 0,
      })

      checks.push({
        label: 'No error nodes',
        passed: result.errorNodes === 0,
        detail: result.nodeResults.filter(n => n.status === 'error').map(n => n.error).join('; '),
      })

      // Check appointment was created
      const appointment = await prisma.appointment.findFirst({
        where: {
          orgId: tc.orgId,
          contactId: tc.contactId,
          notes: 'Follow-up khách B2B mới',
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, appointmentDate: true, status: true, notes: true, assignedUserId: true },
      })

      checks.push({
        label: 'Appointment created in DB',
        passed: !!appointment,
        detail: appointment
          ? `date=${appointment.appointmentDate?.toISOString()}, status=${appointment.status}`
          : 'Not found',
      })

      if (appointment) {
        // Check scheduled 72h in future
        const diff = (appointment.appointmentDate.getTime() - Date.now()) / 3600_000
        checks.push({
          label: 'Scheduled ~72h in future',
          passed: diff > 70 && diff < 74,
          detail: `${diff.toFixed(1)}h from now`,
        })

        checks.push({
          label: 'Has assignedUserId',
          passed: !!appointment.assignedUserId,
          detail: `assignedUserId=${appointment.assignedUserId}`,
        })
      }

      return { passed: checks.every(c => c.passed), checks }
    },
  },

  // ── ⑤ Ecommerce multi-action (increment + update) ─────────────
  {
    name: 'ecommerce-order-completed',
    presetKey: 'ecommerce',
    automation: ecommercePreset.automations[1], // "Tăng số đơn khi hoàn thành"
    buildCtx: (tc) => ({
      orgId: tc.orgId,
      contactId: tc.contactId,
    }),
    assertions: async (result, tc) => {
      const checks: FlowAssertionResult['checks'] = []

      checks.push({
        label: 'Both nodes executed (2 actions)',
        passed: result.executedNodes >= 2,
        detail: `executedNodes=${result.executedNodes}`,
      })

      checks.push({
        label: 'No error nodes',
        passed: result.errorNodes === 0,
        detail: result.nodeResults.filter(n => n.status === 'error').map(n => n.error).join('; '),
      })

      // Check order_count property
      const ocProp = await prisma.customProperty.findFirst({
        where: { orgId: tc.orgId, fieldKey: 'order_count' },
        select: { id: true },
      })
      if (ocProp) {
        const val = await prisma.contactPropertyValue.findUnique({
          where: { contactId_propertyId: { contactId: tc.contactId, propertyId: ocProp.id } },
        })
        checks.push({
          label: 'order_count incremented',
          passed: Number(val?.value) >= 1,
          detail: `value = ${val?.value ?? '(not found)'}`,
        })
      } else {
        checks.push({
          label: 'order_count property exists',
          passed: false,
          detail: 'Install ecommerce preset first',
        })
      }

      // Check last_purchase_date property
      const lpProp = await prisma.customProperty.findFirst({
        where: { orgId: tc.orgId, fieldKey: 'last_purchase_date' },
        select: { id: true },
      })
      if (lpProp) {
        const val = await prisma.contactPropertyValue.findUnique({
          where: { contactId_propertyId: { contactId: tc.contactId, propertyId: lpProp.id } },
        })
        const today = new Date().toISOString().slice(0, 10)
        checks.push({
          label: 'last_purchase_date set to today',
          passed: val?.value === today,
          detail: `value = ${val?.value}, expected = ${today}`,
        })
      } else {
        checks.push({
          label: 'last_purchase_date property exists',
          passed: false,
          detail: 'Install ecommerce preset first',
        })
      }

      return { passed: checks.every(c => c.passed), checks }
    },
  },
]

// ═══════════════════════════════════════════════════════════════════════
//  TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════

async function setupTestContext(): Promise<TestContext> {
  const org = await prisma.organization.findFirst({ select: { id: true, name: true } })
  if (!org) throw new Error('No organization found — run /api/v1/setup first')

  const user = await prisma.user.findFirst({
    where: { orgId: org.id, role: { in: ['owner', 'admin'] } },
    select: { id: true, fullName: true },
  })
  if (!user) throw new Error('No admin user found')

  const conv = await prisma.conversation.findFirst({
    where: { orgId: org.id },
    include: { contact: { select: { id: true, fullName: true, crmName: true } } },
    orderBy: { lastMessageAt: 'desc' },
  })
  if (!conv?.contact) throw new Error('No conversation with contact found')

  return {
    orgId: org.id,
    orgName: org.name,
    userId: user.id,
    contactId: conv.contact.id,
    contactName: conv.contact.crmName || conv.contact.fullName || 'Unknown',
    conversationId: conv.id,
  }
}

async function runFlowTest(flow: FlowTest, tc: TestContext): Promise<{ passed: boolean; checks: FlowAssertionResult['checks'] }> {
  log(INFO, `\n${'═'.repeat(60)}`)
  log(INFO, `Flow: "${flow.name}" (${flow.presetKey})`)
  log(INFO, `Automation: "${flow.automation.name}"`)
  log(INFO, `Trigger: ${flow.automation.trigger} → ${flow.automation.actions.map(a => a.type).join(' → ')}`)
  log(INFO, `${'═'.repeat(60)}`)

  // ── Step 1: Build flowConfig ──
  let templateId: string | undefined
  if (flow.automation.templateName && flow.automation.templateContent) {
    const tmpl = await prisma.messageTemplate.create({
      data: {
        orgId: tc.orgId,
        name: `[TEST] ${flow.automation.templateName}`,
        content: flow.automation.templateContent,
        category: 'preset',
      },
    })
    templateId = tmpl.id
    log(PASS, `Template created: "${tmpl.name}" (${tmpl.id})`)

    // Show what rendered content will look like
    const contact = await prisma.contact.findUnique({
      where: { id: tc.contactId },
      select: { fullName: true, crmName: true, phone: true, email: true, lifecycleStage: true, source: true },
    })
    const org = await prisma.organization.findUnique({ where: { id: tc.orgId }, select: { name: true } })
    const rendered = renderTemplate(flow.automation.templateContent, { contact, org })
    log(DATA, `Template preview (rendered):`, { raw: flow.automation.templateContent, rendered })
  }

  const flowConfig = buildFlowConfigFromPreset(flow.automation, templateId)
  log(PASS, `flowConfig built: ${flowConfig.nodes.length} node(s), ${flowConfig.edges.length} edge(s)`)

  // ── Step 2: Create automation rule ──
  const rule = await prisma.automationRule.create({
    data: {
      orgId: tc.orgId,
      name: `[TEST] ${flow.automation.name}`,
      description: 'E2E test — auto-deleted',
      trigger: flow.automation.trigger,
      conditions: flow.automation.conditions,
      actions: flow.automation.actions.map(a =>
        a.params.templateId === '__preset__' && templateId
          ? { ...a, params: { ...a.params, templateId } }
          : a,
      ),
      enabled: true,
      priority: 0,
      flowVersion: 2,
      flowConfig,
    },
  })
  log(PASS, `Rule created: ${rule.id}`)

  // ── Step 3: Execute flow ──
  const ctx = flow.buildCtx(tc)
  log(INFO, `Executing with context:`, {
    orgId: ctx.orgId,
    contactId: ctx.contactId,
    conversationId: ctx.conversationId,
    triggerData: ctx.triggerData,
  })

  const result = await executeFlowV2(rule.id, rule.name, flowConfig as FlowConfig, ctx, false)
  log(DATA, `Execution result:`, {
    total: result.totalNodes,
    executed: result.executedNodes,
    skipped: result.skippedNodes,
    errors: result.errorNodes,
    durationMs: result.durationMs,
    nodes: result.nodeResults.map(n => ({
      id: n.nodeId,
      label: n.nodeLabel,
      status: n.status,
      ms: n.durationMs,
      ...(n.error ? { error: n.error } : {}),
    })),
  })

  // ── Step 4: Run assertions ──
  const assertResult = await flow.assertions(result, tc)

  for (const check of assertResult.checks) {
    log(check.passed ? PASS : FAIL, check.label, check.detail ? { detail: check.detail } : undefined)
  }

  // ── Step 5: Cleanup ──
  await prisma.automationRule.delete({ where: { id: rule.id } }).catch(() => {})
  if (templateId) {
    await prisma.messageTemplate.delete({ where: { id: templateId } }).catch(() => {})
  }

  return assertResult
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const filterFlow = process.argv.find(a => a.startsWith('--flow='))?.split('=')[1]

  log('🧪', '=== CDP Automation E2E Test Suite ===')
  log(INFO, `Time: ${new Date().toISOString()}`)

  const tc = await setupTestContext()
  log(PASS, `Test context:`, {
    org: `${tc.orgName} (${tc.orgId})`,
    contact: `${tc.contactName} (${tc.contactId})`,
    conversation: tc.conversationId,
  })

  const flows = filterFlow
    ? ALL_FLOWS.filter(f => f.name.includes(filterFlow))
    : ALL_FLOWS

  if (flows.length === 0) {
    log(FAIL, `No flows match filter: "${filterFlow}"`)
    log(INFO, `Available flows: ${ALL_FLOWS.map(f => f.name).join(', ')}`)
    process.exit(1)
  }

  log(INFO, `Running ${flows.length}/${ALL_FLOWS.length} flows...\n`)

  const results: { name: string; passed: boolean; failedChecks: string[] }[] = []

  for (const flow of flows) {
    try {
      const r = await runFlowTest(flow, tc)
      results.push({
        name: flow.name,
        passed: r.passed,
        failedChecks: r.checks.filter(c => !c.passed).map(c => c.label),
      })
    } catch (err: any) {
      log(FAIL, `Flow "${flow.name}" CRASHED: ${err.message}`)
      results.push({ name: flow.name, passed: false, failedChecks: [`CRASH: ${err.message}`] })
    }
  }

  // ── Summary ──
  log(INFO, `\n${'═'.repeat(60)}`)
  log(INFO, 'SUMMARY')
  log(INFO, `${'═'.repeat(60)}`)

  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  for (const r of results) {
    log(r.passed ? PASS : FAIL, `${r.name}: ${r.passed ? 'PASSED' : 'FAILED'}`)
    if (r.failedChecks.length > 0) {
      for (const fc of r.failedChecks) {
        log('  ', `  └─ ${fc}`)
      }
    }
  }

  log(INFO, `\n${passed}/${results.length} passed, ${failed} failed`)

  // Cleanup test appointment if b2b test ran
  if (flows.some(f => f.name === 'b2b-followup-appointment')) {
    await prisma.appointment.deleteMany({
      where: { orgId: tc.orgId, notes: 'Follow-up khách B2B mới', contactId: tc.contactId },
    }).catch(() => {})
  }

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('Suite crashed:', err)
  process.exit(1)
})
