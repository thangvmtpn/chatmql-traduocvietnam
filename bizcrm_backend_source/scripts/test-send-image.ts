/**
 * test-send-image.ts — reproduce the "cannot send image in chat" issue.
 * Signs a JWT with the server's own secret (never printed), picks a real
 * conversation, and POSTs a genuine 1x1 PNG to /messages/image on the
 * running server (port 4520). Prints status + response body.
 */
import 'dotenv/config'
import { createSigner } from 'fast-jwt'
import { prisma } from '../src/shared/prisma-client.js'

async function main() {
  const conv = await prisma.conversation.findFirst({
    orderBy: { lastMessageAt: 'desc' },
    select: {
      id: true, orgId: true, channelAccountId: true, externalThreadId: true,
      contact: { select: { zaloUid: true } },
      channelAccount: { select: { platform: true, status: true } },
    },
  })
  if (!conv) throw new Error('No conversation in DB')

  const user = await prisma.user.findFirst({
    where: { orgId: conv.orgId, role: 'admin' },
    select: { id: true, orgId: true, role: true, email: true },
  }) || await prisma.user.findFirst({
    where: { orgId: conv.orgId },
    select: { id: true, orgId: true, role: true, email: true },
  })
  if (!user) throw new Error('No user in conversation org')

  console.log('User:', user.email, user.role, '| Conv:', conv.id)
  console.log('Platform:', conv.channelAccount?.platform, '| account status:', conv.channelAccount?.status, '| zaloUid:', conv.contact?.zaloUid ? 'yes' : 'no', '| externalThreadId:', conv.externalThreadId ? 'yes' : 'no')

  const secret = process.env.JWT_SECRET || 'dev-secret-change-me'
  const sign = createSigner({ key: secret, expiresIn: 10 * 60 * 1000 })
  const token = sign({ id: user.id, orgId: user.orgId, role: user.role })

  // Real 1x1 red PNG
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )

  const form = new FormData()
  form.append('file', new Blob([png], { type: 'image/png' }), 'test-image.png')
  form.append('caption', 'test caption from script')

  const res = await fetch(`http://localhost:4520/api/v1/conversations/${conv.id}/messages/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  const text = await res.text()
  console.log('\nHTTP', res.status)
  console.log(text.slice(0, 2000))
  await prisma.$disconnect()
}

main().catch((e) => { console.error('SCRIPT ERROR:', e); process.exit(1) })
