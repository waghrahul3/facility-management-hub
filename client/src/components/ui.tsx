import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../i18n";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-br from-onion-600 to-onion-800 text-white shadow-sm shadow-onion-900/20 hover:from-onion-700 hover:to-onion-900 hover:shadow-md hover:shadow-onion-900/25 ring-1 ring-inset ring-white/10",
  success:
    "bg-gradient-to-br from-husk-400 to-husk-500 text-onion-950 shadow-sm shadow-husk-500/30 hover:from-husk-300 hover:to-husk-400 hover:shadow-md hover:shadow-husk-500/40",
  secondary:
    "bg-white text-field-700 border border-field-300 shadow-sm shadow-field-900/5 hover:bg-field-50 hover:border-field-400 hover:text-field-900 hover:shadow-md hover:shadow-field-900/5",
  ghost: "text-field-600 hover:bg-field-100 hover:text-field-900",
  danger:
    "bg-gradient-to-br from-red-600 to-red-700 text-white shadow-sm shadow-red-900/20 hover:from-red-700 hover:to-red-800 hover:shadow-md hover:shadow-red-900/25",
};

const buttonSizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:hover:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Card & section headers                                              */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className = "",
  title,
  subtitle,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`card-surface overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-field-100 bg-field-50/40 px-5 py-4">
          <div>
            {title && <h3 className="font-display text-sm font-semibold text-field-900">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-field-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="animate-fade-up mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight text-field-900 sm:text-[1.7rem]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-field-500">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */

type BadgeTone = "green" | "amber" | "red" | "slate" | "blue" | "violet";

const badgeTones: Record<BadgeTone, string> = {
  green: "bg-onion-50 text-onion-800 border-onion-200 ring-onion-100",
  amber: "bg-husk-50 text-husk-700 border-husk-200 ring-husk-100",
  red: "bg-red-50 text-red-700 border-red-200 ring-red-100",
  slate: "bg-field-100 text-field-600 border-field-200 ring-field-100",
  blue: "bg-blue-50 text-blue-700 border-blue-200 ring-blue-100",
  violet: "bg-violet-50 text-violet-700 border-violet-200 ring-violet-100",
};

export function Badge({
  tone = "slate",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide shadow-sm shadow-field-900/5 ring-1 ring-inset ${badgeTones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Map domain statuses to badge tones. */
export function statusTone(status: string): BadgeTone {
  const s = status.toLowerCase();
  if (s.includes("approved") || s.includes("paid") || s.includes("complete") || s.includes("active") || s.includes("distributed") || s.includes("collected")) {
    return "green";
  }
  if (s.includes("pending") || s.includes("draft") || s.includes("registered")) {
    return "amber";
  }
  if (s.includes("reject") || s.includes("inactive")) {
    return "red";
  }
  return "slate";
}

export function StatusBadge({ status }: { status: string }) {
  const live = /pending|draft|registered/i.test(status);
  return (
    <Badge tone={statusTone(status)}>
      {live && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-soft" />}
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                       */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-field-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-field-400">{hint}</span>}
    </label>
  );
}

const inputBase =
  "w-full rounded-xl border border-field-300 bg-white px-3.5 py-2.5 text-sm text-field-900 shadow-sm shadow-field-900/5 placeholder:text-field-400 transition-all duration-150 hover:border-field-400 focus:border-onion-600 focus:outline-none focus:ring-4 focus:ring-onion-600/15";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputBase} ${className}`} {...rest} />;
}

export function Textarea({
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputBase} ${className}`} {...rest} />;
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${inputBase} ${className}`} {...rest}>
      {children}
    </select>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Compact search box + status filter bar for paginated lists. Both controls
 * are fully controlled; changing either should reset the list to page 1.
 */
export function ListFilters({
  search,
  onSearch,
  status,
  onStatus,
  statusOptions,
  searchPlaceholder,
  allLabel,
  className = "",
}: {
  search: string;
  onSearch: (value: string) => void;
  status: string;
  onStatus: (value: string) => void;
  statusOptions: SelectOption[];
  searchPlaceholder?: string;
  /** Label for the “all” option — defaults to “All statuses”. */
  allLabel?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const searchText = searchPlaceholder ?? t("Search…");
  const allText = allLabel ?? t("All statuses");
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div className="relative min-w-[220px] flex-1">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-field-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
        </svg>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchText}
          aria-label={searchText}
          className={`${inputBase} pl-9`}
        />
      </div>
      <Select
        value={status}
        onChange={(e) => onStatus(e.target.value)}
        className="w-auto cursor-pointer"
        aria-label={t("Filter by status")}
      >
        <option value="">{allText}</option>
        {statusOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {(search || status) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            onSearch("");
            onStatus("");
          }}
        >
          {t("Clear")}
        </Button>
      )}
    </div>
  );
}

