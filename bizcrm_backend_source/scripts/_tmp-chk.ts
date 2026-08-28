import { prisma } from '../src/shared/prisma-client.js'
async function main(){
  const n = await prisma.note.findFirst({ select: { id: true, status: true } })
  console.log('✓ Prisma client có Note.status:', n === null ? '(chưa có ghi chú)' : JSON.stringify(n))
  await prisma.$disconnect()
}
main()
