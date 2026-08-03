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

interface Earnings {
  summaries: Array<{
    id: string;
    total_work_amount: number;
    daily_charge_agreed_amount: number;
    total_earnings: number;
    approval_status: string;
  }>;
  entries: Array<{
    entry: { work_date: string; quantity_bags: number; rate_per_bag: number; total_amount: number; status: string };
    bagSize: { size_name: string; weight_kg: number };
  }>;
  weekStart: string;
}

export default function EarningsPage() {
  const [data, setData] = useState<Earnings | null>(null);

  useEffect(() => {
    api<Earnings>("/toli-leader/weekly-earnings").then(setData);
  }, []);

  if (!data) return <LoadingScreen label="Loading earnings…" />;

  const summary = data.summaries[0];

  return (
    <div>
      <PageHeader title="Weekly Earnings" subtitle={`Week of ${fmtDate(data.weekStart)}`} />

      {summary ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-field-400">Work amount</p>
              <p className="mt-1 font-display text-xl font-bold text-field-900">
                <Money value={summary.total_work_amount} />
              </p>
            </div>
            <div className="card-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-field-400">Day charge</p>
              <p className="mt-1 font-display text-xl font-bold text-field-900">
                <Money value={summary.daily_charge_agreed_amount} />
              </p>
            </div>
            <div className="card-surface border-onion-200 bg-onion-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-onion-600">Total earnings</p>
              <p className="mt-1 font-display text-xl font-bold text-onion-800">
                <Money value={summary.total_earnings} />
              </p>
            </div>
          </div>

          <Card title="Work entry breakdown" subtitle={`${data.entries.length} entries this week`}>
            <Table head={["Date", "Bag size", "Qty", "Rate", "Amount"]} empty={null}>
              {data.entries.map((r, i) => (
                <tr key={i} className="hover:bg-field-50/50">
                  <Td>{fmtDate(r.entry.work_date)}</Td>
                  <Td>{r.bagSize.size_name} ({r.bagSize.weight_kg}kg)</Td>
                  <Td>{r.entry.quantity_bags}</Td>
                  <Td><Money value={r.entry.rate_per_bag} /></Td>
                  <Td className="font-semibold"><Money value={r.entry.total_amount} /></Td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState title="No summary for this week yet" hint="The facility admin generates summaries after approvals" />
        </Card>
      )}
    </div>
  );
}
