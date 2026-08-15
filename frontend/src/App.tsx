import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import useAuthStore from "@/stores/useAuthStore";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import CustomerList from "@/pages/CustomerList";
import CustomerAssignment from "@/pages/CustomerAssignment/CustomerAssignment";
import CustomerDetailPage from "@/pages/CustomerDetailPage/CustomerDetailPage";
import OrderDetail from "@/pages/OrderDetail/OrderDetail";
import OrderEdit from "@/pages/OrderEdit/OrderEdit";
import RegionCustomers from "@/pages/RegionCustomers/RegionCustomers";
import CSKHSchedule from "@/pages/CSKHSchedule/CSKHSchedule";
import ProposalLeadManagement from "@/pages/ProposalLeadManagement/ProposalLeadManagement";
import WithdrawLeadManagement from "@/pages/WithdrawLeadManagement/WithdrawLeadManagement";
import DailyTarget from "@/pages/DailyTarget";
import MenuItem1 from "@/pages/EmployeeClassification/MenuItem1/MenuItem1";
import InvoiceSearch from "@/pages/InvoiceSearch/InvoiceSearch";
import InvoiceList from "@/pages/InvoiceList/InvoiceList";
import "react-toastify/dist/ReactToastify.css";
import AIAssistantPage from "@/pages/AIAssistantPage/AIAssistantPage";
import BaoCaoDoanhSo from "@/pages/BaoCaoDoanhSo";
import InputOverviewPage from "@/pages/InputOverviewPage";
import SalesScheduleOverviewPage from "@/pages/SalesScheduleOverview/SalesScheduleOverviewPage";
import ThuatNguPage from "@/pages/ThuatNgu/ThuatNguPage";
import LeadProposalHubPage from "@/pages/LeadProposalHub/LeadProposalHubPage";
import AccountHubPage from "@/pages/AccountManagement/AccountHubPage";
import AccountListPage from "@/pages/AccountManagement/AccountListPage";
import CreateAccountPage from "@/pages/AccountManagement/CreateAccountPage";
import ManagerActivities from "@/pages/ManagerActivities/ManagerActivities";

// Gamification
import IndividualPage from "@/pages/Gamification/Individual/IndividualPage";
import DealShockPage from "@/pages/Gamification/Individual/DealShockPage";
import DealShockDetailPage from "@/pages/Gamification/Individual/DealShockDetailPage";
import TopRacePage from "@/pages/Gamification/Individual/TopRacePage";
import GamificationDetailPage from "@/pages/Gamification/Individual/GamificationDetailPage";
// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);
  return isAuthenticated && user ? <>{children}</> : <Navigate to="/login" replace />;
};

function App() {
  const user = useAuthStore((state) => state.user);

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai-assistant"
            element={
              <ProtectedRoute>
                <AIAssistantPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedRoute>
                <CustomerList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers/assignment"
            element={
              <ProtectedRoute>
                <CustomerAssignment />
              </ProtectedRoute>
            }
          />
          <Route
            path="/order-detail/:code_invoice"
            element={
              <ProtectedRoute>
                <OrderDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/order-edit/:code_invoice"
            element={
              <ProtectedRoute>
                <OrderEdit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/region-customers"
            element={
              <ProtectedRoute>
                <RegionCustomers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cskh-schedule"
            element={
              <ProtectedRoute>
                <CSKHSchedule />
              </ProtectedRoute>
            }
          />
          <Route
            path="/proposal-leads"
            element={
              <ProtectedRoute>
                <ProposalLeadManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/withdraw-leads"
            element={
              <ProtectedRoute>
                <WithdrawLeadManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/daily-target"
            element={
              <ProtectedRoute>
                <DailyTarget user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customer/:customerId"
            element={
              <ProtectedRoute>
                <CustomerDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/classification/menu-item-1"
            element={
              <ProtectedRoute>
                <MenuItem1 />
              </ProtectedRoute>
            }
          />
          <Route
            path="/invoice-search"
            element={
              <ProtectedRoute>
                <InvoiceSearch />
              </ProtectedRoute>
            }
          />
          <Route
            path="/invoices"
            element={
              <ProtectedRoute>
                <InvoiceList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales-report"
            element={
              <ProtectedRoute>
                <BaoCaoDoanhSo user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/input-overview"
            element={
              <ProtectedRoute>
                <InputOverviewPage user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales-schedule-overview"
            element={
              <ProtectedRoute>
                <SalesScheduleOverviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/thuat-ngu"
            element={
              <ProtectedRoute>
                <ThuatNguPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/lead-proposals"
            element={
              <ProtectedRoute>
                <LeadProposalHubPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts"
            element={
              <ProtectedRoute>
                <AccountHubPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts/list"
            element={
              <ProtectedRoute>
                <AccountListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts/create"
            element={
              <ProtectedRoute>
                <CreateAccountPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/manager/activities"
            element={
              <ProtectedRoute>
                <ManagerActivities />
              </ProtectedRoute>
            }
          />
          {/* Gamification Routes */}
          <Route
            path="/gamification/individual"
            element={
              <ProtectedRoute>
                <IndividualPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gamification/individual/deal-shock"
            element={
              <ProtectedRoute>
                <DealShockPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gamification/individual/deal-shock/create"
            element={
              <ProtectedRoute>
                <DealShockDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gamification/individual/deal-shock/edit/:id"
            element={
              <ProtectedRoute>
                <DealShockDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gamification/individual/top-race"
            element={
              <ProtectedRoute>
                <TopRacePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gamification/individual/top-race/create"
            element={
              <ProtectedRoute>
                <GamificationDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gamification/individual/top-race/edit/:id"
            element={
              <ProtectedRoute>
                <GamificationDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gamification/detail/:id"
            element={
              <ProtectedRoute>
                <GamificationDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gamification/deal-shock-detail/:id"
            element={
              <ProtectedRoute>
                <DealShockDetailPage />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </Router>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </QueryClientProvider>
  );
}

export default App;