/**
 * Dropdown with a built-in search box — use everywhere option lists can grow
 * (suppliers, facilities, tolis, bag sizes, …).
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  empty,
  allowClear = false,
  required = false,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  empty?: string;
  allowClear?: boolean;
  required?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const placeText = placeholder ?? t("Select…");
  const searchText = searchPlaceholder ?? t("Search…");
  const emptyText = empty ?? t("No matches");

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Reset the query and focus the search box each time the list opens
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* Hidden input keeps native required-validation working in forms */}
      <input type="hidden" value={value} required={required} />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputBase} flex items-center justify-between gap-2 text-left ${
          value ? "text-field-900" : "text-field-400"
        }`}
      >
        <span className="truncate">{selected?.label ?? placeText}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-field-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {allowClear && value && (
        <button
          type="button"
          aria-label="Clear selection"
          onClick={() => {
            onChange("");
            setOpen(false);
          }}
          className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-0.5 text-field-400 hover:bg-field-100 hover:text-field-700"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {open && (
        <div className="animate-pop-in absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-field-200 bg-white shadow-[var(--shadow-pop)]">
          <div className="border-b border-field-100 p-2">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchText}
              className="w-full rounded-lg border border-field-200 bg-field-50/50 px-2.5 py-2 text-sm text-field-900 placeholder:text-field-400 focus:border-onion-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-onion-600/20"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-center text-xs text-field-400">{emptyText}</li>
            )}
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-100 ${
                    o.value === value
                      ? "bg-onion-50 font-semibold text-onion-800"
                      : "text-field-700 hover:bg-field-50 hover:text-field-900"
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value && (
                    <svg className="h-4 w-4 shrink-0 text-onion-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  const uid = useId();

  // Close on Escape while the modal is open
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-field-950/55 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={uid}
        className={`animate-pop-in safe-bottom relative z-10 max-h-[92dvh] w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-md"} overflow-y-auto rounded-t-3xl bg-white p-6 shadow-[var(--shadow-pop)] ring-1 ring-black/5 sm:rounded-2xl`}
      >
        {/* Drag handle (mobile bottom-sheet affordance) */}
        <div className="pointer-events-none absolute left-1/2 top-2.5 h-1 w-10 -translate-x-1/2 rounded-full bg-field-200 sm:hidden" />
        <div className="mb-4 mt-1 flex items-center justify-between sm:mt-0">
          <h3 id={uid} className="font-display text-lg font-bold text-field-900">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-field-400 transition-colors duration-150 hover:bg-field-100 hover:text-field-700"
            aria-label={t("Close")}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat card                                                           */
/* ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  icon,
  tone = "green",
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "green" | "amber" | "red" | "slate" | "blue" | "violet";
}) {
  const tones = {
    green: "bg-onion-50 text-onion-700",
    amber: "bg-husk-50 text-husk-600",
    red: "bg-red-50 text-red-700",
    slate: "bg-field-100 text-field-600",
    blue: "bg-blue-50 text-blue-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <div className="card-surface group flex items-center gap-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]">
      {icon && (
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-black/5 transition-transform duration-200 group-hover:scale-110 ${tones[tone]}`}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-field-400">{label}</p>
        <p className="mt-0.5 truncate font-display text-xl font-bold text-field-900">{value}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Table                                                               */
/* ------------------------------------------------------------------ */

export function Table({
  head,
  children,
  empty,
}: {
  head: ReactNode[];
  children: ReactNode;
  empty?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm sm:min-w-0">
        <thead>
          <tr className="border-b border-field-200 bg-field-50/70">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-field-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-field-100">{children}</tbody>
      </table>
      {empty && (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          {empty}
        </div>
      )}
    </div>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle text-field-700 ${className}`}>{children}</td>;
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  totalPages: number;
  total?: number;
  pageSize?: number;
  onChange: (page: number) => void;
}) {
  const { t } = useI18n();
  if (totalPages <= 1) return null;

  const from = total !== undefined && pageSize ? (page - 1) * pageSize + 1 : null;
  const to = total !== undefined && pageSize ? Math.min(page * pageSize, total) : null;

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) pages.push(i);

  const btn =
    "inline-flex h-8 min-w-8 touch-target items-center justify-center rounded-xl px-2.5 text-sm font-medium transition-all duration-150";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-field-100 px-4 py-3">
      {from !== null && to !== null && total !== undefined ? (
        <p className="text-xs text-field-400">
          {t("Showing {from}–{to} of {total}", { from, to, total })}
        </p>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label={t("Previous")}
          className={`${btn} text-field-600 hover:bg-field-100 disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {t("Previous")}
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            className={`${btn} ${
              p === page
                ? "bg-gradient-to-br from-onion-600 to-onion-800 font-semibold text-white shadow-sm shadow-onion-900/25"
                : "text-field-600 hover:bg-field-100"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          aria-label={t("Next")}
          className={`${btn} text-field-600 hover:bg-field-100 disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {t("Next")}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export function LoadingScreen({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-field-400">
      <Spinner className="h-8 w-8 text-onion-600" />
      <p className="text-sm font-medium">{label ?? t("Loading…")}</p>
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-10 text-center">
      {icon && (
        <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-field-300 bg-field-50/70 text-2xl">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-field-600">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-relaxed text-field-400">{hint}</p>}
    </div>
  );
}

export function Money({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  return (
    <span className={`font-semibold tabular-nums ${className}`}>
      {new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value ?? 0)}
    </span>
  );
}
