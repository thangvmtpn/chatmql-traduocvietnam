/**
 * permission-registry.ts — NGUỒN DUY NHẤT khai báo mọi quyền của hệ thống.
 *
 * Bảng `permissions` trong DB chỉ là bản sao của file này (seed lại mỗi lần khởi
 * động). Muốn thêm quyền → sửa ở đây, không INSERT tay vào DB.
 *
 * Quy ước khoá: `<module>.<action>`, ví dụ `contacts.delete`.
 * Nhóm (`group`) bám đúng menu chính để người dùng nhìn ma trận thấy quen thuộc.
 *
 * ⚠️ GIAI ĐOẠN 1: danh mục + vai trò đã dựng nhưng CHƯA có hiệu lực. 74 chỗ
 * `if (!['owner','admin'])` trong route vẫn đang quyết định. Việc thay chúng
 * bằng `requirePermission()` là giai đoạn 2.
 */
/** Hành động chuẩn. Không phải module nào cũng có đủ. */
export declare const Action: {
    readonly VIEW: "view";
    readonly CREATE: "create";
    readonly UPDATE: "update";
    readonly DELETE: "delete";
    readonly IMPORT: "import";
    readonly EXPORT: "export";
    readonly APPROVE: "approve";
    readonly SEND: "send";
    readonly MONITOR: "monitor";
    readonly IMPERSONATE: "impersonate";
};
export type ActionKey = (typeof Action)[keyof typeof Action];
export declare const ACTION_LABEL: Record<ActionKey, string>;
export interface PermissionDef {
    key: string;
    module: string;
    action: ActionKey;
    label: string;
    group: string;
    sortOrder: number;
}
/** Bung khai báo module thành danh sách quyền phẳng. */
export declare const PERMISSIONS: PermissionDef[];
export declare const PERMISSION_KEYS: Set<string>;
/** Phạm vi dữ liệu gắn vào vai trò (khớp DataScope ở shared/data-scope.ts). */
export type RoleDataScope = 'all' | 'team' | 'own';
export interface SystemRoleDef {
    /** Khớp giá trị `User.role` cũ để chuyển tiếp không gãy. */
    systemKey: 'owner' | 'admin' | 'manager' | 'member';
    name: string;
    description: string;
    dataScope: RoleDataScope;
    /** '*' = toàn bộ quyền. Ngược lại là danh sách khoá cụ thể. */
    permissions: '*' | string[];
}
/**
 * 4 vai trò gốc — seed cho mọi tổ chức, `isSystem = true` nên không xoá được.
 * Quyền ở đây phản ánh ĐÚNG hành vi hiện tại của 74 chỗ kiểm tra trong route,
 * để giai đoạn 2 thay thế mà không đổi hành vi.
 */
export declare const SYSTEM_ROLES: SystemRoleDef[];
/** Quyền thực tế của một vai trò gốc (bung '*' thành danh sách đầy đủ). */
export declare function permissionsOf(role: SystemRoleDef): string[];
