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
    notes: string | null;
    quantity_bags: number;
    rate_per_bag: number;
    total_amount: number;
    status: "DRAFT" | "APPROVED" | "PAID";
  };
  toli: { id: string; leader_name: string; worker_count: number | null };
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
    worker_count: 1,
    work_date: todayInput(),
    bag_size_id: "",
    onion_category: "",
    notes: "",
  });
  // Step 2: "Add bags" popup — the new count is previous + new bags,
  // and the drop rent can be corrected right there too.
  const [pendingBagId, setPendingBagId] = useState<string | null>(null);
  const [bagEntry, setBagEntry] = useState<EntryRow | null>(null);
  const [newBags, setNewBags] = useState("");
  const [rentInput, setRentInput] = useState("");
  // Edit modal — entry details, leader & workers, work date
  const [editEntry, setEditEntry] = useState<EntryRow | null>(null);
  const [editForm, setEditForm] = useState({
    work_date: "",
    bag_size_id: "",
    quantity: "",
    onion_category: "",
    notes: "",
    leader_name: "",
    worker_count: "",
  });

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
      // After quick-create, auto-open the bags popup for the new entry
      if (pendingBagId) {
        const found = r.entries.find((e) => e.entry.id === pendingBagId);
        if (found) {
          setBagEntry(found);
          setNewBags("");
          setRentInput(String(found.drop?.rent_per_drop ?? 0));
          setPendingBagId(null);
        }
      }
    });
  }, [fid, weekStart, page, q, statusFilter, supplierFilter, pendingBagId]);

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
        worker_count: Number(form.worker_count) || 0,
        work_date: form.work_date,
        bag_size_id: form.bag_size_id,
        onion_category: form.onion_category || null,
        notes: form.notes || null,
      });
      setShowModal(false);
      setForm({ ...form, leader_name: "", rent_per_drop: 0, onion_category: "", notes: "" });
      // Step 2: open the bags popup for the new entry as soon as the list refreshes
      setPendingBagId(r.entry.id);
      load();
    } finally {
      setBusy(false);
    }
  }

  // Step 2: save the new total = previous count + newly added bags, plus any
  // correction to the drop rent
  async function saveBagsFromModal() {
    if (!bagEntry) return;
    const previous = bagEntry.entry.quantity_bags || 0;
    const added = Number(newBags) || 0;
    setBusyId(bagEntry.entry.id);
    try {
      await put(`/facility/${fid}/work-entries/${bagEntry.entry.id}`, {
        quantity_bags: previous + added,
        rent_per_drop: Number(rentInput) || 0,
      });
      setBagEntry(null);
      setNewBags("");
      setRentInput("");
      load();
    } finally {
      setBusyId(null);
    }
  }

  function openEdit(r: EntryRow) {
    setEditEntry(r);
    setEditForm({
      work_date: r.entry.work_date.slice(0, 10),
      bag_size_id: r.bagSize.id,
      quantity: String(r.entry.quantity_bags ?? ""),
      onion_category: r.entry.onion_category ?? "",
      notes: r.entry.notes ?? "",
      leader_name: r.toli.leader_name,
      worker_count: String(r.toli.worker_count ?? ""),
    });
  }

  async function saveEdit() {
    if (!editEntry) return;
    setBusyId(editEntry.entry.id);
    try {
      await put(`/facility/${fid}/work-entries/${editEntry.entry.id}`, {
        work_date: editForm.work_date,
        bag_size_id: editForm.bag_size_id,
        quantity_bags: Number(editForm.quantity) || 0,
        onion_category: editForm.onion_category || null,
        notes: editForm.notes || null,
        leader_name: editForm.leader_name,
        worker_count: Number(editForm.worker_count) || 0,
      });
      setEditEntry(null);
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
          <Table head={[t("Date"), t("Supplier"), t("Toli"), t("Workers"), t("Bag size"), t("Category"), t("Bags filled"), t("Add bags"), t("Rent / drop"), t("Rate"), t("Amount"), t("Status"), t("Action")]} empty={null}>
            {entries.map((r) => (
              <tr key={r.entry.id} className="hover:bg-field-50/50">
                <Td>{fmtDate(r.entry.work_date)}</Td>
                <Td className="font-medium text-field-900">
                  {r.supplier?.name ?? <span className="text-field-300">—</span>}
                </Td>
                <Td>{r.toli.leader_name}</Td>
                <Td>{r.toli.worker_count ?? <span className="text-field-300">—</span>}</Td>
                <Td>{r.bagSize.size_name} ({r.bagSize.weight_kg}kg)</Td>
                <Td>{r.entry.onion_category || <span className="text-field-300">—</span>}</Td>
                <Td className="font-semibold">{r.entry.quantity_bags}</Td>
                <Td>
                  {r.entry.status === "PAID" ? (
                    <span className="text-field-300">—</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setBagEntry(r);
                        setNewBags("");
                        setRentInput(String(r.drop?.rent_per_drop ?? 0));
                      }}
                    >
                      {t("Add bags")}
                    </Button>
                  )}
                </Td>
                <Td>{r.drop ? <Money value={r.drop.rent_per_drop} /> : <span className="text-field-300">—</span>}</Td>
                <Td><Money value={r.entry.rate_per_bag} /></Td>
                <Td className="font-semibold"><Money value={r.entry.total_amount} /></Td>
                <Td><StatusBadge status={r.entry.status} /></Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    {r.entry.status !== "PAID" && (
                      <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>
                        {t("Edit")}
                      </Button>
                    )}
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
                  </div>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            <Field label={t("Worker count")}>
              <Input
                type="number"
                min={1}
                step={1}
                value={form.worker_count}
                onChange={(e) => setForm({ ...form, worker_count: Number(e.target.value) })}
                placeholder="1"
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
            2 / 2 — {t("Add the bags-filled count in the popup right after saving")}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={busy}>{t("Create entry")}</Button>
          </div>
        </form>
      </Modal>

      {/* Edit work entry — entry details, leader & workers, work date */}
      <Modal open={editEntry !== null} onClose={() => setEditEntry(null)} title={t("Edit work entry")}>
        {editEntry && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
            className="space-y-4"
          >
            <div className="rounded-lg bg-field-50 px-3 py-2 text-xs text-field-500">
              {t("Supplier")}: {editEntry.supplier?.name ?? "—"} · {t("Rent of drop")}:{" "}
              <Money value={editEntry.drop?.rent_per_drop ?? 0} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("Work date")}>
                <Input
                  type="date"
                  value={editForm.work_date}
                  onChange={(e) => setEditForm({ ...editForm, work_date: e.target.value })}
                  required
                />
              </Field>
              <Field label={t("Bag count")}>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={editForm.quantity}
                  onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                  placeholder="0"
                />
              </Field>
            </div>
            <Field label={t("Bag size")}>
              <SearchableSelect
                value={editForm.bag_size_id}
                onChange={(v) => setEditForm({ ...editForm, bag_size_id: v })}
                options={bagSizes.map((b) => ({ value: b.id, label: `${b.size_name} (${b.weight_kg}kg)` }))}
                placeholder={t("Select bag size…")}
                searchPlaceholder={t("Search bag sizes…")}
                required
              />
            </Field>
            <Field label={t("Onion category")}>
              <Input
                value={editForm.onion_category}
                onChange={(e) => setEditForm({ ...editForm, onion_category: e.target.value })}
                placeholder={t("Enter onion category…")}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("Leader name")}>
                <Input
                  value={editForm.leader_name}
                  onChange={(e) => setEditForm({ ...editForm, leader_name: e.target.value })}
                  required
                />
              </Field>
              <Field label={t("Worker count")}>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={editForm.worker_count}
                  onChange={(e) => setEditForm({ ...editForm, worker_count: e.target.value })}
                  placeholder="1"
                />
              </Field>
            </div>
            <Field label={t("Notes (optional)")}>
              <Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditEntry(null)}>
                {t("Cancel")}
              </Button>
              <Button type="submit" loading={busyId === editEntry.entry.id}>
                {t("Save changes")}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Step 2: add bags popup — new total = previous + new bags */}
      <Modal open={bagEntry !== null} onClose={() => setBagEntry(null)} title={t("Add bags")}>
        {bagEntry && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveBagsFromModal();
            }}
            className="space-y-4"
          >
            <div className="rounded-lg bg-field-50 px-3 py-2 text-xs text-field-500">
              {bagEntry.supplier?.name ?? "—"} · {bagEntry.toli.leader_name} · {fmtDate(bagEntry.entry.work_date)}
            </div>
            <div className="flex items-center justify-between rounded-lg bg-onion-50 px-3 py-2">
              <span className="text-xs font-medium text-onion-700">{t("Current bags")}</span>
              <span className="text-xl font-bold text-onion-800">{bagEntry.entry.quantity_bags}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("New bags")} hint={t("Added on top of the current count")}>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={newBags}
                  onChange={(e) => setNewBags(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
              </Field>
              <Field label={t("Rent of drop")} hint={t("₹ — negotiated per drop")}>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={rentInput}
                  onChange={(e) => setRentInput(e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-field-200 bg-white px-3 py-2">
              <span className="text-sm text-field-500">{t("Total bags")}</span>
              <span className="text-lg font-bold text-field-900">
                {(bagEntry.entry.quantity_bags || 0) + (Number(newBags) || 0)}
              </span>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setBagEntry(null)}>{t("Cancel")}</Button>
              <Button type="submit" loading={busyId === bagEntry.entry.id}>{t("Save")}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
