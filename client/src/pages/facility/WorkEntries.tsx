import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post, put } from "../../lib/api";
import { useFacilityScope } from "../../lib/facilityScope";
import { useI18n } from "../../i18n";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  ListFilters,
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

interface SupplierOption {
  id: string;
  name: string;
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
  drop: { id: string; rent_per_drop: number } | null;
  supplier: { id: string; name: string } | null;
  bagSize: { id: string; size_name: string; weight_kg: number };
}

export default function WorkEntriesPage() {
  const { facilityId: fid } = useFacilityScope();
  const { t } = useI18n();
  const [entries, setEntries] = useState<EntryRow[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [bagSizes, setBagSizes] = useState<BagOption[]>([]);
  const [weekStart, setWeekStart] = useState(weekStartInput());
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState({
    supplier_id: "",
    leader_name: "",
    rent_per_drop: 0,
    work_date: todayInput(),
    bag_size_id: "",
    onion_category: "",
    notes: "",
  });
  // Step 2: inline "bags filled" editor per row
  const [bagEditId, setBagEditId] = useState<string | null>(null);
  const [bagQty, setBagQty] = useState("");

  const load = useCallback(() => {
    if (!fid) return;
    const params = new URLSearchParams({
      weekStart,
      page: String(page),
      pageSize: String(PAGE_SIZE),
      q,
      status: statusFilter,
      supplier_id: supplierFilter,
    });
    api<{ entries: EntryRow[]; total: number }>(
      `/facility/${fid}/work-entries?${params.toString()}`
    ).then((r) => {
      setEntries(r.entries);
      setTotal(r.total);
      if (page > Math.max(1, Math.ceil(r.total / PAGE_SIZE))) {
        setPage(Math.max(1, Math.ceil(r.total / PAGE_SIZE)));
      }
    });
  }, [fid, weekStart, page, q, statusFilter, supplierFilter]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!fid) return;
    api<{ suppliers: SupplierOption[] }>(`/facility/${fid}/suppliers`).then((r) =>
      setSuppliers(r.suppliers)
    );
    api<{ bagSizes: BagOption[] }>(`/facility/${fid}/bag-sizes`).then((r) => setBagSizes(r.bagSizes));
  }, [fid]);

  // Step 1: create the drop → toli → work entry chain in one submit
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await post<{ entry: EntryRow["entry"] }>(`/facility/${fid}/work-entries/quick-create`, {
        supplier_id: form.supplier_id,
        leader_name: form.leader_name,
        rent_per_drop: Number(form.rent_per_drop) || 0,
        work_date: form.work_date,
        bag_size_id: form.bag_size_id,
        onion_category: form.onion_category || null,
        notes: form.notes || null,
      });
      setShowModal(false);
      setForm({ ...form, leader_name: "", rent_per_drop: 0, onion_category: "", notes: "" });
      // Step 2: jump straight into the bags-filled editor for the new entry
      setBagEditId(r.entry.id);
      setBagQty("");
      load();
    } finally {
      setBusy(false);
    }
  }

  // Step 2: save the bags-filled count for an entry
  async function saveBags(id: string) {
    setBusyId(id);
    try {
      await put(`/facility/${fid}/work-entries/${id}`, {
        quantity_bags: Number(bagQty) || 0,
      });
      setBagEditId(null);
      setBagQty("");
      load();
    } finally {
      setBusyId(null);
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
        <div className="mt-4">
          <ListFilters
            search={q}
            onSearch={(v) => {
              setQ(v);
              setPage(1);
            }}
            status={statusFilter}
            onStatus={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            statusOptions={[
              { value: "DRAFT", label: t("Draft") },
              { value: "APPROVED", label: t("Approved") },
              { value: "PAID", label: t("Paid") },
            ]}
            searchPlaceholder={t("Search toli leader…")}
          />
          <div className="mt-3 max-w-xs">
            <SearchableSelect
              value={supplierFilter}
              onChange={(v) => {
                setSupplierFilter(v);
                setPage(1);
              }}
              options={[{ value: "", label: t("All suppliers") }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
              placeholder={t("Filter by supplier…")}
              searchPlaceholder={t("Search suppliers…")}
            />
          </div>
        </div>
      </Card>

      {!entries ? (
        <LoadingScreen />
      ) : entries.length === 0 ? (
        <Card>
          {q || statusFilter || supplierFilter ? (
            <EmptyState icon="🔍" title={t("No work entries match")} hint={t("Try a different search or status filter")} />
          ) : (
            <EmptyState title={t("No work entries this week")} hint={t("Record the first work entry")} />
          )}
        </Card>
      ) : (
        <Card>
          <Table head={[t("Date"), t("Supplier"), t("Toli"), t("Bag size"), t("Category"), t("Bags filled"), t("Rent / drop"), t("Rate"), t("Amount"), t("Status"), t("Leader OK"), t("Action")]} empty={null}>
            {entries.map((r) => (
              <tr key={r.entry.id} className="hover:bg-field-50/50">
                <Td>{fmtDate(r.entry.work_date)}</Td>
                <Td className="font-medium text-field-900">
                  {r.supplier?.name ?? <span className="text-field-300">—</span>}
                </Td>
                <Td>{r.toli.leader_name}</Td>
                <Td>{r.bagSize.size_name} ({r.bagSize.weight_kg}kg)</Td>
                <Td>{r.entry.onion_category || <span className="text-field-300">—</span>}</Td>
                <Td>
                  {r.entry.status === "PAID" ? (
                    <span className="font-semibold">{r.entry.quantity_bags}</span>
                  ) : bagEditId === r.entry.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={0}
                        value={bagQty}
                        onChange={(e) => setBagQty(e.target.value)}
                        className="w-20"
                        autoFocus
                      />
                      <Button size="sm" loading={busyId === r.entry.id} onClick={() => saveBags(r.entry.id)}>
                        {t("Save")}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold">{r.entry.quantity_bags}</span>
                      <Button size="sm" variant="secondary" onClick={() => { setBagEditId(r.entry.id); setBagQty(String(r.entry.quantity_bags || "")); }}>
                        {t("Add bags")}
                      </Button>
                    </div>
                  )}
                </Td>
                <Td>{r.drop ? <Money value={r.drop.rent_per_drop} /> : <span className="text-field-300">—</span>}</Td>
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
          <div className="rounded-lg bg-onion-50 px-3 py-2 text-xs font-medium text-onion-800">
            1 / 2 — {t("Supplier, toli leader and drop rent")}
          </div>
          <Field label={t("Supplier")}>
            <SearchableSelect
              value={form.supplier_id}
              onChange={(v) => setForm({ ...form, supplier_id: v })}
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              placeholder={t("Select supplier…")}
              searchPlaceholder={t("Search suppliers…")}
              required
            />
          </Field>
          <Field label={t("Leader name")}>
            <Input
              value={form.leader_name}
              onChange={(e) => setForm({ ...form, leader_name: e.target.value })}
              placeholder={t("Enter toli leader name…")}
              required
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("Rent of drop")} hint={t("₹ — negotiated per drop")}>
              <Input
                type="number"
                min={0}
                step={1}
                value={form.rent_per_drop}
                onChange={(e) => setForm({ ...form, rent_per_drop: Number(e.target.value) })}
                placeholder="0"
              />
            </Field>
            <Field label={t("Work date")}>
              <Input type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} required />
            </Field>
          </div>
          <Field label={t("Bag size")}>
            <SearchableSelect
              value={form.bag_size_id}
              onChange={(v) => setForm({ ...form, bag_size_id: v })}
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
          <Field label={t("Notes (optional)")}>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="rounded-lg bg-field-50 px-3 py-2 text-xs text-field-500">
            2 / 2 — {t("Add the bags-filled count right after saving, inline in the list")}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={busy}>{t("Create entry")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
