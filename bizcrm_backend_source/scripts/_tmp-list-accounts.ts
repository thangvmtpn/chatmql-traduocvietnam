import 'dotenv/config'
import { prisma } from '../src/shared/prisma-client.js'
async function main() {
  const accs = await prisma.channelAccount.findMany({ select: { id: true, platform: true, status: true, displayName: true, isDisabled: true, deletedAt: true } })
  for (const a of accs) console.log(`platform=${a.platform} status=${a.status} disabled=${a.isDisabled} deleted=${!!a.deletedAt} name=${a.displayName} id=${a.id}`)
  const convs = await prisma.conversation.count()
  console.log('conversations:', convs)
  await prisma.$disconnect()
}
main()
