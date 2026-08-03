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
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";

interface SupplierRow {
  supplier: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    contact_person: string | null;
    address: string | null;
    city: string | null;
    status: "PENDING" | "ACTIVE";
    facility_id: string | null;
  };
  facility: { id: string; name: string } | null;
  user: { id: string; name: string; email: string } | null;
}

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  contact_person: "",
  address: "",
  city: "",
  create_login: false,
  password: "",
};

const emptyLoginForm = { email: "", password: "" };

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierRow[] | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Generate-login (activation) state
  const [loginTarget, setLoginTarget] = useState<SupplierRow["supplier"] | null>(null);
  const [loginForm, setLoginForm] = useState(emptyLoginForm);
  const [loginBusy, setLoginBusy] = useState(false);

  const load = useCallback(() => {
    api<{ suppliers: SupplierRow[] }>("/super-admin/suppliers").then((r) =>
      setSuppliers(r.suppliers)
    );
  }, []);

  useEffect(load, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await post("/super-admin/suppliers", {
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        contact_person: form.contact_person || null,
        address: form.address || null,
        city: form.city || null,
        create_login: form.create_login,
        password: form.create_login ? form.password : undefined,
      });
      const emailForLogin = form.email.trim().toLowerCase();
      setNotice(
        form.create_login
          ? {
              kind: "success",
              text: `Supplier “${form.name}” created with a login for ${emailForLogin}.\n\nPassword: ${form.password} — share these with the supplier.`,
            }
          : { kind: "success", text: `Supplier “${form.name}” created.` }
      );
      setShowModal(false);
      setForm(emptyForm);
      load();
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Failed to create supplier",
      });
    } finally {
      setBusy(false);
    }
  }

  function openLogin(target: SupplierRow["supplier"]) {
    setLoginTarget(target);
    setLoginForm({ email: target.email ?? "", password: "" });
  }

  async function handleGenerateLogin(e: FormEvent) {
    e.preventDefault();
    if (!loginTarget) return;
    setLoginBusy(true);
    setNotice(null);
    try {
      await post(`/super-admin/suppliers/${loginTarget.id}/generate-login`, {
        email: loginForm.email,
        password: loginForm.password,
      });
      setNotice({
        kind: "success",
        text: `Login generated for “${loginTarget.name}”.\n\nEmail: ${loginForm.email.trim().toLowerCase()}\nPassword: ${loginForm.password}\n\nShare these with the supplier — they are now active and selectable at every facility.`,
      });
      setLoginTarget(null);
      setLoginForm(emptyLoginForm);
      load();
    } catch (err) {
      setNotice({
        kind: "error",
        text: err instanceof Error ? err.message : "Failed to generate login",
      });
    } finally {
      setLoginBusy(false);
    }
  }

  const pendingCount = suppliers?.filter((r) => r.supplier.status === "PENDING").length ?? 0;

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Global supplier registry — facility-added suppliers activate after a login is generated"
        action={<Button onClick={() => setShowModal(true)}>+ New supplier</Button>}
      />

      {notice && (
        <div
          className={`animate-fade-in mb-4 whitespace-pre-line rounded-lg border px-4 py-3 text-sm ${
            notice.kind === "success"
              ? "border-onion-200 bg-onion-50 text-onion-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      {pendingCount > 0 && (
        <div className="animate-fade-in mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700">
            {pendingCount}
          </span>
          <p>
            <strong>Awaiting activation.</strong>{" "}
            {pendingCount === 1 ? "This supplier was added by a facility" : "These suppliers were added by facilities"}{" "}
            and becomes selectable at every facility only after you generate their login below.
          </p>
        </div>
      )}

      {!suppliers ? (
        <LoadingScreen />
      ) : suppliers.length === 0 ? (
        <Card><EmptyState title="No suppliers yet" hint="Register the first supplier" /></Card>
      ) : (
        <Card>
          <Table head={["Supplier", "Contact", "Phone", "Added by", "Status", "Login"]} empty={null}>
            {suppliers.map((r) => (
              <tr key={r.supplier.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{r.supplier.name}</Td>
                <Td>
                  {r.supplier.contact_person ?? "—"}
                  {r.supplier.email ? (
                    <span className="block text-xs text-field-400">{r.supplier.email}</span>
                  ) : null}
                </Td>
                <Td>{r.supplier.phone ?? "—"}</Td>
                <Td>
                  {r.facility ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Badge tone="slate">Facility</Badge>
                      <span className="text-xs text-field-600">{r.facility.name}</span>
                    </span>
                  ) : (
                    <Badge tone="slate">Global</Badge>
                  )}
                </Td>
                <Td>
                  {r.supplier.status === "PENDING" ? (
                    <StatusBadge status="PENDING" />
                  ) : (
                    <Badge tone="green">Active</Badge>
                  )}
                </Td>
                <Td>
                  {r.user ? (
                    <div className="flex flex-col items-start gap-0.5">
                      <Badge tone="green">Has login</Badge>
                      <span className="text-[11px] text-field-400">{r.user.email}</span>
                    </div>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => openLogin(r.supplier)}>
                      Generate login
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New supplier">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg bg-onion-50 px-3 py-2 text-xs text-onion-800">
            Globally registered suppliers are active immediately and selectable at every facility.
          </div>
          <Field label="Supplier name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
          </div>
          <Field label="Contact person">
            <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Address">
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="City">
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-field-700">
            <input
              type="checkbox"
              checked={form.create_login}
              onChange={(e) => setForm({ ...form, create_login: e.target.checked })}
              className="h-4 w-4 rounded border-field-300 text-onion-700 focus:ring-onion-600"
            />
            Create a supplier login account
          </label>

          {form.create_login && (
            <Field label="Login password" hint="The supplier signs in with the email above and this password">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </Field>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" loading={busy}>Create supplier</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={loginTarget !== null}
        onClose={() => setLoginTarget(null)}
        title={loginTarget ? `Generate login — ${loginTarget.name}` : "Generate login"}
      >
        <form onSubmit={handleGenerateLogin} className="space-y-4">
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {loginTarget?.facility_id
              ? "Registered by a facility and awaiting activation. Generating the login makes this supplier ACTIVE and selectable at every facility."
              : "This supplier has no login yet. Generating one also marks them ACTIVE."}
          </div>
          <Field label="Login email">
            <Input
              type="email"
              value={loginForm.email}
              onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
              required
            />
          </Field>
          <Field label="Password" hint="The supplier signs in with this password">
            <Input
              type="password"
              value={loginForm.password}
              onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              required
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setLoginTarget(null)}>Cancel</Button>
            <Button type="submit" loading={loginBusy}>Generate &amp; activate</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
