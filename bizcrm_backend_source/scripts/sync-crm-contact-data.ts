/**
 * sync-crm-contact-data.ts — Kéo dữ liệu đã có trên CRM về contact ChatMQL.
 *
 * VẤN ĐỀ: CRM tra cứu theo SỐ ĐIỆN THOẠI, nhưng hơn một nửa contact ChatMQL
 * (đến từ Zalo) không có số điện thoại — nên không nối được với CRM, và ô số
 * điện thoại / địa chỉ trong modal lên đơn bị trống.
 *
 * Script tìm số điện thoại qua 2 đường, theo thứ tự tin cậy giảm dần:
 *   1. Số nằm trong tên hiển thị Zalo  ("Nguyễn Hường.0914306885")
 *   2. zalo_uid khớp uid_oa bên CRM     (rất ít bản ghi, nhưng chắc chắn đúng)
 *
 * KHÔNG khớp theo tên. Tên trùng nhau rất nhiều ("Nguyễn Hường" có mấy chục
 * người), gán nhầm sẽ kéo GMV và địa chỉ của khách khác sang — sai nguy hiểm
 * hơn là để trống.
 *
 * Có số rồi thì tra CRM và điền vào chỗ CÒN TRỐNG của contact: số điện thoại,
 * địa chỉ, tỉnh, tên đầy đủ. Không bao giờ đè lên dữ liệu đã có.
 *
 * Dùng:
 *   npx tsx scripts/sync-crm-contact-data.ts          # chạy thử, không ghi
 *   npx tsx scripts/sync-crm-contact-data.ts --apply  # ghi thật
 *   npx tsx scripts/sync-crm-contact-data.ts --apply --limit 200
 */
import 'dotenv/config'
import { prisma } from '../src/shared/prisma-client.js'
import { extractPhoneFromName } from '../src/modules/contacts/phone-extractor.js'
import { getCrmPool, normalizePhoneVariants } from '../src/modules/integrations/crm-sync/crm-sync-service.js'

const APPLY = process.argv.includes('--apply')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg > -1 ? parseInt(process.argv[limitArg + 1], 10) : 100_000

interface CrmRow {
  id_kh: number
  ten_khach_hang: string | null
  sdt1: string | null
  dia_chi: string | null
  tinh: string | null
  gmv: string | number | null
  so_lan_mua: number | null
}

