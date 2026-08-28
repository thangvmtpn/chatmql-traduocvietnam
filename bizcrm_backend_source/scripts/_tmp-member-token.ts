import 'dotenv/config'
import { createSigner } from 'fast-jwt'
import { prisma } from '../src/shared/prisma-client.js'
async function main(){
  const email = process.argv[2] || 'hauvt@traduoc.ai'
  const u = await prisma.user.findFirst({ where:{ email }, select:{id:true,orgId:true,role:true,email:true,fullName:true}})
  if(!u) throw new Error('không thấy user '+email)
  const sign = createSigner({ key: process.env.JWT_SECRET || 'dev-secret-change-me', expiresIn: 3600_000 })
  // payload GIỐNG HỆT lúc đăng nhập thật (auth-routes.ts:29)
  const token = sign({ id:u.id, email:u.email, fullName:u.fullName, role:u.role, orgId:u.orgId })
  console.log(JSON.stringify({email:u.email, fullName:u.fullName, token}))
  await prisma.$disconnect()
}
main()
