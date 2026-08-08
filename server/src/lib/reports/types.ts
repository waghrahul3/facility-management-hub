// ---------------------------------------------------------------------------
// Generic report shape. Every ledger/report builder returns this structure so
// the UI table, the Excel exporter and the PDF exporter all consume one shape.
// ---------------------------------------------------------------------------

export type ReportColumnType =
  | "text"
  | "money"
  | "number"
  | "date"
  | "datetime"
  | "status"
  | "bool";

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
}

export type ReportRow = Record<string, unknown>;

export type CardTone = "green" | "amber" | "red" | "slate" | "blue" | "violet";

export interface ReportCard {
  label: string;
  value: string;
  tone?: CardTone;
}

export interface Report {
  type: string;
  title: string;
  subtitle: string;
  generatedAt: string;
  period: { from: string | null; to: string | null };
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: Record<string, number>;
  cards: ReportCard[];
  /** Optional extra structured data (e.g. trends) — ignored by exporters. */
  meta?: Record<string, unknown>;
}

export interface ReportFilters {
  from: string | null;
  to: string | null;
  facilityId: string | null;
  supplierId: string | null;
}

/** Resolved data-visibility scope for the authenticated role. */
export interface ReportScope {
  role: string;
  companyId: string | null;
  /** null = all facilities (Super Admin / Supplier scoped by supplier instead) */
  facilityIds: string[] | null;
  supplierId: string | null;
  toliId: string | null;
}

// ---------------------------------------------------------------------------
// Small formatting helpers used by builders (kept local to this module).
// ---------------------------------------------------------------------------

export function money(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n ?? 0);
}

export function d(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d2 = new Date(value);
  return d2.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function endOfDay(value: Date | string): Date {
  const d2 = new Date(value);
  d2.setHours(23, 59, 59, 999);
  return d2;
}
