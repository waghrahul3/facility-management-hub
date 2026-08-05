import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post } from "../../lib/api";
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

interface FacilityAdmin {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  facility_id: string | null;
}

interface Facility {
  id: string;
  name: string;
  location: string;
  is_active: boolean;
}

export default function FacilityAdminsPage() {
  const { t } = useI18n();
  const [admins, setAdmins] = useState<FacilityAdmin[] | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", facilityId: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ facilityAdmins: FacilityAdmin[] }>("/super-admin/facility-admins").then((r) =>
      setAdmins(r.facilityAdmins)
    );
    api<{ facilities: Facility[] }>("/super-admin/facilities").then((r) => {
      const active = r.facilities.filter((f) => f.is_active !== false);
      setFacilities(active);
      setForm((f) => ({ ...f, facilityId: f.facilityId || active[0]?.id || "" }));
    });
  }, []);

  useEffect(load, [load]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await post("/super-admin/facility-admins", {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        password: form.password,
        facilityId: form.facilityId,
      });
      setShowModal(false);
      setForm({ name: "", email: "", phone: "", password: "", facilityId: facilities[0]?.id ?? "" });
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("Facility Admins")}
        subtitle={t("Create and manage administrators for each facility")}
        action={<Button onClick={() => setShowModal(true)}>{t("+ New admin")}</Button>}
      />

      {!admins ? (
        <LoadingScreen />
      ) : admins.length === 0 ? (
        <Card><EmptyState title={t("No facility admins yet")} hint={t("Create an admin for a facility")} /></Card>
      ) : (
        <Card>
          <Table head={[t("Name"), t("Email"), t("Phone"), t("Facility"), t("Role")]} empty={null}>
            {admins.map((a) => (
              <tr key={a.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{a.name}</Td>
                <Td>{a.email}</Td>
                <Td>{a.phone ?? "—"}</Td>
                <Td>
                  {a.facility_id ? (
                    <Badge tone="green">{facilities.find((f) => f.id === a.facility_id)?.name ?? t("Assigned")}</Badge>
                  ) : (
                    <Badge tone="red">{t("Unassigned")}</Badge>
                  )}
                </Td>
                <Td><Badge tone="blue">FACILITY ADMIN</Badge></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={t("New facility admin")}>
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
          <Field label={t("Facility")}>
            <SearchableSelect
              value={form.facilityId}
              onChange={(v) => setForm({ ...form, facilityId: v })}
              options={facilities.map((f) => ({ value: f.id, label: f.name }))}
              placeholder={t("Select facility…")}
              searchPlaceholder={t("Search facilities…")}
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
