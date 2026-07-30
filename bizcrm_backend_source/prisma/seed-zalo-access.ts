/**
 * seed-zalo-access.ts — Seeds sample team members for testing the
 * per-account Zalo ACL feature.
 *
 * Run: npx tsx prisma/seed-zalo-access.ts
 *
 * Creates four `member`-role users in the first organization:
 *   1. Member with NO Zalo access (control — should see zero conversations)
 *   2. Another member with NO access (control)
 *   3. Member granted `chat` permission on the first Zalo account
 *   4. Member granted `read`  permission on the first Zalo account
 *
 * The script is idempotent — re-running it is safe; existing emails are
 * left as-is and only the access grants are refreshed.
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

interface SampleMember {
  fullName: string
  email: string
  password: string
  role: 'admin' | 'manager' | 'member'
  /** Permission to grant on the first Zalo account; null = no access.
   *  Ignored for non-member roles (they bypass ACL anyway). */
  grantOnFirstAccount: 'read' | 'chat' | 'admin' | null
}

const SAMPLE_MEMBERS: SampleMember[] = [
  {
    fullName: 'Đỗ Thanh Tùng (Manager)',
    email: 'manager@bizcrm.test',
    password: 'Member@123',
    role: 'manager',
    grantOnFirstAccount: null,
  },
  {
    fullName: 'Trần Văn Khóa (No access)',
    email: 'member.no-access@bizcrm.test',
    password: 'Member@123',
    role: 'member',
    grantOnFirstAccount: null,
  },
  {
    fullName: 'Nguyễn Thị Hương (No access)',
    email: 'member.no-access2@bizcrm.test',
    password: 'Member@123',
    role: 'member',
    grantOnFirstAccount: null,
  },
  {
    fullName: 'Lê Hoàng Nam (Chat)',
    email: 'member.chat@bizcrm.test',
    password: 'Member@123',
    role: 'member',
    grantOnFirstAccount: 'chat',
  },
  {
    fullName: 'Phạm Mai Linh (Read)',
    email: 'member.read@bizcrm.test',
    password: 'Member@123',
    role: 'member',
    grantOnFirstAccount: 'read',
  },
]

async function main() {
  const org = await prisma.organization.findFirst({ select: { id: true, name: true } })
  if (!org) {
    console.log('❌ No organization found. Register a user first.')
    return
  }
  console.log(`📦 Org: ${org.name} (${org.id})`)

  // The "first" Zalo account in the org — used as the target for grants
  const firstAccount = await prisma.zaloAccount.findFirst({
    where: { orgId: org.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, displayName: true },
  })
  if (firstAccount) {
    console.log(`📲 Target Zalo account: ${firstAccount.displayName || firstAccount.id}`)
  } else {
    console.log('⚠️  No Zalo account in this org yet — grants will be skipped.')
  }

  console.log('\n👥 Seeding sample members...\n')

  for (const m of SAMPLE_MEMBERS) {
    const email = m.email.toLowerCase().trim()
    let user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, fullName: true },
    })

    if (user) {
      // Ensure role stays in sync with the seed config (e.g. promotions)
      await prisma.user.update({ where: { id: user.id }, data: { role: m.role } })
      console.log(`   ↳ ${m.email} already exists (id=${user.id}) — role refreshed to "${m.role}"`)
    } else {
      const passwordHash = await bcrypt.hash(m.password, 12)
      user = await prisma.user.create({
        data: {
          orgId: org.id,
          email,
          passwordHash,
          fullName: m.fullName,
          role: m.role,
        },
        select: { id: true, fullName: true },
      })
      console.log(`   ✅ Created ${m.email} (${m.role})`)
    }

    if (firstAccount && m.grantOnFirstAccount) {
      await prisma.zaloAccountAccess.upsert({
        where: {
          zaloAccountId_userId: {
            zaloAccountId: firstAccount.id,
            userId: user.id,
          },
        },
        update: { permission: m.grantOnFirstAccount },
        create: {
          zaloAccountId: firstAccount.id,
          userId: user.id,
          permission: m.grantOnFirstAccount,
        },
      })
      console.log(`      → granted "${m.grantOnFirstAccount}" on "${firstAccount.displayName || firstAccount.id}"`)
    } else if (firstAccount) {
      // Ensure no stale grant left over from a prior seed run
      await prisma.zaloAccountAccess.deleteMany({
        where: { zaloAccountId: firstAccount.id, userId: user.id },
      })
      console.log(`      → no grant (control)`)
    }
  }

  console.log('\n📋 Test credentials:')
  console.log('──────────────────────────────────────────────────────────────────────')
  console.log('Email                            │ Password    │ Role     │ Access   ')
  console.log('──────────────────────────────────────────────────────────────────────')
  for (const m of SAMPLE_MEMBERS) {
    const grant = m.grantOnFirstAccount ?? '— none —'
    console.log(`${m.email.padEnd(32)} │ ${m.password.padEnd(11)} │ ${m.role.padEnd(8)} │ ${grant}`)
  }
  console.log('──────────────────────────────────────────────────────────────────────')
  console.log('\nQuick test matrix:')
  console.log('  • manager@*           → bypasses ACL → sees ALL conversations,')
  console.log('                          but Tích hợp tab is hidden')
  console.log('  • member.no-access@*  → conversation list should be EMPTY')
  console.log('  • member.chat@*       → sees only the granted account\'s conversations')
  console.log('  Use Phân quyền on the Zalo account to grant/revoke at runtime.\n')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
