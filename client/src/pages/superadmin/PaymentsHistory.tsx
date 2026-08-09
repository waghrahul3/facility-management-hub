import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useI18n } from "../../i18n";
import {
  Card,
  EmptyState,
  LoadingScreen,
  Money,
  PageHeader,
  Pagination,
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

const PAGE_SIZE = 50;

export default function PaymentsHistoryPage() {
  const { t } = useI18n();
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(() => {
    api<{ payments: PaymentRow[]; total: number }>(`/super-admin/reports/payments?page=${page}&pageSize=${PAGE_SIZE}`).then((r) => {
      setPayments(r.payments);
      setTotal(r.total);
      if (page > Math.max(1, Math.ceil(r.total / PAGE_SIZE))) {
        setPage(Math.max(1, Math.ceil(r.total / PAGE_SIZE)));
      }
    });
  }, [page]);

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
                <Td className="text-onion-700">+ <Money value={r.payment.total_rent_charges} /></Td>
                <Td className="font-bold text-onion-800"><Money value={r.payment.net_payment} /></Td>
                <Td>{r.payment.payment_method ?? "—"}</Td>
                <Td><StatusBadge status={r.payment.collection_status} /></Td>
              </tr>
            ))}
          </Table>
          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            total={total}
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
        </Card>
      )}
    </div>
  );
}
