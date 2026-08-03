import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post } from "../../lib/api";
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

export default function CompanyAdminsPage() {
  const [admins, setAdmins] = useState<CompanyAdmin[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", companyId: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ companyAdmins: CompanyAdmin[] }>("/super-admin/company-admins").then((r) =>
      setAdmins(r.companyAdmins)
    );
    api<{ companies: { company: Company }[] }>("/super-admin/companies").then((r) => {
      const active = r.companies
        .map((c) => c.company)
        .filter((c) => c.is_active !== false);
      setCompanies(active);
      setForm((f) => ({ ...f, companyId: f.companyId || active[0]?.id || "" }));
    });
  }, []);

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

  return (
    <div>
      <PageHeader
        title="Company Admins"
        subtitle="Administrators who oversee all facilities of a trading company"
        action={<Button onClick={() => setShowModal(true)}>+ New company admin</Button>}
      />

      {!admins ? (
        <LoadingScreen />
      ) : admins.length === 0 ? (
        <Card><EmptyState title="No company admins yet" hint="Create an admin for a company" /></Card>
      ) : (
        <Card>
          <Table head={["Name", "Email", "Phone", "Company", "Role"]} empty={null}>
            {admins.map((a) => (
              <tr key={a.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{a.name}</Td>
                <Td>{a.email}</Td>
                <Td>{a.phone ?? "—"}</Td>
                <Td>
                  {a.company_id ? (
                    <Badge tone="blue">{companies.find((c) => c.id === a.company_id)?.name ?? "Assigned"}</Badge>
                  ) : (
                    <Badge tone="red">Unassigned</Badge>
                  )}
                </Td>
                <Td><Badge tone="violet">COMPANY ADMIN</Badge></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New company admin">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Full name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="Password">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </Field>
          <Field label="Company">
            <SearchableSelect
              value={form.companyId}
              onChange={(v) => setForm({ ...form, companyId: v })}
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Select company…"
              searchPlaceholder="Search companies…"
              required
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Create admin</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
