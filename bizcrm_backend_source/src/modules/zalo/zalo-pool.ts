/**
 * zalo-pool.ts — D9.6: Zalo account pool manager with zca-js QR login.
 * Manages live zca-js sessions, QR login flow, message sending.
 */
import { Zalo, LoginQRCallbackEventType, ThreadType } from 'zca-js'
import type { LoginQRCallbackEvent } from 'zca-js'
import type { API as ZaloAPI } from 'zca-js'
import { prisma } from '../../shared/prisma-client.js'
import { Prisma } from '@prisma/client'
import { getIO } from '../realtime/socket-gateway.js'
import { stopMessageSync } from './zalo-message-sync.js'
import { setupMessageListener } from './zalo-event-handlers.js'

// ─── Pool state ────────────────────────────────────────────────────────────────

interface PoolEntry {
  accountId: string
  orgId: string
  status: 'connected' | 'connecting' | 'qr_pending' | 'disconnected'
  api?: ZaloAPI
  connectedAt?: Date
  abortLogin?: () => void
}

const pool = new Map<string, PoolEntry>()

// ─── In-memory debug log (ring buffer, NOT persisted) ──────────────────────
export interface DebugLogEntry {
  ts: string
  accountId: string
  event: string
  summary: string
  data?: any
}
const DEBUG_LOG_MAX = 500
const debugLog: DebugLogEntry[] = []

export function pushDebug(accountId: string, event: string, summary: string, data?: any) {
  const entry: DebugLogEntry = {
    ts: new Date().toISOString(),
    accountId,
    event,
    summary,
    data,
  }
  debugLog.push(entry)
  if (debugLog.length > DEBUG_LOG_MAX) debugLog.shift()
  // Real-time push to frontend
  try { getIO().emit('zalo:debug', entry) } catch {}
}

export function getDebugLog(): DebugLogEntry[] {
  return debugLog
}

// ─── Pool API ──────────────────────────────────────────────────────────────────

export async function getPoolStatus(orgId: string): Promise<PoolEntry[]> {
  const accounts = await prisma.channelAccount.findMany({
    where: { orgId },
    select: { id: true, orgId: true, status: true },
  })
  return accounts.map(a => pool.get(a.id) ?? {
    accountId: a.id, orgId: a.orgId,
    status: (a.status as PoolEntry['status']) || 'disconnected',
  })
}

export function getPoolEntry(accountId: string): PoolEntry | undefined {
  return pool.get(accountId)
}

/**
 * Initiate QR login for a Zalo account.
 * Emits Socket.IO events to the org room:
 *   zalo:qr       → { accountId, image } (base64 QR image)
 *   zalo:scanned  → { accountId, avatar, displayName }
 *   zalo:connected → { accountId }
 *   zalo:error     → { accountId, message }
 */
