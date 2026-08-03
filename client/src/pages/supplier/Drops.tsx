import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post } from "../../lib/api";
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
import { fmtDate, todayInput, weekStartInput } from "../../lib/format";

interface Facility {
  id: string;
  name: string;
  location: string;
}

interface DropRow {
  drop: {
    id: string;
    drop_date: string;
    total_workers_dropped: number;
    rent_per_drop: number;
    status: "REGISTERED" | "COMPLETED";
  };
  facility: { id: string; name: string } | null;
}

export default function SupplierDropsPage() {
  const [drops, setDrops] = useState<DropRow[] | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [weekStart, setWeekStart] = useState(weekStartInput());
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    facility_id: "",
    drop_date: todayInput(),
    total_workers_dropped: 0,
    rent_per_drop: 0,
  });

  const load = useCallback(() => {
    api<{ drops: DropRow[] }>(`/supplier/drops?weekStart=${weekStart}`).then((r) => setDrops(r.drops));
  }, [weekStart]);

  useEffect(load, [load]);

  useEffect(() => {
    api<{ facilities: Facility[] }>("/facility/facilities").then((r) => {
      setFacilities(r.facilities);
      setForm((f) => ({ ...f, facility_id: f.facility_id || r.facilities[0]?.id || "" }));
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await post("/supplier/drops/register", {
        facility_id: form.facility_id,
        drop_date: form.drop_date,
        total_workers_dropped: Number(form.total_workers_dropped),
        rent_per_drop: Number(form.rent_per_drop),
      });
      setShowModal(false);
      setForm({ ...form, total_workers_dropped: 0, rent_per_drop: 0 });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="My Drops"
        subtitle="Register the workers you drop at each facility"
        action={<Button onClick={() => setShowModal(true)}>+ Register drop</Button>}
      />

      <Card className="mb-5">
        <Field label="Week starting">
          <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
        </Field>
      </Card>

      {!drops ? (
        <LoadingScreen />
      ) : drops.length === 0 ? (
        <Card><EmptyState title="No drops registered this week" hint="Register your first drop" /></Card>
      ) : (
        <Card>
          <Table head={["Facility", "Date", "Workers", "Rent / drop", "Status"]} empty={null}>
            {drops.map((r) => (
              <tr key={r.drop.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{r.facility?.name ?? "—"}</Td>
                <Td>{fmtDate(r.drop.drop_date)}</Td>
                <Td>{r.drop.total_workers_dropped}</Td>
                <Td><Money value={r.drop.rent_per_drop} /></Td>
                <Td><StatusBadge status={r.drop.status} /></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Register a drop">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Facility">
            <SearchableSelect
              value={form.facility_id}
              onChange={(v) => setForm({ ...form, facility_id: v })}
              options={facilities.map((f) => ({ value: f.id, label: f.name }))}
              placeholder="Select facility…"
              searchPlaceholder="Search facilities…"
              required
            />
          </Field>
          <Field label="Drop date">
            <Input type="date" value={form.drop_date} onChange={(e) => setForm({ ...form, drop_date: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Workers dropped">
              <Input type="number" min={0} value={form.total_workers_dropped} onChange={(e) => setForm({ ...form, total_workers_dropped: Number(e.target.value) })} required />
            </Field>
            <Field label="Rent per drop (₹)" hint="Negotiated with facility">
              <Input type="number" min={0} value={form.rent_per_drop} onChange={(e) => setForm({ ...form, rent_per_drop: Number(e.target.value) })} required />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Register drop</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
