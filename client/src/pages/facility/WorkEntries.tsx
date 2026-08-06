import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
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
  Modal,
  Money,
  PageHeader,
  Pagination,
  SearchableSelect,
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";
import { fmtDate, todayInput, weekStartInput } from "../../lib/format";
import ExportButtons from "../../components/ExportButtons";

const PAGE_SIZE = 50;

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

export default function WorkEntriesPage() {
  const { facilityId: fid } = useFacilityScope();
  const { t } = useI18n();
  const [entries, setEntries] = useState<EntryRow[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
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
    onion_category: "",
    quantity_bags: 0,
    notes: "",
  });
  const [previewRate, setPreviewRate] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!fid) return;
    api<{ entries: EntryRow[]; total: number }>(`/facility/${fid}/work-entries?weekStart=${weekStart}&page=${page}&pageSize=${PAGE_SIZE}`).then((r) => {
      setEntries(r.entries);
      setTotal(r.total);
      if (page > Math.max(1, Math.ceil(r.total / PAGE_SIZE))) {
        setPage(Math.max(1, Math.ceil(r.total / PAGE_SIZE)));
      }
    });
  }, [fid, weekStart, page]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!fid) return;
    api<{ tolis: { toli: ToliOption }[] }>(`/facility/${fid}/tolis?pageSize=200`).then((r) =>
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
        onion_category: form.onion_category || null,
        quantity_bags: Number(form.quantity_bags),
        notes: form.notes || null,
      });
      setShowModal(false);
      setForm({ ...form, onion_category: "", quantity_bags: 0, notes: "" });
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
        title={t("Work Entries")}
        subtitle={t("Record daily bags processed by each toli")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButtons reportType="work" filters={{ from: weekStart }} />
            <Button onClick={() => setShowModal(true)}>{t("+ Record work")}</Button>
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

      {!entries ? (
        <LoadingScreen />
      ) : entries.length === 0 ? (
        <Card><EmptyState title={t("No work entries this week")} hint={t("Record the first work entry")} /></Card>
      ) : (
        <Card>
          <Table head={[t("Date"), t("Toli"), t("Bag size"), t("Category"), t("Qty"), t("Rate"), t("Amount"), t("Status"), t("Leader OK"), t("Action")]} empty={null}>
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
                <Td>
                  {r.entry.status === "DRAFT" && (
                    <Button
                      size="sm"
                      loading={busyId === r.entry.id}
                      onClick={() => setStatus(r.entry.id, "approve")}
                    >
                      {t("Approve")}
                    </Button>
                  )}
                  {r.entry.status === "APPROVED" && (
                    <Button
                      size="sm"
                      variant="danger"
                      loading={busyId === r.entry.id}
                      onClick={() => setStatus(r.entry.id, "reject")}
                    >
                      {t("Reject")}
                    </Button>
                  )}
                  {r.entry.status === "PAID" && (
                    <Badge tone="slate">🔒 {t("Settled")}</Badge>
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
          <div className="mt-3 rounded-lg bg-field-50 px-3 py-2 text-xs text-field-500">
            {t("Status can only be changed by the facility admin. Approved entries count toward weekly summaries; paid entries are locked after settlement.")}
          </div>
        </Card>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={t("Record work entry")}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t("Toli")}>
            <SearchableSelect
              value={form.toli_id}
              onChange={(v) => setForm({ ...form, toli_id: v })}
              options={tolis.map((tl) => ({ value: tl.id, label: tl.leader_name }))}
              placeholder={t("Select toli…")}
              searchPlaceholder={t("Search tolis…")}
              required
            />
          </Field>
          <Field label={t("Work date")}>
            <Input type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} required />
          </Field>
          <Field label={t("Bag size")}>
            <SearchableSelect
              value={form.bag_size_id}
              onChange={(v) => {
                setForm({ ...form, bag_size_id: v });
                setPreviewRate(null);
              }}
              options={bagSizes.map((b) => ({ value: b.id, label: `${b.size_name} (${b.weight_kg}kg)` }))}
              placeholder={t("Select bag size…")}
              searchPlaceholder={t("Search bag sizes…")}
              required
            />
          </Field>
          <Field label={t("Onion category")} hint={t("e.g. Red, White, Rose, Grower grade")}>
            <Input
              value={form.onion_category}
              onChange={(e) => setForm({ ...form, onion_category: e.target.value })}
              placeholder={t("Enter onion category…")}
            />
          </Field>
          <Field label={t("Quantity (bags)")}>
            <Input type="number" min={0} value={form.quantity_bags} onChange={(e) => setForm({ ...form, quantity_bags: Number(e.target.value) })} required />
          </Field>
          <Field label={t("Notes (optional)")}>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="rounded-lg bg-field-50 px-3 py-2 text-xs text-field-500">
            {t("Amount = quantity × applicable rate. Facility rates override global rates automatically.")}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={busy}>{t("Save entry")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
