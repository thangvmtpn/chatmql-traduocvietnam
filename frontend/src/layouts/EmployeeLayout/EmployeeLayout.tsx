import { useState } from "react";
import { User } from "@/stores/useAuthStore";
import Sidebar from "@/components/Sidebar/Sidebar";
import CustomerManagement from "@/pages/CustomerManagement/CustomerManagement";
import Breadcrumb from "@/components/Breadcrumb/Breadcrumb";
import "material-symbols";
import "./EmployeeLayout.css";
import Header from "@/components/Header/Header";
import SuggestionBox from "@/components/Floating/SuggestionBox";

interface EmployeeLayoutProps {
  user: User;
}

function EmployeeLayout({ user }: EmployeeLayoutProps) {
  const [searchCustomerId, setSearchCustomerId] = useState("");
  const [searchPhoneNumber, setSearchPhoneNumber] = useState("");

  const handleSearch = (customerId: string, phoneNumber: string) => {
    setSearchCustomerId(customerId);
    setSearchPhoneNumber(phoneNumber);
  };

  return (
    <div className="employee-layout">
      {/* Header */}
      <Header
        title="Bảng quản trị khách hàng - Cấp nhân sự"
        subtitle="Gia tăng vòng đời khách hàng"
        userName={user.name || "Nhân viên"}
      />

      <div className="employee-container">
        {/* Sidebar Component */}
        <Sidebar user={user} onSearch={handleSearch} />

        {/* Main Content */}
        <main className="main-content">
          <Breadcrumb />
          <CustomerManagement
            userId={user.id}
            searchCustomerId={searchCustomerId}
            searchPhoneNumber={searchPhoneNumber}
          />
        </main>
      </div>
      <SuggestionBox />
    </div>
  );
}

export default EmployeeLayout;
