import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./lib/auth";
import { AppShell } from "./components/layout";
import { FacilityScopeProvider } from "./lib/facilityScope";
import FacilityTabs from "./components/FacilityTabs";
import type { AuthUser } from "./lib/api";
import { useI18n } from "./i18n";

// ---------------------------------------------------------------------------
// Lazy-loaded routes — each page ships as its own chunk and loads on demand.
// ---------------------------------------------------------------------------

// Super Admin pages
const SuperAdminDashboard = lazy(() => import("./pages/superadmin/Dashboard"));
const CompaniesPage = lazy(() => import("./pages/superadmin/Companies"));
const CompanyAdminsPage = lazy(() => import("./pages/superadmin/CompanyAdmins"));
const FacilitiesPage = lazy(() => import("./pages/superadmin/Facilities"));
const FacilityAdminsPage = lazy(() => import("./pages/superadmin/FacilityAdmins"));
const BagSizesPage = lazy(() => import("./pages/superadmin/BagSizes"));
const RatesPage = lazy(() => import("./pages/superadmin/Rates"));
const PaymentsHistoryPage = lazy(() => import("./pages/superadmin/PaymentsHistory"));
const SuppliersPage = lazy(() => import("./pages/superadmin/Suppliers"));
const AuditLogPage = lazy(() => import("./pages/superadmin/AuditLog"));
const GitHubPage = lazy(() => import("./pages/superadmin/GitHub"));
const SubscriptionsPage = lazy(() => import("./pages/superadmin/Subscriptions"));
const ReportsPage = lazy(() => import("./pages/Reports"));
const LoadingGuidePage = lazy(() => import("./pages/LoadingGuide"));

// Company Admin pages
const CompanyDashboard = lazy(() => import("./pages/company/Dashboard"));
const CompanyFacilitiesPage = lazy(() => import("./pages/company/Facilities"));
const BuyersPage = lazy(() => import("./pages/company/Buyers"));
const OrdersPage = lazy(() => import("./pages/company/Orders"));

// Facility Admin pages
const FacilityDashboard = lazy(() => import("./pages/facility/Dashboard"));
const DropsPage = lazy(() => import("./pages/facility/Drops"));
const TolisPage = lazy(() => import("./pages/facility/Tolis"));
const WorkEntriesPage = lazy(() => import("./pages/facility/WorkEntries"));
const FacilityRatesPage = lazy(() => import("./pages/facility/Rates"));
const ApprovalsPage = lazy(() => import("./pages/facility/Approvals"));
const PaymentsPage = lazy(() => import("./pages/facility/Payments"));
const FacilitySalesPage = lazy(() => import("./pages/facility/Sales"));

// Supplier pages
const SupplierDashboard = lazy(() => import("./pages/supplier/Dashboard"));
const SupplierDropsPage = lazy(() => import("./pages/supplier/Drops"));
const SupplierWorkEntriesPage = lazy(() => import("./pages/supplier/WorkEntries"));
const SupplierPaymentsPage = lazy(() => import("./pages/supplier/Payments"));
const SupplierPaymentHistoryPage = lazy(() => import("./pages/supplier/PaymentHistory"));

// Toli Leader pages
const ToliLeaderDashboard = lazy(() => import("./pages/tolileader/Dashboard"));
const MyToliPage = lazy(() => import("./pages/tolileader/MyToli"));
const TodayWorkPage = lazy(() => import("./pages/tolileader/TodayWork"));
const EarningsPage = lazy(() => import("./pages/tolileader/Earnings"));
const LeaderPaymentHistoryPage = lazy(() => import("./pages/tolileader/PaymentHistory"));

// Auth
const LoginPage = lazy(() => import("./pages/LoginPage"));

function RouteFallback() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center py-24 text-field-400">
      <div className="flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-field-200 border-t-onion-600" />
        <span className="text-sm font-medium">{t("Loading…")}</span>
      </div>
    </div>
  );
}

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
        <Route path="/company/buyers" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><BuyersPage /></RequireRole>} />
        <Route path="/company/orders" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><OrdersPage /></RequireRole>} />

        {/* Company Admin — full facility-admin capabilities per facility */}
        <Route path="/company/facility/:facilityId/dashboard" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><FacilityDashboard /></CompanyFacilityWorkspace></RequireRole>} />
        <Route path="/company/facility/:facilityId/loading" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><LoadingGuidePage /></CompanyFacilityWorkspace></RequireRole>} />
        <Route path="/company/facility/:facilityId/drops" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><DropsPage /></CompanyFacilityWorkspace></RequireRole>} />
        <Route path="/company/facility/:facilityId/tolis" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><TolisPage /></CompanyFacilityWorkspace></RequireRole>} />
        <Route path="/company/facility/:facilityId/work-entries" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><WorkEntriesPage /></CompanyFacilityWorkspace></RequireRole>} />
        <Route path="/company/facility/:facilityId/rates" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><FacilityRatesPage /></CompanyFacilityWorkspace></RequireRole>} />
        <Route path="/company/facility/:facilityId/approvals" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><ApprovalsPage /></CompanyFacilityWorkspace></RequireRole>} />
        <Route path="/company/facility/:facilityId/payments" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><PaymentsPage /></CompanyFacilityWorkspace></RequireRole>} />
        <Route path="/company/facility/:facilityId/sales" element={<RequireRole user={user} roles={["COMPANY_ADMIN"]}><CompanyFacilityWorkspace><FacilitySalesPage /></CompanyFacilityWorkspace></RequireRole>} />

        {/* Facility Admin */}
        <Route path="/facility/dashboard" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><FacilityDashboard /></FacilityAdminScope></RequireRole>} />
        <Route path="/facility/loading" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><LoadingGuidePage /></FacilityAdminScope></RequireRole>} />
        <Route path="/facility/drops" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><DropsPage /></FacilityAdminScope></RequireRole>} />
        <Route path="/facility/tolis" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><TolisPage /></FacilityAdminScope></RequireRole>} />
        <Route path="/facility/work-entries" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><WorkEntriesPage /></FacilityAdminScope></RequireRole>} />
        <Route path="/facility/rates" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><FacilityRatesPage /></FacilityAdminScope></RequireRole>} />
        <Route path="/facility/approvals" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><ApprovalsPage /></FacilityAdminScope></RequireRole>} />
        <Route path="/facility/payments" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><PaymentsPage /></FacilityAdminScope></RequireRole>} />
        <Route path="/facility/sales" element={<RequireRole user={user} roles={["FACILITY_ADMIN"]}><FacilityAdminScope user={user}><FacilitySalesPage /></FacilityAdminScope></RequireRole>} />

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
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<Protected />} />
      </Routes>
    </Suspense>
  );
}
