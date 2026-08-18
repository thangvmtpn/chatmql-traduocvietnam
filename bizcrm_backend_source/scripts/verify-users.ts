import { prisma } from '../src/shared/prisma-client.js';
import bcrypt from 'bcryptjs';

async function main() {
  const users = await prisma.user.findMany({
    include: { org: true },
  });

  console.log('Current Users in DB:');
  for (const u of users) {
    console.log(`- Email: ${u.email} | Role: ${u.role} | Active: ${u.isActive} | Org: ${u.org?.name} (${u.org?.status})`);
  }

  const hash = await bcrypt.hash('admin123', 12);

  // Check if admin@traduoc.ai exists
  const traduocUser = await prisma.user.findUnique({ where: { email: 'admin@traduoc.ai' } });
  if (traduocUser) {
    await prisma.user.update({
      where: { email: 'admin@traduoc.ai' },
      data: {
        passwordHash: hash,
        isActive: true,
      },
    });
    console.log('✓ Reset password for admin@traduoc.ai to admin123 and set isActive=true');
  } else {
    // Check if there is an organization for Trà Dược Việt Nam
    let org = await prisma.organization.findFirst({
      where: { name: { contains: 'Trà Dược' } }
    });
    if (!org) {
      org = await prisma.organization.findFirst();
    }
    if (org) {
      await prisma.user.create({
        data: {
          email: 'admin@traduoc.ai',
          passwordHash: hash,
          fullName: 'Admin Trà Dược Việt Nam',
          role: 'owner',
          isActive: true,
          orgId: org.id,
        }
      });
      console.log('✓ Created admin@traduoc.ai with password admin123 and role owner');
    }
  }

  // Also check admin@bizino.ai
  const bizinoUser = await prisma.user.findUnique({ where: { email: 'admin@bizino.ai' } });
  if (bizinoUser) {
    await prisma.user.update({
      where: { email: 'admin@bizino.ai' },
      data: {
        passwordHash: hash,
        isActive: true,
      },
    });
    console.log('✓ Reset password for admin@bizino.ai to admin123 and set isActive=true');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
