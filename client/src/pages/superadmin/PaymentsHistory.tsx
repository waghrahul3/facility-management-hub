import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useI18n } from "../../i18n";
import {
  Card,
  EmptyState,
  LoadingScreen,
  Money,
  PageHeader,
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";
import { fmtDate } from "../../lib/format";
import ExportButtons from "../../components/ExportButtons";

interface PaymentRow {
  payment: {
    id: string;
    week_start_date: string;
    total_worker_earnings: number;
    total_drops: number;
    total_rent_charges: number;
    net_payment: number;
    collection_status: string;
    payment_method: string | null;
  };
  supplier: { id: string; name: string } | null;
  facility: { id: string; name: string } | null;
}

export default function PaymentsHistoryPage() {
  const { t } = useI18n();
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);

  const load = useCallback(() => {
    api<{ payments: PaymentRow[] }>("/super-admin/reports/payments").then((r) =>
      setPayments(r.payments)
    );
  }, []);

  useEffect(load, [load]);

  return (
    <div>
      <PageHeader
        title={t("Payment History")}
        subtitle={t("Weekly supplier settlements across all facilities")}
        action={<ExportButtons reportType="payments" />}
      />

      {!payments ? (
        <LoadingScreen />
      ) : payments.length === 0 ? (
        <Card><EmptyState title={t("No payments yet")} hint={t("Payments appear once facilities process Sunday settlements")} /></Card>
      ) : (
        <Card>
          <Table
            head={[t("Week"), t("Facility"), t("Supplier"), t("Earnings"), t("Rent"), t("Net"), t("Method"), t("Status")]}
            empty={null}
          >
            {payments.map((r) => (
              <tr key={r.payment.id} className="hover:bg-field-50/50">
                <Td>{fmtDate(r.payment.week_start_date)}</Td>
                <Td className="font-medium text-field-800">{r.facility?.name ?? "—"}</Td>
                <Td>{r.supplier?.name ?? "—"}</Td>
                <Td><Money value={r.payment.total_worker_earnings} /></Td>
                <Td className="text-red-600">− <Money value={r.payment.total_rent_charges} /></Td>
                <Td className="font-bold text-onion-800"><Money value={r.payment.net_payment} /></Td>
                <Td>{r.payment.payment_method ?? "—"}</Td>
                <Td><StatusBadge status={r.payment.collection_status} /></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
