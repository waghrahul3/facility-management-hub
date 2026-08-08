import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post, updateCompanyAdmin } from "../../lib/api";
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
  SearchableSelect,
  Table,
  Td,
} from "../../components/ui";
import ResetPasswordModal from "../../components/ResetPasswordModal";
import EditUserModal from "../../components/EditUserModal";

interface CompanyAdmin {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company_id: string | null;
}

interface Company {
  id: string;
  name: string;
  is_active: boolean;
}

const PAGE_SIZE = 50;

export default function CompanyAdminsPage() {
  const { t } = useI18n();
  const [admins, setAdmins] = useState<CompanyAdmin[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", companyId: "" });
  const [busy, setBusy] = useState(false);
  const [resetTarget, setResetTarget] = useState<CompanyAdmin | null>(null);
  const [editTarget, setEditTarget] = useState<CompanyAdmin | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  const load = useCallback(() => {
    api<{ companyAdmins: CompanyAdmin[]; total: number }>(`/super-admin/company-admins?page=${page}&pageSize=${PAGE_SIZE}`).then((r) => {
      setAdmins(r.companyAdmins);
      setTotal(r.total);
      if (page > Math.max(1, Math.ceil(r.total / PAGE_SIZE))) {
        setPage(Math.max(1, Math.ceil(r.total / PAGE_SIZE)));
      }
    });
    api<{ companies: { company: Company }[] }>("/super-admin/companies?pageSize=200").then((r) => {
      const active = r.companies
        .map((c) => c.company)
        .filter((c) => c.is_active !== false);
      setCompanies(active);
      setForm((f) => ({ ...f, companyId: f.companyId || active[0]?.id || "" }));
    });
  }, [page]);

  useEffect(load, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await post("/super-admin/company-admins", {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        password: form.password,
        companyId: form.companyId,
      });
      setShowModal(false);
      setForm({ name: "", email: "", phone: "", password: "", companyId: companies[0]?.id ?? "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit(values: { name: string; phone: string; email: string }) {
    if (!editTarget) return;
    setEditBusy(true);
    try {
      await updateCompanyAdmin(editTarget.id, {
        name: values.name,
        phone: values.phone.trim() || null,
        email: values.email,
      });
      setEditTarget(null);
      load();
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("Company Admins")}
        subtitle={t("Administrators who oversee all facilities of a trading company")}
        action={<Button onClick={() => setShowModal(true)}>{t("+ New company admin")}</Button>}
      />

      {!admins ? (
        <LoadingScreen />
      ) : admins.length === 0 ? (
        <Card><EmptyState title={t("No company admins yet")} hint={t("Create an admin for a company")} /></Card>
      ) : (
        <Card>
          <Table head={[t("Name"), t("Email"), t("Phone"), t("Company"), t("Role"), t("Actions")]} empty={null}>
            {admins.map((a) => (
              <tr key={a.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{a.name}</Td>
                <Td>{a.email}</Td>
                <Td>{a.phone ?? "—"}</Td>
                <Td>
                  {a.company_id ? (
                    <Badge tone="blue">{companies.find((c) => c.id === a.company_id)?.name ?? t("Assigned")}</Badge>
                  ) : (
                    <Badge tone="red">{t("Unassigned")}</Badge>
                  )}
                </Td>
                <Td><Badge tone="violet">COMPANY ADMIN</Badge></Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => setEditTarget(a)}>
                      {t("Edit")}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setResetTarget(a)}>
                      {t("Reset password")}
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

      <ResetPasswordModal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        userId={resetTarget?.id ?? null}
        userName={resetTarget?.name}
      />

      <EditUserModal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={t("Edit company admin")}
        initial={editTarget ? { name: editTarget.name, phone: editTarget.phone, email: editTarget.email } : null}
        saving={editBusy}
        onSave={handleEdit}
      />

      <Modal open={showModal} onClose={() => setShowModal(false)} title={t("New company admin")}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t("Full name")}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label={t("Email")}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label={t("Phone")}>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label={t("Password")}>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </Field>
          <Field label={t("Company")}>
            <SearchableSelect
              value={form.companyId}
              onChange={(v) => setForm({ ...form, companyId: v })}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              placeholder={t("Select company…")}
              searchPlaceholder={t("Search companies…")}
              required
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={busy}>{t("Create admin")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
