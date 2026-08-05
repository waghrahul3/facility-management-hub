import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post, put } from "../../lib/api";
import { useI18n } from "../../i18n";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  LoadingScreen,
  Modal,
  Money,
  PageHeader,
  SearchableSelect,
  Table,
  Td,
} from "../../components/ui";

interface BagSize {
  id: string;
  size_name: string;
  weight_kg: number;
}

interface GlobalRate {
  id: string;
  bag_size_id: string;
  rate_amount: number;
}

export default function RatesPage() {
  const { t } = useI18n();
  const [rates, setRates] = useState<GlobalRate[] | null>(null);
  const [bagSizes, setBagSizes] = useState<BagSize[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<GlobalRate | null>(null);
  const [form, setForm] = useState({ bag_size_id: "", rate_amount: 50 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ rates: GlobalRate[] }>("/super-admin/rates").then((r) => setRates(r.rates));
    api<{ bagSizes: BagSize[] }>("/super-admin/bag-sizes").then((r) => setBagSizes(r.bagSizes));
  }, []);

  useEffect(load, [load]);

  function bagName(id: string) {
    return bagSizes.find((b) => b.id === id)?.size_name ?? "—";
  }

  function openCreate() {
    setEditing(null);
    setForm({ bag_size_id: bagSizes[0]?.id ?? "", rate_amount: 50 });
    setShowModal(true);
  }

  function openEdit(r: GlobalRate) {
    setEditing(r);
    setForm({ bag_size_id: r.bag_size_id, rate_amount: r.rate_amount });
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        await put(`/super-admin/rates/${editing.id}`, { rate_amount: form.rate_amount });
      } else {
        await post("/super-admin/rates", form);
      }
      setShowModal(false);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("Global Rates")}
        subtitle={t("Default per-bag rates for each size, applied across all facilities")}
        action={<Button onClick={openCreate}>{t("+ Set rate")}</Button>}
      />

      {!rates ? (
        <LoadingScreen />
      ) : rates.length === 0 ? (
        <Card><EmptyState title={t("No global rates")} hint={t("Set the default rate for each bag size")} /></Card>
      ) : (
        <Card>
          <Table head={[t("Bag size"), t("Rate / bag"), t("Scope"), t("Actions")]} empty={null}>
            {rates.map((r) => (
              <tr key={r.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{bagName(r.bag_size_id)}</Td>
                <Td><Money value={r.rate_amount} /></Td>
                <Td><Badge tone="green">{t("Global")}</Badge></Td>
                <Td>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(r)}>{t("Edit")}</Button>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t("Edit global rate") : t("Set global rate")}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editing && (
            <Field label={t("Bag size")}>
              <SearchableSelect
                value={form.bag_size_id}
                onChange={(v) => setForm({ ...form, bag_size_id: v })}
                options={bagSizes.map((b) => ({ value: b.id, label: `${b.size_name} (${b.weight_kg} kg)` }))}
                placeholder={t("Select bag size…")}
                searchPlaceholder={t("Search bag sizes…")}
                required
              />
            </Field>
          )}
          <Field label={t("Rate per bag (₹)")}>
            <Input
              type="number"
              min={0}
              value={form.rate_amount}
              onChange={(e) => setForm({ ...form, rate_amount: Number(e.target.value) })}
              required
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={busy}>{editing ? t("Save changes") : t("Set rate")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
