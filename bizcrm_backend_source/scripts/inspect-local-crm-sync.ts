import { prisma } from '../src/shared/prisma-client.js';
import pg from 'pg';

async function main() {
  console.log('=== INSPECTING LOCAL DATABASES ===');

  // 1. ChatMQL (bizcrm2)
  const org = await prisma.organization.findFirst({
    where: { name: { contains: 'Trà Dược' } },
  }) || await prisma.organization.findFirst();
  console.log('ChatMQL Active Org:', org?.name, '| ID:', org?.id);

  const customProps = await prisma.customProperty.findMany({
    where: { orgId: org?.id },
  });
  console.log(`ChatMQL Custom Properties (${customProps.length}):`);
  for (const p of customProps) {
    console.log(`  - [${p.groupName}] ${p.name} (key: ${p.fieldKey}, type: ${p.fieldType})`);
  }

  // 2. CRM Cũ (crm_tdvn)
  const crmPool = new pg.Pool({
    connectionString: 'postgresql://apple@localhost:5432/crm_tdvn',
  });
  const crmCount = await crmPool.query('SELECT count(*) FROM khach_hang');
  console.log(`\nCRM Cũ (crm_tdvn) - Total Customers:`, crmCount.rows[0].count);

  const sampleCrm = await crmPool.query(`
    SELECT ten_khach_hang, sdt1, gioi_tinh, ngay_sinh, nguon_data, dac_thu_sp, nhu_cau_sd, nhom_kh, gmv, so_lan_mua, ngay_hen_banhang
    FROM khach_hang 
    WHERE sdt1 IS NOT NULL AND sdt1 != '' 
    LIMIT 3
  `);
  console.log('Sample CRM Customers:', sampleCrm.rows);

  // 3. FM (fm_tdvn)
  const fmPool = new pg.Pool({
    connectionString: 'postgresql://apple@localhost:5432/fm_tdvn',
  });
  const fmInvoiceCount = await fmPool.query('SELECT count(*) FROM invoice');
  console.log(`\nFM (fm_tdvn) - Total Invoices:`, fmInvoiceCount.rows[0].count);

  await crmPool.end();
  await fmPool.end();
}

main().catch(console.error).finally(() => prisma.$disconnect());
