import { useCallback, useEffect, useState } from "react";
import { api, post } from "../../lib/api";
import { useFacilityScope } from "../../lib/facilityScope";
import { useI18n } from "../../i18n";
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
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";
import { weekStartInput } from "../../lib/format";
import ExportButtons from "../../components/ExportButtons";

interface PendingPayment {
  payment: {
    id: string;
    supplier_id: string;
    week_start_date: string;
    total_worker_earnings: number;
    total_drops: number;
    total_rent_charges: number;
    net_payment: number;
    collection_status: string;
    payment_method: string | null;
  };
  supplier: { id: string; name: string };
}

interface HistoryRow {
  payment: {
    id: string;
    week_start_date: string;
    total_worker_earnings: number;
    total_rent_charges: number;
    net_payment: number;
    collection_status: string;
    payment_method: string | null;
  };
  supplier: { id: string; name: string };
}

export default function PaymentsPage() {
  const { facilityId: fid } = useFacilityScope();
  const { t } = useI18n();
  const [pending, setPending] = useState<PendingPayment[] | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [weekStart, setWeekStart] = useState(weekStartInput());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!fid) return;
    api<{ payments: PendingPayment[] }>(`/facility/${fid}/payments/pending?weekStart=${weekStart}`)
      .then((r) => setPending(r.payments))
      .catch(() => setPending([]));
    api<{ payments: HistoryRow[] }>(`/facility/${fid}/payments/history`).then((r) =>
      setHistory(r.payments)
    );
  }, [fid, weekStart]);

  useEffect(load, [load]);

  async function processSunday() {
    if (!confirm(t("Process Sunday payments for this week? This locks approved work as PAID."))) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await post<{ processed: unknown[] }>(`/facility/${fid}/payments/process`, { weekStart });
      setNotice(
        t("Processed {n} supplier payments. Suppliers can now collect and distribute.", { n: r.processed.length })
      );
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("Sunday Payments")}
        subtitle={t("Calculate net payments: worker earnings − supplier rent charges")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButtons reportType="payments" filters={{ from: weekStart }} />
            <Button variant="success" onClick={processSunday} loading={busy}>
              {t("Process Sunday payments")}
            </Button>
          </div>
        }
      />

      {notice && (
        <div className="mb-4 rounded-lg border border-onion-200 bg-onion-50 px-4 py-3 text-sm text-onion-800">
          {notice}
        </div>
      )}

      <Card className="mb-5">
        <Field label={t("Week starting")}>
          <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
        </Field>
      </Card>

      <Card title={t("Pending collections")} subtitle={t("Net payment each supplier will collect from the facility")}>
        {!pending ? (
          <LoadingScreen />
        ) : pending.length === 0 ? (
          <EmptyState title={t("No pending payments")} hint={t("Process Sunday payments once summaries are approved")} />
        ) : (
          <Table
            head={[t("Supplier"), t("Worker earnings"), t("Drops"), t("Rent charges"), t("Net payment"), t("Status")]}
            empty={null}
          >
            {pending.map((r) => (
              <tr key={r.payment.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{r.supplier.name}</Td>
                <Td><Money value={r.payment.total_worker_earnings} /></Td>
                <Td>{r.payment.total_drops}</Td>
                <Td className="text-red-600">− <Money value={r.payment.total_rent_charges} /></Td>
                <Td className="font-bold text-onion-800"><Money value={r.payment.net_payment} /></Td>
                <Td><StatusBadge status={r.payment.collection_status} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <div className="mt-6">
        <Card title={t("Payment history")} subtitle={t("All weekly supplier payments for this facility")}>
          {history.length === 0 ? (
            <EmptyState title={t("No payment history yet")} />
          ) : (
            <Table
              head={[t("Week"), t("Supplier"), t("Earnings"), t("Rent"), t("Net"), t("Method"), t("Status")]}
              empty={null}
            >
              {history.map((r) => (
                <tr key={r.payment.id} className="hover:bg-field-50/50">
                  <Td>{r.payment.week_start_date.slice(0, 10)}</Td>
                  <Td className="font-medium">{r.supplier.name}</Td>
                  <Td><Money value={r.payment.total_worker_earnings} /></Td>
                  <Td>− <Money value={r.payment.total_rent_charges} /></Td>
                  <Td className="font-semibold"><Money value={r.payment.net_payment} /></Td>
                  <Td>{r.payment.payment_method ?? "—"}</Td>
                  <Td>
                    <Badge tone={r.payment.collection_status === "PENDING" ? "amber" : "green"}>
                      {r.payment.collection_status.replace(/_/g, " ")}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
