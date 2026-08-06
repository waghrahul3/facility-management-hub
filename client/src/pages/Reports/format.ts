import { inr } from "../../lib/format";
import type { ReportColumn } from "./types";

// ---------------------------------------------------------------------------
// Reports — cell formatting helpers
// ---------------------------------------------------------------------------

export const toneClasses: Record<string, string> = {
  green: "bg-green-50 border-green-200 text-green-800",
  amber: "bg-amber-50 border-amber-200 text-amber-800",
  red: "bg-red-50 border-red-200 text-red-800",
  blue: "bg-blue-50 border-blue-200 text-blue-800",
  violet: "bg-violet-50 border-violet-200 text-violet-800",
  slate: "bg-slate-50 border-slate-200 text-slate-700",
};

export function formatCell(value: unknown, col: ReportColumn): string {
  if (value === null || value === undefined) return "—";
  switch (col.type) {
    case "money": {
      const n = Number(value);
      return isNaN(n) ? "—" : inr(n);
    }
    case "number":
      return typeof value === "number" ? value.toLocaleString("en-IN") : String(value);
    case "date": {
      const d = new Date(String(value));
      return d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
    case "datetime": {
      const d = new Date(String(value));
      return d.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    case "status":
      return String(value);
    default:
      return String(value);
  }
}

export function formatTotal(value: unknown, col: ReportColumn): string {
  if (value === undefined) return "";
  if (col.type === "money") return inr(Number(value));
  if (col.type === "number") return Number(value).toLocaleString("en-IN");
  return String(value);
}

export function getStatusColor(status: string): string {
  const s = status?.toUpperCase() || "";
  if (s === "APPROVED" || s === "COLLECTED" || s === "COMPLETED")
    return "bg-green-100 text-green-800 border border-green-200";
  if (s === "PENDING" || s === "REGISTERED")
    return "bg-amber-100 text-amber-800 border border-amber-200";
  if (s === "REJECTED") return "bg-red-100 text-red-800 border border-red-200";
  return "bg-slate-100 text-slate-700 border border-slate-200";
}
