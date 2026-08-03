import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./lib/auth";
import { AppShell } from "./components/layout";
import LoginPage from "./pages/LoginPage";
import type { AuthUser } from "./lib/api";

// Super Admin pages
import SuperAdminDashboard from "./pages/superadmin/Dashboard";
import CompaniesPage from "./pages/superadmin/Companies";
import CompanyAdminsPage from "./pages/superadmin/CompanyAdmins";
import FacilitiesPage from "./pages/superadmin/Facilities";
import FacilityAdminsPage from "./pages/superadmin/FacilityAdmins";
import BagSizesPage from "./pages/superadmin/BagSizes";
import RatesPage from "./pages/superadmin/Rates";
import PaymentsHistoryPage from "./pages/superadmin/PaymentsHistory";
import SuppliersPage from "./pages/superadmin/Suppliers";
import AuditLogPage from "./pages/superadmin/AuditLog";

// Company Admin pages
import CompanyDashboard from "./pages/company/Dashboard";
import CompanyFacilitiesPage from "./pages/company/Facilities";

// Facility Admin pages
import FacilityDashboard from "./pages/facility/Dashboard";
import DropsPage from "./pages/facility/Drops";
import TolisPage from "./pages/facility/Tolis";
import WorkEntriesPage from "./pages/facility/WorkEntries";
import FacilityRatesPage from "./pages/facility/Rates";
import ApprovalsPage from "./pages/facility/Approvals";
import PaymentsPage from "./pages/facility/Payments";

// Supplier pages
import SupplierDashboard from "./pages/supplier/Dashboard";
import SupplierDropsPage from "./pages/supplier/Drops";
import SupplierWorkEntriesPage from "./pages/supplier/WorkEntries";
import SupplierPaymentsPage from "./pages/supplier/Payments";
import SupplierPaymentHistoryPage from "./pages/supplier/PaymentHistory";

// Toli Leader pages
import ToliLeaderDashboard from "./pages/tolileader/Dashboard";
import MyToliPage from "./pages/tolileader/MyToli";
import TodayWorkPage from "./pages/tolileader/TodayWork";
import EarningsPage from "./pages/tolileader/Earnings";
import LeaderPaymentHistoryPage from "./pages/tolileader/PaymentHistory";

function RequireRole({ user, roles, children }: { user: AuthUser; roles: AuthUser["role"][]; children: ReactNode }) {
  if (!roles.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace />;
  }
  return <>{children}</>;
}

function Protected() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AppShell>
      <Routes>
        {/* Super Admin */}
        <Route path="/dashboard" element={<RequireRole user={user} roles={["SUPER_ADMIN"]}><SuperAdminDashboard /></RequireRole>} />
        <Route path="/companies" element={<RequireRole user={user} roles={["SUPER_ADMIN"]}><CompaniesPage /></RequireRole>} />
        <Route path="/facilities" element={<RequireRole user={user} roles={["SUPER_ADMIN"]}><FacilitiesPage /></RequireRole>} />
        <Route path="/facility-admins" element={<RequireRole user={user} roles={["SUPER_ADMIN"]}><FacilityAdminsPage /></RequireRole>} />
        <Route path="/company-admins" element={<RequireRole user={user} roles={["SUPER_ADMIN"]}><CompanyAdminsPage /></RequireRole>} />
        <Route path="/bag-sizes" element={<RequireRole user={user} roles={["SUPER_ADMIN"]}><BagSizesPage /></RequireRole>} />
        <Route path="/rates" element={<RequireRole user={user} roles={["SUPER_ADMIN"]}><RatesPage /></RequireRole>} />
        <Route path="/suppliers" element={<RequireRole user={user} roles={["SUPER_ADMIN"]}><SuppliersPage /></RequireRole>} />
        <Route path="/payments-history" element={<RequireRole user={user} roles={["SUPER_ADMIN"]}><PaymentsHistoryPage /></RequireRole>} />
        <Route path="/audit" element={<RequireRole user={user} roles={["SUPER_ADMIN"]}><AuditLogPage /></RequireRole>} />

        {/* Company Admin */}
        <Route path="/company/dashboard" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyDashboard /></RequireRole>} />
        <Route path="/company/facilities" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilitiesPage /></RequireRole>} />

        {/* Facility Admin */}
        <Route path="/facility/dashboard" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityDashboard /></RequireRole>} />
        <Route path="/facility/drops" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><DropsPage /></RequireRole>} />
        <Route path="/facility/tolis" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><TolisPage /></RequireRole>} />
        <Route path="/facility/work-entries" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><WorkEntriesPage /></RequireRole>} />
        <Route path="/facility/rates" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityRatesPage /></RequireRole>} />
        <Route path="/facility/approvals" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><ApprovalsPage /></RequireRole>} />
        <Route path="/facility/payments" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><PaymentsPage /></RequireRole>} />

        {/* Supplier */}
        <Route path="/supplier/dashboard" element={<RequireRole user={user} roles={["SUPPLIER"]}><SupplierDashboard /></RequireRole>} />
        <Route path="/supplier/drops" element={<RequireRole user={user} roles={["SUPPLIER"]}><SupplierDropsPage /></RequireRole>} />
        <Route path="/supplier/work-entries" element={<RequireRole user={user} roles={["SUPPLIER"]}><SupplierWorkEntriesPage /></RequireRole>} />
        <Route path="/supplier/payments" element={<RequireRole user={user} roles={["SUPPLIER"]}><SupplierPaymentsPage /></RequireRole>} />
        <Route path="/supplier/payment-history" element={<RequireRole user={user} roles={["SUPPLIER"]}><SupplierPaymentHistoryPage /></RequireRole>} />

        {/* Toli Leader */}
        <Route path="/leader/dashboard" element={<RequireRole user={user} roles={["TOLI_LEADER"]}><ToliLeaderDashboard /></RequireRole>} />
        <Route path="/leader/my-toli" element={<RequireRole user={user} roles={["TOLI_LEADER"]}><MyToliPage /></RequireRole>} />
        <Route path="/leader/today-work" element={<RequireRole user={user} roles={["TOLI_LEADER"]}><TodayWorkPage /></RequireRole>} />
        <Route path="/leader/earnings" element={<RequireRole user={user} roles={["TOLI_LEADER"]}><EarningsPage /></RequireRole>} />
        <Route path="/leader/payments-history" element={<RequireRole user={user} roles={["TOLI_LEADER"]}><LeaderPaymentHistoryPage /></RequireRole>} />

        <Route path="*" element={<Navigate to={homeFor(user.role)} replace />} />
      </Routes>
    </AppShell>
  );
}

function homeFor(role: AuthUser["role"]): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/dashboard";
    case "COMPANY_ADMIN":
      return "/company/dashboard";
    case "FACILITY_ADMIN":
      return "/facility/dashboard";
    case "SUPPLIER":
      return "/supplier/dashboard";
    case "TOLI_LEADER":
      return "/leader/dashboard";
  }
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<Protected />} />
    </Routes>
  );
}
