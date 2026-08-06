import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import { Button, Field, Input, Modal, Select } from "../../../components/ui";
import { formatMoney } from "./helpers";
import type { EntityOption, SubscriptionPlan } from "./types";

interface Props {
  open: boolean;
  plans: SubscriptionPlan[];
  companies: EntityOption[];
  suppliers: EntityOption[];
  onClose: () => void;
  onSave: (values: {
    plan_id: string;
    company_id: string;
    supplier_id: string;
    start_date: string;
    end_date: string;
    notes: string;
  }) => void | Promise<void>;
}

const empty = {
  plan_id: "",
  company_id: "",
  supplier_id: "",
  start_date: "",
  end_date: "",
  notes: "",
};

export default function SubscriptionModal({ open, plans, companies, suppliers, onClose, onSave }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (open) setForm(empty);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={t("Add Subscription")}>
      <div className="p-6">
        <h2 className="text-lg font-bold text-field-900">Add Subscription</h2>
        <div className="mt-4 space-y-4">
          <Field label="Plan">
            <Select
              value={form.plan_id}
              onChange={(e) => setForm({ ...form, plan_id: e.target.value })}
            >
              <option value="">Select plan...</option>
              {plans.filter((p) => p.is_active).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.type}) — {formatMoney(p.price)}/{p.billing_cycle}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Company (for Company plans)">
            <Select
              value={form.company_id}
              onChange={(e) => setForm({ ...form, company_id: e.target.value })}
            >
              <option value="">Select company...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Supplier (for Supplier plans)">
            <Select
              value={form.supplier_id}
              onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
            >
              <option value="">Select supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date">
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </Field>
            <Field label="End Date">
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Notes">
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional notes"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave(form)}>Create</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
