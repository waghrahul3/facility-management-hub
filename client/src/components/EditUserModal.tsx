import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useI18n } from "../i18n";
import { Button, Field, Input, Modal } from "./ui";

export interface EditUserValues {
  name: string;
  phone: string;
  email: string;
}

interface EditUserModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Initial profile values shown when the modal opens. */
  initial: { name: string; phone: string | null; email: string } | null;
  saving?: boolean;
  onSave: (values: EditUserValues) => void | Promise<void>;
}

/**
 * Shared admin modal for editing a user's name / phone / email.
 * Used by the Super Admin admin-management pages and the company
 * facility-admin management.
 */
export default function EditUserModal({
  open,
  onClose,
  title,
  initial,
  saving = false,
  onSave,
}: EditUserModalProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<EditUserValues>({ name: "", phone: "", email: "" });

  useEffect(() => {
    if (open && initial) {
      setForm({ name: initial.name, phone: initial.phone ?? "", email: initial.email });
    }
  }, [open, initial]);

  function submit(e: FormEvent) {
    e.preventDefault();
    void onSave(form);
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t("Name")}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label={t("Email")}>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </Field>
        <Field label={t("Phone")}>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {t("Save changes")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
