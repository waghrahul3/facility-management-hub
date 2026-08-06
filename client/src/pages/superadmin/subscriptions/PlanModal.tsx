import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import { Button, Field, Input, Modal, Select } from "../../../components/ui";
import type { SubscriptionPlan } from "./types";

interface Props {
  open: boolean;
  plan: SubscriptionPlan | null;
  onClose: () => void;
  onSave: (values: {
    name: string;
    type: "COMPANY" | "SUPPLIER";
    price: number;
    billing_cycle: string;
    description: string;
  }) => void | Promise<void>;
}

export default function PlanModal({ open, plan, onClose, onSave }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: "",
    type: "COMPANY" as "COMPANY" | "SUPPLIER",
    price: 500,
    billing_cycle: "monthly",
    description: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: plan?.name ?? "",
        type: plan?.type ?? "COMPANY",
        price: plan?.price ?? 500,
        billing_cycle: plan?.billing_cycle ?? "monthly",
        description: plan?.description ?? "",
      });
    }
  }, [open, plan]);

  const close = () => {
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={t("Plan")}>
      <div className="p-6">
        <h2 className="text-lg font-bold text-field-900">{plan ? "Edit Plan" : "Add Plan"}</h2>
        <div className="mt-4 space-y-4">
          <Field label="Plan Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Company Monthly"
            />
          </Field>
          <Field label="Type">
            <Select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as "COMPANY" | "SUPPLIER" })}
            >
              <option value="COMPANY">Company</option>
              <option value="SUPPLIER">Supplier</option>
            </Select>
          </Field>
          <Field label="Price (₹)">
            <Input
              type="number"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            />
          </Field>
          <Field label="Billing Cycle">
            <Select
              value={form.billing_cycle}
              onChange={(e) => setForm({ ...form, billing_cycle: e.target.value })}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly (3 months)</option>
              <option value="half-yearly">Half-Yearly (6 months)</option>
              <option value="yearly">Yearly (12 months)</option>
            </Select>
          </Field>
          <Field label="Description">
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => onSave(form)}>
              {plan ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
