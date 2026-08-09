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
  ListFilters,
  LoadingScreen,
  Modal,
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
  /** Computed preview from approved summaries + drops (no id / no collection_status). */
  payment: {
    supplierId: string;
    supplierName: string;
    totalWorkerEarnings: number;
    totalDrops: number;
    totalRentCharges: number;
    netPayment: number;
  } | null;
  /** The actual supplier_payments row created by the facility admin. */
  stored: {
    id: string;
    net_payment: number;
    total_worker_earnings: number;
    total_drops: number;
    total_rent_charges: number;
    advance_deducted: number | null;
    advance_balance_before: number | null;
    collection_status: string;
    payment_method: string | null;
    collection_date: string | null;
  } | null;
}

/** A payment the supplier still has to receive (or has collected and must distribute). */
interface SupplierPendingPayment {
  id: string;
  facility: { id: string; name: string };
  week_start_date: string;
  net_payment: number;
  total_worker_earnings: number;
  total_rent_charges: number;
  advance_deducted: number | null;
  collection_status: string;
  payment_method: string | null;
  collection_date: string | null;
  summaries: Array<{ toliId: string; leader: string; earnings: number }>;
}

export default function SupplierPaymentsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [statementOpen, setStatementOpen] = useState(false);
  const [week, setWeek] = useState<ThisWeek | null>(null);
  const [pending, setPending] = useState<PaymentPending | null>(null);
  const [pendingList, setPendingList] = useState<SupplierPendingPayment[] | null>(null);
  const [listQ, setListQ] = useState("");
  const [listStatus, setListStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [advances, setAdvances] = useState<MyAdvances | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Collect from the list — one modal shared by every pending payment
  const [collectFor, setCollectFor] = useState<SupplierPendingPayment | null>(null);
  const [collectMethod, setCollectMethod] = useState<"CASH" | "BANK_TRANSFER">("CASH");
  const [collectNotes, setCollectNotes] = useState("");

  // Per-payment distribution amounts (paymentId → toliId → amount)
  const [distributions, setDistributions] = useState<Record<string, Record<string, number>>>({});
  const [distributingId, setDistributingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoaded(false);
    setLoadError(false);
    Promise.allSettled([
      api<ThisWeek>("/supplier/this-week"),
      api<PaymentPending>("/supplier/payment-pending"),
      api<{ payments: SupplierPendingPayment[] }>("/supplier/pending-payments"),
    ]).then(([w, p, pl]) => {
      if (w.status === "fulfilled") setWeek(w.value);
      if (p.status === "fulfilled") setPending(p.value);
      if (pl.status === "fulfilled") setPendingList(pl.value.payments);
      setLoadError(w.status === "rejected" || p.status === "rejected" || pl.status === "rejected");
      setLoaded(true);
    });
    getMyAdvances().then(setAdvances).catch(() => setAdvances(null));
  }, []);

  useEffect(load, [load]);

  if (!loaded) return <LoadingScreen label={t("Loading payment details…")} />;

  // Render with safe defaults so every card always shows content, even when
  // one of the endpoints failed.
  const safeWeek: ThisWeek = week ?? {
    weekStart: "",
    weekEnd: "",
    summaries: [],
    totalDrops: 0,
    totalRent: 0,
    totalWorkerEarnings: 0,
    netPayment: 0,
  };
  const safePending: PaymentPending = pending ?? { payment: null, stored: null };
  const netToCollect =
    safePending.stored?.net_payment ?? safePending.payment?.netPayment ?? safeWeek.netPayment;

  async function collectFromFacility() {
    if (!collectFor) return;
    setBusy(true);
    setNotice(null);
    try {
      await post("/supplier/collect-payment", {
        payment_id: collectFor.id,
        payment_method: collectMethod,
        notes: collectNotes.trim() || null,
      });
      setNotice(t("Payment marked as collected from the facility. Now distribute to workers."));
      setCollectFor(null);
      setCollectNotes("");
      load();
    } catch (err) {
      setNotice(t("Collect failed: {message}", { message: err instanceof Error ? err.message : "" }));
    } finally {
      setBusy(false);
    }
  }

  // Client-side filters over the payments-to-receive list (search by facility,
  // week, or leader; status = PENDING | COLLECTED_FROM_FACILITY).
  const filteredPending = (pendingList ?? []).filter((p) => {
    const q = listQ.trim().toLowerCase();
    const qMatch =
      !q ||
      p.facility.name.toLowerCase().includes(q) ||
      p.week_start_date.slice(0, 10).includes(q) ||
      p.summaries.some((s) => s.leader.toLowerCase().includes(q));
    const sMatch = !listStatus || p.collection_status === listStatus;
    return qMatch && sMatch;
  });

  const totalDistributedFor = (p: SupplierPendingPayment) =>
    p.summaries.reduce(
      (s, sum) => s + (Number(distributions[p.id]?.[sum.toliId] ?? sum.earnings) || 0),
      0
    );

  async function distributeToWorkers(p: SupplierPendingPayment) {
    const dists = p.summaries.map((s) => ({
      toli_id: s.toliId,
      amount: Number(distributions[p.id]?.[s.toliId] ?? s.earnings),
      method: p.payment_method ?? "CASH",
    }));
    const total = dists.reduce((s, d) => s + d.amount, 0);
    if (total > p.net_payment) {
      setNotice(t("Distribution total exceeds the net payment!"));
      return;
    }
    setDistributingId(p.id);
    setNotice(null);
    try {
      await post("/supplier/distribute-payment", { payment_id: p.id, distributions: dists });
      setNotice(t("Distribution recorded. Payment marked DISTRIBUTED_TO_WORKERS."));
      load();
    } catch (err) {
      setNotice(t("Distribution failed: {message}", { message: err instanceof Error ? err.message : "" }));
    } finally {
      setDistributingId(null);
    }
  }

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

      {loadError && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            {t("Couldn't load payment details")} — {t("Showing partial data. Try again.")}
          </span>
          <Button size="sm" variant="secondary" onClick={load}>
            {t("Try again")}
          </Button>
        </div>
      )}

      {/* Net payment breakdown — this week */}
      <Card
        title={t("Net payment for this week")}
        subtitle={
          safeWeek.weekStart
            ? t("Week of {date}", { date: fmtDate(safeWeek.weekStart) })
            : t("No week data loaded")
        }
        className="mb-6"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-field-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-field-400">{t("Worker earnings")}</p>
            <p className="mt-1 font-display text-xl font-bold text-field-900">
              <Money value={safeWeek.totalWorkerEarnings} />
            </p>
          </div>
          <div className="rounded-xl bg-field-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-field-400">
              {t("Rent charges ({count} drops)", { count: safeWeek.totalDrops })}
            </p>
            <p className="mt-1 font-display text-xl font-bold text-onion-700">
              + <Money value={safeWeek.totalRent} />
            </p>
          </div>
          <div className="rounded-xl bg-onion-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-onion-600">{t("Net to collect")}</p>
            <p className="mt-1 font-display text-xl font-bold text-onion-800">
              <Money value={netToCollect} />
            </p>
          </div>
        </div>
      </Card>

      {/* Payments to receive from facilities */}
      <Card
        title={t("Payments to receive from facilities")}
        subtitle={t("Collect the net payment from each facility, then distribute to the toli leaders")}
        className="mb-6"
      >
        {!pendingList ? (
          <LoadingScreen />
        ) : pendingList.length === 0 ? (
          <EmptyState
            icon="💰"
            title={t("No payments to receive")}
            hint={t("The facility admin must process Sunday payments first")}
          />
        ) : (
          <>
            <ListFilters
              className="mb-4"
              search={listQ}
              onSearch={setListQ}
              status={listStatus}
              onStatus={setListStatus}
              statusOptions={[
                { value: "PENDING", label: t("Pending") },
                { value: "COLLECTED_FROM_FACILITY", label: t("Collected from facility") },
              ]}
              searchPlaceholder={t("Search facility, week or leader…")}
              allLabel={t("All statuses")}
            />

            {filteredPending.length === 0 ? (
              <EmptyState
                icon="🔍"
                title={t("No matching payments")}
                hint={t("Try a different search or status filter")}
              />
            ) : (
            <div className="space-y-4">
            {filteredPending.map((p) => {
              const collected = p.collection_status === "COLLECTED_FROM_FACILITY";
              const totalDistributed = totalDistributedFor(p);
              const remaining = p.net_payment - totalDistributed;
              return (
                <div key={p.id} className="overflow-hidden rounded-xl border border-field-200">
                  {/* Row header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-field-100 bg-field-50/70 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-onion-700 text-base text-white">
                        🏭
                      </span>
                      <div>
                        <p className="font-semibold text-field-900">{p.facility.name}</p>
                        <p className="text-xs text-field-500">
                          {t("Week of {date}", { date: fmtDate(p.week_start_date) })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={p.collection_status} />
                      <div className="text-right">
                        <span className="font-display text-lg font-bold text-onion-800">
                          <Money value={p.net_payment} />
                        </span>
                        {collected && (
                          <p className="text-xs text-field-500">
                            {t("Collected via {method}", {
                              method:
                                p.payment_method === "BANK_TRANSFER"
                                  ? t("Bank transfer")
                                  : t("Cash"),
                            })}{" "}
                            · {fmtDate(p.collection_date)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="px-4 py-4">
                    {!collected ? (
                      /* Step 1 — collect from this facility */
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-field-500">
                          {t("Receive the net payment in cash or by bank transfer")}
                        </p>
                        <Button
                          variant="success"
                          loading={busy}
                          onClick={() => {
                            setCollectMethod("CASH");
                            setCollectNotes("");
                            setCollectFor(p);
                          }}
                        >
                          {t("Collect payment")}
                        </Button>
                      </div>
                    ) : (
                      /* Step 2 — distribute to this facility's toli leaders */
                      <div>
                        {p.summaries.length === 0 ? (
                          <EmptyState title={t("No approved toli earnings yet")} />
                        ) : (
                          <>
                            <Table head={[t("Toli leader"), t("Earnings"), t("Distribute (₹)")]} empty={null}>
                              {p.summaries.map((s) => (
                                <tr key={s.toliId}>
                                  <Td className="font-semibold text-field-900">{s.leader}</Td>
                                  <Td><Money value={s.earnings} /></Td>
                                  <Td>
                                    <Input
                                      type="number"
                                      min={0}
                                      className="w-36"
                                      value={distributions[p.id]?.[s.toliId] ?? s.earnings}
                                      onChange={(e) =>
                                        setDistributions({
                                          ...distributions,
                                          [p.id]: {
                                            ...(distributions[p.id] ?? {}),
                                            [s.toliId]: Number(e.target.value),
                                          },
                                        })
                                      }
                                    />
                                  </Td>
                                </tr>
                              ))}
                            </Table>
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                              <p className="text-sm text-field-500">
                                {t("{n} distributed", { n: totalDistributed.toLocaleString("en-IN") })} ·{" "}
                                <span
                                  className={
                                    remaining < 0
                                      ? "font-semibold text-red-600"
                                      : "font-semibold text-onion-700"
                                  }
                                >
                                  {remaining >= 0
                                    ? t("{n} remaining", { n: remaining.toLocaleString("en-IN") })
                                    : t("{n} over", { n: (-remaining).toLocaleString("en-IN") })}
                                </span>
                              </p>
                              <Button
                                variant="success"
                                loading={distributingId === p.id}
                                onClick={() => distributeToWorkers(p)}
                              >
                                {t("Record distribution")}
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
            )}
          </>
        )}
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

      {/* Collect from facility modal */}
      <Modal
        open={collectFor !== null}
        onClose={() => setCollectFor(null)}
        title={t("Collect from facility")}
      >
        <div className="space-y-4">
          {collectFor && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-field-200 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-field-900">{collectFor.facility.name}</p>
                <p className="text-xs text-field-500">
                  {t("Week of {date}", { date: fmtDate(collectFor.week_start_date) })}
                </p>
              </div>
              <Money value={collectFor.net_payment} />
            </div>
          )}
          <Field label={t("Payment method")}>
            <SearchableSelect
              value={collectMethod}
              onChange={(v) => setCollectMethod(v as "CASH" | "BANK_TRANSFER")}
              options={[
                { value: "CASH", label: t("Cash") },
                { value: "BANK_TRANSFER", label: t("Bank transfer") },
              ]}
              placeholder={t("Select method…")}
              searchPlaceholder={t("Search payment methods…")}
            />
          </Field>
          <Field label={t("Notes (optional)")}>
            <Input
              value={collectNotes}
              onChange={(e) => setCollectNotes(e.target.value)}
              placeholder={t("e.g. collected at facility office")}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCollectFor(null)}>
              {t("Cancel")}
            </Button>
            <Button type="button" variant="success" onClick={collectFromFacility} loading={busy}>
              {t("Mark collected — ₹{amount}", {
                amount: (collectFor?.net_payment ?? 0).toLocaleString("en-IN"),
              })}
            </Button>
          </div>
        </div>
      </Modal>

      <SupplierAdvanceStatementModal
        open={statementOpen}
        onClose={() => setStatementOpen(false)}
        supplierId={user?.supplierId ?? ""}
      />
    </div>
  );
}
