import { NavLink } from "react-router-dom";

const sections = [
  { key: "dashboard", label: "Dashboard" },
  { key: "drops", label: "Drops" },
  { key: "tolis", label: "Tolis" },
  { key: "work-entries", label: "Work" },
  { key: "rates", label: "Rates" },
  { key: "approvals", label: "Approvals" },
  { key: "payments", label: "Payments" },
];

/** Sub-navigation across a facility's sections (used in company workspace). */
export default function FacilityTabs({ base }: { base: string }) {
  return (
    <nav className="no-scrollbar -mx-1 mb-6 flex gap-1 overflow-x-auto rounded-xl border border-field-200 bg-white p-1">
      {sections.map((s) => (
        <NavLink
          key={s.key}
          to={`${base}/${s.key}`}
          className={({ isActive }) =>
            `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
              isActive
                ? "bg-onion-700 text-white shadow-sm"
                : "text-field-600 hover:bg-field-100 hover:text-field-900"
            }`
          }
        >
          {s.label}
        </NavLink>
      ))}
    </nav>
  );
}
