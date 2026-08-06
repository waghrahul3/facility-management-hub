import { Link, NavLink, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../lib/auth";
import type { AuthUser } from "../lib/api";
import { useI18n } from "../i18n";
import { LanguagePicker } from "./LanguagePicker";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const icons: Record<string, ReactNode> = {
  dashboard: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  companies: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  ),
  facilities: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008z" />
    </svg>
  ),
  drops: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  ),
  work: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  rates: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
  ),
  payments: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  history: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  team: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  bags: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
    </svg>
  ),
  suppliers: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  ),
  audit: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  subscriptions: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
    </svg>
  ),
  github: (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49v-1.7c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.36 1.12 2.94.85.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.36 9.36 0 015 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.31.68.93.68 1.88v2.79c0 .27.18.6.69.49A10.26 10.26 0 0022 12.25C22 6.58 17.52 2 12 2z" />
    </svg>
  ),
  reports: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  loading: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  ),
  sales: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
    </svg>
  ),
};

function navItemsFor(user: AuthUser, t: (s: string) => string): NavItem[] {
  switch (user.role) {
    case "SUPER_ADMIN":
      return [
        { to: "/dashboard", label: t("Dashboard"), icon: icons.dashboard },
        { to: "/companies", label: t("Companies"), icon: icons.companies },
        { to: "/facilities", label: t("Facilities"), icon: icons.facilities },
        { to: "/facility-admins", label: t("Admins"), icon: icons.team },
        { to: "/company-admins", label: t("Company Admins"), icon: icons.team },
        { to: "/suppliers", label: t("Suppliers"), icon: icons.suppliers },
        { to: "/bag-sizes", label: t("Bag Sizes"), icon: icons.bags },
        { to: "/rates", label: t("Rates"), icon: icons.rates },
        { to: "/payments-history", label: t("Payments"), icon: icons.payments },
        { to: "/reports", label: t("Reports"), icon: icons.reports },
        { to: "/audit", label: t("Audit Log"), icon: icons.audit },
        { to: "/github", label: t("GitHub"), icon: icons.github },
        { to: "/subscriptions", label: t("Subscriptions"), icon: icons.subscriptions },
      ];
    case "COMPANY_ADMIN":
      return [
        { to: "/company/dashboard", label: t("Dashboard"), icon: icons.dashboard },
        { to: "/company/facilities", label: t("Facilities"), icon: icons.facilities },
        { to: "/company/buyers", label: t("Buyers"), icon: icons.team },
        { to: "/company/orders", label: t("Sales Orders"), icon: icons.sales },
        { to: "/reports", label: t("Reports"), icon: icons.reports },
      ];
    case "FACILITY_ADMIN":
      return [
        { to: "/facility/dashboard", label: t("Dashboard"), icon: icons.dashboard },
        { to: "/facility/loading", label: t("Loading"), icon: icons.loading },
        { to: "/facility/sales", label: t("Sales Orders"), icon: icons.sales },
        { to: "/facility/drops", label: t("Drops"), icon: icons.drops },
        { to: "/facility/tolis", label: t("Tolis"), icon: icons.team },
        { to: "/facility/work-entries", label: t("Work"), icon: icons.work },
        { to: "/facility/rates", label: t("Rates"), icon: icons.rates },
        { to: "/facility/approvals", label: t("Approvals"), icon: icons.work },
        { to: "/facility/payments", label: t("Payments"), icon: icons.payments },
        { to: "/reports", label: t("Reports"), icon: icons.reports },
      ];
    case "SUPPLIER":
      return [
        { to: "/supplier/dashboard", label: t("Dashboard"), icon: icons.dashboard },
        { to: "/supplier/drops", label: t("My Drops"), icon: icons.drops },
        { to: "/supplier/work-entries", label: t("Work Entries"), icon: icons.work },
        { to: "/supplier/payments", label: t("Payments"), icon: icons.payments },
        { to: "/supplier/payment-history", label: t("History"), icon: icons.history },
        { to: "/reports", label: t("Reports"), icon: icons.reports },
      ];
    case "TOLI_LEADER":
      return [
        { to: "/leader/dashboard", label: t("Dashboard"), icon: icons.dashboard },
        { to: "/leader/my-toli", label: t("My Toli"), icon: icons.team },
        { to: "/leader/today-work", label: t("Today's Work"), icon: icons.work },
        { to: "/leader/earnings", label: t("Earnings"), icon: icons.rates },
        { to: "/leader/payments-history", label: t("Payments"), icon: icons.payments },
        { to: "/reports", label: t("Reports"), icon: icons.reports },
      ];
    default:
      return [];
  }
}

