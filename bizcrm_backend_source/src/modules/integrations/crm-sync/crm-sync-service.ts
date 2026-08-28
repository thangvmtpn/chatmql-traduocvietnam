import { prisma } from '../../../shared/prisma-client.js';
import { logger } from '../../../shared/logger.js';

const CRM_DB_URL = process.env.DATABASE_URL_CRM || 'postgresql://apple@localhost:5432/crm_tdvn';
const FM_DB_URL = process.env.DATABASE_URL_FM || 'postgresql://apple@localhost:5432/fm_tdvn';

let crmPool: any = null;
let fmPool: any = null;

export async function getCrmPool(): Promise<any> {
  if (!crmPool) {
    try {
      const mod = 'pg';
      const pgPkg = await import(/* @vite-ignore */ mod);
      const pg = pgPkg.default || pgPkg;
      crmPool = new pg.Pool({ connectionString: CRM_DB_URL });
    } catch (e) {
      return null;
    }
  }
  return crmPool;
}

export async function getFmPool(): Promise<any> {
  if (!fmPool) {
    try {
      const mod = 'pg';
      const pgPkg = await import(/* @vite-ignore */ mod);
      const pg = pgPkg.default || pgPkg;
      fmPool = new pg.Pool({ connectionString: FM_DB_URL });
    } catch (e) {
      return null;
    }
  }
  return fmPool;
}

export interface CrmCustomerData {
  id_kh: number;
  ten_khach_hang: string | null;
  sdt1: string | null;
  sdt2: string | null;
  gioi_tinh: string | null;
  ngay_sinh: string | null;
  nguon_data: string | null;
  nhom_kh: string | null;
  dac_thu_sp: string | null;
  nhu_cau_sd: string | null;
  gmv: string | number | null;
  so_lan_mua: number | null;
  dia_chi: string | null;
  tinh: string | null;
  phuong: string | null;
  ngay_hen_banhang: Date | null;
  thoi_gian_cs_lai: Date | null;
  type_hen: string | null;
}

/** Ensure default Custom Properties exist for the organization */
export async function ensureCustomProperties(orgId: string) {
  const defaultProps = [
    { name: 'Mức độ ưu tiên', fieldKey: 'priority_level', fieldType: 'single_select', groupName: 'THÔNG TIN CÁ NHÂN', sortOrder: 1 },
    { name: 'Kênh liên hệ ưa thích', fieldKey: 'contact_preference', fieldType: 'single_select', groupName: 'THÔNG TIN CÁ NHÂN', sortOrder: 2 },
    { name: 'Giới tính', fieldKey: 'gender', fieldType: 'single_select', groupName: 'THÔNG TIN CÁ NHÂN', sortOrder: 3 },
    { name: 'Nguồn giới thiệu', fieldKey: 'referral_source', fieldType: 'text', groupName: 'THÔNG TIN CÁ NHÂN', sortOrder: 4 },
    { name: 'Thích dùng hàng', fieldKey: 'thich_dung_hang', fieldType: 'text', groupName: 'TRÀ INFO', sortOrder: 5 },
    { name: 'Nhu cầu sử dụng', fieldKey: 'nhu_cau_sd', fieldType: 'text', groupName: 'TRÀ INFO', sortOrder: 6 },
    { name: 'Bạn bè Zalo', fieldKey: 'zalo_friend_status', fieldType: 'boolean', groupName: 'ZALO', sortOrder: 7 },
    { name: 'Ngày sinh nhật', fieldKey: 'birthday', fieldType: 'date', groupName: 'ZALO', sortOrder: 8 },
    { name: 'Tổng chi tiêu (GMV)', fieldKey: 'gmv_total', fieldType: 'number', groupName: 'LỊCH SỬ MUA HÀNG', sortOrder: 9 },
    { name: 'Số đơn đã mua', fieldKey: 'order_count', fieldType: 'number', groupName: 'LỊCH SỬ MUA HÀNG', sortOrder: 10 },
  ];

  for (const prop of defaultProps) {
    await prisma.customProperty.upsert({
      where: {
        orgId_fieldKey: {
          orgId,
          fieldKey: prop.fieldKey,
        },
      },
      update: {
        name: prop.name,
        fieldType: prop.fieldType,
        groupName: prop.groupName,
        sortOrder: prop.sortOrder,
      },
      create: {
        orgId,
        name: prop.name,
        fieldKey: prop.fieldKey,
        fieldType: prop.fieldType,
        groupName: prop.groupName,
        sortOrder: prop.sortOrder,
      },
    });
  }
}

/** Normalize phone number for cross-system matching (0912345678 -> 84912345678 or 0912345678) */
export function normalizePhoneVariants(phone: string): string[] {
  if (!phone) return [];
  const digits = phone.replace(/\D/g, '');
  const variants = [digits];
  if (digits.startsWith('84') && digits.length >= 11) {
    variants.push('0' + digits.slice(2));
  } else if (digits.startsWith('0') && digits.length >= 10) {
    variants.push('84' + digits.slice(1));
  }
  return Array.from(new Set(variants));
}

