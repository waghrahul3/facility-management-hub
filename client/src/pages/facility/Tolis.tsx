import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post } from "../../lib/api";
import { useFacilityScope } from "../../lib/facilityScope";
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
  Pagination,
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

const PAGE_SIZE = 50;

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
  const { facilityId: fid } = useFacilityScope();
  const { t } = useI18n();
  const [tolis, setTolis] = useState<ToliRow[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
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
    api<{ tolis: ToliRow[]; total: number }>(`/facility/${fid}/tolis?page=${page}&pageSize=${PAGE_SIZE}`).then((r) => {
      setTolis(r.tolis);
      setTotal(r.total);
      if (page > Math.max(1, Math.ceil(r.total / PAGE_SIZE))) {
        setPage(Math.max(1, Math.ceil(r.total / PAGE_SIZE)));
      }
    });
    api<{ drops: { drop: DropOption; supplier: { name: string } | null }[] }>(
      `/facility/${fid}/supplier-drops?pageSize=200`
    ).then((r) =>
      setDrops(
        r.drops.map((d) => ({ id: d.drop.id, drop_date: d.drop.drop_date, supplier: d.supplier }))
      )
    );
  }, [fid, page]);

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
        title={t("Tolis")}
        subtitle={t("Daily worker groups: leader, worker count, and day charge")}
        action={<Button onClick={() => setShowModal(true)}>{t("+ Create toli")}</Button>}
      />

      {!tolis ? (
        <LoadingScreen />
      ) : tolis.length === 0 ? (
        <Card><EmptyState title={t("No tolis yet")} hint={t("Create a toli under a supplier drop")} /></Card>
      ) : (
        <Card>
          <Table head={[t("Leader"), t("Date"), t("Workers"), t("Day charge"), t("Drop"), t("Status")]} empty={null}>
            {tolis.map((r) => (
              <tr key={r.toli.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{r.toli.leader_name}</Td>
                <Td>{fmtDate(r.toli.date)}</Td>
                <Td>{r.toli.worker_count}</Td>
                <Td><Money value={r.toli.daily_charge} /></Td>
                <Td className="text-xs text-field-500">
                  {r.supplier ? t("{name} drop", { name: r.supplier.name }) : "—"}
                </Td>
                <Td><StatusBadge status={r.toli.status} /></Td>
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
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={t("Create toli")}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t("Leader name")}>
            <Input value={form.leader_name} onChange={(e) => setForm({ ...form, leader_name: e.target.value })} placeholder={t("e.g. Mahesh Kale")} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Worker count")}>
              <Input type="number" min={0} value={form.worker_count} onChange={(e) => setForm({ ...form, worker_count: Number(e.target.value) })} required />
            </Field>
            <Field label={t("Day charge (₹)")}>
              <Input type="number" min={0} value={form.daily_charge} onChange={(e) => setForm({ ...form, daily_charge: Number(e.target.value) })} required />
            </Field>
          </div>
          <Field label={t("Date")}>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          </Field>
          <Field label={t("Supplier drop (optional)")}>
            <SearchableSelect
              value={form.drop_id}
              onChange={(v) => setForm({ ...form, drop_id: v })}
              options={drops.map((d) => ({
                value: d.id,
                label: `${d.supplier?.name ?? t("Unknown supplier")} — ${fmtDate(d.drop_date)}`,
              }))}
              placeholder={t("No drop")}
              searchPlaceholder={t("Search drops…")}
              allowClear
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={busy}>{t("Create toli")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
