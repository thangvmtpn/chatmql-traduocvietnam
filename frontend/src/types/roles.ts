export enum UserRole {
  ADMIN = 1,
  MANAGER = 2,
  SUPERVISOR = 3,
  EMPLOYEE = 4,
}

export const ADMIN_ROLES = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.SUPERVISOR,
];
export const EMPLOYEE_ROLES = [UserRole.EMPLOYEE];

export const isAdminRole = (role: number): boolean => {
  return ADMIN_ROLES.includes(role);
};

export const isEmployeeRole = (role: number): boolean => {
  return EMPLOYEE_ROLES.includes(role);
};

export const getRoleName = (role: number): string => {
  switch (role) {
    case UserRole.ADMIN:
      return "Quản trị viên";
    case UserRole.MANAGER:
      return "Quản lý";
    case UserRole.SUPERVISOR:
      return "Giám sát";
    case UserRole.EMPLOYEE:
      return "Nhân viên";
    default:
      return "Không xác định";
  }
};
