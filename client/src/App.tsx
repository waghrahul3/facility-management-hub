import { Navigate, Route, Routes, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./lib/auth";
import { AppShell } from "./components/layout";
import { FacilityScopeProvider } from "./lib/facilityScope";
import FacilityTabs from "./components/FacilityTabs";
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
import GitHubPage from "./pages/superadmin/GitHub";
import SubscriptionsPage from "./pages/superadmin/Subscriptions";
import ReportsPage from "./pages/Reports";

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

/** Facility-admin routes operate on the admin's own facility. */
function FacilityAdminScope({ user, children }: { user: AuthUser; children: ReactNode }) {
  return <FacilityScopeProvider facilityId={user.facilityId}>{children}</FacilityScopeProvider>;
}

/** Company-admin routes operate on a facility selected by URL, with workspace tabs. */
function CompanyFacilityWorkspace({ children }: { children: ReactNode }) {
  const { facilityId } = useParams<{ facilityId: string }>();
  const base = `/company/facility/${facilityId}`;
  return (
    <FacilityScopeProvider facilityId={facilityId ?? null} base={base}>
      {facilityId && <FacilityTabs base={base} />}
      {children}
    </FacilityScopeProvider>
  );
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
        <Route path="/github" element={<RequireRole user={user} roles={["SUPER_ADMIN"]}><GitHubPage /></RequireRole>} />
        <Route path="/subscriptions" element={<RequireRole user={user} roles={["SUPER_ADMIN"]}><SubscriptionsPage /></RequireRole>} />
        <Route path="/reports" element={<RequireRole user={user} roles={["SUPER_ADMIN", "COMPANY_ADMIN", "FACILITY_ADMIN", "SUPPLIER", "TOLI_LEADER"]}><ReportsPage /></RequireRole>} />

        {/* Company Admin */}
        <Route path="/company/dashboard" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyDashboard /></RequireRole>} />
        <Route path="/company/facilities" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilitiesPage /></RequireRole>} />

        {/* Company Admin — full facility-admin capabilities per facility */}
        <Route path="/company/facility/:facilityId/dashboard" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><FacilityDashboard /></CompanyFacilityWorkspace></RequireRole>} />
        <Route path="/company/facility/:facilityId/drops" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><DropsPage /></CompanyFacilityWorkspace></RequireRole>} />
        <Route path="/company/facility/:facilityId/tolis" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><TolisPage /></CompanyFacilityWorkspace></RequireRole>} />
        <Route path="/company/facility/:facilityId/work-entries" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><WorkEntriesPage /></CompanyFacilityWorkspace></RequireRole>} />
        <Route path="/company/facility/:facilityId/rates" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><FacilityRatesPage /></CompanyFacilityWorkspace></RequireRole>} />
        <Route path="/company/facility/:facilityId/approvals" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><ApprovalsPage /></CompanyFacilityWorkspace></RequireRole>} />
        <Route path="/company/facility/:facilityId/payments" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><PaymentsPage /></CompanyFacilityWorkspace></RequireRole>} />

        {/* Facility Admin */}
        <Route path="/facility/dashboard" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><FacilityDashboard /></FacilityAdminScope></RequireRole>} />
        <Route path="/facility/drops" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><DropsPage /></FacilityAdminScope></RequireRole>} />
        <Route path="/facility/tolis" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><TolisPage /></FacilityAdminScope></RequireRole>} />
        <Route path="/facility/work-entries" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><WorkEntriesPage /></FacilityAdminScope></RequireRole>} />
        <Route path="/facility/rates" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><FacilityRatesPage /></FacilityAdminScope></RequireRole>} />
        <Route path="/facility/approvals" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><ApprovalsPage /></FacilityAdminScope></RequireRole>} />
        <Route path="/facility/payments" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><PaymentsPage /></FacilityAdminScope></RequireRole>} />

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
