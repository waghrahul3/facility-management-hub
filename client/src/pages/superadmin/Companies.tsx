import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, del, post, put } from "../../lib/api";
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
  Pagination,
  Table,
  Td,
} from "../../components/ui";

interface Company {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  is_active: boolean;
  facilityCount: number;
  adminName: string | null;
  adminEmail: string | null;
}

const PAGE_SIZE = 50;

const emptyForm = {
  name: "",
  contact_person: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  adminName: "",
  adminEmail: "",
  adminPhone: "",
  adminPassword: "",
};

export default function CompaniesPage() {
  const { t } = useI18n();
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{
      companies: { company: Omit<Company, "facilityCount" | "adminName" | "adminEmail">; facilityCount: number; adminName: string | null; adminEmail: string | null }[];
      total: number;
    }>(`/super-admin/companies?page=${page}&pageSize=${PAGE_SIZE}`).then((r) => {
      setCompanies(
        r.companies.map((row) => ({
          ...row.company,
          facilityCount: row.facilityCount,
          adminName: row.adminName,
          adminEmail: row.adminEmail,
        }))
      );
      setTotal(r.total);
      if (page > Math.max(1, Math.ceil(r.total / PAGE_SIZE))) {
        setPage(Math.max(1, Math.ceil(r.total / PAGE_SIZE)));
      }
    });
  }, [page]);

  useEffect(load, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setShowModal(true);
  }

  function openEdit(c: Company) {
    setEditing(c);
    setForm({
      name: c.name,
      contact_person: c.contact_person ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      adminName: "",
      adminEmail: "",
      adminPhone: "",
      adminPassword: "",
    });
    setError(null);
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        contact_person: form.contact_person || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        city: form.city || null,
      };
      if (editing) {
        await put(`/super-admin/companies/${editing.id}`, payload);
      } else {
        // New companies are registered together with their first company admin
        const hasAdmin = form.adminName || form.adminEmail || form.adminPassword || form.adminPhone;
        if (hasAdmin) {
          payload.admin = {
            name: form.adminName,
            email: form.adminEmail,
            phone: form.adminPhone || null,
            password: form.adminPassword,
          };
        }
        await post("/super-admin/companies", payload);
      }
      setShowModal(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(c: Company) {
    await put(`/super-admin/companies/${c.id}`, { is_active: !c.is_active });
    load();
  }

  async function remove(c: Company) {
    if (!confirm(t("Delete company \"{name}\"? Its facilities will be unassigned.", { name: c.name }))) return;
    await del(`/super-admin/companies/${c.id}`);
    load();
  }

  return (
    <div>
      <PageHeader
        title={t("Companies")}
        subtitle={t("Trading companies that own one or more onion processing facilities")}
        action={<Button onClick={openCreate}>{t("+ New company")}</Button>}
      />

      {!companies ? (
        <LoadingScreen />
      ) : companies.length === 0 ? (
        <Card><EmptyState title={t("No companies yet")} hint={t("Register the first trading company")} /></Card>
      ) : (
        <Card>
          <Table
            head={[t("Company"), t("Contact"), t("Phone"), t("City"), t("Company admin"), t("Facilities"), t("Status"), t("Actions")]}
            empty={null}
          >
            {companies.map((c) => (
              <tr key={c.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{c.name}</Td>
                <Td>
                  {c.contact_person ?? "—"}
                  {c.email ? <span className="block text-xs text-field-400">{c.email}</span> : null}
                </Td>
                <Td>{c.phone ?? "—"}</Td>
                <Td>{c.city ?? "—"}</Td>
                <Td>
                  {c.adminName ? (
                    <span>
                      <span className="font-medium text-field-800">{c.adminName}</span>
                      <span className="block text-xs text-field-400">{c.adminEmail}</span>
                    </span>
                  ) : (
                    <span className="text-field-400">—</span>
                  )}
                </Td>
                <Td><Badge tone="blue">{t("{n} facilities", { n: c.facilityCount })}</Badge></Td>
                <Td>
                  {c.is_active ? <Badge tone="green">{t("Active")}</Badge> : <Badge tone="red">{t("Inactive")}</Badge>}
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openEdit(c)}>{t("Edit")}</Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(c)}>
                      {c.is_active ? t("Deactivate") : t("Activate")}
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => remove(c)}>{t("Delete")}</Button>
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

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t("Edit company") : t("New company")}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg bg-onion-50 px-3 py-2 text-xs text-onion-800">
            {t("A company owns one or more facilities. Its admin can oversee all of them after sign-in.")}
          </div>
          <Field label={t("Company name")}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label={t("Contact person")}>
            <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Email")}>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label={t("Phone")}>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Address")}>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label={t("City")}>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
          </div>

          {!editing && (
            <div className="rounded-xl border border-field-200 bg-field-50/40 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-field-500">
                {t("Company admin login")}
              </p>
              <p className="-mt-2 mb-3 text-[11px] text-field-400">
                {t("The admin is created with the company and can sign in immediately.")}
              </p>
              <div className="space-y-3">
                <Field label={t("Admin full name")}>
                  <Input
                    value={form.adminName}
                    onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                    placeholder={t("e.g. Santosh Deshmukh")}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("Admin email")}>
                    <Input
                      type="email"
                      value={form.adminEmail}
                      onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                      placeholder="admin@company.com"
                    />
                  </Field>
                  <Field label={t("Admin phone")}>
                    <Input
                      value={form.adminPhone}
                      onChange={(e) => setForm({ ...form, adminPhone: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label={t("Temporary password")}>
                  <Input
                    type="password"
                    value={form.adminPassword}
                    onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                    placeholder={t("Min. 6 characters")}
                    minLength={6}
                  />
                </Field>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={busy}>{editing ? t("Save changes") : t("Create company")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
