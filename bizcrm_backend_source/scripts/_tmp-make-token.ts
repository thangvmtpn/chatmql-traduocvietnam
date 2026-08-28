import 'dotenv/config'
import { createSigner } from 'fast-jwt'
import { prisma } from '../src/shared/prisma-client.js'
import { writeFileSync } from 'fs'
async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'admin@traduoc.ai' }, select: { id: true, orgId: true, role: true } })
  if (!user) throw new Error('no user')
  const sign = createSigner({ key: process.env.JWT_SECRET || 'dev-secret-change-me', expiresIn: 2 * 60 * 60 * 1000 })
  const token = sign({ id: user.id, orgId: user.orgId, role: user.role })
  writeFileSync('/private/tmp/claude-504/-Users-apple-Projects-AI-bizcrm/5fbb6edc-154a-46fa-a1c8-1c227653a172/scratchpad/dev-token.txt', token)
  console.log('token written, role:', user.role)
  await prisma.$disconnect()
}
main()
