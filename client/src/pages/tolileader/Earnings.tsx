import { useEffect, useState } from "react";
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

interface Earnings {
  summaries: Array<{
    id: string;
    total_work_amount: number;
    daily_charge_agreed_amount: number;
    total_earnings: number;
    approval_status: string;
  }>;
  entries: Array<{
    entry: { work_date: string; onion_category: string | null; quantity_bags: number; rate_per_bag: number; total_amount: number; status: string };
    bagSize: { size_name: string; weight_kg: number };
  }>;
  weekStart: string;
}

export default function EarningsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<Earnings | null>(null);

  useEffect(() => {
    api<Earnings>("/toli-leader/weekly-earnings").then(setData);
  }, []);

  if (!data) return <LoadingScreen label={t("Loading earnings…")} />;

  const summary = data.summaries[0];

  return (
    <div>
      <PageHeader
        title={t("Weekly Earnings")}
        subtitle={t("Week of {date}", { date: fmtDate(data.weekStart) })}
        action={<ExportButtons reportType="summaries" />}
      />

      {summary ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="card-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-field-400">{t("Work amount")}</p>
              <p className="mt-1 font-display text-xl font-bold text-field-900">
                <Money value={summary.total_work_amount} />
              </p>
            </div>
            <div className="card-surface p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-field-400">{t("Day charge")}</p>
              <p className="mt-1 font-display text-xl font-bold text-field-900">
                <Money value={summary.daily_charge_agreed_amount} />
              </p>
            </div>
            <div className="card-surface border-onion-200 bg-onion-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-onion-600">{t("Total earnings")}</p>
              <p className="mt-1 font-display text-xl font-bold text-onion-800">
                <Money value={summary.total_earnings} />
              </p>
            </div>
          </div>

          <Card title={t("Work entry breakdown")} subtitle={t("{n} entries this week", { n: data.entries.length })}>
            <Table head={[t("Date"), t("Bag size"), t("Category"), t("Qty"), t("Rate"), t("Amount")]} empty={null}>
              {data.entries.map((r, i) => (
                <tr key={i} className="hover:bg-field-50/50">
                  <Td>{fmtDate(r.entry.work_date)}</Td>
                  <Td>{r.bagSize.size_name} ({r.bagSize.weight_kg}kg)</Td>
                  <Td>{r.entry.onion_category || <span className="text-field-300">—</span>}</Td>
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
          <EmptyState title={t("No summary for this week yet")} hint={t("The facility admin generates summaries after approvals")} />
        </Card>
      )}
    </div>
  );
}
