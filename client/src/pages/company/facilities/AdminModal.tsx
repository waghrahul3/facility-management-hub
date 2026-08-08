import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useI18n } from "../../../i18n";
import { Button, Field, Input, Modal, SearchableSelect } from "../../../components/ui";
import type { AdminSaveValues, FacilityRow } from "./types";

interface Props {
  open: boolean;
  facilities: FacilityRow[];
  /** Facility pre-selected when the modal is opened from a facility row. */
  initialFacilityId: string;
  saving: boolean;
  onClose: () => void;
  onSave: (values: AdminSaveValues) => void | Promise<void>;
}

const empty = { name: "", email: "", phone: "", password: "" };

export default function AdminModal({ open, facilities, initialFacilityId, saving, onClose, onSave }: Props) {
  const { t } = useI18n();
  const [facilityId, setFacilityId] = useState(initialFacilityId);
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (open) {
      setFacilityId(initialFacilityId);
      setForm(empty);
    }
  }, [open, initialFacilityId]);

  function submit(e: FormEvent) {
    e.preventDefault();
    void onSave({ facilityId, ...form });
  }

  return (
    <Modal open={open} onClose={onClose} title={t("Add facility admin")}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("Facility")}>
          <SearchableSelect
            value={facilityId}
            onChange={setFacilityId}
            options={facilities.map((r) => ({ value: r.facility.id, label: r.facility.name }))}
            placeholder={t("Select facility…")}
            searchPlaceholder={t("Search facilities…")}
            required
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("Name")}>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label={t("Email")}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </Field>
          <Field label={t("Phone")}>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label={t("Password")} hint={t("Min 8 characters")}>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {t("Create admin")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
