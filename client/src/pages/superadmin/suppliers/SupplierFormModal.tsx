import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useI18n } from "../../../i18n";
import { Button, Field, Input, Modal } from "../../../components/ui";
import { emptySupplierForm, type SupplierFormValues } from "./types";

interface Props {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (values: SupplierFormValues) => void | Promise<void>;
  /** When set, the modal edits this supplier instead of creating a new one. */
  editing?: {
    name: string;
    email: string | null;
    phone: string | null;
    contact_person: string | null;
    address: string | null;
    city: string | null;
  } | null;
}

export default function SupplierFormModal({ open, saving, onClose, onSave, editing }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState<SupplierFormValues>(emptySupplierForm);

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          name: editing.name,
          email: editing.email ?? "",
          phone: editing.phone ?? "",
          contact_person: editing.contact_person ?? "",
          address: editing.address ?? "",
          city: editing.city ?? "",
          create_login: false,
          password: "",
        });
      } else {
        setForm(emptySupplierForm);
      }
    }
  }, [open, editing]);

  function submit(e: FormEvent) {
    e.preventDefault();
    void onSave(form);
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? t("Edit supplier") : t("New supplier")}>
      <form onSubmit={submit} className="space-y-4">
        {!editing && (
          <div className="rounded-lg bg-onion-50 px-3 py-2 text-xs text-onion-800">
            {t("Globally registered suppliers are active immediately and selectable at every facility.")}
          </div>
        )}
        <Field label={t("Supplier name")}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Email")}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label={t("Phone")}>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
        </div>
        <Field label={t("Contact person")}>
          <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Address")}>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label={t("City")}>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
        </div>

        {!editing && (
          <>
            <label className="flex items-center gap-2 text-sm text-field-700">
              <input
                type="checkbox"
                checked={form.create_login}
                onChange={(e) => setForm({ ...form, create_login: e.target.checked })}
                className="h-4 w-4 rounded border-field-300 text-onion-700 focus:ring-onion-600"
              />
              {t("Create a supplier login account")}
            </label>

            {form.create_login && (
              <Field label={t("Login password")} hint={t("The supplier signs in with the email above and this password")}>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </Field>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t("Cancel")}</Button>
          <Button type="submit" loading={saving}>{editing ? t("Save changes") : t("Create supplier")}</Button>
        </div>
      </form>
    </Modal>
  );
}
