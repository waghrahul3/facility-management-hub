import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useI18n } from "../../../i18n";
import { Button, Field, Input, Modal, Money, Select } from "../../../components/ui";
import { todayInput } from "../../../lib/format";
import type { OrderDetail, PaymentFormValues } from "./types";

interface Props {
  open: boolean;
  detail: OrderDetail | null;
  onClose: () => void;
  onSave: (values: PaymentFormValues) => void | Promise<void>;
}

const emptyForm: PaymentFormValues = {
  amount: 0,
  payment_date: todayInput(),
  payment_method: "CASH",
  reference_number: "",
  notes: "",
};

export default function PaymentModal({ open, detail, onClose, onSave }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState<PaymentFormValues>(emptyForm);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && detail) {
      setForm({ ...emptyForm, amount: detail.balanceAmount });
    }
  }, [open, detail]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(form);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("Record payment")}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-onion-50 px-3 py-2 text-xs text-onion-800">
          {detail && (
            <>
              {t("Order total")} <strong><Money value={detail.order.total_amount} /></strong> · {t("Paid")}{" "}
              <strong><Money value={detail.paidAmount} /></strong> · {t("Balance")}{" "}
              <strong><Money value={detail.balanceAmount} /></strong>
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Amount (₹)")}>
            <Input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required />
          </Field>
          <Field label={t("Payment date")}>
            <Input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} required />
          </Field>
          <Field label={t("Method")}>
            <Select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
              <option value="CASH">{t("Cash")}</option>
              <option value="BANK_TRANSFER">{t("Bank transfer")}</option>
              <option value="UPI">UPI</option>
              <option value="CHEQUE">{t("Cheque")}</option>
            </Select>
          </Field>
          <Field label={t("Reference no.")}>
            <Input value={form.reference_number} onChange={(e) => setForm({ ...form, reference_number: e.target.value })} placeholder={t("UTR / cheque no.")} />
          </Field>
        </div>
        <Field label={t("Notes (optional)")}>
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t("Cancel")}</Button>
          <Button type="submit" loading={busy}>{t("Record payment")}</Button>
        </div>
      </form>
    </Modal>
  );
}