/** Find customer in CRM by phone numbers */
export async function findCrmCustomerByPhone(phone: string): Promise<CrmCustomerData | null> {
  const pool = await getCrmPool();
  if (!pool) return null;
  const phones = normalizePhoneVariants(phone);
  if (phones.length === 0) return null;

  try {
    const res = await pool.query(
      `SELECT id_kh, ten_khach_hang, sdt1, sdt2, gioi_tinh, ngay_sinh, nguon_data, nhom_kh, 
              dac_thu_sp, nhu_cau_sd, gmv, so_lan_mua, dia_chi, tinh, phuong, ngay_hen_banhang, 
              thoi_gian_cs_lai, type_hen
       FROM khach_hang 
       WHERE sdt1 = ANY($1) OR sdt2 = ANY($1) 
       ORDER BY thoi_gian_capnhat DESC NULLS LAST, id_kh DESC 
       LIMIT 1`,
      [phones]
    );

    if (res.rows.length > 0) {
      return res.rows[0];
    }
  } catch (err) {
    logger.warn({ err, phone }, 'Failed to query CRM database for customer');
  }
  return null;
}

/** Sync CRM customer info into ChatMQL Contact & Custom Properties */
export async function syncContactFromCrm(contactId: string, orgId: string) {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { propertyValues: true },
  });

  if (!contact || !contact.phone) return null;

  const crmKh = await findCrmCustomerByPhone(contact.phone);
  if (!crmKh) return null;

  await ensureCustomProperties(orgId);

  // Fetch all custom properties for mapping
  const props = await prisma.customProperty.findMany({ where: { orgId } });
  const propMap = new Map(props.map(p => [p.fieldKey, p.id]));

  // Values to upsert
  const valuesToSet: Array<{ fieldKey: string; value: string }> = [];

  if (crmKh.gioi_tinh && crmKh.gioi_tinh.trim()) {
    valuesToSet.push({ fieldKey: 'gender', value: crmKh.gioi_tinh.trim() });
  }
  if (crmKh.ngay_sinh && crmKh.ngay_sinh.trim()) {
    valuesToSet.push({ fieldKey: 'birthday', value: crmKh.ngay_sinh.trim() });
  }
  if (crmKh.nhom_kh && crmKh.nhom_kh.trim()) {
    valuesToSet.push({ fieldKey: 'priority_level', value: crmKh.nhom_kh.trim() });
  }
  if (crmKh.nguon_data && crmKh.nguon_data.trim()) {
    valuesToSet.push({ fieldKey: 'referral_source', value: crmKh.nguon_data.trim() });
  }
  if (crmKh.dac_thu_sp && crmKh.dac_thu_sp.trim()) {
    valuesToSet.push({ fieldKey: 'thich_dung_hang', value: crmKh.dac_thu_sp.trim() });
  }
  if (crmKh.nhu_cau_sd && crmKh.nhu_cau_sd.trim()) {
    valuesToSet.push({ fieldKey: 'nhu_cau_sd', value: crmKh.nhu_cau_sd.trim() });
  }
  if (crmKh.gmv !== null && crmKh.gmv !== undefined) {
    valuesToSet.push({ fieldKey: 'gmv_total', value: String(crmKh.gmv).trim() });
  }
  if (crmKh.so_lan_mua !== null && crmKh.so_lan_mua !== undefined) {
    valuesToSet.push({ fieldKey: 'order_count', value: String(crmKh.so_lan_mua) });
  }

  // Upsert property values
  for (const item of valuesToSet) {
    const propId = propMap.get(item.fieldKey);
    if (!propId) continue;

    await prisma.contactPropertyValue.upsert({
      where: {
        contactId_propertyId: {
          contactId: contact.id,
          propertyId: propId,
        },
      },
      update: { value: item.value },
      create: {
        orgId,
        contactId: contact.id,
        propertyId: propId,
        value: item.value,
      },
    });
  }

  // Update contact basic fields if missing
  const updateData: Record<string, any> = {};
  if (!contact.fullName && crmKh.ten_khach_hang) {
    updateData.fullName = crmKh.ten_khach_hang.trim();
  }
  const currentMeta = (contact.metadata && typeof contact.metadata === 'object') ? { ...(contact.metadata as Record<string, any>) } : {};
  if (crmKh.dia_chi) currentMeta.address = crmKh.dia_chi.trim();
  if (crmKh.tinh) currentMeta.city = crmKh.tinh.trim();
  updateData.metadata = currentMeta;

  if (crmKh.gmv) {
    updateData.leadScore = Math.min(100, Math.floor(Number(crmKh.gmv) / 100000));
  }

  await prisma.contact.update({
    where: { id: contact.id },
    data: updateData,
  });

  // Sync Appointment if present in CRM
  if (crmKh.ngay_hen_banhang) {
    const apptDate = new Date(crmKh.ngay_hen_banhang);
    if (!isNaN(apptDate.getTime())) {
      const existingAppt = await prisma.appointment.findFirst({
        where: {
          contactId: contact.id,
          appointmentDate: apptDate,
        },
      });

      if (!existingAppt) {
        await prisma.appointment.create({
          data: {
            orgId,
            contactId: contact.id,
            appointmentDate: apptDate,
            type: crmKh.type_hen || 'CSKH',
            status: 'scheduled',
            notes: `Hẹn bán hàng / CSKH từ CRM cũ (${crmKh.nhu_cau_sd || ''})`,
          },
        });
      }
    }
  }

  return { crmKh, syncedPropertiesCount: valuesToSet.length };
}

/** Batch sync all contacts in organization with CRM */
export async function batchSyncContacts(orgId: string, limit = 500) {
  const contacts = await prisma.contact.findMany({
    where: { orgId, phone: { not: null } },
    take: limit,
  });

  let successCount = 0;
  for (const c of contacts) {
    try {
      const res = await syncContactFromCrm(c.id, orgId);
      if (res) successCount++;
    } catch (e) {
      logger.error({ err: e, contactId: c.id }, 'Error syncing contact from CRM');
    }
  }

  return { total: contacts.length, synced: successCount };
}
