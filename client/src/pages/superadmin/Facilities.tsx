import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post, put, del } from "../../lib/api";
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
  PageHeader,
  SearchableSelect,
  Table,
  Td,
} from "../../components/ui";

interface Facility {
  id: string;
  name: string;
  location: string;
  city: string | null;
  capacity: number | null;
  is_active: boolean;
  company_id: string | null;
  created_at: string;
  company?: { id: string; name: string } | null;
  admin?: { id: string; name: string; email: string } | null;
}

interface CompanyOption {
  id: string;
  name: string;
  is_active: boolean;
}

const emptyForm = { name: "", location: "", city: "", capacity: 0, companyId: "" };

export default function FacilitiesPage() {
  const { t } = useI18n();
  const [facilities, setFacilities] = useState<Facility[] | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Facility | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ facilities: Facility[] }>("/super-admin/facilities").then((r) => setFacilities(r.facilities));
    api<{ companies: { company: CompanyOption }[] }>("/super-admin/companies").then((r) =>
      setCompanies(r.companies.map((c) => c.company).filter((c) => c.is_active !== false))
    );
  }, []);

  useEffect(load, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(f: Facility) {
    setEditing(f);
    setForm({
      name: f.name,
      location: f.location,
      city: f.city ?? "",
      capacity: f.capacity ?? 0,
      companyId: f.company_id ?? "",
    });
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        location: form.location,
        city: form.city || null,
        capacity: Number(form.capacity),
        company_id: form.companyId || null,
      };
      if (editing) {
        await put(`/super-admin/facilities/${editing.id}`, payload);
      } else {
        await post("/super-admin/facilities", payload);
      }
      setShowModal(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(f: Facility) {
    await put(`/super-admin/facilities/${f.id}`, { is_active: !f.is_active });
    load();
  }

  async function remove(f: Facility) {
    if (!confirm(t("Delete facility \"{name}\"? This removes its data.", { name: f.name }))) return;
    await del(`/super-admin/facilities/${f.id}`);
    load();
  }

  return (
    <div>
      <PageHeader
        title={t("Facilities")}
        subtitle={t("Manage all onion processing facilities in the network")}
        action={<Button onClick={openCreate}>{t("+ New facility")}</Button>}
      />

      {!facilities ? (
        <LoadingScreen />
      ) : facilities.length === 0 ? (
        <Card><EmptyState title={t("No facilities yet")} hint={t("Create your first facility")} /></Card>
      ) : (
        <Card>
          <Table
            head={[t("Facility"), t("Location"), t("Capacity"), t("Company"), t("Admin"), t("Status"), t("Actions")]}
            empty={null}
          >
            {facilities.map((f) => (
              <tr key={f.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{f.name}</Td>
                <Td>
                  {f.location}
                  {f.city ? <span className="text-field-400"> · {f.city}</span> : null}
                </Td>
                <Td>{t("{n} workers", { n: f.capacity ?? 0 })}</Td>
                <Td>
                  {f.company ? (
                    <Badge tone="blue">{f.company.name}</Badge>
                  ) : (
                    <span className="text-field-400">{t("Standalone")}</span>
                  )}
                </Td>
                <Td>{f.admin ? f.admin.name : <span className="text-field-400">—</span>}</Td>
                <Td>
                  {f.is_active ? <Badge tone="green">{t("Active")}</Badge> : <Badge tone="red">{t("Inactive")}</Badge>}
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(f)}>{t("Edit")}</Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(f)}>
                      {f.is_active ? t("Deactivate") : t("Activate")}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => remove(f)}>{t("Delete")}</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t("Edit facility") : t("New facility")}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t("Facility name")}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label={t("Location / address")}>
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("City")}>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label={t("Capacity (workers)")}>
              <Input
                type="number"
                min={0}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label={t("Company (optional)")} hint={t("One company can own multiple facilities")}>
            <SearchableSelect
              value={form.companyId}
              onChange={(v) => setForm({ ...form, companyId: v })}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              placeholder={t("Standalone facility (no company)")}
              searchPlaceholder={t("Search companies…")}
              allowClear
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={busy}>{editing ? t("Save changes") : t("Create facility")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