export async function loginWithQR(accountId: string, orgId: string): Promise<void> {
  let currentSessionData: any = null
  let scannedDisplayName: string | undefined
  let scannedAvatar: string | undefined

  // Cancel any existing login for this account
  const existing = pool.get(accountId)
  if (existing?.abortLogin) {
    existing.abortLogin()
  }

  // Update status to qr_pending
  pool.set(accountId, { accountId, orgId, status: 'qr_pending' })
  await prisma.channelAccount.update({
    where: { id: accountId },
    data: { status: 'qr_pending' },
  })

  const io = getIO()
  const zalo = new Zalo({ logging: false, selfListen: true })

  try {
    const api = await zalo.loginQR({}, (event: LoginQRCallbackEvent) => {
      switch (event.type) {
        case LoginQRCallbackEventType.QRCodeGenerated: {
          logger.info(`[zalo-pool] ${accountId} → QR generated`)
          // Emit QR image to all org members
          io.to(`org:${orgId}`).emit('zalo:qr', {
            accountId,
            image: event.data.image, // base64 encoded QR image
            code: event.data.code,
          })

          // Store abort function
          const entry = pool.get(accountId)
          if (entry) {
            pool.set(accountId, { ...entry, abortLogin: event.actions.abort })
          }
          break
        }

        case LoginQRCallbackEventType.QRCodeExpired: {
          logger.info(`[zalo-pool] ${accountId} → QR expired, retrying...`)
          io.to(`org:${orgId}`).emit('zalo:qr-expired', { accountId })
          // Auto-retry
          event.actions.retry()
          break
        }

        case LoginQRCallbackEventType.QRCodeScanned: {
          logger.info(`[zalo-pool] ${accountId} → QR scanned by ${event.data.display_name}`)
          scannedDisplayName = event.data.display_name || undefined
          scannedAvatar = event.data.avatar || undefined
          pool.set(accountId, {
            accountId, orgId, status: 'connecting',
          })
          io.to(`org:${orgId}`).emit('zalo:scanned', {
            accountId,
            avatar: event.data.avatar,
            displayName: event.data.display_name,
          })
          break
        }

        case LoginQRCallbackEventType.QRCodeDeclined: {
          logger.info(`[zalo-pool] ${accountId} → QR declined`)
          pool.set(accountId, { accountId, orgId, status: 'disconnected' })
          io.to(`org:${orgId}`).emit('zalo:error', {
            accountId,
            message: 'QR code bị từ chối. Vui lòng thử lại.',
          })
          break
        }

        case LoginQRCallbackEventType.GotLoginInfo: {
          logger.info(`[zalo-pool] ${accountId} → Login info received, saving session...`)
          // Save session data for persistent reconnection
          currentSessionData = {
            cookie: event.data.cookie,
            imei: event.data.imei,
            userAgent: event.data.userAgent,
          }
          prisma.channelAccount.update({
            where: { id: accountId },
            data: { sessionData: currentSessionData },
          }).catch(err => logger.error('[zalo-pool] Failed to save session:', err))
          break
        }
      }
    })

    // Login succeeded — api is now available
    logger.info(`[zalo-pool] ${accountId} → Connected successfully!`)

    // Extract externalUid from authenticated context; displayName from QRCodeScanned event
    const ctx = api.getContext()
    const externalUid = ctx?.uid || null
    const displayName = scannedDisplayName || (ctx as any)?.name || (ctx as any)?.displayName || undefined
    const avatarUrl = scannedAvatar || undefined
    logger.info(`[zalo-pool] ${accountId} → uid=${externalUid}, name=${displayName}, avatar=${avatarUrl ? 'yes' : 'no'}`)

    // Auto-fetch phone number from Zalo profile
    let phoneNumber: string | null = null
    if (externalUid) {
      try {
        const userInfoRes = await api.getUserInfo(externalUid)
        const profile = userInfoRes?.changed_profiles?.[externalUid]
        if (profile?.phoneNumber) {
          phoneNumber = profile.phoneNumber
          logger.info(`[zalo-pool] ${accountId} → phone=${phoneNumber}`)
        }
      } catch (err: any) {
        logger.warn(`[zalo-pool] ${accountId} → Failed to fetch phone:`, err.message)
      }
    }

    let finalAccountId = accountId

    // "Revive" existing account if externalUid matches
    if (externalUid) {
      const existing = await prisma.channelAccount.findUnique({ where: { externalUid } })
      if (existing && existing.orgId === orgId && existing.id !== accountId) {
        logger.info(`[zalo-pool] Zalo UID ${externalUid} already exists. Reviving account ${existing.id}...`)

        // Delete the temporary placeholder account we just used for login
        await prisma.channelAccount.delete({ where: { id: accountId } }).catch(() => {})
        
        // Remove old entry from pool
        pool.delete(accountId)
        
        // Switch to existing account ID
        finalAccountId = existing.id
      }
    }

    pool.set(finalAccountId, {
      accountId: finalAccountId,
      orgId,
      status: 'connected',
      api,
      connectedAt: new Date(),
    })

    // Update DB with real Zalo identity. Also clear soft-delete markers in
    // case we're reviving an account that was previously removed — the user
    // re-pairing the same Zalo UID is an explicit re-activation.
    await prisma.channelAccount.update({
      where: { id: finalAccountId },
      data: {
        status: 'connected',
        deletedAt: null,
        isDisabled: false,
        ...(externalUid ? { externalUid } : {}),
        ...(displayName ? { displayName } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
        ...(currentSessionData ? { sessionData: currentSessionData } : {}),
        ...(phoneNumber ? { phone: phoneNumber } : {}),
        lastConnectedAt: new Date(),
      },
    })

    // Emit connected event (frontend should reload the list, emit original accountId to close modal)
    io.to(`org:${orgId}`).emit('zalo:connected', { accountId })

    // Start listening for messages
    setupMessageListener(finalAccountId, orgId, api)

    // Fire-and-forget: sync friends + recent conversations after connect
    syncOnConnect(finalAccountId, orgId, api).catch(err =>
      logger.error(`[zalo-pool] syncOnConnect error:`, err.message)
    )

  } catch (err: any) {
    logger.error(`[zalo-pool] ${accountId} → Login failed:`, err.message)
    pool.set(accountId, { accountId, orgId, status: 'disconnected' })

    await prisma.channelAccount.update({
      where: { id: accountId },
      data: { status: 'disconnected' },
    }).catch(() => {})

    io.to(`org:${orgId}`).emit('zalo:error', {
      accountId,
      message: `Đăng nhập thất bại: ${err.message}`,
    })
  }
}

// setupMessageListener + mapZcaContentType moved to zalo-event-handlers.ts

export async function disconnectAccount(accountId: string): Promise<void> {
  const entry = pool.get(accountId)
  if (entry) {
    if (entry.abortLogin) entry.abortLogin()
    if (entry.api) {
      try { entry.api.listener.stop() } catch {}
      // Detach every handler we attached in setupMessageListener. zca-js runs
      // the socket with retryOnClose, so stop() can be followed by an automatic
      // reconnect (a normal WS drop racing with this teardown, or the manual
      // close code being retryable) — and stop() leaves the handlers attached.
      // Without this, a removed account keeps recording inbound messages, i.e.
      // "deleted the Zalo connection but chat still works".
      try { entry.api.listener.removeAllListeners() } catch {}
    }
    stopMessageSync(accountId)
    pool.delete(accountId)
  }
  await prisma.channelAccount.update({
    where: { id: accountId },
    data: { status: 'disconnected' },
  })
  logger.info(`[zalo-pool] ${accountId} → disconnected`)
}

export async function updateStatus(
  accountId: string,
  status: 'connected' | 'disconnected',
): Promise<void> {
  const existing = pool.get(accountId)
  const orgId = existing?.orgId
  if (existing) {
    pool.set(accountId, { ...existing, status, connectedAt: status === 'connected' ? new Date() : undefined })
  }
  await prisma.channelAccount.update({
    where: { id: accountId },
    data: {
      status,
      ...(status === 'connected' ? { lastConnectedAt: new Date() } : {}),
    },
  })

  // Emit real-time status change so frontend can update immediately
  // (e.g. when account gets kicked out by login on another platform)
  if (orgId) {
    try {
      getIO().to(`org:${orgId}`).emit('zalo:account-status', { accountId, status })
    } catch { /* socket not ready yet */ }
  } else {
    // Fallback: look up orgId from DB if not in pool
    try {
      const acc = await prisma.channelAccount.findUnique({
        where: { id: accountId },
        select: { orgId: true },
      })
      if (acc?.orgId) {
        getIO().to(`org:${acc.orgId}`).emit('zalo:account-status', { accountId, status })
      }
    } catch { /* ignore */ }
  }
}

/**
 * Reconnect a Zalo account using saved session credentials (cookie/imei/userAgent).
 * This allows restoring connections after server restart without QR re-scan.
 */
export async function reconnectWithSession(
  accountId: string,
  orgId: string,
  session: { cookie: any; imei: string; userAgent: string },
): Promise<void> {
  logger.info(`[zalo-pool] ${accountId} → Reconnecting with saved session...`)

  pool.set(accountId, { accountId, orgId, status: 'connecting' })
  await prisma.channelAccount.update({
    where: { id: accountId },
    data: { status: 'connecting' },
  })

  const io = getIO()
  const zalo = new Zalo({ logging: false, selfListen: true })

  try {
    const api = await zalo.login({
      cookie: session.cookie,
      imei: session.imei,
      userAgent: session.userAgent,
    })

    logger.info(`[zalo-pool] ${accountId} → Reconnected successfully!`)

    pool.set(accountId, {
      accountId,
      orgId,
      status: 'connected',
      api,
      connectedAt: new Date(),
    })

    // Extract externalUid from context
    const ctx = api.getContext()
    const externalUid = ctx?.uid || null

    await prisma.channelAccount.update({
      where: { id: accountId },
      data: {
        status: 'connected',
        ...(externalUid ? { externalUid } : {}),
        lastConnectedAt: new Date(),
      },
    })

    io.to(`org:${orgId}`).emit('zalo:connected', { accountId })

    // Start listener + sync
    setupMessageListener(accountId, orgId, api)
    syncOnConnect(accountId, orgId, api).catch(err =>
      logger.error(`[zalo-pool] syncOnConnect error:`, err.message)
    )
  } catch (err: any) {
    logger.error(`[zalo-pool] ${accountId} → Reconnect failed:`, err.message)
    pool.set(accountId, { accountId, orgId, status: 'disconnected' })
    await prisma.channelAccount.update({
      where: { id: accountId },
      data: { status: 'disconnected' },
    }).catch(() => {})

    io.to(`org:${orgId}`).emit('zalo:error', {
      accountId,
      message: `Kết nối lại thất bại: ${err.message}. Vui lòng đăng nhập QR lại.`,
    })
  }
}

/**
 * Auto-reconnect all Zalo accounts that have saved session data.
 * Called once on server startup after Socket.IO is initialized.
 */
export async function autoReconnectSavedAccounts(): Promise<void> {
  // Always start the watchdog (covers boot-reconnect failures + later WS drops).
  startConnectionWatchdog()
  try {
    const accounts = await prisma.channelAccount.findMany({
      where: { sessionData: { not: Prisma.DbNull } },
      select: { id: true, orgId: true, sessionData: true, displayName: true },
    })

    if (accounts.length === 0) {
      logger.info('[zalo-pool] No saved Zalo sessions to reconnect')
      return
    }

    logger.info(`[zalo-pool] Auto-reconnecting ${accounts.length} saved Zalo account(s)...`)

    for (const account of accounts) {
      const session = account.sessionData as { cookie: any; imei: string; userAgent: string } | null
      if (!session?.imei) continue

      // Don't await — reconnect concurrently
      reconnectWithSession(account.id, account.orgId, session).catch(err =>
        logger.error(`[zalo-pool] Auto-reconnect failed for ${account.displayName || account.id}:`, err.message)
      )

      // Stagger reconnects slightly to avoid burst
      await new Promise(r => setTimeout(r, 500))
    }
  } catch (err: any) {
    logger.error('[zalo-pool] autoReconnectSavedAccounts error:', err.message)
  }
}

// ── Connection watchdog ─────────────────────────────────────────────────────
// Personal-Zalo WebSockets can drop silently (e.g. close code 1006) without the
// library's retryOnClose actually recovering — leaving the listener dead while
// the DB still says "connected", so no inbound messages are recorded. This
// watchdog periodically re-establishes any saved account whose live listener is
// gone, backing off after repeated failures (expired session → needs QR re-scan).
const WATCHDOG_INTERVAL_MS = 90_000
const MAX_AUTO_RECONNECT_ATTEMPTS = 4
const reconnectFailures = new Map<string, number>()
let watchdogTimer: ReturnType<typeof setInterval> | null = null

export function startConnectionWatchdog(): void {
  if (watchdogTimer) return
  watchdogTimer = setInterval(() => { void runWatchdogTick() }, WATCHDOG_INTERVAL_MS)
  logger.info(`[zalo-pool] Connection watchdog started (every ${WATCHDOG_INTERVAL_MS / 1000}s)`)
}

async function runWatchdogTick(): Promise<void> {
  try {
    const accounts = await prisma.channelAccount.findMany({
      where: { sessionData: { not: Prisma.DbNull }, isDisabled: false, deletedAt: null },
      select: { id: true, orgId: true, sessionData: true, displayName: true },
    })
    for (const acc of accounts) {
      const entry = pool.get(acc.id)
      // Healthy or mid-connect → reset the failure counter and leave it alone.
      if (entry?.status === 'connected' || entry?.status === 'connecting') {
        reconnectFailures.delete(acc.id)
        continue
      }
      const fails = reconnectFailures.get(acc.id) ?? 0
      if (fails >= MAX_AUTO_RECONNECT_ATTEMPTS) continue // give up — needs manual/QR re-login
      const session = acc.sessionData as { cookie: any; imei: string; userAgent: string } | null
      if (!session?.imei) continue

      reconnectFailures.set(acc.id, fails + 1)
      logger.warn(`[zalo-pool] watchdog: ${acc.displayName || acc.id} listener down → reconnect attempt ${fails + 1}/${MAX_AUTO_RECONNECT_ATTEMPTS}`)
      reconnectWithSession(acc.id, acc.orgId, session)
        .then(() => reconnectFailures.delete(acc.id))
        .catch(() => { /* counter stays incremented; retried until the cap */ })
    }
  } catch (err: any) {
    logger.error('[zalo-pool] watchdog tick error:', err?.message || err)
  }
}

/**
 * Send a message via connected Zalo account.
 * Returns true if sent via Zalo, false if stored locally only.
 * Note: Does NOT create a local message record — the caller (chat-routes)
 * is responsible for that to avoid duplicates.
 */
/**
 * Best-effort "đang nhập..." indicator to the Zalo customer.
 * Zalo auto-expires the indicator after a few seconds (there is no stop API),
 * so a crashed flow can never leave the customer with an infinite typing state.
 * Cosmetic only — never throws, never blocks the caller.
 */
export async function sendTypingViaPool(
  accountId: string,
  targetUid: string,
  threadType?: 'user' | 'group'
): Promise<void> {
  const entry = pool.get(accountId)
  if (!entry?.api || entry.status !== 'connected') return
  try {
    const { ThreadType } = await import('zca-js')
    await (entry.api as any).sendTypingEvent(
      targetUid,
      threadType === 'group' ? ThreadType.Group : ThreadType.User,
    )
  } catch {
    // typing là phụ trợ — bỏ qua mọi lỗi
  }
}

export async function sendViaPool(
  accountId: string,
  targetUid: string,
  text: string,
  _conversationId: string,
  quote?: any,
  threadType?: 'user' | 'group'
): Promise<{ sent: boolean; error?: string }> {
  const entry = pool.get(accountId)

  if (entry?.api && entry.status === 'connected') {
    try {
      // Send via zca-js API
      const { ThreadType } = await import('zca-js')
      const payload: any = { msg: text }
      if (quote) payload.quote = quote

      const threadTypeEnum = threadType === 'group' ? ThreadType.Group : ThreadType.User;

      await entry.api.sendMessage(
        payload,
        targetUid,
        threadTypeEnum,
      )
      logger.info(`[zalo-pool] ✓ Message sent via Zalo to ${targetUid}`)
      return { sent: true }
    } catch (err: any) {
      logger.warn(`[zalo-pool] Zalo send failed:`, err.message)
      return { sent: false, error: err.message || 'Zalo send failed' }
    }
  } else {
    logger.warn(`[zalo-pool] Account ${accountId} not connected — message stored locally only`)
    return { sent: false, error: 'Tài khoản Zalo chưa kết nối' }
  }
}

export async function undoViaPool(
  accountId: string,
  targetUid: string,
  msgId: string,
  cliMsgId: string,
  threadType?: 'user' | 'group'
): Promise<boolean> {
  const entry = pool.get(accountId)
  if (entry?.api && entry.status === 'connected') {
    try {
      const { ThreadType } = await import('zca-js')
      const threadTypeEnum = threadType === 'group' ? ThreadType.Group : ThreadType.User;
      await entry.api.undo({ msgId, cliMsgId }, targetUid, threadTypeEnum)
      return true
    } catch (err: any) {
      logger.warn(`[zalo-pool] Undo failed:`, err.message)
      return false
    }
  }
  return false
}

/**
 * Send an image via connected Zalo account.
 * @param accountId - ChannelAccount.id
 * @param targetUid - Zalo UID of recipient
 * @param imageBuffer - Image file buffer
 * @param filename - Original filename (e.g. "photo.jpg")
 * @param text - Optional caption text
 * @returns true if sent via Zalo
 */
export async function sendImageViaPool(
  accountId: string,
  targetUid: string,
  imageBuffer: Buffer,
  filename: string,
  text?: string,
  threadType: 0 | 1 = 0,
): Promise<{ sent: boolean; content?: string }> {
  const entry = pool.get(accountId)

  if (entry?.api && entry.status === 'connected') {
    try {
      const { ThreadType } = await import('zca-js')
      const attachment = {
        data: imageBuffer,
        filename: filename as `${string}.${string}`,
        metadata: { totalSize: imageBuffer.length },
      }
      
      let preUploadContent: string | undefined
      try {
        const uploadRes = await entry.api.uploadAttachment(attachment, targetUid, threadType)
        if (uploadRes && uploadRes.length > 0) {
          preUploadContent = JSON.stringify(uploadRes[0])
        }
      } catch (err: any) {
        logger.warn(`[zalo-pool] Pre-upload image failed, proceeding anyway: ${err.message}`)
      }

      await entry.api.sendMessage(
        { msg: text || '', attachments: [attachment] },
        targetUid,
        threadType,
      )
      logger.info(`[zalo-pool] ✓ Image sent via Zalo to ${targetUid}: ${filename}`)
      return { sent: true, content: preUploadContent }
    } catch (err: any) {
      logger.warn(`[zalo-pool] Zalo image send failed:`, err.message)
      return { sent: false }
    }
  }
  return { sent: false }
}

/**
 * Send a file via connected Zalo account.
 * @param accountId - ChannelAccount.id
 * @param targetUid - Zalo UID of recipient
 * @param fileBuffer - File buffer
 * @param filename - Original filename (e.g. "document.pdf")
 * @param text - Optional caption text
 * @returns true if sent via Zalo
 */
export async function sendFileViaPool(
  accountId: string,
  targetUid: string,
  fileBuffer: Buffer,
  filename: string,
  text?: string,
): Promise<boolean> {
  const entry = pool.get(accountId)

  if (entry?.api && entry.status === 'connected') {
    try {
      const { ThreadType } = await import('zca-js')
      const attachment = {
        data: fileBuffer,
        filename: filename as `${string}.${string}`,
        metadata: { totalSize: fileBuffer.length },
      }
      await entry.api.sendMessage(
        { msg: text || '', attachments: [attachment] },
        targetUid,
        ThreadType.User,
      )
      logger.info(`[zalo-pool] ✓ File sent via Zalo to ${targetUid}: ${filename}`)
      return true
    } catch (err: any) {
      logger.warn(`[zalo-pool] Zalo file send failed:`, err.message)
      return false
    }
  }
  return false
}

// ─── Rate limiter (upgraded to multi-category) ───────────────────────────────
// The new rate limiter lives in zalo-rate-limiter.ts with daily + burst limits.
// Re-export legacy-compat functions so existing callers don't break.

import { checkRateLimitCompat, recordSendCompat } from './zalo-rate-limiter.js'
import { logger } from '../../shared/logger.js'
export { checkRateLimitCompat as checkRateLimit }

// Note: recordSendCompat is available if callers need to record sends explicitly.
// The sendViaPool function below uses checkRateLimit internally.

// ─── Post-connect sync ────────────────────────────────────────────────────────

/**
 * Sync friend list and recent conversations after a successful Zalo login.
 * Runs as fire-and-forget — errors are logged but don't break the connection.
 */
export async function syncOnConnect(accountId: string, orgId: string, api: ZaloAPI): Promise<void> {
  const io = getIO()
  let syncedFriends = 0
  let syncedConvs = 0

  // ── 1. Sync friend list ─────────────────────────────────────────────
  if (typeof (api as any).getAllFriends !== 'function') {
    logger.warn(`[zalo-pool] zca-js does not expose getAllFriends — skipping friend sync`)
  } else {
  try {
    const friendsResult = await (api as any).getAllFriends()
    const friends: any[] = friendsResult?.data || friendsResult || []

    if (Array.isArray(friends)) {
      for (const f of friends) {
        const uid = f.userId || f.uid || f.id
        const name = f.displayName || f.zaloName || f.dName || f.name || `Zalo ${String(uid).slice(-4)}`
        if (!uid) continue

        await prisma.channelContact.upsert({
          where: {
            channelAccountId_friendUid: { channelAccountId: accountId, friendUid: String(uid) },
          },
          update: {
            displayName: name,
            avatarUrl: f.avatar || f.avatarUrl || null,
          },
          create: {
            orgId,
            channelAccountId: accountId,
            friendUid: String(uid),
            displayName: name,
            avatarUrl: f.avatar || f.avatarUrl || null,
          },
        })

        // Also backfill Contact.avatarUrl if the contact exists but has no avatar
        const friendAvatar = f.avatar || f.avatarUrl || null
        if (friendAvatar) {
          await prisma.contact.updateMany({
            where: { orgId, externalUid: String(uid), avatarUrl: null },
            data: { avatarUrl: friendAvatar },
          }).catch(() => {})
        }

        syncedFriends++
      }
      logger.info(`[zalo-pool] ✓ Synced ${syncedFriends} friends for ${accountId}`)
    }
  } catch (err: any) {
    logger.warn(`[zalo-pool] Friend sync failed:`, err.message)
  }
  } // end getFriendList else

  // ── 2. Sync recent conversations (Groups & 1-1 Users) ─────────────
  try {
    const { syncGroupMessages, syncUserMessages, registerCustomApis } = await import('./zalo-message-sync.js')
    registerCustomApis(api)
    const backfilledGroupMsgs = await syncGroupMessages(api, accountId)
    const backfilledUserMsgs = await syncUserMessages(api, accountId)
    const totalBackfilled = backfilledGroupMsgs + backfilledUserMsgs
    if (totalBackfilled > 0) {
      logger.info(`[zalo-pool] ✓ Initial sync backfilled ${totalBackfilled} messages (groups: ${backfilledGroupMsgs}, users: ${backfilledUserMsgs}) for ${accountId}`)
    }
  } catch (err: any) {
    logger.warn(`[zalo-pool] Initial conversation sync failed:`, err.message)
  }

  // NOTE: requestOldMessages is intentionally NOT called here.
  // It is triggered by the 'cipher_key' event in setupMessageListener(), which fires
  // once the WS handshake completes on the initial connect AND every reconnect — the
  // point at which the socket can actually accept the request. Calling it here (before
  // the key handshake) would be sent too early and duplicate the catch-up.

  // Notify frontend to refresh conversation list
  if (syncedFriends > 0) {
    io.to(`org:${orgId}`).emit('chat:conv-updated', { reason: 'sync' })
  }
}
