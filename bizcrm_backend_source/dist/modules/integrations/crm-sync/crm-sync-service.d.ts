export declare function getCrmPool(): Promise<any>;
export declare function getFmPool(): Promise<any>;
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
export declare function ensureCustomProperties(orgId: string): Promise<void>;
/** Normalize phone number for cross-system matching (0912345678 -> 84912345678 or 0912345678) */
export declare function normalizePhoneVariants(phone: string): string[];
/** Find customer in CRM by phone numbers */
export declare function findCrmCustomerByPhone(phone: string): Promise<CrmCustomerData | null>;
/** Sync CRM customer info into ChatMQL Contact & Custom Properties */
export declare function syncContactFromCrm(contactId: string, orgId: string): Promise<{
    crmKh: CrmCustomerData;
    syncedPropertiesCount: number;
} | null>;
/** Batch sync all contacts in organization with CRM */
export declare function batchSyncContacts(orgId: string, limit?: number): Promise<{
    total: number;
    synced: number;
}>;
