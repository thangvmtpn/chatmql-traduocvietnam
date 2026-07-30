import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { User } from "@/stores/useAuthStore";
import Header from "@/components/Header/Header";
import Sidebar from "@/components/Sidebar/Sidebar";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import "./BaseLayout.css";

interface BaseLayoutProps {
  user: User;
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

function BaseLayout({
  user,
  children,
  title = "Quản lý khách hàng",
  subtitle = "Gia tăng vòng đời khách hàng",
}: BaseLayoutProps) {
  const location = useLocation();

  // Extract page name from pathname
  const getPageClass = () => {
    const pathname = location.pathname;
    // /region-customers -> region-customers
    // /customers -> customers
    const pageName = pathname.slice(1).split("/")[0];
    return pageName || "home";
  };

  const pageClass = getPageClass();

  return (
    <div className={`base-layout ${pageClass}`}>
      {/* Header */}
      <Header
        title={title}
        subtitle={subtitle}
        userName={user.name || "Nhân viên"}
      />

      <div className="base-layout-container">
        {/* Sidebar */}
        <Sidebar user={user} />

        {/* Main Content */}
        <div className="base-layout-content">
          <Breadcrumb />
          {children}
        </div>
      </div>
    </div>
  );
}

export default BaseLayout;
