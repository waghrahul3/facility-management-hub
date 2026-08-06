import { useState } from "react";
import type { FormEvent } from "react";
import { useI18n } from "../../../i18n";
import { Button, Field, Input, Modal, SearchableSelect, Select } from "../../../components/ui";
import { todayInput } from "../../../lib/format";
import type { BagSize, BuyerOpt, FacilityOpt, LineDraft, OrderFormValues } from "./types";

interface Props {
  open: boolean;
  buyers: BuyerOpt[];
  facilities: FacilityOpt[];
  bagSizes: BagSize[];
  onClose: () => void;
  onSave: (values: OrderFormValues & { items: Array<{ onion_category: string | null; bag_size_id: string; quantity_bags: number; rate_per_bag: number }> }) => void | Promise<void>;
}

const emptyForm: OrderFormValues = {
  buyer_id: "",
  facility_id: "",
  order_date: todayInput(),
  notes: "",
};

export default function CreateOrderModal({ open, buyers, facilities, bagSizes, onClose, onSave }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState<OrderFormValues>(emptyForm);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [busy, setBusy] = useState(false);

  function reset() {
    setForm(emptyForm);
    setLines([]);
  }

  function addLine() {
    setLines((ls) => [
      ...ls,
      {
        key: Date.now() + Math.random(),
        onion_category: "",
        bag_size_id: bagSizes[0]?.id ?? "",
        quantity_bags: 0,
        rate_per_bag: 0,
      },
    ]);
  }

  function updateLine(key: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: number) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lines.length === 0) {
      alert(t("Add at least one line item"));
      return;
    }
    setBusy(true);
    try {
      await onSave({
        ...form,
        items: lines.map((l) => ({
          onion_category: l.onion_category || null,
          bag_size_id: l.bag_size_id,
          quantity_bags: Number(l.quantity_bags),
          rate_per_bag: Number(l.rate_per_bag),
        })),
      });
      reset();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("New sales order")} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-onion-50 px-3 py-2 text-xs text-onion-800">
          {t("Buyer places an order with the company → you record it here → the assigned facility fills it by loading bags onto a vehicle.")}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t("Buyer")}>
            <SearchableSelect
              value={form.buyer_id}
              onChange={(v) => setForm({ ...form, buyer_id: v })}
              options={buyers.map((b) => ({ value: b.id, label: b.name + (b.city ? ` (${b.city})` : "") }))}
              placeholder={t("Select buyer…")}
              searchPlaceholder={t("Search buyers…")}
              required
            />
          </Field>
          <Field label={t("Facility to fill")}>
            <SearchableSelect
              value={form.facility_id}
              onChange={(v) => setForm({ ...form, facility_id: v })}
              options={facilities.map((f) => ({ value: f.id, label: f.name }))}
              placeholder={t("Select facility…")}
              searchPlaceholder={t("Search facilities…")}
              required
            />
          </Field>
          <Field label={t("Order date")}>
            <Input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} required />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-field-600">{t("Line items — bags the buyer wants")}</span>
            <Button type="button" size="sm" variant="secondary" onClick={addLine}>{t("+ Add line")}</Button>
          </div>
          {lines.length === 0 ? (
            <div className="rounded-lg border border-dashed border-field-200 px-4 py-6 text-center text-sm text-field-400">
              {t("No lines yet — add the first bag line (category, bag size, qty, rate)")}
            </div>
          ) : (
            <div className="space-y-2.5">
              {lines.map((l) => (
                <div key={l.key} className="grid grid-cols-2 gap-2 rounded-lg bg-field-50 p-3 sm:grid-cols-[1fr_1fr_90px_110px_36px]">
                  <Field label={t("Category")}>
                    <Input value={l.onion_category} onChange={(e) => updateLine(l.key, { onion_category: e.target.value })} placeholder={t("Red / White / Rose")} />
                  </Field>
                  <Field label={t("Bag size")}>
                    <Select value={l.bag_size_id} onChange={(e) => updateLine(l.key, { bag_size_id: e.target.value })}>
                      {bagSizes.map((b) => (
                        <option key={b.id} value={b.id}>{b.size_name} ({b.weight_kg}kg)</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t("Bags")}>
                    <Input type="number" min={1} value={l.quantity_bags} onChange={(e) => updateLine(l.key, { quantity_bags: Number(e.target.value) })} required />
                  </Field>
                  <Field label={t("Rate / bag (₹)")}>
                    <Input type="number" min={0} value={l.rate_per_bag} onChange={(e) => updateLine(l.key, { rate_per_bag: Number(e.target.value) })} required />
                  </Field>
                  <div className="flex items-end justify-center pb-1">
                    <Button type="button" size="sm" variant="danger" onClick={() => removeLine(l.key)}>✕</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Field label={t("Notes (optional)")}>
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t("Payment terms, delivery instructions…")} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>{t("Cancel")}</Button>
          <Button type="submit" loading={busy}>{t("Create order")}</Button>
        </div>
      </form>
    </Modal>
  );
}
