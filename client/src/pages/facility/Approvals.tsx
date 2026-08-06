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
  Pagination,
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";
import { weekStartInput } from "../../lib/format";
import ExportButtons from "../../components/ExportButtons";

const PAGE_SIZE = 50;

interface SummaryRow {
  summary: {
    id: string;
    total_bags_processed: number;
    total_work_amount: number;
    daily_charge_agreed_amount: number;
    total_earnings: number;
    approval_status: "PENDING" | "APPROVED" | "REJECTED";
  };
  toli: { id: string; leader_name: string };
  supplier: { id: string; name: string } | null;
}

export default function ApprovalsPage() {
  const { facilityId: fid } = useFacilityScope();
  const { t } = useI18n();
  const [summaries, setSummaries] = useState<SummaryRow[] | null>(null);
  const [weekStart, setWeekStart] = useState(weekStartInput());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!fid) return;
    api<{ summaries: SummaryRow[]; total: number }>(`/facility/${fid}/weekly-summary?weekStart=${weekStart}&page=${page}&pageSize=${PAGE_SIZE}`).then(
      (r) => {
        setSummaries(r.summaries);
        setTotal(r.total);
        if (page > Math.max(1, Math.ceil(r.total / PAGE_SIZE))) {
          setPage(Math.max(1, Math.ceil(r.total / PAGE_SIZE)));
        }
      }
    );
  }, [fid, weekStart, page]);

  useEffect(load, [load]);

  async function generate() {
    setBusy(true);
    try {
      await post(`/facility/${fid}/weekly-summary/generate`, { weekStart });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string) {
    await post(`/facility/${fid}/weekly-summary/${id}/approve`);
    load();
  }

  async function reject(id: string) {
    await post(`/facility/${fid}/weekly-summary/${id}/reject`);
    load();
  }

  return (
    <div>
      <PageHeader
        title={t("Weekly Approvals")}
        subtitle={t("Generate per-toli weekly summaries and approve before Sunday payment")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButtons reportType="summaries" filters={{ from: weekStart }} />
            <Button onClick={generate} loading={busy}>
              {t("Regenerate summaries")}
            </Button>
          </div>
        }
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

      {!summaries ? (
        <LoadingScreen />
      ) : summaries.length === 0 ? (
        <Card>
          <EmptyState
            title={t("No summaries for this week")}
            hint={t("Generate summaries from approved work entries")}
          />
        </Card>
      ) : (
        <Card>
          <Table
            head={[t("Toli"), t("Supplier"), t("Bags"), t("Work amount"), t("Day charge"), t("Total earnings"), t("Status"), t("Actions")]}
            empty={null}
          >
            {summaries.map((r) => (
              <tr key={r.summary.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{r.toli.leader_name}</Td>
                <Td>{r.supplier?.name ?? "—"}</Td>
                <Td>{r.summary.total_bags_processed}</Td>
                <Td><Money value={r.summary.total_work_amount} /></Td>
                <Td><Money value={r.summary.daily_charge_agreed_amount} /></Td>
                <Td className="font-bold text-onion-800"><Money value={r.summary.total_earnings} /></Td>
                <Td><StatusBadge status={r.summary.approval_status} /></Td>
                <Td>
                  {r.summary.approval_status === "PENDING" ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => approve(r.summary.id)}>{t("Approve")}</Button>
                      <Button size="sm" variant="danger" onClick={() => reject(r.summary.id)}>{t("Reject")}</Button>
                    </div>
                  ) : r.summary.approval_status === "APPROVED" ? (
                    <Badge tone="green">{t("Ready for payment")}</Badge>
                  ) : (
                    <Badge tone="red">{t("Rejected")}</Badge>
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
          <div className="mt-3 rounded-lg bg-onion-50 px-3 py-2 text-xs text-onion-800">
            {t("Only approved summaries count toward Sunday supplier payments.")}
          </div>
        </Card>
      )}
    </div>
  );
}
