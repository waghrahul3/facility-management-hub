import { useCallback, useEffect, useState } from "react";
import { api, getMyAdvances, post } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../i18n";
import SupplierAdvanceStatementModal from "../../components/SupplierAdvanceStatementModal";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingScreen,
  Money,
  PageHeader,
  SearchableSelect,
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";
import { fmtDate } from "../../lib/format";
import ExportButtons from "../../components/ExportButtons";

interface ThisWeek {
  weekStart: string;
  weekEnd: string;
  summaries: Array<{
    summary: { id: string; total_earnings: number; approval_status: string };
    toli: { id: string; leader_name: string };
  }>;
  totalDrops: number;
  totalRent: number;
  totalWorkerEarnings: number;
  netPayment: number;
}

interface MyAdvances {
  advances: Array<{
    id: string;
    amount: number;
    advance_date: string;
    payment_method: string;
    notes: string | null;
    facility: { id: string; name: string };
  }>;
  totalGiven: number;
  totalOutstanding: number;
  byFacility: Array<{ facilityId: string; outstanding: number }>;
}

interface PaymentPending {
  payment: {
    id: string;
    net_payment: number;
    total_worker_earnings: number;
    total_drops: number;
    total_rent_charges: number;
    collection_status: string;
    payment_method: string | null;
  } | null;
  stored: {
    id: string;
    net_payment: number;
    collection_status: string;
    payment_method: string | null;
  } | null;
}

