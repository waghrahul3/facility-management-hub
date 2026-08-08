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
  PageHeader,
  Table,
  Td,
} from "../../components/ui";

interface BagSize {
  id: string;
  size_name: string;
  weight_kg: number;
  is_global: boolean;
}

export default function BagSizesPage() {
  const { t } = useI18n();
  const [bagSizes, setBagSizes] = useState<BagSize[] | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BagSize | null>(null);
  const [form, setForm] = useState({ size_name: "", weight_kg: 5 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ bagSizes: BagSize[] }>("/super-admin/bag-sizes").then((r) => setBagSizes(r.bagSizes));
  }, []);

  useEffect(load, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ size_name: "", weight_kg: 5 });
    setShowModal(true);
  }

  function openEdit(b: BagSize) {
    setEditing(b);
    setForm({ size_name: b.size_name, weight_kg: b.weight_kg });
    setShowModal(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        await put(`/super-admin/bag-sizes/${editing.id}`, form);
      } else {
        await post("/super-admin/bag-sizes", form);
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
        title={t("Bag Sizes")}
        subtitle={t("Global bag sizes used across all facilities")}
        action={<Button onClick={openCreate}>{t("+ New bag size")}</Button>}
      />

      {!bagSizes ? (
        <LoadingScreen />
      ) : bagSizes.length === 0 ? (
        <Card><EmptyState title={t("No bag sizes")} hint={t("Create Small, Medium, Large sizes")} /></Card>
      ) : (
        <Card>
          <Table head={[t("Size"), t("Weight"), t("Scope")]} empty={null}>
            {bagSizes.map((b) => (
              <tr key={b.id} className="hover:bg-field-50/50">
                <Td className="font-semibold text-field-900">{b.size_name}</Td>
                <Td>{b.weight_kg} kg</Td>
                <Td>{b.is_global ? <Badge tone="green">{t("Global")}</Badge> : <Badge tone="amber">{t("Facility")}</Badge>}</Td>
                <Td>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(b)}>{t("Edit")}</Button>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? t("Edit bag size") : t("New bag size")}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t("Size name")}>
            <Input value={form.size_name} onChange={(e) => setForm({ ...form, size_name: e.target.value })} placeholder={t("e.g. Small")} required />
          </Field>
          <Field label={t("Weight (kg)")}>
            <Input
              type="number"
              min={0.1}
              step="any"
              value={form.weight_kg}
              onChange={(e) => setForm({ ...form, weight_kg: Number(e.target.value) })}
              required
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={busy}>{editing ? t("Save changes") : t("Create")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
