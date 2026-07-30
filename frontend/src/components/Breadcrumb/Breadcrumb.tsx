import { Link, useLocation, useParams } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { useCustomerDetail } from "@/hooks/useDashboard";
import { useInvoiceDetail } from "@/hooks/useInvoices";
import "./Breadcrumb.css";

interface BreadcrumbItem {
  label: string;
  path?: string;
}

const routeLabels: Record<string, string> = {
  dashboard: "Bảng điều khiển",
  customers: "Khách hàng",
  assignment: "Phân công khách hàng",
  "region-customers": "Khách hàng theo miền",
  "cskh-schedule": "Lịch Bán Hàng",
  "proposal-leads": "Quản lý đề xuất lead",
  "daily-target": "Mục tiêu hàng ngày",
  "order-detail": "Chi tiết đơn hàng",
  customer: "Chi tiết khách hàng",
  "invoice-search": "Tìm kiếm hoá đơn",
  "withdraw-leads": "Quản lý thu hồi lead",
  invoice: "Đơn hàng",
  "sales-report": "Báo cáo doanh số",
  "input-overview": "Tổng quan đầu vào",
  "thuat-ngu": "Thuật ngữ",
  "order-edit": "Sửa đơn hàng",
  "invoices": "Danh sách đơn hàng",
};

export default function Breadcrumb() {
  const location = useLocation();
  const params = useParams();
  const pathnames = location.pathname.split("/").filter((x) => x);

  // Get customer detail if we're on customer detail page
  const customerId = params.customerId ? parseInt(params.customerId) : 0;
  const { data: customerDetail } = useCustomerDetail(customerId);

  // Get invoice detail if we're on order detail page
  const codeInvoice = params.code_invoice;
  const { data: invoiceDetail } = useInvoiceDetail(codeInvoice);

  // Generate breadcrumb items
  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Trang chủ", path: "/dashboard" },
  ];

  let currentPath = "";
  pathnames.forEach((pathname, index) => {
    currentPath += `/${pathname}`;

    // Handle dynamic parameters
    if (/^\d+$/.test(pathname)) {
      // It's an ID
      if (pathnames[index - 1] === "customer" && customerDetail) {
        breadcrumbItems.push({
          label: customerDetail.name_customer || `Khách hàng #${pathname}`,
        });
      } else {
        breadcrumbItems.push({ label: `#${pathname}` });
      }
      return;
    }

    // Handle order detail code
    if (pathnames[index - 1] === "order-detail" && invoiceDetail) {
      breadcrumbItems.push({
        label: `Đơn hàng ${pathname}`,
      });
      return;
    }

    // Skip if it's a long string (likely a dynamic parameter)
    if (pathname.length > 20) {
      return;
    }

    const label = routeLabels[pathname] || pathname;

    // Add item - last item should not have a path (current page)
    if (index === pathnames.length - 1) {
      breadcrumbItems.push({ label });
    } else {
      breadcrumbItems.push({ label, path: currentPath });
    }
  });

  // Don't show breadcrumb on login page
  if (location.pathname === "/login" || location.pathname === "/") {
    return null;
  }

  // If only home, don't show breadcrumb
  if (
    breadcrumbItems.length === 1 &&
    breadcrumbItems[0]?.path === "/dashboard"
  ) {
    return null;
  }

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol className="breadcrumb-list">
        {breadcrumbItems.map((item, index) => (
          <li key={index} className="breadcrumb-item">
            {item.path ? (
              <>
                <Link to={item.path} className="breadcrumb-link">
                  {index === 0 && (
                    <Home size={16} className="breadcrumb-home-icon" />
                  )}
                  <span>{item.label}</span>
                </Link>
                {index < breadcrumbItems.length - 1 && (
                  <ChevronRight size={16} className="breadcrumb-separator" />
                )}
              </>
            ) : (
              <span className="breadcrumb-current">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
