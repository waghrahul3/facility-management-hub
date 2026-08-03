import { useCallback, useEffect, useState } from "react";
import { api, post } from "../../lib/api";
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
  const [week, setWeek] = useState<ThisWeek | null>(null);
  const [pending, setPending] = useState<PaymentPending | null>(null);
  const [method, setMethod] = useState<"CASH" | "BANK_TRANSFER">("CASH");
  const [notes, setNotes] = useState("");
  const [distributions, setDistributions] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api<ThisWeek>("/supplier/this-week").then(setWeek);
    api<PaymentPending>("/supplier/payment-pending").then((r) => {
      setPending(r);
      if (r.payment) {
        setDistributions({});
      }
    });
  }, []);

  useEffect(load, [load]);

  if (!week || !pending) return <LoadingScreen label="Loading payment details…" />;

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
      setNotice("Payment marked as collected from the facility. Now distribute to workers.");
      load();
    } finally {
      setBusy(false);
    }
  };

  const distribute = async () => {
    const pay = pending?.payment;
    if (!pay) return;
    if (totalDistributed > pay.net_payment) {
      setNotice("Distribution total exceeds the net payment!");
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
      setNotice("Distribution recorded. Payment marked DISTRIBUTED_TO_WORKERS.");
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
        title="Collect & Distribute"
        subtitle="Sunday flow: collect from the facility, then distribute to toli leaders"
      />

      {notice && (
        <div className="mb-4 rounded-lg border border-onion-200 bg-onion-50 px-4 py-3 text-sm text-onion-800">
          {notice}
        </div>
      )}

      {/* Net payment breakdown */}
      <Card
        title="Net payment for this week"
        subtitle={`Week of ${fmtDate(week.weekStart)}`}
        className="mb-6"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-field-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-field-400">Worker earnings</p>
            <p className="mt-1 font-display text-xl font-bold text-field-900">
              <Money value={week.totalWorkerEarnings} />
            </p>
          </div>
          <div className="rounded-xl bg-field-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-field-400">
              Rent charges ({week.totalDrops} drops)
            </p>
            <p className="mt-1 font-display text-xl font-bold text-red-600">
              − <Money value={week.totalRent} />
            </p>
          </div>
          <div className="rounded-xl bg-onion-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-onion-600">Net to collect</p>
            <p className="mt-1 font-display text-xl font-bold text-onion-800">
              <Money value={payment?.net_payment ?? week.netPayment} />
            </p>
          </div>
        </div>
        <div className="mt-3">
          <StatusBadge status={collectionStatus} />
        </div>
      </Card>

      {/* Step 1: Collect */}
      <Card title="Step 1 — Collect from facility" subtitle="Receive the net payment in cash or by bank transfer" className="mb-6">
        {canCollect ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Payment method">
                <SearchableSelect
                  value={method}
                  onChange={(v) => setMethod(v as "CASH" | "BANK_TRANSFER")}
                  options={[
                    { value: "CASH", label: "Cash" },
                    { value: "BANK_TRANSFER", label: "Bank transfer" },
                  ]}
                  placeholder="Select method…"
                  searchPlaceholder="Search payment methods…"
                />
              </Field>
              <Field label="Notes (optional)">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. collected at facility office" />
              </Field>
            </div>
            <Button variant="success" onClick={collect} loading={busy}>
              Mark collected — ₹{payment?.net_payment?.toLocaleString("en-IN")}
            </Button>
          </div>
        ) : collectionStatus === "COLLECTED_FROM_FACILITY" ? (
          <div className="rounded-lg bg-onion-50 px-4 py-3 text-sm text-onion-800">
            ✅ Collected{payment?.payment_method ? ` via ${payment.payment_method.replace("_", " ")}` : ""}.
            Proceed to distribution below.
          </div>
        ) : (
          <EmptyState title="No payment ready yet" hint="The facility admin must process Sunday payments first" />
        )}
      </Card>

      {/* Step 2: Distribute */}
      <Card title="Step 2 — Distribute to workers" subtitle="Record the amount given to each toli leader">
        {approvedSummaries.length === 0 ? (
          <EmptyState title="No approved toli earnings yet" />
        ) : (
          <>
            <Table head={["Toli leader", "Earnings", "Distribute (₹)"]} empty={null}>
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
                {totalDistributed.toLocaleString("en-IN")} distributed ·{" "}
                <span className={remaining < 0 ? "font-semibold text-red-600" : "font-semibold text-onion-700"}>
                  {remaining >= 0 ? `${remaining.toLocaleString("en-IN")} remaining` : `${(-remaining).toLocaleString("en-IN")} over`}
                </span>
              </p>
              {canDistribute && (
                <Button variant="success" onClick={distribute} loading={busy}>
                  Record distribution
                </Button>
              )}
              {collectionStatus === "DISTRIBUTED_TO_WORKERS" && (
                <Badge tone="green">DISTRIBUTED TO WORKERS</Badge>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
