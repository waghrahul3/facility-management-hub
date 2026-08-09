import { useEffect, useState } from "react";
import { api, downloadReport } from "../lib/api";
import { useI18n } from "../i18n";
import { fmtDate } from "../lib/format";
import { Button, LoadingScreen, StatusBadge } from "./ui";

// ---------------------------------------------------------------------------
// Printable supplier invoice — one supplier, one week.
// The settlement is split into TWO separate invoices:
//   1. Worker invoice — toli earnings (work amount + day charge)
//   2. Drop invoice  — supplier drop rent charges
// Each view prints on its own and its PDF / Excel download is scoped to that
// section via the `section` report filter.
// Rendered inside a .invoice-print wrapper so @media print (in index.css)
// prints only this document.
// ---------------------------------------------------------------------------

interface InvoiceToliLine {
  leader: string;
  bags: number;
  workAmount: number;
  dayCharge: number;
  earnings: number;
  status: string;
}

interface InvoiceWorkDetail {
  workDate: string;
  leader: string;
  bagSize: string;
  category: string | null;
  bags: number;
  rate: number;
  amount: number;
  status: string;
}

interface InvoiceDrop {
  id: string;
  dropDate: string;
  workers: number;
  rent: number;
  status: string;
}

interface InvoiceData {
  title: string;
  subtitle: string;
  generatedAt: string;
  period: { from: string | null; to: string | null };
  totals: Record<string, number>;
  meta: {
    invoiceNo: string;
    supplier: {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      address: string | null;
      city: string | null;
    };
    facility: { id: string; name: string; location: string | null; city: string | null };
    weekStart: string;
    weekEnd: string;
    toliLines: InvoiceToliLine[];
    workDetails: InvoiceWorkDetail[];
    drops: InvoiceDrop[];
    payment: {
      status: string;
      method: string | null;
      collectedAt: string | null;
      net: number;
    } | null;
  };
}

