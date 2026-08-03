import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingScreen,
  Modal,
  Money,
  PageHeader,
  SearchableSelect,
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";
import { fmtDate, todayInput, weekStartInput } from "../../lib/format";

interface ToliOption {
  id: string;
  leader_name: string;
}

interface BagOption {
  id: string;
  size_name: string;
  weight_kg: number;
}

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
  toli: { id: string; leader_name: string };
  bagSize: { id: string; size_name: string; weight_kg: number };
}

export default function WorkEntriesPage() {
  const { user } = useAuth();
  const fid = user?.facilityId;
  const [entries, setEntries] = useState<EntryRow[] | null>(null);
  const [tolis, setTolis] = useState<ToliOption[]>([]);
  const [bagSizes, setBagSizes] = useState<BagOption[]>([]);
  const [weekStart, setWeekStart] = useState(weekStartInput());
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({
    toli_id: "",
    work_date: todayInput(),
    bag_size_id: "",
    quantity_bags: 0,
    notes: "",
  });
  const [previewRate, setPreviewRate] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!fid) return;
    api<{ entries: EntryRow[] }>(`/facility/${fid}/work-entries?weekStart=${weekStart}`).then((r) =>
      setEntries(r.entries)
    );
  }, [fid, weekStart]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!fid) return;
    api<{ tolis: { toli: ToliOption }[] }>(`/facility/${fid}/tolis`).then((r) =>
      setTolis(r.tolis.map((t) => t.toli))
    );
    api<{ bagSizes: BagOption[] }>(`/facility/${fid}/bag-sizes`).then((r) => setBagSizes(r.bagSizes));
  }, [fid]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await post(`/facility/${fid}/work-entries`, {
        toli_id: form.toli_id,
        work_date: form.work_date,
        bag_size_id: form.bag_size_id,
        quantity_bags: Number(form.quantity_bags),
        notes: form.notes || null,
      });
      setShowModal(false);
      setForm({ ...form, quantity_bags: 0, notes: "" });
      setPreviewRate(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  // Status changes are facility-admin only (enforced on the server too).
  async function setStatus(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await post(`/facility/${fid}/work-entries/${id}/${action}`);
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Work Entries"
        subtitle="Record daily bags processed by each toli"
        action={<Button onClick={() => setShowModal(true)}>+ Record work</Button>}
      />

      <Card className="mb-5">
        <Field label="Week starting">
          <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
        </Field>
      </Card>

      {!entries ? (
        <LoadingScreen />
      ) : entries.length === 0 ? (
        <Card><EmptyState title="No work entries this week" hint="Record the first work entry" /></Card>
      ) : (
        <Card>
          <Table head={["Date", "Toli", "Bag size", "Qty", "Rate", "Amount", "Status", "Leader OK", "Action"]} empty={null}>
            {entries.map((r) => (
              <tr key={r.entry.id} className="hover:bg-field-50/50">
                <Td>{fmtDate(r.entry.work_date)}</Td>
                <Td className="font-medium text-field-900">{r.toli.leader_name}</Td>
                <Td>{r.bagSize.size_name} ({r.bagSize.weight_kg}kg)</Td>
                <Td>{r.entry.quantity_bags}</Td>
                <Td><Money value={r.entry.rate_per_bag} /></Td>
                <Td className="font-semibold"><Money value={r.entry.total_amount} /></Td>
                <Td><StatusBadge status={r.entry.status} /></Td>
                <Td>
                  {r.entry.leader_confirmed_at ? (
                    <Badge tone="green">Confirmed</Badge>
                  ) : (
                    <Badge tone="slate">Pending</Badge>
                  )}
                </Td>
                <Td>
                  {r.entry.status === "DRAFT" && (
                    <Button
                      size="sm"
                      loading={busyId === r.entry.id}
                      onClick={() => setStatus(r.entry.id, "approve")}
                    >
                      Approve
                    </Button>
                  )}
                  {r.entry.status === "APPROVED" && (
                    <Button
                      size="sm"
                      variant="danger"
                      loading={busyId === r.entry.id}
                      onClick={() => setStatus(r.entry.id, "reject")}
                    >
                      Reject
                    </Button>
                  )}
                  {r.entry.status === "PAID" && (
                    <Badge tone="slate">🔒 Settled</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
          <div className="mt-3 rounded-lg bg-field-50 px-3 py-2 text-xs text-field-500">
            Status can only be changed by the facility admin. Approved entries count
            toward weekly summaries; paid entries are locked after settlement.
          </div>
        </Card>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Record work entry">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Toli">
            <SearchableSelect
              value={form.toli_id}
              onChange={(v) => setForm({ ...form, toli_id: v })}
              options={tolis.map((t) => ({ value: t.id, label: t.leader_name }))}
              placeholder="Select toli…"
              searchPlaceholder="Search tolis…"
              required
            />
          </Field>
          <Field label="Work date">
            <Input type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} required />
          </Field>
          <Field label="Bag size">
            <SearchableSelect
              value={form.bag_size_id}
              onChange={(v) => {
                setForm({ ...form, bag_size_id: v });
                setPreviewRate(null);
              }}
              options={bagSizes.map((b) => ({ value: b.id, label: `${b.size_name} (${b.weight_kg}kg)` }))}
              placeholder="Select bag size…"
              searchPlaceholder="Search bag sizes…"
              required
            />
          </Field>
          <Field label="Quantity (bags)">
            <Input type="number" min={0} value={form.quantity_bags} onChange={(e) => setForm({ ...form, quantity_bags: Number(e.target.value) })} required />
          </Field>
          <Field label="Notes (optional)">
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="rounded-lg bg-field-50 px-3 py-2 text-xs text-field-500">
            Amount = quantity × applicable rate. Facility rates override global rates automatically.
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Save entry</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