export default function SupplierPaymentsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [statementOpen, setStatementOpen] = useState(false);
  const [week, setWeek] = useState<ThisWeek | null>(null);
  const [pending, setPending] = useState<PaymentPending | null>(null);
  const [method, setMethod] = useState<"CASH" | "BANK_TRANSFER">("CASH");
  const [notes, setNotes] = useState("");
  const [distributions, setDistributions] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [advances, setAdvances] = useState<MyAdvances | null>(null);

  const load = useCallback(() => {
    api<ThisWeek>("/supplier/this-week").then(setWeek);
    api<PaymentPending>("/supplier/payment-pending").then((r) => {
      setPending(r);
      if (r.payment) {
        setDistributions({});
      }
    });
    getMyAdvances().then(setAdvances).catch(() => setAdvances(null));
  }, []);

  useEffect(load, [load]);

  if (!week || !pending) return <LoadingScreen label={t("Loading payment details…")} />;

  const payment = pending.payment ?? pending.stored;
  const collectionStatus = payment?.collection_status ?? "PENDING";
  const totalDistributed = Object.values(distributions).reduce((s, v) => s + (Number(v) || 0), 0);
  const remaining = (payment?.net_payment ?? 0) - totalDistributed;
  const approvedSummaries = week.summaries.filter((s) => s.summary.approval_status === "APPROVED");

  const collect = async () => {
    const pay = pending?.payment;
    if (!pay) return;
    setBusy(true);
    setNotice(null);
    try {
      await post("/supplier/collect-payment", {
        payment_id: pay.id,
        payment_method: method,
        notes: notes || null,
      });
      setNotice(t("Payment marked as collected from the facility. Now distribute to workers."));
      load();
    } finally {
      setBusy(false);
    }
  };

  const distribute = async () => {
    const pay = pending?.payment;
    if (!pay) return;
    if (totalDistributed > pay.net_payment) {
      setNotice(t("Distribution total exceeds the net payment!"));
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await post("/supplier/distribute-payment", {
        payment_id: pay.id,
        distributions: approvedSummaries.map((s) => ({
          toli_id: s.toli.id,
          amount: Number(distributions[s.toli.id] ?? s.summary.total_earnings),
          method,
          notes: notes || null,
        })),
      });
      setNotice(t("Distribution recorded. Payment marked DISTRIBUTED_TO_WORKERS."));
      load();
    } finally {
      setBusy(false);
    }
  };

  const canCollect = collectionStatus === "PENDING" && !!pending.payment;
  const canDistribute = collectionStatus === "COLLECTED_FROM_FACILITY" && !!pending.payment;

  return (
    <div>
      <PageHeader
        title={t("Collect & Distribute")}
        subtitle={t("Sunday flow: collect from the facility, then distribute to toli leaders")}
        action={<ExportButtons reportType="supplier-statements" />}
      />

      {notice && (
        <div className="mb-4 rounded-lg border border-onion-200 bg-onion-50 px-4 py-3 text-sm text-onion-800">
          {notice}
        </div>
      )}

      {/* Net payment breakdown */}
      <Card
        title={t("Net payment for this week")}
        subtitle={t("Week of {date}", { date: fmtDate(week.weekStart) })}
        className="mb-6"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-field-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-field-400">{t("Worker earnings")}</p>
            <p className="mt-1 font-display text-xl font-bold text-field-900">
              <Money value={week.totalWorkerEarnings} />
            </p>
          </div>
          <div className="rounded-xl bg-field-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-field-400">
              {t("Rent charges ({count} drops)", { count: week.totalDrops })}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-red-600">
              − <Money value={week.totalRent} />
            </p>
          </div>
          <div className="rounded-xl bg-onion-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-onion-600">{t("Net to collect")}</p>
            <p className="mt-1 font-display text-xl font-bold text-onion-800">
              <Money value={payment?.net_payment ?? week.netPayment} />
            </p>
          </div>
        </div>
        <div className="mt-3">
          <StatusBadge status={collectionStatus} />
        </div>
      </Card>

      {/* Advance balance + history */}
      <Card
        title={t("Supplier advances")}
        subtitle={t("Cash advanced by facilities, recovered from your weekly payments")}
        className="mb-6"
        action={
          user?.supplierId ? (
            <Button size="sm" variant="secondary" onClick={() => setStatementOpen(true)}>
              📄 {t("Advance statement")}
            </Button>
          ) : undefined
        }
      >
        {!advances ? (
          <EmptyState title={t("No advance records")} hint={t("Ask the facility admin to record any advance cash given to you")} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-amber-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-amber-600">{t("Total advance received")}</p>
                <p className="mt-1 font-display text-xl font-bold text-amber-900">
                  <Money value={advances.totalGiven} />
                </p>
              </div>
              <div className="rounded-xl bg-red-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-red-600">{t("Outstanding to repay")}</p>
                <p className="mt-1 font-display text-xl font-bold text-red-700">
                  <Money value={advances.totalOutstanding} />
                </p>
              </div>
              <div className="rounded-xl bg-onion-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-onion-600">{t("Recovered so far")}</p>
                <p className="mt-1 font-display text-xl font-bold text-onion-800">
                  <Money value={advances.totalGiven - advances.totalOutstanding} />
                </p>
              </div>
            </div>
            {advances.byFacility.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {advances.byFacility.map((b) => {
                  const name = advances.advances.find((a) => a.facility.id === b.facilityId)?.facility.name;
                  return (
                    <span key={b.facilityId} className="inline-flex items-center gap-1 rounded-full bg-field-50 px-3 py-1 text-xs font-medium text-field-600">
                      {name ?? b.facilityId.slice(0, 8)}: <Money value={b.outstanding} />
                    </span>
                  );
                })}
              </div>
            )}
            {advances.advances.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-xl border border-field-100">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-field-100 bg-field-50/60 text-xs uppercase tracking-wide text-field-400">
                        <th className="px-4 py-3 font-semibold">{t("Date")}</th>
                        <th className="px-4 py-3 font-semibold">{t("Facility")}</th>
                        <th className="px-4 py-3 font-semibold">{t("Amount")}</th>
                        <th className="px-4 py-3 font-semibold">{t("Method")}</th>
                        <th className="px-4 py-3 font-semibold">{t("Notes")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advances.advances.map((a) => (
                        <tr key={a.id} className="border-b border-field-50 last:border-0">
                          <Td>{fmtDate(a.advance_date)}</Td>
                          <Td className="font-medium text-field-800">{a.facility.name}</Td>
                          <Td><Money value={a.amount} /></Td>
                          <Td>{a.payment_method === "BANK_TRANSFER" ? t("Bank transfer") : t("Cash")}</Td>
                          <Td className="text-field-500">{a.notes ?? "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Step 1: Collect */}
      <Card title={t("Step 1 — Collect from facility")} subtitle={t("Receive the net payment in cash or by bank transfer")} className="mb-6">
        {canCollect ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("Payment method")}>
                <SearchableSelect
                  value={method}
                  onChange={(v) => setMethod(v as "CASH" | "BANK_TRANSFER")}
                  options={[
                    { value: "CASH", label: t("Cash") },
                    { value: "BANK_TRANSFER", label: t("Bank transfer") },
                  ]}
                  placeholder={t("Select method…")}
                  searchPlaceholder={t("Search payment methods…")}
                />
              </Field>
              <Field label={t("Notes (optional)")}>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("e.g. collected at facility office")} />
              </Field>
            </div>
            <Button variant="success" onClick={collect} loading={busy}>
              {t("Mark collected — ₹{amount}", { amount: payment?.net_payment?.toLocaleString("en-IN") ?? "0" })}
            </Button>
          </div>
        ) : collectionStatus === "COLLECTED_FROM_FACILITY" ? (
          <div className="rounded-lg bg-onion-50 px-4 py-3 text-sm text-onion-800">
            {t("✅ Collected{via}. Proceed to distribution below.", {
              via: payment?.payment_method ? ` via ${payment.payment_method.replace("_", " ")}` : "",
            })}
          </div>
        ) : (
          <EmptyState title={t("No payment ready yet")} hint={t("The facility admin must process Sunday payments first")} />
        )}
      </Card>

      {/* Step 2: Distribute */}
      <Card title={t("Step 2 — Distribute to workers")} subtitle={t("Record the amount given to each toli leader")}>
        {approvedSummaries.length === 0 ? (
          <EmptyState title={t("No approved toli earnings yet")} />
        ) : (
          <>
            <Table head={[t("Toli leader"), t("Earnings"), t("Distribute (₹)")]} empty={null}>
              {approvedSummaries.map((s) => (
                <tr key={s.summary.id}>
                  <Td className="font-semibold text-field-900">{s.toli.leader_name}</Td>
                  <Td><Money value={s.summary.total_earnings} /></Td>
                  <Td>
                    <Input
                      type="number"
                      min={0}
                      className="w-36"
                      value={distributions[s.toli.id] ?? s.summary.total_earnings}
                      onChange={(e) =>
                        setDistributions({ ...distributions, [s.toli.id]: Number(e.target.value) })
                      }
                      disabled={!canDistribute && collectionStatus !== "COLLECTED_FROM_FACILITY"}
                    />
                  </Td>
                </tr>
              ))}
            </Table>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-field-500">
                {t("{n} distributed", { n: totalDistributed.toLocaleString("en-IN") })} ·{" "}
                <span className={remaining < 0 ? "font-semibold text-red-600" : "font-semibold text-onion-700"}>
                  {remaining >= 0 ? t("{n} remaining", { n: remaining.toLocaleString("en-IN") }) : t("{n} over", { n: (-remaining).toLocaleString("en-IN") })}
                </span>
              </p>
              {canDistribute && (
                <Button variant="success" onClick={distribute} loading={busy}>
                  {t("Record distribution")}
                </Button>
              )}
              {collectionStatus === "DISTRIBUTED_TO_WORKERS" && (
                <Badge tone="green">{t("DISTRIBUTED TO WORKERS")}</Badge>
              )}
            </div>
          </>
        )}
      </Card>

      <SupplierAdvanceStatementModal
        open={statementOpen}
        onClose={() => setStatementOpen(false)}
        supplierId={user?.supplierId ?? ""}
      />
    </div>
  );
}
