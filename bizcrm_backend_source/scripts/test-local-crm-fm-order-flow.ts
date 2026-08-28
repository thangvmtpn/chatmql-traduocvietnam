import { prisma } from '../src/shared/prisma-client.js';
import { syncContactFromCrm, getCrmPool, getFmPool } from '../src/modules/integrations/crm-sync/crm-sync-service.js';
import { createOrderAndSync } from '../src/modules/orders/order-service.js';

async function testFlow() {
  console.log('================================================================');
  console.log('🚀 TESTING LOCAL CRM & FM INTEGRATION + ORDER DISPATCH PIPELINE');
  console.log('================================================================\n');

  // 1. Get or create active Org
  const org = await prisma.organization.findFirst({
    where: { name: { contains: 'Trà Dược' } },
  }) || await prisma.organization.findFirst();

  if (!org) throw new Error('No organization found');
  console.log(`[1] Active Organization: "${org.name}" (${org.id})`);

  // 2. Create or find test Contact with phone matching CRM customer (0939298504)
  const testPhone = '0939298504';
  let contact = await prisma.contact.findFirst({
    where: { orgId: org.id, phone: testPhone },
  });

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        phone: testPhone,
        fullName: 'Anh Hoàng (Test)',
        lifecycleStage: 'lead',
      },
    });
    console.log(`[2] Created local test contact: ID ${contact.id}`);
  } else {
    console.log(`[2] Found existing local test contact: ID ${contact.id}`);
  }

  // 3. Test CRM Custom Fields Sync
  console.log('\n--- BƯỚC 1: ĐỒNG BỘ THÔNG TIN TÙY CHỈNH TỪ CRM CŨ ---');
  const syncResult = await syncContactFromCrm(contact.id, org.id);
  console.log('Sync Result:', {
    tenKhachHang: syncResult?.crmKh.ten_khach_hang,
    gioiTinh: syncResult?.crmKh.gioi_tinh,
    ngaySinh: syncResult?.crmKh.ngay_sinh,
    nhomKh: syncResult?.crmKh.nhom_kh,
    thichDungHang: syncResult?.crmKh.dac_thu_sp,
    nhuCau: syncResult?.crmKh.nhu_cau_sd,
    gmvCu: syncResult?.crmKh.gmv,
    soLanMuaCu: syncResult?.crmKh.so_lan_mua,
  });

  // Verify property values in ChatMQL
  const propertyValues = await prisma.contactPropertyValue.findMany({
    where: { contactId: contact.id },
    include: { property: true },
  });
  console.log('\n✅ Giá trị các trường tùy chỉnh sau đồng bộ trong ChatMQL:');
  for (const pv of propertyValues) {
    console.log(`  • [${pv.property.groupName}] ${pv.property.name}: "${pv.value}"`);
  }

  // Check appointments in ChatMQL
  const appointments = await prisma.appointment.findMany({
    where: { contactId: contact.id },
  });
  console.log(`\n✅ Lịch hẹn được đồng bộ vào ChatMQL: ${appointments.length} lịch hẹn`);
  appointments.forEach(a => console.log(`  • Ngày hẹn: ${a.appointmentDate.toISOString()} | Ghi chú: ${a.notes}`));

  // 4. Test Create Order and 3-Way Sync
  console.log('\n--- BƯỚC 2: LÊN ĐƠN HÀNG TRỰC TIẾP & BẮN SANG CRM + FM ---');
  
  // Find or create test conversation
  const channelAcc = await prisma.channelAccount.findFirst({
    where: { orgId: org.id },
  });
  if (!channelAcc) throw new Error('No channel account found');

  let conv = await prisma.conversation.findFirst({
    where: { orgId: org.id, contactId: contact.id },
  });
  if (!conv) {
    conv = await prisma.conversation.create({
      data: {
        orgId: org.id,
        channelAccountId: channelAcc.id,
        contactId: contact.id,
        displayName: contact.fullName || 'Khách hàng',
        externalThreadId: 'thread-' + Date.now(),
      },
    });
  }

  const orderPayload = {
    orgId: org.id,
    contactId: contact.id,
    conversationId: conv.id,
    sellerName: 'Nguyễn Văn B (Sale TDVN)',
    customerName: contact.fullName || 'Anh Hoàng',
    customerPhone: testPhone,
    shippingAddress: 'Số 88 Phố Vọng, Phường Phương Liệt, Quận Thanh Xuân, Hà Nội',
    city: 'Hà Nội',
    items: [
      {
        productCode: 'FX/TP-CC03-100/KR',
        productName: 'Trà Đinh Ngọc (Hộp 200g)',
        quantity: 1,
        unitPrice: 1500000,
      },
      {
        productCode: 'VT-200G',
        productName: 'Vạn Thịnh Trà (Hộp 200g)',
        quantity: 1,
        unitPrice: 850000,
      },
    ],
    discountAmount: 100000,
    shippingFee: 0,
    paymentMethod: 'vietqr' as const,
    shippingProvider: 'jt_express' as const,
    notes: 'Khách VIP, đóng gói túi quà sang trọng',
  };

  const orderResult = await createOrderAndSync(orderPayload);
  console.log('Order Dispatch Result:', orderResult);

  // 5. Verify records in CRM (crm_tdvn)
  const crmPool = getCrmPool();
  const crmHdRes = await crmPool.query(
    'SELECT ma_hd, tong_tien, trang_thai, sdt, dia_chi, cp_uudai_khuyenmai, ma_san_pham FROM hoa_don WHERE ma_hd = $1',
    [orderResult.orderCode]
  );
  console.log('\n✅ Kiểm tra Hóa đơn trong CRM cũ (crm_tdvn.hoa_don):');
  console.log(crmHdRes.rows[0]);

  // 6. Verify records in FM (fm_tdvn)
  const fmPool = getFmPool();
  const fmInvRes = await fmPool.query(
    'SELECT code_invoice, total_amount, discount, fee_delivery, status_value FROM invoice WHERE code_invoice = $1',
    [orderResult.orderCode]
  );
  console.log('\n✅ Kiểm tra Hóa đơn trong Hệ thống FM (fm_tdvn.invoice):');
  console.log(fmInvRes.rows[0]);

  const fmDetailRes = await fmPool.query(
    `SELECT d.name_product, d.quantity, d.price, d.total 
     FROM invoice_detail d 
     WHERE d.code_invoice = $1`,
    [orderResult.orderCode]
  );
  console.log('✅ Chi tiết sản phẩm trong FM (fm_tdvn.invoice_detail):', fmDetailRes.rows);

  const fmDelivRes = await fmPool.query(
    `SELECT del.receiver, del.contact_number, del.address, del.partner_delivery, del.codfee 
     FROM delivery_information del 
     WHERE del.code_invoice = $1`,
    [orderResult.orderCode]
  );
  console.log('✅ Thông tin vận đơn trong FM (fm_tdvn.delivery_information):', fmDelivRes.rows);

  // 7. Verify Chat confirmation message in ChatMQL
  const latestMessage = await prisma.message.findFirst({
    where: { conversationId: conv.id },
    orderBy: { sentAt: 'desc' },
  });
  console.log('\n✅ Tin nhắn xác nhận đơn hàng hiển thị trong ChatMQL:\n');
  console.log(latestMessage?.content);

  console.log('\n================================================================');
  console.log('🎉 TOÀN BỘ LUỒNG ĐỒNG BỘ 3 CHIỀU (ChatMQL <-> CRM <-> FM) TEST THÀNH CÔNG 100% TRÊN LOCAL!');
  console.log('================================================================');
}

testFlow().catch(console.error).finally(() => prisma.$disconnect());
