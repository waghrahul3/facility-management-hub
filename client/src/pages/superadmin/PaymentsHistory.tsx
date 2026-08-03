import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
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
        title="Payment History"
        subtitle="Weekly supplier settlements across all facilities"
      />

      {!payments ? (
        <LoadingScreen />
      ) : payments.length === 0 ? (
        <Card><EmptyState title="No payments yet" hint="Payments appear once facilities process Sunday settlements" /></Card>
      ) : (
        <Card>
          <Table
            head={["Week", "Facility", "Supplier", "Earnings", "Rent", "Net", "Method", "Status"]}
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
