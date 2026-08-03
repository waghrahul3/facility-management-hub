import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
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
import { fmtDate, todayInput } from "../../lib/format";

interface DropOption {
  id: string;
  drop_date: string;
  supplier: { name: string } | null;
}

interface ToliRow {
  toli: {
    id: string;
    leader_name: string;
    worker_count: number;
    daily_charge: number;
    date: string;
    status: "ACTIVE" | "COMPLETED";
  };
  drop: { id: string; rent_per_drop: number } | null;
  supplier: { id: string; name: string } | null;
}

export default function TolisPage() {
  const { user } = useAuth();
  const fid = user?.facilityId;
  const [tolis, setTolis] = useState<ToliRow[] | null>(null);
  const [drops, setDrops] = useState<DropOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    leader_name: "",
    worker_count: 0,
    daily_charge: 0,
    date: todayInput(),
    drop_id: "",
  });

  const load = useCallback(() => {
    if (!fid) return;
    api<{ tolis: ToliRow[] }>(`/facility/${fid}/tolis`).then((r) => setTolis(r.tolis));
    api<{ drops: { drop: DropOption; supplier: { name: string } | null }[] }>(
      `/facility/${fid}/supplier-drops`
    ).then((r) =>
      setDrops(
        r.drops.map((d) => ({ id: d.drop.id, drop_date: d.drop.drop_date, supplier: d.supplier }))
      )
    );
  }, [fid]);

  useEffect(load, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await post(`/facility/${fid}/tolis`, {
        leader_name: form.leader_name,
        worker_count: Number(form.worker_count),
        daily_charge: Number(form.daily_charge),
        date: form.date,
        drop_id: form.drop_id || null,
      });
      setShowModal(false);
      setForm({ leader_name: "", worker_count: 0, daily_charge: 0, date: todayInput(), drop_id: "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Tolis"
        subtitle="Daily worker groups: leader, worker count, and day charge"
        action={<Button onClick={() => setShowModal(true)}>+ Create toli</Button>}
      />

      {!tolis ? (
        <LoadingScreen />
      ) : tolis.length === 0 ? (
        <Card><EmptyState title="No tolis yet" hint="Create a toli under a supplier drop" /></Card>
      ) : (
        <Card>
          <Table head={["Leader", "Date", "Workers", "Day charge", "Drop", "Status"]} empty={null}>
            {tolis.map((r) => (
              <tr key={r.toli.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{r.toli.leader_name}</Td>
                <Td>{fmtDate(r.toli.date)}</Td>
                <Td>{r.toli.worker_count}</Td>
                <Td><Money value={r.toli.daily_charge} /></Td>
                <Td className="text-xs text-field-500">
                  {r.supplier ? `${r.supplier.name} drop` : "—"}
                </Td>
                <Td><StatusBadge status={r.toli.status} /></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Create toli">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Leader name">
            <Input value={form.leader_name} onChange={(e) => setForm({ ...form, leader_name: e.target.value })} placeholder="e.g. Mahesh Kale" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Worker count">
              <Input type="number" min={0} value={form.worker_count} onChange={(e) => setForm({ ...form, worker_count: Number(e.target.value) })} required />
            </Field>
            <Field label="Day charge (₹)">
              <Input type="number" min={0} value={form.daily_charge} onChange={(e) => setForm({ ...form, daily_charge: Number(e.target.value) })} required />
            </Field>
          </div>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label="Supplier drop (optional)">
            <SearchableSelect
              value={form.drop_id}
              onChange={(v) => setForm({ ...form, drop_id: v })}
              options={drops.map((d) => ({
                value: d.id,
                label: `${d.supplier?.name ?? "Unknown supplier"} — ${fmtDate(d.drop_date)}`,
              }))}
              placeholder="No drop"
              searchPlaceholder="Search drops…"
              allowClear
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Create toli</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
