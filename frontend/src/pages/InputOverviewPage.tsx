import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/Sidebar/Sidebar";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import { User } from "@/stores/useAuthStore";
import "material-symbols";
import "./InputOverviewPage.css";

interface InputOverviewPageProps {
  user: User | null;
}

function InputOverviewPage({ user }: InputOverviewPageProps) {
  const navigate = useNavigate();

  if (!user) return <div>Loading...</div>;

  const overviewItems = [
    // {
    //   id: "daily-target",
    //   title: "Tổng quan mục tiêu",
    //   description: "Theo dõi tiến độ mục tiêu doanh số hàng ngày",
    //   icon: "target",
    //   color: "bg-orange-500",
    //   path: "/daily-target",
    // },
    {
      id: "sales-report",
      title: "Tổng quan doanh số",
      description: "Xem báo cáo doanh số chi tiết",
      icon: "bar_chart",
      color: "bg-purple-600",
      path: "/sales-report",
    },
    {
      id: "sales-schedule-overview",
      title: "Tổng quan lịch bán hàng",
      description: "Theo dõi lịch bán hàng của tất cả nhân viên kinh doanh",
      icon: "event_available",
      color: "bg-emerald-600",
      path: "/sales-schedule-overview",
    },
    {
      id: "gamification-individual",
      title: "Gamification",
      description: "Quản lý các chương trình Deal Sốc, Đua Top",
      icon: "emoji_events",
      color: "bg-pink-600",
      path: "/gamification/individual",
    },
    {
      id: "invoices",
      title: "Tổng quan đơn hàng",
      description: "Xem danh sách và quản lý các hoá đơn",
      icon: "receipt_long",
      color: "bg-indigo-600",
      path: "/invoices",
    },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%" }}>
      <Sidebar user={user} />
      <main
        style={{
          flex: 1,
          overflowY: "auto",
          backgroundColor: "#f8f9fa",
          width: "100%",
        }}
      >
        <Breadcrumb />

        <div className="p-6">
          {/* Title */}
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-8">
            Tổng quan đầu vào
          </h1>

          {/* Overview Items Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {overviewItems.map((item) => (
              <div
                key={item.id}
                onClick={() => navigate(item.path)}
                className="input-overview-card cursor-pointer"
                style={{
                  background: "white",
                  borderRadius: "12px",
                  padding: "24px",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                  transition:
                    "transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow =
                    "0 8px 16px rgba(0, 0, 0, 0.15)";
                  e.currentTarget.style.backgroundColor = "#f8f9fa";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 2px 8px rgba(0, 0, 0, 0.1)";
                  e.currentTarget.style.backgroundColor = "white";
                }}
              >
                {/* Icon */}
                <div
                  className={`${item.color} rounded-full w-16 h-16 flex items-center justify-center mb-4 transition-all`}
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "32px", color: "white" }}
                  >
                    {item.icon}
                  </span>
                </div>

                {/* Content */}
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  {item.title}
                </h2>
                <p className="text-gray-600 mb-4">{item.description}</p>

                {/* Arrow indicator */}
                <div className="flex items-center text-indigo-600 font-semibold">
                  <span>Xem chi tiết</span>
                  <span
                    className="material-symbols-outlined"
                    style={{ marginLeft: "8px" }}
                  >
                    arrow_forward
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default InputOverviewPage;
