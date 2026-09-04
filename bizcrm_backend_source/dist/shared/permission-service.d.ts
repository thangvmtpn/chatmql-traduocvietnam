/**
 * Chỉ khai đúng hai trường hàm này thực sự đọc. Đòi thêm `id`/`orgId` sẽ bắt
 * mọi handler phải nới kiểu ép của `request.user` — thừa và dễ gây lỗi biên dịch
 * ở những chỗ không liên quan.
 */
export interface PermissionUser {
    role: string;
    roleId?: string | null;
}
/** Gọi sau khi sửa quyền của vai trò để lần đọc kế tiếp lấy bản mới. */
export declare function invalidateRolePermissionCache(roleId?: string): void;
/** Tập quyền hiệu lực. Không bao giờ ném lỗi — hỏng thì lùi về vai trò cũ. */
export declare function getUserPermissions(user: PermissionUser): Promise<Set<string>>;
export declare function userHasPermission(user: PermissionUser, key: string): Promise<boolean>;
/** Gọi sau khi PATCH đổi vai trò của một thành viên. */
export declare function invalidateUserRoleCache(userId?: string): void;
/** Tập quyền hiệu lực theo trạng thái HIỆN TẠI trong DB (không tin roleId trong token). */
export declare function getUserPermissionsFresh(userId: string, fallbackRole: string): Promise<Set<string>>;
export declare function userHasPermissionFresh(userId: string, fallbackRole: string, key: string): Promise<boolean>;
