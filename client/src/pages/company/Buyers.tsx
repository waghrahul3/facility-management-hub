import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post, put, del } from "../../lib/api";
import { useAuth } from "../../lib/auth";
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
  PageHeader,
  Pagination,
  Table,
  Td,
} from "../../components/ui";
import { fmtDate } from "../../lib/format";

interface BuyerRow {
  buyer: {
    id: string;
    company_id: string;
    name: string;
    phone: string | null;
    address: string | null;
    city: string | null;
    is_active: boolean;
    created_at: string;
  };
  company: { id: string; name: string } | null;
}

const PAGE_SIZE = 50;

const emptyForm = { name: "", phone: "", address: "", city: "" };

export default function BuyersPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isSuper = user?.role === "SUPER_ADMIN";
  const [rows, setRows] = useState<BuyerRow[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BuyerRow["buyer"] | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(() => {
    api<{ buyers: BuyerRow[]; total: number }>(
      `/sales/buyers?page=${page}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(q)}&status=${status}`
    ).then((r) => {
      setRows(r.buyers);
      setTotal(r.total);
      if (page > Math.max(1, Math.ceil(r.total / PAGE_SIZE))) {
        setPage(Math.max(1, Math.ceil(r.total / PAGE_SIZE)));
      }
    });
  }, [page, q, status]);

  useEffect(load, [load]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(b: BuyerRow["buyer"]) {
    setEditing(b);
    setForm({
      name: b.name,
      phone: b.phone ?? "",
      address: b.address ?? "",
      city: b.city ?? "",
    });
    setShowModal(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const body = {
        name: form.name,
        phone: form.phone || null,
        address: form.address || null,
        city: form.city || null,
      };
      if (editing) {
        await put(`/sales/buyers/${editing.id}`, body);
        setNotice({ kind: "success", text: t("Buyer “{name}” updated.", { name: form.name }) });
      } else {
        await post("/sales/buyers", body);
        setNotice({ kind: "success", text: t("Buyer “{name}” registered.", { name: form.name }) });
      }
      setShowModal(false);
      load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to save buyer") });
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(b: BuyerRow["buyer"]) {
    try {
      await put(`/sales/buyers/${b.id}`, { is_active: !b.is_active });
      load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to update buyer") });
    }
  }

  async function remove(b: BuyerRow["buyer"]) {
    if (!confirm(t("Delete buyer “{name}”? This removes their history.", { name: b.name }))) return;
    try {
      await del(`/sales/buyers/${b.id}`);
      setNotice({ kind: "success", text: t("Buyer “{name}” deleted.", { name: b.name }) });
      load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to delete buyer") });
    }
  }

  if (!rows) return <LoadingScreen label={t("Loading buyers…")} />;

  return (
    <div>
      <PageHeader
        title={t("Buyers")}
        subtitle={t("The customers who place onion orders with your company")}
        action={
          <Button onClick={openAdd}>{t("+ Register buyer")}</Button>
        }
      />

      {notice && (
        <div
          className={`animate-fade-in mb-5 rounded-xl border px-4 py-3 text-sm font-medium ${
            notice.kind === "success"
              ? "border-onion-200 bg-onion-50 text-onion-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      )}

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
            { value: "INACTIVE", label: t("Inactive") },
          ]}
          searchPlaceholder={t("Search name, phone or city…")}
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          {q || status ? (
            <EmptyState icon="🔍" title={t("No buyers match")} hint={t("Try a different search or status filter")} />
          ) : (
            <EmptyState
              icon="🤝"
              title={t("No buyers yet")}
              hint={t("Register your first buyer — they can then place onion orders")}
            />
          )}
        </Card>
      ) : (
        <Card>
          <Table head={[t("Name"), t("Phone"), t("City"), t("Company"), t("Registered"), t("Status"), t("Actions")]} empty={null}>
            {rows.map((r) => (
              <tr key={r.buyer.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{r.buyer.name}</Td>
                <Td>{r.buyer.phone ?? "—"}</Td>
                <Td>{r.buyer.city ?? "—"}</Td>
                <Td className="text-field-500">{isSuper ? (r.company?.name ?? "—") : "—"}</Td>
                <Td className="text-xs text-field-400">{fmtDate(r.buyer.created_at)}</Td>
                <Td>
                  {r.buyer.is_active ? (
                    <Badge tone="green">{t("Active")}</Badge>
                  ) : (
                    <Badge tone="red">{t("Inactive")}</Badge>
                  )}
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(r.buyer)}>
                      {t("Edit")}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => toggleActive(r.buyer)}>
                      {r.buyer.is_active ? t("Disable") : t("Enable")}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(r.buyer)}>
                      {t("Delete")}
                    </Button>
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

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t("Edit {name}", { name: editing.name }) : t("Register buyer")}>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t("Buyer name")}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("e.g. Mumbai Mandi Trader")} required />
            </Field>
            <Field label={t("Phone")}>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="98xxxxxx00" />
            </Field>
            <Field label={t("City")}>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder={t("e.g. Mumbai")} />
            </Field>
            <Field label={t("Address")}>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder={t("Market yard, plot…")} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={busy}>{editing ? t("Save changes") : t("Register buyer")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
