import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post, put, updateToliLeader } from "../../lib/api";
import { useFacilityScope } from "../../lib/facilityScope";
import { useI18n } from "../../i18n";
import {
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
  Select,
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";
import { fmtDate, toDateInputValue, todayInput } from "../../lib/format";
import ResetPasswordModal from "../../components/ResetPasswordModal";

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
  // Toli leader registry row
  leader: { id: string; phone: string | null } | null;
  // Linked toli-leader login account, if one exists
  user: { id: string; name: string; email: string; phone: string | null } | null;
}

export default function TolisPage() {
  const { facilityId: fid } = useFacilityScope();
  const { t } = useI18n();
  const [tolis, setTolis] = useState<ToliRow[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [drops, setDrops] = useState<DropOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetTarget, setResetTarget] = useState<ToliRow["user"] | null>(null);
  const [editTarget, setEditTarget] = useState<ToliRow | null>(null);
  const [editForm, setEditForm] = useState({
    leader_name: "",
    phone: "",
    worker_count: 0,
    daily_charge: 0,
    date: todayInput(),
    drop_id: "",
    status: "ACTIVE" as "ACTIVE" | "COMPLETED",
  });
  const [editBusy, setEditBusy] = useState(false);
  const [editNotice, setEditNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({
    leader_name: "",
    worker_count: 0,
    daily_charge: 0,
    date: todayInput(),
    drop_id: "",
  });

  const load = useCallback(() => {
    if (!fid) return;
    api<{ tolis: ToliRow[]; total: number }>(
      `/facility/${fid}/tolis?page=${page}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(q)}&status=${status}`
    ).then((r) => {
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
  }, [fid, page, q, status]);

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

  function openEdit(r: ToliRow) {
    setEditTarget(r);
    setEditForm({
      leader_name: r.toli.leader_name,
      phone: r.leader?.phone ?? r.user?.phone ?? "",
      worker_count: r.toli.worker_count,
      daily_charge: r.toli.daily_charge,
      date: toDateInputValue(new Date(r.toli.date)),
      drop_id: r.drop?.id ?? "",
      status: r.toli.status,
    });
    setEditNotice(null);
  }

  // The drop dropdown follows the selected date: only show drops that
  // happened on that day. The edit form keeps the currently linked drop
  // selectable even if its stored date no longer matches.
  const dropDay = (d: DropOption) => toDateInputValue(new Date(d.drop_date));
  const dropsOnDate = drops.filter((d) => dropDay(d) === form.date);
  const editDropsOnDate = drops.filter((d) => dropDay(d) === editForm.date);
  const editDropOptions =
    editForm.drop_id && !editDropsOnDate.some((d) => d.id === editForm.drop_id)
      ? [...editDropsOnDate, drops.find((d) => d.id === editForm.drop_id)].filter(
          (d): d is DropOption => !!d
        )
      : editDropsOnDate;

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!editTarget || !fid) return;
    setEditNotice(null);
    setEditBusy(true);
    try {
      // Leader name + phone stay in sync across the registry, toli row and
      // any linked login account via the dedicated leader endpoint.
      await updateToliLeader(fid, editTarget.toli.id, {
        leader_name: editForm.leader_name.trim(),
        phone: editForm.phone.trim() || null,
      });
      // Operational fields update the toli row itself.
      await put(`/facility/${fid}/tolis/${editTarget.toli.id}`, {
        worker_count: Number(editForm.worker_count),
        daily_charge: Number(editForm.daily_charge),
        date: editForm.date,
        drop_id: editForm.drop_id || null,
        status: editForm.status,
      });
      setEditNotice({ kind: "success", text: t("Toli updated.") });
      setEditTarget(null);
      load();
    } catch (err) {
      setEditNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to update toli") });
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("Tolis")}
        subtitle={t("Daily worker groups: leader, worker count, and day charge")}
        action={<Button onClick={() => setShowModal(true)}>{t("+ Create toli")}</Button>}
      />

      <div className="mb-4">
        <ListFilters
          search={q}
          onSearch={(v) => {
            setQ(v);
            setPage(1);
          }}
          status={status}
          onStatus={(v) => {
            setStatus(v);
            setPage(1);
          }}
          statusOptions={[
            { value: "ACTIVE", label: t("Active") },
            { value: "COMPLETED", label: t("Completed") },
          ]}
          searchPlaceholder={t("Search leader or supplier…")}
        />
      </div>

      {!tolis ? (
        <LoadingScreen />
      ) : tolis.length === 0 ? (
        <Card>
          {q || status ? (
            <EmptyState icon="🔍" title={t("No tolis match")} hint={t("Try a different search or status filter")} />
          ) : (
            <EmptyState title={t("No tolis yet")} hint={t("Create a toli under a supplier drop")} />
          )}
        </Card>
      ) : (
        <Card>
          <Table head={[t("Leader"), t("Date"), t("Workers"), t("Day charge"), t("Drop"), t("Status"), t("Actions")]} empty={null}>
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
                <Td>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>
                      {t("Edit")}
                    </Button>
                    {r.user ? (
                      <Button size="sm" variant="secondary" onClick={() => setResetTarget(r.user)}>
                        {t("Reset password")}
                      </Button>
                    ) : null}
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
        </Card>
      )}

      <ResetPasswordModal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        userId={resetTarget?.id ?? null}
      />

      <Modal open={editTarget !== null} onClose={() => setEditTarget(null)} title={t("Edit toli")}>
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <Field label={t("Leader name")}>
            <Input
              value={editForm.leader_name}
              onChange={(e) => setEditForm({ ...editForm, leader_name: e.target.value })}
              placeholder={t("e.g. Mahesh Kale")}
              required
            />
          </Field>
          <Field label={t("Phone")}>
            <Input
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              placeholder="98xxxxxxxx"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Worker count")}>
              <Input type="number" min={0} value={editForm.worker_count} onChange={(e) => setEditForm({ ...editForm, worker_count: Number(e.target.value) })} required />
            </Field>
            <Field label={t("Day charge (₹)")}>
              <Input type="number" min={0} step="any" value={editForm.daily_charge} onChange={(e) => setEditForm({ ...editForm, daily_charge: Number(e.target.value) })} required />
            </Field>
          </div>
          <Field label={t("Date")}>
            <Input
              type="date"
              value={editForm.date}
              onChange={(e) => {
                const date = e.target.value;
                setEditForm((f) => ({
                  ...f,
                  date,
                  drop_id:
                    f.drop_id &&
                    drops.some((d) => d.id === f.drop_id && dropDay(d) === date)
                      ? f.drop_id
                      : "",
                }));
              }}
              required
            />
          </Field>
          <Field label={t("Supplier drop (optional)")}>
            <SearchableSelect
              value={editForm.drop_id}
              onChange={(v) => setEditForm({ ...editForm, drop_id: v })}
              options={editDropOptions.map((d) => ({
                value: d.id,
                label: `${d.supplier?.name ?? t("Unknown supplier")} — ${fmtDate(d.drop_date)}`,
              }))}
              placeholder={t("No drop")}
              searchPlaceholder={t("Search drops…")}
              allowClear
            />
            {editDropsOnDate.length === 0 && (
              <p className="mt-1 text-xs text-field-500">
                {t("No drops registered for this date — register the supplier drop first.")}
              </p>
            )}
          </Field>
          <Field label={t("Status")}>
            <Select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as "ACTIVE" | "COMPLETED" })}>
              <option value="ACTIVE">{t("Active")}</option>
              <option value="COMPLETED">{t("Completed")}</option>
            </Select>
          </Field>

          {editTarget?.user ? (
            <p className="rounded-lg bg-onion-50 px-3 py-2 text-xs leading-relaxed text-onion-800">
              {t("Linked login: {email} — name and phone stay in sync.", {
                email: editTarget.user.email,
              })}
            </p>
          ) : (
            <p className="rounded-lg bg-field-50 px-3 py-2 text-xs leading-relaxed text-field-500">
              {t("This leader has no login account yet — the name and phone are stored with the toli.")}
            </p>
          )}

          {editNotice && (
            <div
              className={`animate-fade-in rounded-lg border px-3 py-2 text-xs font-medium ${
                editNotice.kind === "success"
                  ? "border-onion-200 bg-onion-50 text-onion-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {editNotice.text}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditTarget(null)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" loading={editBusy}>
              {t("Save changes")}
            </Button>
          </div>
        </form>
      </Modal>

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
            <Input
              type="date"
              value={form.date}
              onChange={(e) => {
                const date = e.target.value;
                setForm((f) => ({
                  ...f,
                  date,
                  drop_id:
                    f.drop_id &&
                    drops.some((d) => d.id === f.drop_id && dropDay(d) === date)
                      ? f.drop_id
                      : "",
                }));
              }}
              required
            />
          </Field>
          <Field label={t("Supplier drop (optional)")}>
            <SearchableSelect
              value={form.drop_id}
              onChange={(v) => setForm({ ...form, drop_id: v })}
              options={dropsOnDate.map((d) => ({
                value: d.id,
                label: `${d.supplier?.name ?? t("Unknown supplier")} — ${fmtDate(d.drop_date)}`,
              }))}
              placeholder={t("No drop")}
              searchPlaceholder={t("Search drops…")}
              allowClear
            />
            {dropsOnDate.length === 0 && (
              <p className="mt-1 text-xs text-field-500">
                {t("No drops registered for this date — register the supplier drop first.")}
              </p>
            )}
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
