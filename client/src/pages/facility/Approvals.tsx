import { useCallback, useEffect, useState } from "react";
import { api, post } from "../../lib/api";
import { useFacilityScope } from "../../lib/facilityScope";
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
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";
import { weekStartInput } from "../../lib/format";

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
  const [summaries, setSummaries] = useState<SummaryRow[] | null>(null);
  const [weekStart, setWeekStart] = useState(weekStartInput());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!fid) return;
    api<{ summaries: SummaryRow[] }>(`/facility/${fid}/weekly-summary?weekStart=${weekStart}`).then(
      (r) => setSummaries(r.summaries)
    );
  }, [fid, weekStart]);

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
        title="Weekly Approvals"
        subtitle="Generate per-toli weekly summaries and approve before Sunday payment"
        action={
          <Button onClick={generate} loading={busy}>
            Regenerate summaries
          </Button>
        }
      />

      <Card className="mb-5">
        <Field label="Week starting">
          <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
        </Field>
      </Card>

      {!summaries ? (
        <LoadingScreen />
      ) : summaries.length === 0 ? (
        <Card>
          <EmptyState
            title="No summaries for this week"
            hint="Generate summaries from approved work entries"
          />
        </Card>
      ) : (
        <Card>
          <Table
            head={["Toli", "Supplier", "Bags", "Work amount", "Day charge", "Total earnings", "Status", "Actions"]}
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
                      <Button size="sm" onClick={() => approve(r.summary.id)}>Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => reject(r.summary.id)}>Reject</Button>
                    </div>
                  ) : r.summary.approval_status === "APPROVED" ? (
                    <Badge tone="green">Ready for payment</Badge>
                  ) : (
                    <Badge tone="red">Rejected</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
          <div className="mt-3 rounded-lg bg-onion-50 px-3 py-2 text-xs text-onion-800">
            Only approved summaries count toward Sunday supplier payments.
          </div>
        </Card>
      )}
    </div>
  );
}
