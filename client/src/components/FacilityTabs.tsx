import { NavLink } from "react-router-dom";
import { useI18n } from "../i18n";

const sectionKeys = [
  "dashboard",
  "loading",
  "sales",
  "drops",
  "tolis",
  "work-entries",
  "rates",
  "approvals",
  "payments",
] as const;

const sectionLabels: Record<(typeof sectionKeys)[number], string> = {
  dashboard: "Dashboard",
  loading: "Loading",
  sales: "Sales Orders",
  drops: "Drops",
  tolis: "Tolis",
  "work-entries": "Work",
  rates: "Rates",
  approvals: "Approvals",
  payments: "Payments",
};

/** Sub-navigation across a facility's sections (used in company workspace). */
export default function FacilityTabs({ base }: { base: string }) {
  const { t } = useI18n();
  return (
    <nav className="no-scrollbar -mx-1 mb-6 flex gap-1 overflow-x-auto rounded-xl border border-field-200 bg-white p-1 shadow-sm shadow-field-900/5">
      {sectionKeys.map((key) => (
        <NavLink
          key={key}
          to={`${base}/${key}`}
          className={({ isActive }) =>
            `touch-target flex items-center whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-semibold transition-all duration-150 ${
              isActive
                ? "bg-gradient-to-br from-onion-600 to-onion-800 text-white shadow-sm shadow-onion-900/25"
                : "text-field-600 hover:bg-field-100 hover:text-field-900"
            }`
          }
        >
          {t(sectionLabels[key])}
        </NavLink>
      ))}
    </nav>
  );
}
