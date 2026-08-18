import { prisma } from '../src/shared/prisma-client.js';
import fs from 'fs';
import path from 'path';

const TRADUOC_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 110" width="420" height="110">
  <g transform="translate(10, 5)">
    <!-- Star & Swoosh Icon -->
    <circle cx="50" cy="50" r="40" fill="none" stroke="#E31D24" stroke-width="6"/>
    <path d="M 25,65 Q 45,85 70,60 T 80,30" fill="none" stroke="#0D6838" stroke-width="6" stroke-linecap="round"/>
    <polygon points="50,10 60,35 85,35 65,50 72,75 50,60 28,75 35,50 15,35 40,35" fill="#F59E0B"/>
  </g>
  <!-- Text -->
  <text x="115" y="52" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-weight="900" font-size="26" fill="#0D6838">TRÀ DƯỢC VIỆT NAM</text>
  <text x="115" y="80" font-family="-apple-system, BlinkMacSystemFont, Arial, sans-serif" font-weight="600" font-size="13" stroke-width="0.5" fill="#E31D24">PHƯỚC LÀNH CHO SỨC KHỎE</text>
</svg>`;

async function main() {
  const bytes = new Uint8Array(Buffer.from(TRADUOC_SVG, 'utf-8'));
  
  // Set brand_name
  await prisma.platformSetting.upsert({
    where: { settingKey: 'brand_name' },
    create: { settingKey: 'brand_name', valueText: 'Trà Dược Việt Nam' },
    update: { valueText: 'Trà Dược Việt Nam' },
  });

  // Set brand_logo
  await prisma.platformSetting.upsert({
    where: { settingKey: 'brand_logo' },
    create: { settingKey: 'brand_logo', valueBytes: bytes, valueText: 'image/svg+xml' },
    update: { valueBytes: bytes, valueText: 'image/svg+xml' },
  });

  // Set brand_favicon
  await prisma.platformSetting.upsert({
    where: { settingKey: 'brand_favicon' },
    create: { settingKey: 'brand_favicon', valueBytes: bytes, valueText: 'image/svg+xml' },
    update: { valueBytes: bytes, valueText: 'image/svg+xml' },
  });

  console.log('Successfully set Trà Dược Việt Nam brand logo and settings in DB!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
