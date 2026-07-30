import Sidebar from "@/components/Sidebar/Sidebar";
import DailyTargetDashboard from "@/components/DailyTarget/DailyTargetDashboard";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import { User } from "@/stores/useAuthStore";
import "./DailyTarget.css";

interface DailyTargetProps {
  user: User | null;
}

function DailyTarget({ user }: DailyTargetProps) {
  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="daily-target-layout">
      <Sidebar user={user} />
      <main className="daily-target-main">
        <Breadcrumb />
        <DailyTargetDashboard />
      </main>
    </div>
  );
}

export default DailyTarget;
