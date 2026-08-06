import { useEffect, useState } from "react";
import { useI18n } from "../../../i18n";
import { Button, Field, Input, Modal, Select } from "../../../components/ui";
import type { Subscription } from "./types";

interface Props {
  open: boolean;
  subscription: Subscription | null;
  onClose: () => void;
  onSave: (values: {
    amount: number;
    payment_date: string;
    payment_method: string;
    reference_number: string;
    notes: string;
  }) => void | Promise<void>;
}

export default function PaymentModal({ open, subscription, onClose, onSave }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    amount: 0,
    payment_date: new Date().toISOString().split("T")[0],
    payment_method: "CASH",
    reference_number: "",
    notes: "",
  });

  useEffect(() => {
    if (open && subscription) {
      setForm({
        amount: subscription.plan_price,
        payment_date: new Date().toISOString().split("T")[0],
        payment_method: "CASH",
        reference_number: "",
        notes: "",
      });
    }
  }, [open, subscription]);

  const close = () => {
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={t("Record Payment")}>
      <div className="p-6">
        <h2 className="text-lg font-bold text-field-900">Record Payment</h2>
        {subscription && (
          <p className="mt-1 text-sm text-field-500">
            {subscription.company_name || subscription.supplier_name} — {subscription.plan_name}
          </p>
        )}
        <div className="mt-4 space-y-4">
          <Field label="Amount (₹)">
            <Input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
          </Field>
          <Field label="Payment Date">
            <Input
              type="date"
              value={form.payment_date}
              onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
            />
          </Field>
          <Field label="Payment Method">
            <Select
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
            >
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="UPI">UPI</option>
            </Select>
          </Field>
          <Field label="Reference Number">
            <Input
              value={form.reference_number}
              onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
              placeholder="Optional reference"
            />
          </Field>
          <Field label="Notes">
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional notes"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => onSave(form)}>Record Payment</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
