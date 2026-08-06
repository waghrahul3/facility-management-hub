import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useI18n } from "../../i18n";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingScreen,
  Money,
  PageHeader,
  Pagination,
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";
import { fmtDate, weekStartInput } from "../../lib/format";
import ExportButtons from "../../components/ExportButtons";

const PAGE_SIZE = 50;

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
  toli: { id: string; leader_name: string };
  bagSize: { id: string; size_name: string; weight_kg: number };
}

export default function SupplierWorkEntriesPage() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<EntryRow[] | null>(null);
  const [weekStart, setWeekStart] = useState(weekStartInput());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(() => {
    api<{ entries: EntryRow[]; total: number }>(`/supplier/work-entries?weekStart=${weekStart}&page=${page}&pageSize=${PAGE_SIZE}`).then((r) => {
      setEntries(r.entries);
      setTotal(r.total);
      if (page > Math.max(1, Math.ceil(r.total / PAGE_SIZE))) {
        setPage(Math.max(1, Math.ceil(r.total / PAGE_SIZE)));
      }
    });
  }, [weekStart, page]);

  useEffect(load, [load]);

  const totalWork = (entries ?? []).reduce((s, r) => s + r.entry.total_amount, 0);

  return (
    <div>
      <PageHeader
        title={t("Work Entries")}
        subtitle={t("Daily work recorded for the tolis you dropped — view only")}
        action={<ExportButtons reportType="work" filters={{ from: weekStart }} />}
      />

      <Card className="mb-5">
        <Field label={t("Week starting")}>
          <Input
            type="date"
            value={weekStart}
            onChange={(e) => {
              setWeekStart(e.target.value);
              setPage(1);
            }}
          />
        </Field>
      </Card>

      {!entries ? (
        <LoadingScreen />
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState
            title={t("No work entries for your drops")}
            hint={t("Work recorded against tolis from your drops will appear here")}
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between rounded-xl border border-onion-200 bg-onion-50 px-4 py-3">
            <span className="text-sm font-medium text-onion-800">
              {t("Total work value for your drops this week")}
            </span>
            <Money value={totalWork} className="text-lg font-bold" />
          </div>
          <Card>
            <Table head={[t("Date"), t("Toli leader"), t("Bag size"), t("Category"), t("Qty"), t("Rate"), t("Amount"), t("Status"), t("Leader OK")]} empty={null}>
              {entries.map((r) => (
                <tr key={r.entry.id} className="hover:bg-field-50/50">
                  <Td>{fmtDate(r.entry.work_date)}</Td>
                  <Td className="font-medium text-field-900">{r.toli.leader_name}</Td>
                  <Td>{r.bagSize.size_name} ({r.bagSize.weight_kg}kg)</Td>
                  <Td>{r.entry.onion_category || <span className="text-field-300">—</span>}</Td>
                  <Td>{r.entry.quantity_bags}</Td>
                  <Td><Money value={r.entry.rate_per_bag} /></Td>
                  <Td className="font-semibold"><Money value={r.entry.total_amount} /></Td>
                  <Td><StatusBadge status={r.entry.status} /></Td>
                  <Td>
                    {r.entry.leader_confirmed_at ? (
                      <Badge tone="green">{t("Confirmed")}</Badge>
                    ) : (
                      <Badge tone="slate">{t("Pending")}</Badge>
                    )}
                  </Td>
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
        </>
      )}
    </div>
  );
}
