import { useEffect, useState } from "react";
import { api, downloadReport } from "../lib/api";
import { useI18n } from "../i18n";
import { fmtDate } from "../lib/format";
import { Button, LoadingScreen } from "./ui";

// ---------------------------------------------------------------------------
// Printable supplier advance statement — running balance of advance cash
// given to a supplier and what has been recovered from weekly payments.
// Rendered inside a .invoice-print wrapper so @media print (in index.css)
// prints only this document. Also offers PDF / Excel download of the same
// report (the server scopes the data to the caller's role).
// ---------------------------------------------------------------------------

interface StatementAdvance {
  id: string;
  date: string;
  facilityName: string;
  method: string;
  notes: string | null;
  amount: number;
}

interface StatementRecovery {
  id: string;
  weekStart: string;
  weekEnd: string;
  balanceBefore: number;
  deducted: number;
  facilityName: string;
}

interface StatementData {
  title: string;
  subtitle: string;
  generatedAt: string;
  period: { from: string | null; to: string | null };
  totals: Record<string, number>;
  meta: {
    statementNo: string;
    supplier: {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      address: string | null;
      city: string | null;
    };
    facility: { id: string; name: string; location: string | null; city: string | null } | null;
    period: { from: string | null; to: string | null };
    advances: StatementAdvance[];
    recoveries: StatementRecovery[];
    totals: { given: number; recovered: number; outstanding: number };
  };
}

