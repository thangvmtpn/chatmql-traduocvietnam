import { User } from "@/stores/useAuthStore";
import { isAdminRole, isEmployeeRole } from "@/types/roles";
import AdminLayout from "@/layouts/AdminLayout/AdminLayout";
import ManagerLayout from "@/layouts/ManagerLayout/ManagerLayout";
import EmployeeLayout from "@/layouts/EmployeeLayout/EmployeeLayout";
import EmployeeClassificationLayout from "@/layouts/EmployeeClassificationLayout/EmployeeClassificationLayout";

interface DashboardProps {
  user: User | null;
}

function Dashboard({ user }: DashboardProps) {
  if (!user) {
    return <div>Loading...</div>;
  }

  // Phân quyền layout theo role_id và chức vụ
  const roleId = user.role_id || 4; // Default là employee
  const chucVu = user.chuc_vu?.toUpperCase();

  if (isAdminRole(roleId)) {
    // Role 1 - Admin
    if (roleId === 1) {
      return <AdminLayout user={user} />;
    }
    // Role 2, 3 - Manager/Supervisor
    return <ManagerLayout user={user} />;
  }

  if (isEmployeeRole(roleId)) {
    // Role 4 - Employee
    // Kiểm tra chức vụ để phân loại layout
    if (chucVu === "NHÂN VIÊN PHÂN LOẠI") {
      return <EmployeeClassificationLayout user={user} />;
    }
    // Các chức vụ khác của employee
    return <EmployeeLayout user={user} />;
  }

  // Fallback - không có quyền
  return (
    <div style={{ padding: "50px", textAlign: "center" }}>
      <h2>Không có quyền truy cập</h2>
      <p>Vui lòng liên hệ quản trị viên</p>
    </div>
  );
}

export default Dashboard;
