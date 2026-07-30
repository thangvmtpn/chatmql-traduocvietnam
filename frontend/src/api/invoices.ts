import apiBackend from "@/services/api";

export async function get_sale_channels() {
  try {
    const token = localStorage.getItem('token');

    const response = await api.get('/invoice/sale_channels', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching sale channels:', error);
    throw error;
  }
}

export async function get_all_delivery_partners() {
  try {
    const token = localStorage.getItem('token');
    const response = await api.get('/invoice/delivery_partners', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching delivery partners:', error);
    throw error;
  }
}

export async function create_invoice(invoiceData) {
  try {
    const token = localStorage.getItem('token');
    const response = await api.post('/invoice/create', invoiceData, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw error;
  }
}

export async function create_delivery(params) {
  try {
    const token = localStorage.getItem('token');
    const response = await api.post('/invoice/delivery/createDelivery', params, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error creating delivery invoice:', error);
    throw error;
  }
}

export async function cancel_invocie(invoices) {
  try {
    const token = localStorage.getItem('token');
    const response = await api.post(
      '/invoice/cancel',
      { invoices },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error canceling delivery:', error);
    throw error;
  }
}

export async function cancel_delivery(invoice) {
  try {
    const token = localStorage.getItem('token');

    // Ép kiểu dữ liệu tuyệt đối an toàn
    const payload = {
      code_invoice: String(invoice.code_invoice || ''),
      txlogisticId: String(invoice.txlogisticid || invoice.txlogisticId || ''),
      billCode: String(invoice.code_delivery || invoice.billCode || ''),
      id_partner: Number(invoice.id_partner_delivery || invoice.id_partner || 0),
    };

    const response = await api.post('/invoice/delivery/cancel', payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    throw error;
  }
}

export async function print_delivery_invoice(txlogisticId, id_partner) {
  try {
    const token = localStorage.getItem('token');
    const response = await api.post(
      '/invoice/delivery/print',
      { txlogisticId, id_partner },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error printing delivery invoice:', error);
    throw error;
  }
}

export async function mass_print_delivery_invoice(txlogisticIds, id_partner) {
  try {
    const token = localStorage.getItem('token');
    const response = await api.post(
      '/invoice/delivery/print_bulk',
      { txlogisticIds, id_partner },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error printing delivery invoice:', error);
    throw error;
  }
}

export async function get_list_invoice(search_conditions = {}, limit = 30, offset = 0) {
  try {
    const token = localStorage.getItem('token');
    const data_user = JSON.parse(localStorage.getItem('data_user'));
    const code_user = data_user.code_user;
    const response = await api.post(
      '/invoice/list',
      {
        code_user,
        search_conditions,
        limit,
        offset,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error fetching invoice list:', error);
    throw error;
  }
}

export async function get_list_invoice_tts(search_conditions = {}, limit = 30, offset = 0) {
  try {
    const token = localStorage.getItem('token');

    const data_user = JSON.parse(localStorage.getItem('data_user') || '{}');

    const response = await api.post(
      '/invoice/tts/list',
      {
        code_user: data_user.code_user || '', // Lấy code_user an toàn
        search_conditions,
        limit,
        offset,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Lỗi API lấy đơn TTS:', error);
    throw error;
  }
}

export async function update_invoice_salechannel(data) {
  try {
    const token = localStorage.getItem('token');
    const response = await api.post('/invoice/tts/update-subchannel', data, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error('Lỗi cập nhật phân loại:', error);
    throw error;
  }
}

export async function get_list_invoice_VAT(search_conditions = {}, limit = 30, offset = 0) {
  try {
    const token = localStorage.getItem('token');
    const data_user = JSON.parse(localStorage.getItem('data_user'));
    const code_user = data_user.code_user;
    const response = await api.post(
      '/invoice/listVAT',
      {
        code_user,
        search_conditions,
        limit,
        offset,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error fetching invoice list:', error);
    throw error;
  }
}

export async function export_invoice_overview(search_conditions = {}) {
  try {
    const token = localStorage.getItem('token');
    const data_user = JSON.parse(localStorage.getItem('data_user'));
    const code_user = data_user.code_user;

    const response = await api.post(
      '/invoice/exportOverview',
      {
        code_user,
        search_conditions,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        responseType: 'blob', // ⬅️ CỰC KỲ QUAN TRỌNG
      }
    );

    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();

    // Lấy thời gian theo múi giờ Việt Nam
    const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));

    const yyyy = vnTime.getFullYear();
    const mm = String(vnTime.getMonth() + 1).padStart(2, '0');
    const dd = String(vnTime.getDate()).padStart(2, '0');

    const hh = String(vnTime.getHours()).padStart(2, '0');
    const mi = String(vnTime.getMinutes()).padStart(2, '0');
    a.href = url;
    a.download = `hoa_don_${hh}${mi}_${dd}${mm}${yyyy}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export error:', error);
  }
}

// export async function export_invoice_details(search_conditions = {}) {
//   try {
//     const token = localStorage.getItem("token");
//     const data_user = JSON.parse(localStorage.getItem("data_user"));
//     const code_user = data_user.code_user;

//     const response = await api.post(
//       "/invoice/exportDetails",
//       {
//         code_user,
//         search_conditions
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${token}`,
//         },
//         responseType: "blob"   // ⬅️ CỰC KỲ QUAN TRỌNG
//       }
//     );

//     const blob = new Blob([response.data], {
//       type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//     });

//     const url = window.URL.createObjectURL(blob);
//     const a = document.createElement("a");
//     const now = new Date();

//     // Lấy thời gian theo múi giờ Việt Nam
//     const vnTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));

//     const yyyy = vnTime.getFullYear();
//     const mm = String(vnTime.getMonth() + 1).padStart(2, "0");
//     const dd = String(vnTime.getDate()).padStart(2, "0");

//     const hh = String(vnTime.getHours()).padStart(2, "0");
//     const mi = String(vnTime.getMinutes()).padStart(2, "0");
//     a.href = url;
//     a.download = `hoa_don_chi_tiet_${hh}${mi}_${dd}${mm}${yyyy}.xlsx`;
//     a.click();
//     window.URL.revokeObjectURL(url);

//   } catch (error) {
//     console.error("Export error:", error);
//   }
// }

export async function get_all_status() {
  try {
    const token = localStorage.getItem('token');
    const response = await api.get('/invoice/all_status', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    console.log(response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching all invoice statuses:', error);
    throw error;
  }
}

// check phí vận chuyển bên đối tác giao hàng J&T EXPRESS
export async function checkJNTShippingFee(orderDetails) {
  try {
    const response = await fetch('/api/shipping/jnt/check-fee', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderDetails),
    });
    if (!response.ok) {
      throw new Error('Failed to check J&T shipping fee');
    }
    const data = await response.json();
    return data.fee; // Giả sử API trả về phí trong trường 'fee'
  } catch (error) {
    console.error('Error checking J&T shipping fee:', error);
    throw error;
  }
}

// gọi api báo cáo ebitda
export async function report_ebitda(start_date, end_date) {
  try {
    const token = localStorage.getItem('token');
    const permissions = JSON.parse(localStorage.getItem('permissions') || []);
    const response = await api.get(
      `/invoice/report_ebitda?from_date=${start_date}&to_date=${end_date}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching EBITDA report:', error);
    throw error;
  }
}

// gọi api cập nhật hóa đơn
export async function update_invoice(code_invoice, updatedData) {
  try {
    const token = localStorage.getItem('token');
    const response = await api.post(
      `/invoice/update?code_invoice=${encodeURIComponent(code_invoice)}`,
      updatedData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error updating invoice:', error);
    throw error;
  }
}

export async function get_invoice_history(code_delivery, partner_id) {
  try {
    const token = localStorage.getItem('token');

    if (!code_delivery) return [];

    let url = `/invoices/history/${code_delivery}`;
    if (partner_id) {
      url += `?partner_id=${partner_id}`;
    }

    const response = await api.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching delivery history:', error);
    return [];
  }
}

export async function get_vtp_services(params) {
  try {
    const token = localStorage.getItem('token');
    const response = await api.post('/invoice/delivery/vtp-services', params, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching VTP services:', error);
    return { code: 0, data: [] };
  }
}

// API lấy thống kê trạng thái đơn hàng
export async function getOrderStatusStatistics(code_user, start_date, end_date) {
  try {
    const token = localStorage.getItem('token');
    const response = await api.post(
      '/invoice/order_status_statistics',
      {
        code_user,
        start_date,
        end_date,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching order status statistics:', error);
    throw error;
  }
}

// API lấy chi tiết đơn hàng theo trạng thái
export async function getOrderStatusDetail(start_date, end_date, status_name) {
  try {
    const token = localStorage.getItem('token');
    const response = await api.post(
      '/invoice/order_status_detail',
      {
        start_date,
        end_date,
        status_name,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching order status detail:', error);
    throw error;
  }
}

// API lấy date range của dữ liệu delivery_detail
export async function getDeliveryDateRange() {
  try {
    const token = localStorage.getItem('token');
    const response = await api.get('/invoice/delivery_date_range', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching delivery date range:', error);
    throw error;
  }
}

export async function update_status_vat(invoiceCodes, status) {
  try {
    const token = localStorage.getItem('token');

    const response = await api.put(
      '/invoice/vat/update-status',
      {
        invoice_codes: invoiceCodes,
        status: status,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Lỗi cập nhật trạng thái:', error);
    throw error;
  }
}

export async function get_report_sales(start_date, end_date, group_by) {
  try {
    const token = localStorage.getItem('token');

    const response = await api.get('/invoice/report-sales', {
      params: {
        start_date,
        end_date,
        group_by,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching sales report:', error);
    throw error;
  }
}

export async function get_report_sales_detail(start_date, end_date) {
  try {
    const token = localStorage.getItem('token');

    const response = await api.get('/invoice/report-sales-detail', {
      params: {
        start_date,
        end_date,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching sales detail sync:', error);
    throw error;
  }
}

export async function export_overdue_orders_5_days() {
  try {
    const token = localStorage.getItem('token');

    const response = await api.get('/invoice/export-overdue-5-days', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      responseType: 'blob',
    });

    const blob = new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();

    // Lấy thời gian theo múi giờ Việt Nam để đặt tên file
    const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));

    const yyyy = vnTime.getFullYear();
    const mm = String(vnTime.getMonth() + 1).padStart(2, '0');
    const dd = String(vnTime.getDate()).padStart(2, '0');
    const hh = String(vnTime.getHours()).padStart(2, '0');
    const mi = String(vnTime.getMinutes()).padStart(2, '0');

    a.href = url;
    a.download = `Don_CSKH_Qua_Han_${dd}${mm}${yyyy}_${hh}${mi}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Lỗi khi xuất đơn quá hạn:', error);
  }
}

export async function get_invoice_by_waybill(waybill) {
  try {
    const token = localStorage.getItem('token');
    const response = await api.get(`/invoice/by-waybill/${waybill}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching invoice by waybill:', error);
    throw error;
  }
}
