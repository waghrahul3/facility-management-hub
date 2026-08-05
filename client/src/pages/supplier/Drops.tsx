import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post } from "../../lib/api";
import { useI18n } from "../../i18n";
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
import ExportButtons from "../../components/ExportButtons";

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
  const { t } = useI18n();
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
        title={t("My Drops")}
        subtitle={t("Register the workers you drop at each facility")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButtons reportType="drops" filters={{ from: weekStart }} />
            <Button onClick={() => setShowModal(true)}>{t("+ Register drop")}</Button>
          </div>
        }
      />

      <Card className="mb-5">
        <Field label={t("Week starting")}>
          <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
        </Field>
      </Card>

      {!drops ? (
        <LoadingScreen />
      ) : drops.length === 0 ? (
        <Card><EmptyState title={t("No drops registered this week")} hint={t("Register your first drop")} /></Card>
      ) : (
        <Card>
          <Table head={[t("Facility"), t("Date"), t("Workers"), t("Rent / drop"), t("Status")]} empty={null}>
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

      <Modal open={showModal} onClose={() => setShowModal(false)} title={t("Register a drop")}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t("Facility")}>
            <SearchableSelect
              value={form.facility_id}
              onChange={(v) => setForm({ ...form, facility_id: v })}
              options={facilities.map((f) => ({ value: f.id, label: f.name }))}
              placeholder={t("Select facility…")}
              searchPlaceholder={t("Search facilities…")}
              required
            />
          </Field>
          <Field label={t("Drop date")}>
            <Input type="date" value={form.drop_date} onChange={(e) => setForm({ ...form, drop_date: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Workers dropped")}>
              <Input type="number" min={0} value={form.total_workers_dropped} onChange={(e) => setForm({ ...form, total_workers_dropped: Number(e.target.value) })} required />
            </Field>
            <Field label={t("Rent per drop (₹)")} hint={t("Negotiated with facility")}>
              <Input type="number" min={0} value={form.rent_per_drop} onChange={(e) => setForm({ ...form, rent_per_drop: Number(e.target.value) })} required />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={busy}>{t("Register drop")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
