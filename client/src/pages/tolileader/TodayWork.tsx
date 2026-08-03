import { useCallback, useEffect, useState } from "react";
import { api, put } from "../../lib/api";
import {
  Badge,
  Button,
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

interface EntryRow {
  entry: {
    id: string;
    work_date: string;
    quantity_bags: number;
    rate_per_bag: number;
    total_amount: number;
    status: "DRAFT" | "APPROVED" | "PAID";
    leader_confirmed_at: string | null;
  };
  bagSize: { id: string; size_name: string; weight_kg: number };
}

export default function TodayWorkPage() {
  const [entries, setEntries] = useState<EntryRow[] | null>(null);
  const [date, setDate] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ entries: EntryRow[]; date: string }>("/toli-leader/today-work").then((r) => {
      setEntries(r.entries);
      setDate(r.date);
    });
  }, []);

  useEffect(load, [load]);

  async function confirm(id: string) {
    await put(`/toli-leader/work-entries/${id}/confirm`);
    load();
  }

  return (
    <div>
      <PageHeader title="Today's Work" subtitle={date ? `Work recorded on ${fmtDate(date)}` : "Today's assignment"} />

      {!entries ? (
        <LoadingScreen />
      ) : entries.length === 0 ? (
        <Card><EmptyState title="No work recorded today" hint="Check back later — the facility admin records entries" /></Card>
      ) : (
        <Card>
          <Table head={["Bag size", "Qty", "Rate", "Amount", "Status", "Confirmation"]} empty={null}>
            {entries.map((r) => (
              <tr key={r.entry.id} className="hover:bg-field-50/50">
                <Td className="font-medium text-field-900">
                  {r.bagSize.size_name} ({r.bagSize.weight_kg}kg)
                </Td>
                <Td>{r.entry.quantity_bags}</Td>
                <Td><Money value={r.entry.rate_per_bag} /></Td>
                <Td className="font-semibold"><Money value={r.entry.total_amount} /></Td>
                <Td><StatusBadge status={r.entry.status} /></Td>
                <Td>
                  {r.entry.leader_confirmed_at ? (
                    <Badge tone="green">✓ Confirmed {fmtDate(r.entry.leader_confirmed_at)}</Badge>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => confirm(r.entry.id)}>
                      Confirm
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
