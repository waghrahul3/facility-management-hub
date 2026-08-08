import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useI18n } from "../../../i18n";
import { Button, Field, Input, Modal } from "../../../components/ui";
import type { FacilityRow, FacilitySaveValues } from "./types";

interface Props {
  open: boolean;
  editing: FacilityRow["facility"] | null;
  saving: boolean;
  onClose: () => void;
  onSave: (values: FacilitySaveValues) => void | Promise<void>;
}

export default function FacilityModal({ open, editing, saving, onClose, onSave }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState({ name: "", location: "", city: "", capacity: 0 });
  const [admin, setAdmin] = useState({ name: "", email: "", phone: "", password: "" });

  useEffect(() => {
    if (open) {
      setForm({
        name: editing?.name ?? "",
        location: editing?.location ?? "",
        city: editing?.city ?? "",
        capacity: editing?.capacity ?? 0,
      });
      setAdmin({ name: "", email: "", phone: "", password: "" });
    }
  }, [open, editing]);

  function submit(e: FormEvent) {
    e.preventDefault();
    void onSave({
      name: form.name,
      location: form.location,
      city: form.city || null,
      capacity: Number(form.capacity) || 0,
      admin: !editing && (admin.name || admin.email || admin.password) ? admin : undefined,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t("Edit {name}", { name: editing.name }) : t("Onboard facility")}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("Facility name")}>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("e.g. Nashik Cold Store 1")}
              required
            />
          </Field>
          <Field label={t("Location")}>
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder={t("e.g. Pimpalgaon, NH-60")}
              required
            />
          </Field>
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

        {!editing && (
          <>
            <div className="rounded-lg bg-onion-50 px-3 py-2 text-xs text-onion-800">
              {t("Optional: create this facility's admin login right away.")}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t("Admin name")}>
                <Input value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} />
              </Field>
              <Field label={t("Admin email")}>
                <Input
                  type="email"
                  value={admin.email}
                  onChange={(e) => setAdmin({ ...admin, email: e.target.value })}
                  placeholder="admin@facility.local"
                />
              </Field>
              <Field label={t("Admin phone")}>
                <Input value={admin.phone} onChange={(e) => setAdmin({ ...admin, phone: e.target.value })} />
              </Field>
              <Field label={t("Admin password")} hint={t("Min 8 characters")}>
                <Input
                  type="password"
                  value={admin.password}
                  onChange={(e) => setAdmin({ ...admin, password: e.target.value })}
                  placeholder="••••••••"
                />
              </Field>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {editing ? t("Save changes") : t("Onboard facility")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
