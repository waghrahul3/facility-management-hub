import { useState } from "react";
import { downloadReport } from "../lib/api";
import { Spinner } from "./ui";
import { useI18n } from "../i18n";

/**
 * Compact PDF + Excel export buttons for listing pages. Downloads the same
 * role-scoped report the Reports page generates via GET /api/reports/:type
 * (the server applies the caller's visibility scope automatically).
 */
export default function ExportButtons({
  reportType,
  filters,
}: {
  reportType: string;
  filters?: Record<string, string>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<"pdf" | "excel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(format: "pdf" | "excel") {
    setBusy(format);
    setError(null);
    try {
      await downloadReport(reportType, format, filters);
    } catch (err: any) {
      setError(err?.message || t("Export failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => run("pdf")}
        disabled={busy !== null}
        title={t("Download as PDF")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-all duration-150 hover:border-red-300 hover:bg-red-50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
      >
        {busy === "pdf" ? (
          <Spinner className="h-3.5 w-3.5" />
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        )}
        {t("PDF")}
      </button>
      <button
        type="button"
        onClick={() => run("excel")}
        disabled={busy !== null}
        title={t("Download as Excel")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-onion-200 bg-white px-3 py-1.5 text-xs font-semibold text-onion-700 transition-all duration-150 hover:border-onion-300 hover:bg-onion-50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
      >
        {busy === "excel" ? (
          <Spinner className="h-3.5 w-3.5" />
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        )}
        {t("Excel")}
      </button>
      {error && (
        <span className="max-w-[220px] text-xs font-medium text-red-600">{error}</span>
      )}
    </div>
  );
}
