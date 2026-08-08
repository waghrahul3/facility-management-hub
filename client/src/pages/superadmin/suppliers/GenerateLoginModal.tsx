import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useI18n } from "../../../i18n";
import { Button, Field, Input, Modal } from "../../../components/ui";
import type { LoginFormValues, SupplierRow } from "./types";

interface Props {
  open: boolean;
  supplier: SupplierRow["supplier"] | null;
  saving: boolean;
  onClose: () => void;
  onSave: (values: LoginFormValues) => void | Promise<void>;
}

const empty = { email: "", password: "" };

export default function GenerateLoginModal({ open, supplier, saving, onClose, onSave }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState<LoginFormValues>(empty);

  useEffect(() => {
    if (open) setForm({ email: supplier?.email ?? "", password: "" });
  }, [open, supplier]);

  function submit(e: FormEvent) {
    e.preventDefault();
    void onSave(form);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={supplier ? t("Generate login — {name}", { name: supplier.name }) : t("Generate login")}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {supplier?.facility_id
            ? t("Registered by a facility and awaiting activation. Generating the login makes this supplier ACTIVE and selectable at every facility.")
            : t("This supplier has no login yet. Generating one also marks them ACTIVE.")}
        </div>
        <Field label={t("Login email")}>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </Field>
        <Field label={t("Password")} hint={t("The supplier signs in with this password")}>
          <Input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t("Cancel")}</Button>
          <Button type="submit" loading={saving}>{t("Generate & activate")}</Button>
        </div>
      </form>
    </Modal>
  );
}