async function main() {
  const crm = await getCrmPool()
  if (!crm) throw new Error('Không kết nối được database CRM (DATABASE_URL_CRM)')

  console.log('='.repeat(74))
  console.log(APPLY ? 'ĐỒNG BỘ CRM → CHATMQL  (GHI THẬT)' : 'ĐỒNG BỘ CRM → CHATMQL  (chạy thử, không ghi gì)')
  console.log('='.repeat(74))

  // Nạp bảng tra zalo_uid -> khách CRM. Chỉ vài chục bản ghi nên nạp hết một lần.
  const uidRes = await crm.query(
    `SELECT uid_oa, id_kh, ten_khach_hang, sdt1, dia_chi, tinh, gmv, so_lan_mua
     FROM khach_hang WHERE uid_oa IS NOT NULL AND uid_oa <> ''`,
  )
  const byUid = new Map<string, CrmRow>()
  for (const r of uidRes.rows) byUid.set(String(r.uid_oa).trim(), r)
  console.log(`\nBảng tra zalo_uid ↔ CRM: ${byUid.size} bản ghi`)

  const contacts = await prisma.contact.findMany({
    where: { isGroup: false },
    select: {
      id: true, fullName: true, crmName: true, phone: true,
      zaloUid: true, metadata: true, orgId: true,
    },
    take: LIMIT,
  })
  console.log(`Đang xét ${contacts.length} contact\n`)

  const stats = {
    daDuDuLieu: 0,
    phoneTuTen: 0,
    phoneTuUid: 0,
    khongTimDuocPhone: 0,
    coPhoneNhungCrmKhongCo: 0,
    daCapNhat: 0,
    themPhone: 0,
    themDiaChi: 0,
    themTen: 0,
  }
  const viDu: string[] = []

  for (const c of contacts) {
    const meta = (c.metadata && typeof c.metadata === 'object')
      ? { ...(c.metadata as Record<string, any>) }
      : {}

    const thieuPhone = !c.phone?.trim()
    const thieuDiaChi = !meta.address
    if (!thieuPhone && !thieuDiaChi) { stats.daDuDuLieu++; continue }

    // ── Tìm số điện thoại ──────────────────────────────────────────
    let phone = c.phone?.trim() || ''
    let nguon = 'sẵn có'

    if (!phone) {
      const tuTen = extractPhoneFromName(c.fullName) || extractPhoneFromName(c.crmName)
      if (tuTen) { phone = tuTen; nguon = 'tên hiển thị'; stats.phoneTuTen++ }
    }
    if (!phone && c.zaloUid) {
      const hit = byUid.get(c.zaloUid.trim())
      if (hit?.sdt1) { phone = hit.sdt1.trim(); nguon = 'zalo_uid'; stats.phoneTuUid++ }
    }
    if (!phone) { stats.khongTimDuocPhone++; continue }

    // ── Tra CRM theo số điện thoại ─────────────────────────────────
    const variants = normalizePhoneVariants(phone)
    const res = await crm.query(
      `SELECT id_kh, ten_khach_hang, sdt1, dia_chi, tinh, gmv, so_lan_mua
       FROM khach_hang WHERE sdt1 = ANY($1) OR sdt2 = ANY($1)
       ORDER BY thoi_gian_capnhat DESC NULLS LAST, id_kh DESC LIMIT 1`,
      [variants],
    )
    const kh: CrmRow | undefined = res.rows[0]

    // Không có trong CRM: vẫn lưu lại số tìm được, vì có số vẫn hơn không.
    if (!kh) {
      stats.coPhoneNhungCrmKhongCo++
      if (thieuPhone) {
        stats.themPhone++
        if (APPLY) {
          await prisma.contact.update({ where: { id: c.id }, data: { phone } })
        }
        if (viDu.length < 12) {
          viDu.push(`  ${(c.fullName || '?').slice(0, 34).padEnd(34)} → phone ${phone} (${nguon}, chưa có trên CRM)`)
        }
      }
      continue
    }

    // ── Ghép dữ liệu, chỉ điền vào chỗ trống ───────────────────────
    const data: Record<string, any> = {}
    const themGi: string[] = []

    if (thieuPhone) { data.phone = phone; stats.themPhone++; themGi.push(`phone=${phone}`) }
    if (!c.fullName?.trim() && kh.ten_khach_hang?.trim()) {
      data.fullName = kh.ten_khach_hang.trim(); stats.themTen++; themGi.push('tên')
    }
    if (thieuDiaChi && kh.dia_chi?.trim()) {
      meta.address = kh.dia_chi.trim(); stats.themDiaChi++; themGi.push('địa chỉ')
    }
    if (!meta.city && kh.tinh?.trim()) meta.city = kh.tinh.trim()
    if (themGi.length === 0) continue

    meta.crmIdKh = kh.id_kh
    data.metadata = meta

    if (APPLY) await prisma.contact.update({ where: { id: c.id }, data })
    stats.daCapNhat++
    if (viDu.length < 12) {
      viDu.push(`  ${(c.fullName || '?').slice(0, 34).padEnd(34)} → ${themGi.join(', ')}  [${nguon}]`)
    }
  }

  console.log('Ví dụ những gì sẽ được điền:')
  viDu.forEach(v => console.log(v))

  console.log('\n' + '-'.repeat(74))
  console.log('KẾT QUẢ')
  console.log('-'.repeat(74))
  console.log(`  Đã đủ phone + địa chỉ, bỏ qua      : ${stats.daDuDuLieu}`)
  console.log(`  Tìm được phone trong tên hiển thị  : ${stats.phoneTuTen}`)
  console.log(`  Tìm được phone qua zalo_uid        : ${stats.phoneTuUid}`)
  console.log(`  Không tìm ra phone ở đâu cả        : ${stats.khongTimDuocPhone}`)
  console.log(`  Có phone nhưng CRM chưa có khách   : ${stats.coPhoneNhungCrmKhongCo}`)
  console.log(`  ── sẽ điền ──`)
  console.log(`  Thêm số điện thoại                 : ${stats.themPhone}`)
  console.log(`  Thêm địa chỉ                       : ${stats.themDiaChi}`)
  console.log(`  Thêm tên đầy đủ                    : ${stats.themTen}`)
  console.log(`  Tổng contact được cập nhật         : ${stats.daCapNhat + stats.themPhone}`)

  if (!APPLY) {
    console.log('\n⚠️  Đây là lần chạy thử — CHƯA ghi gì. Thêm --apply để ghi thật.')
  } else {
    console.log('\n✓ Đã ghi vào database ChatMQL.')
  }
  await prisma.$disconnect()
}

main().catch(e => { console.error('LỖI:', e); process.exit(1) })
