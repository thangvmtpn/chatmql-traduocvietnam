import { prisma } from '../src/shared/prisma-client.js';

async function main() {
  const rows = await prisma.platformSetting.findMany();
  console.log('PlatformSetting rows in DB:', rows.map(r => ({
    key: r.settingKey,
    text: r.valueText,
    bytesLen: r.valueBytes?.length
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
