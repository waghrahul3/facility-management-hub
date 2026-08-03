import { useEffect, useState } from "react";
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

interface Distribution {
  id: string;
  amount_distributed: number;
  distribution_date: string;
  payment_method: string;
  notes: string | null;
}

export default function LeaderPaymentHistoryPage() {
  const [distributions, setDistributions] = useState<Distribution[] | null>(null);

  useEffect(() => {
    api<{ distributions: Distribution[] }>("/toli-leader/payment-history").then((r) =>
      setDistributions(r.distributions)
    );
  }, []);

  if (!distributions) return <LoadingScreen label="Loading payment history…" />;

  return (
    <div>
      <PageHeader title="Payment History" subtitle="Amounts distributed to your toli by the supplier" />

      {distributions.length === 0 ? (
        <Card>
          <EmptyState title="No payments yet" hint="Distributions appear after Sunday settlement" />
        </Card>
      ) : (
        <Card>
          <Table head={["Date", "Method", "Amount", "Notes"]} empty={null}>
            {distributions.map((d) => (
              <tr key={d.id} className="hover:bg-field-50/50">
                <Td>{fmtDate(d.distribution_date)}</Td>
                <Td><StatusBadge status={d.payment_method.replace("_", " ")} /></Td>
                <Td className="font-semibold text-onion-800"><Money value={d.amount_distributed} /></Td>
                <Td className="text-xs text-field-400">{d.notes ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