const roleLabels: Record<AuthUser["role"], string> = {
  SUPER_ADMIN: "Super Admin",
  COMPANY_ADMIN: "Company Admin",
  FACILITY_ADMIN: "Facility Admin",
  TOLI_LEADER: "Toli Leader",
  SUPPLIER: "Supplier",
};

function Brand() {
  const { t } = useI18n();
  return (
    <Link to="/dashboard" className="group flex items-center gap-2.5">
      <span className="brand-gradient flex h-9 w-9 items-center justify-center rounded-xl text-lg shadow-sm shadow-onion-900/20 ring-1 ring-white/20 transition-transform duration-200 group-hover:scale-105">
        🧅
      </span>
      <span className="leading-tight">
        <span className="block font-display text-sm font-bold text-field-900">{t("Onion Facility")}</span>
        <span className="block text-[10px] font-medium uppercase tracking-widest text-field-400">
          {t("Center")}
        </span>
      </span>
    </Link>
  );
}

function UserChip({ user, onLogout }: { user: AuthUser; onLogout: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-field-200 bg-white px-3 py-2 transition-colors duration-150 hover:border-field-300">
      <span className="brand-gradient flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ring-1 ring-white/20">
        {user.name
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")}
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-xs font-semibold text-field-800">{user.name}</p>
        <p className="text-[10px] font-medium uppercase tracking-wide text-field-400">
          {t(roleLabels[user.role])}
        </p>
      </div>
      <button
        onClick={onLogout}
        title={t("Log out")}
        className="ml-1 rounded-lg p-1.5 text-field-400 hover:bg-red-50 hover:text-red-600"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
        </svg>
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  if (!user) return null;
  const items = navItemsFor(user, t);

  return (
    <div className="min-h-screen">
      {/* Brand hairline across the very top */}
      <div className="brand-gradient fixed inset-x-0 top-0 z-40 h-0.5" />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-field-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-field-100 px-5">
          <Brand />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-widest text-field-400">
            {user.companyName
              ? `${t(roleLabels[user.role])} · ${user.companyName}`
              : user.facilityName
                ? `${t(roleLabels[user.role])} · ${user.facilityName}`
                : t(roleLabels[user.role])}
          </p>
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? "bg-onion-50 text-onion-800 shadow-sm ring-1 ring-onion-100"
                    : "text-field-600 hover:bg-field-50 hover:text-field-900"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? "text-onion-700" : ""}>{item.icon}</span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-field-100 p-3">
          <div className="mb-2 flex items-center justify-between rounded-xl bg-field-50 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-field-400">
              {t("Language")}
            </span>
            <LanguagePicker />
          </div>
          <UserChip user={user} onLogout={logout} />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-field-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center gap-1.5">
          <LanguagePicker />
          <button
            onClick={logout}
            className="rounded-lg p-2 text-field-400 hover:bg-red-50 hover:text-red-600"
            title={t("Log out")}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="pb-24 lg:ml-64 lg:pb-8">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>

      {/* Mobile bottom nav — shows every menu item, scrolls horizontally if needed */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-field-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="no-scrollbar flex items-stretch overflow-x-auto">
          {items.map((item) => {
            const isActive =
              item.to === "/dashboard"
                ? location.pathname === "/dashboard"
                : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex min-w-16 max-w-24 flex-1 flex-col items-center gap-0.5 px-2 py-2 text-[10px] font-medium transition-colors duration-150 ${
                  isActive ? "text-onion-700" : "text-field-400 hover:text-field-600"
                }`}
              >
                <span className="relative">
                  {item.icon}
                  {isActive && (
                    <span className="absolute -top-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-onion-600" />
                  )}
                </span>
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