const inr = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function SupplierAdvanceStatementModal({
  open,
  onClose,
  supplierId,
  facilityId,
}: {
  open: boolean;
  onClose: () => void;
  supplierId: string;
  facilityId?: string | null;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<StatementData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pdf" | "excel" | null>(null);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError(null);
    const params = new URLSearchParams();
    params.set("supplierId", supplierId);
    if (facilityId) params.set("facilityId", facilityId);
    api<StatementData>(`/reports/supplier-advance-statement?${params.toString()}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [open, supplierId, facilityId]);

  if (!open) return null;

  async function download(format: "pdf" | "excel") {
    setBusy(format);
    try {
      const filters: Record<string, string> = { supplierId };
      if (facilityId) filters.facilityId = facilityId;
      await downloadReport("supplier-advance-statement", format, filters);
    } catch (err: any) {
      setError(err?.message || t("Download failed"));
    } finally {
      setBusy(null);
    }
  }

  const m = data?.meta;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6">
      <div
        className="absolute inset-0 bg-field-950/60 backdrop-blur-sm animate-fade-in print:hidden"
        onClick={onClose}
      />
      <div className="invoice-print relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Toolbar — hidden when printing */}
        <div className="flex items-center justify-between border-b border-field-200 bg-field-50 px-5 py-3 print:hidden">
          <p className="text-sm font-semibold text-field-700">
            📄 {t("Supplier advance statement")}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" loading={busy === "excel"} onClick={() => download("excel")}>
              {t("Excel")}
            </Button>
            <Button size="sm" variant="secondary" loading={busy === "pdf"} onClick={() => download("pdf")}>
              {t("PDF")}
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              {t("Print")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              {t("Close")}
            </Button>
          </div>
        </div>

        {/* Document */}
        <div className="overflow-y-auto px-6 py-6 sm:px-10">
          {!data && !error && <LoadingScreen label={t("Preparing statement…")} />}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {data && m && (
            <div className="text-field-900">
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-amber-600 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-lg text-white">
                      🧅
                    </span>
                    <div>
                      <p className="font-display text-lg font-bold leading-tight">
                        {m.facility ? m.facility.name : t("Onion Facility Center")}
                      </p>
                      <p className="text-xs text-field-500">
                        {m.facility
                          ? [m.facility.location, m.facility.city].filter(Boolean).join(" · ")
                          : t("All facilities")}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-field-400">
                    {t("Advance statement")} · {m.statementNo}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-bold text-amber-800">
                    {t("ADVANCE STATEMENT")}
                  </p>
                  {m.period.from && (
                    <p className="mt-1 text-xs text-field-500">
                      {t("Period")}: {fmtDate(m.period.from)} – {fmtDate(m.period.to ?? m.period.from)}
                    </p>
                  )}
                  <p className="text-xs text-field-400">
                    {t("Generated")} {fmtDate(data.generatedAt)}
                  </p>
                </div>
              </div>

              {/* Bill to */}
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-field-400">
                    {t("Supplier")}
                  </p>
                  <p className="mt-1 font-semibold">{m.supplier.name}</p>
                  {m.supplier.address && <p className="text-xs text-field-500">{m.supplier.address}</p>}
                  {m.supplier.city && <p className="text-xs text-field-500">{m.supplier.city}</p>}
                  {m.supplier.phone && <p className="text-xs text-field-500">📞 {m.supplier.phone}</p>}
                </div>
                <div className="sm:text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-field-400">
                    {t("Current balance")}
                  </p>
                  <p
                    className={`mt-1.5 font-display text-2xl font-bold ${
                      m.totals.outstanding > 0 ? "text-red-600" : "text-onion-700"
                    }`}
                  >
                    {inr(m.totals.outstanding)}
                  </p>
                  <p className="mt-0.5 text-xs text-field-400">
                    {m.totals.outstanding > 0
                      ? t("Outstanding to repay")
                      : t("Fully recovered — no balance due")}
                  </p>
                </div>
              </div>

              {/* Advances given */}
              <div className="mt-6 overflow-hidden rounded-xl border border-field-200">
                <p className="bg-amber-50 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-amber-800">
                  {t("Advances given")} ({m.advances.length})
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-field-100 text-left text-[11px] uppercase tracking-wider text-field-600">
                      <th className="px-3 py-2 font-semibold">{t("Date")}</th>
                      <th className="px-3 py-2 font-semibold">{t("Facility")}</th>
                      <th className="px-3 py-2 font-semibold">{t("Method")}</th>
                      <th className="px-3 py-2 font-semibold">{t("Notes")}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t("Amount")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-field-100">
                    {m.advances.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-xs text-field-400">
                          {t("No advances recorded in this period")}
                        </td>
                      </tr>
                    )}
                    {m.advances.map((a) => (
                      <tr key={a.id} className="bg-white">
                        <td className="px-3 py-2.5">{fmtDate(a.date)}</td>
                        <td className="px-3 py-2.5 font-medium">{a.facilityName}</td>
                        <td className="px-3 py-2.5">
                          {a.method === "BANK_TRANSFER" ? t("Bank transfer") : t("Cash")}
                        </td>
                        <td className="max-w-40 truncate px-3 py-2.5 text-xs text-field-500">
                          {a.notes ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-amber-700">
                          {inr(a.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {m.advances.length > 0 && (
                    <tfoot>
                      <tr className="bg-amber-50/60">
                        <td colSpan={4} className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wide text-amber-800">
                          {t("Total given")}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-amber-900">{inr(m.totals.given)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Recoveries */}
              <div className="mt-5 overflow-hidden rounded-xl border border-field-200">
                <p className="bg-onion-50 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-onion-800">
                  {t("Recovered from weekly payments")} ({m.recoveries.length})
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-field-100 text-left text-[11px] uppercase tracking-wider text-field-600">
                      <th className="px-3 py-2 font-semibold">{t("Week")}</th>
                      <th className="px-3 py-2 font-semibold">{t("Facility")}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t("Balance before")}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t("Deducted")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-field-100">
                    {m.recoveries.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-xs text-field-400">
                          {t("No recoveries yet — the full advance is still outstanding")}
                        </td>
                      </tr>
                    )}
                    {m.recoveries.map((r) => (
                      <tr key={r.id} className="bg-white">
                        <td className="px-3 py-2.5">
                          {fmtDate(r.weekStart)} – {fmtDate(r.weekEnd)}
                        </td>
                        <td className="px-3 py-2.5 font-medium">{r.facilityName}</td>
                        <td className="px-3 py-2.5 text-right text-field-500">{inr(r.balanceBefore)}</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-onion-700">
                          − {inr(r.deducted)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {m.recoveries.length > 0 && (
                    <tfoot>
                      <tr className="bg-onion-50/60">
                        <td colSpan={3} className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wide text-onion-800">
                          {t("Total recovered")}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-onion-900">− {inr(m.totals.recovered)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Totals */}
              <div className="mt-6 flex justify-end">
                <div className="w-full max-w-xs space-y-1.5 text-sm">
                  <div className="flex justify-between px-3">
                    <span className="text-field-500">{t("Total advances given")}</span>
                    <span className="font-medium">{inr(m.totals.given)}</span>
                  </div>
                  <div className="flex justify-between px-3">
                    <span className="text-field-500">{t("Recovered from payments")}</span>
                    <span className="font-medium text-onion-700">− {inr(m.totals.recovered)}</span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-amber-600 px-3 py-2.5 text-white">
                    <span className="font-semibold">{t("Outstanding balance")}</span>
                    <span className="font-display font-bold">{inr(m.totals.outstanding)}</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-8 border-t border-dashed border-field-200 pt-3 text-center text-[10px] text-field-400">
                {t("Generated by Onion Facility Center · {statementNo}", {
                  statementNo: m.statementNo,
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
