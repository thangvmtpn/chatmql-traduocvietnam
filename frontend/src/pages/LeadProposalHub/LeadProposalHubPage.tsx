import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/Sidebar/Sidebar";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import useAuthStore from "@/stores/useAuthStore";
import "material-symbols";

const leadItems = [
  {
    id: "proposal-leads",
    title: "Đề xuất tạo Lead",
    description: "Xem và quản lý các đề xuất tạo khách hàng tiềm năng mới",
    icon: "assignment_ind",
    colorFrom: "#4f46e5",
    colorTo: "#7c3aed",
    path: "/proposal-leads",
  },
  {
    id: "withdraw-leads",
    title: "Đề xuất thu hồi Lead",
    description: "Xem và xử lý các yêu cầu thu hồi khách hàng tiềm năng",
    icon: "person_remove",
    colorFrom: "#dc2626",
    colorTo: "#ea580c",
    path: "/withdraw-leads",
  },
];

function LeadProposalHubPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  if (!user) return <div>Loading...</div>;

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

        <div style={{ padding: "24px" }}>
          {/* Title */}
          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              marginBottom: "8px",
            }}
          >
            Đề xuất Lead
          </h1>
          <p style={{ color: "#6b7280", marginBottom: "32px", fontSize: "15px" }}>
            Quản lý các đề xuất tạo mới và thu hồi khách hàng tiềm năng
          </p>

          {/* Cards Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "24px",
            }}
          >
            {leadItems.map((item) => (
              <div
                key={item.id}
                onClick={() => navigate(item.path)}
                style={{
                  background: "white",
                  borderRadius: "16px",
                  padding: "28px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  cursor: "pointer",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  borderTop: `4px solid ${item.colorFrom}`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow =
                    "0 12px 24px rgba(0,0,0,0.12)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow =
                    "0 2px 8px rgba(0,0,0,0.08)";
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    width: "56px",
                    height: "56px",
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${item.colorFrom}, ${item.colorTo})`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "16px",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "28px", color: "white" }}
                  >
                    {item.icon}
                  </span>
                </div>

                {/* Content */}
                <h2
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#111827",
                    marginBottom: "8px",
                  }}
                >
                  {item.title}
                </h2>
                <p style={{ color: "#6b7280", marginBottom: "20px", fontSize: "14px" }}>
                  {item.description}
                </p>

                {/* Arrow */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    color: item.colorFrom,
                    fontWeight: 600,
                    fontSize: "14px",
                  }}
                >
                  <span>Xem chi tiết</span>
                  <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
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

export default LeadProposalHubPage;