type InvoiceView = "workers" | "drops";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function SupplierInvoiceModal({
  open,
  onClose,
  supplierId,
  facilityId,
  weekStart,
}: {
  open: boolean;
  onClose: () => void;
  supplierId: string;
  facilityId?: string | null;
  weekStart: string;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<InvoiceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pdf" | "excel" | null>(null);
  const [view, setView] = useState<InvoiceView>("workers");

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError(null);
    setView("workers");
    const params = new URLSearchParams();
    params.set("supplierId", supplierId);
    if (facilityId) params.set("facilityId", facilityId);
    params.set("from", weekStart);
    api<InvoiceData>(`/reports/supplier-invoice?${params.toString()}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [open, supplierId, facilityId, weekStart]);

  if (!open) return null;

  async function download(format: "pdf" | "excel") {
    setBusy(format);
    try {
      const filters: Record<string, string> = { supplierId, from: weekStart, section: view };
      if (facilityId) filters.facilityId = facilityId;
      await downloadReport("supplier-invoice", format, filters);
    } catch (err: any) {
      setError(err?.message || t("Download failed"));
    } finally {
      setBusy(null);
    }
  }

  const m = data?.meta;
  const earningsTotal = m ? m.toliLines.reduce((s, l) => s + l.earnings, 0) : 0;
  const rentTotal = m ? m.drops.reduce((s, d) => s + d.rent, 0) : 0;
  const workersTotal = m ? m.drops.reduce((s, d) => s + d.workers, 0) : 0;

  const viewTabs: { key: InvoiceView; label: string; icon: string }[] = [
    { key: "workers", label: t("Worker invoice"), icon: "👷" },
    { key: "drops", label: t("Drop invoice"), icon: "🚚" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6">
      <div
        className="absolute inset-0 bg-field-950/60 backdrop-blur-sm animate-fade-in print:hidden"
        onClick={onClose}
      />
      <div className="invoice-print relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Toolbar — hidden when printing */}
        <div className="flex items-center justify-between gap-3 border-b border-field-200 bg-field-50 px-5 py-3 print:hidden">
          <div className="flex items-center gap-1.5">
            {viewTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
                  view === tab.key
                    ? "bg-onion-700 text-white shadow-sm"
                    : "text-field-600 hover:bg-white hover:text-field-900"
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
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
          {!data && !error && <LoadingScreen label={t("Preparing invoice…")} />}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {data && m && (
            <div className="text-field-900">
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-onion-700 pb-5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-onion-700 text-lg text-white">
                      🧅
                    </span>
                    <div>
                      <p className="font-display text-lg font-bold leading-tight">{m.facility.name}</p>
                      <p className="text-xs text-field-500">
                        {[m.facility.location, m.facility.city].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-field-400">
                    {t("Supplier invoice")} · {m.invoiceNo}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl font-bold text-onion-800">
                    {view === "workers" ? t("Worker invoice") : t("Drop invoice")}
                  </p>
                  <p className="mt-1 text-xs text-field-500">
                    {t("Week")}: {fmtDate(m.weekStart)} – {fmtDate(m.weekEnd)}
                  </p>
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
                    {t("Payment status")}
                  </p>
                  <div className="mt-1.5">
                    {m.payment ? (
                      <StatusBadge status={m.payment.status} />
                    ) : (
                      <span className="rounded-full bg-field-100 px-2.5 py-1 text-xs font-medium text-field-500">
                        {t("Not processed")}
                      </span>
                    )}
                  </div>
                  {m.payment?.method && (
                    <p className="mt-1.5 text-xs text-field-500">
                      {m.payment.method.replace("_", " ")}
                      {m.payment.collectedAt ? ` · ${fmtDate(m.payment.collectedAt)}` : ""}
                    </p>
                  )}
                </div>
              </div>

              {/* ---------------- Worker invoice ---------------- */}
              {view === "workers" && (
                <>
                  {m.toliLines.length > 0 && (
                    <div className="mt-6 overflow-hidden rounded-xl border border-field-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-onion-700 text-left text-[11px] uppercase tracking-wider text-white">
                            <th className="px-3 py-2.5 font-semibold">{t("Toli / Leader")}</th>
                            <th className="px-3 py-2.5 text-right font-semibold">{t("Bags")}</th>
                            <th className="px-3 py-2.5 text-right font-semibold">{t("Work amount")}</th>
                            <th className="px-3 py-2.5 text-right font-semibold">{t("Day charge")}</th>
                            <th className="px-3 py-2.5 text-right font-semibold">{t("Earnings")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-field-100">
                          {m.toliLines.map((line, i) => (
                            <tr key={i} className="bg-white">
                              <td className="px-3 py-2.5 font-medium">{line.leader}</td>
                              <td className="px-3 py-2.5 text-right">{line.bags}</td>
                              <td className="px-3 py-2.5 text-right">{inr(line.workAmount)}</td>
                              <td className="px-3 py-2.5 text-right">{inr(line.dayCharge)}</td>
                              <td className="px-3 py-2.5 text-right font-semibold text-onion-800">
                                {inr(line.earnings)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {(m.workDetails ?? []).length > 0 && (
                    <div className="mt-5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-field-400">
                        {t("Date-wise work details")} ({m.workDetails.length})
                      </p>
                      <div className="mt-1.5 overflow-hidden rounded-xl border border-field-200">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-field-100 text-left text-[11px] uppercase tracking-wider text-field-600">
                              <th className="px-3 py-2 font-semibold">{t("Date")}</th>
                              <th className="px-3 py-2 font-semibold">{t("Toli / Leader")}</th>
                              <th className="px-3 py-2 font-semibold">{t("Bag size")}</th>
                              <th className="px-3 py-2 font-semibold">{t("Category")}</th>
                              <th className="px-3 py-2 text-right font-semibold">{t("Bags")}</th>
                              <th className="px-3 py-2 text-right font-semibold">{t("Rate")}</th>
                              <th className="px-3 py-2 text-right font-semibold">{t("Amount")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-field-100">
                            {m.workDetails.map((w, i) => (
                              <tr key={i} className="bg-white">
                                <td className="px-3 py-2">{fmtDate(w.workDate)}</td>
                                <td className="px-3 py-2 font-medium">{w.leader}</td>
                                <td className="px-3 py-2">{w.bagSize}</td>
                                <td className="px-3 py-2">{w.category || <span className="text-field-300">—</span>}</td>
                                <td className="px-3 py-2 text-right">{w.bags}</td>
                                <td className="px-3 py-2 text-right">{inr(w.rate)}</td>
                                <td className="px-3 py-2 text-right font-medium">{inr(w.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="mt-6 flex justify-end">
                    <div className="w-full max-w-xs space-y-1.5 text-sm">
                      <div className="flex justify-between px-3">
                        <span className="text-field-500">{t("Worker earnings")}</span>
                        <span className="font-medium">{inr(earningsTotal)}</span>
                      </div>
                      <div className="flex justify-between rounded-lg bg-onion-700 px-3 py-2.5 text-white">
                        <span className="font-semibold">{t("Total to pay")}</span>
                        <span className="font-display font-bold">{inr(earningsTotal)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ---------------- Drop invoice ---------------- */}
              {view === "drops" && (
                <>
                  {m.drops.length > 0 && (
                    <div className="mt-6 overflow-hidden rounded-xl border border-field-200">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-amber-700 text-left text-[11px] uppercase tracking-wider text-white">
                            <th className="px-3 py-2.5 font-semibold">{t("Date")}</th>
                            <th className="px-3 py-2.5 text-right font-semibold">{t("Workers")}</th>
                            <th className="px-3 py-2.5 text-right font-semibold">{t("Rent per drop")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-field-100">
                          {m.drops.map((d) => (
                            <tr key={d.id} className="bg-white">
                              <td className="px-3 py-2.5">{fmtDate(d.dropDate)}</td>
                              <td className="px-3 py-2.5 text-right">{d.workers}</td>
                              <td className="px-3 py-2.5 text-right font-medium">{inr(d.rent)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="mt-6 flex justify-end">
                    <div className="w-full max-w-xs space-y-1.5 text-sm">
                      <div className="flex justify-between px-3">
                        <span className="text-field-500">{t("Workers")}</span>
                        <span className="font-medium">{workersTotal}</span>
                      </div>
                      <div className="flex justify-between px-3">
                        <span className="text-field-500">{t("Drop rent")}</span>
                        <span className="font-medium text-amber-700">{inr(rentTotal)}</span>
                      </div>
                      <div className="flex justify-between rounded-lg bg-amber-800 px-3 py-2.5 text-white">
                        <span className="font-semibold">{t("Total to pay")}</span>
                        <span className="font-display font-bold">{inr(rentTotal)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Footer */}
              <div className="mt-8 border-t border-dashed border-field-200 pt-3 text-center text-[10px] text-field-400">
                {t("Generated by Onion Facility Center · {facility} · {invoiceNo}", {
                  facility: m.facility.name,
                  invoiceNo: m.invoiceNo,
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
