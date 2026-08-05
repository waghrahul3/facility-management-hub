import { useCallback, useEffect, useState } from "react";
import { api, put } from "../../lib/api";
import { useI18n } from "../../i18n";
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
import ExportButtons from "../../components/ExportButtons";

interface EntryRow {
  entry: {
    id: string;
    work_date: string;
    onion_category: string | null;
    quantity_bags: number;
    rate_per_bag: number;
    total_amount: number;
    status: "DRAFT" | "APPROVED" | "PAID";
    leader_confirmed_at: string | null;
  };
  bagSize: { id: string; size_name: string; weight_kg: number };
}

export default function TodayWorkPage() {
  const { t } = useI18n();
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
      <PageHeader
        title={t("Today's Work")}
        subtitle={date ? t("Work recorded on {date}", { date: fmtDate(date) }) : t("Today's assignment")}
        action={<ExportButtons reportType="work" />}
      />

      {!entries ? (
        <LoadingScreen />
      ) : entries.length === 0 ? (
        <Card><EmptyState title={t("No work recorded today")} hint={t("Check back later — the facility admin records entries")} /></Card>
      ) : (
        <Card>
          <Table head={[t("Bag size"), t("Category"), t("Qty"), t("Rate"), t("Amount"), t("Status"), t("Confirmation")]} empty={null}>
            {entries.map((r) => (
              <tr key={r.entry.id} className="hover:bg-field-50/50">
                <Td className="font-medium text-field-900">
                  {r.bagSize.size_name} ({r.bagSize.weight_kg}kg)
                </Td>
                <Td>{r.entry.onion_category || <span className="text-field-300">—</span>}</Td>
                <Td>{r.entry.quantity_bags}</Td>
                <Td><Money value={r.entry.rate_per_bag} /></Td>
                <Td className="font-semibold"><Money value={r.entry.total_amount} /></Td>
                <Td><StatusBadge status={r.entry.status} /></Td>
                <Td>
                  {r.entry.leader_confirmed_at ? (
                    <Badge tone="green">✓ {t("Confirmed")} {fmtDate(r.entry.leader_confirmed_at)}</Badge>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => confirm(r.entry.id)}>
                      {t("Confirm")}
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
