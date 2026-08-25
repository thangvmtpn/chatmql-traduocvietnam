import { prisma } from '../src/shared/prisma-client.js';
import fs from 'fs';
import path from 'path';

const LOGO_PATH = path.resolve(process.cwd(), '../bizcrm_frontend_dist/assets/logo-traduocvietnam.png');

async function main() {
  let bytes: Uint8Array;
  let mime = 'image/png';
  if (fs.existsSync(LOGO_PATH)) {
    const buf = fs.readFileSync(LOGO_PATH);
    bytes = new Uint8Array(buf);
  } else {
    console.warn('Logo file not found at', LOGO_PATH);
    return;
  }
  
  // Set brand_name
  await prisma.platformSetting.upsert({
    where: { settingKey: 'brand_name' },
    create: { settingKey: 'brand_name', valueText: 'Trà Dược Việt Nam' },
    update: { valueText: 'Trà Dược Việt Nam' },
  });

  // Set brand_logo
  await prisma.platformSetting.upsert({
    where: { settingKey: 'brand_logo' },
    create: { settingKey: 'brand_logo', valueBytes: bytes, valueText: mime },
    update: { valueBytes: bytes, valueText: mime },
  });

  // Set brand_favicon
  await prisma.platformSetting.upsert({
    where: { settingKey: 'brand_favicon' },
    create: { settingKey: 'brand_favicon', valueBytes: bytes, valueText: mime },
    update: { valueBytes: bytes, valueText: mime },
  });

  console.log('Successfully set Trà Dược Việt Nam brand PNG logo and settings in DB!');
}

main().catch(console.error).finally(() => prisma.$disconnect());

