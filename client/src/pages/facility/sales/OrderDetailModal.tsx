import { useState } from "react";
import type { FormEvent } from "react";
import { post } from "../../../lib/api";
import { useI18n } from "../../../i18n";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Money,
  Select,
  StatusBadge,
  Table,
  Td,
} from "../../../components/ui";
import { fmtDate, todayInput } from "../../../lib/format";
import { vehicleLabel } from "./helpers";
import { vehicleTypes, type OrderDetail } from "./types";

interface OrderDetailModalProps {
  detail: OrderDetail | null;
  onClose: () => void;
  /** Called after a successful dispatch so the parent can refresh detail + list. */
  onDispatched: (bagCount: number) => void;
  onError: (text: string) => void;
}

export default function OrderDetailModal({ detail, onClose, onDispatched, onError }: OrderDetailModalProps) {
  const { t } = useI18n();
  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatchForm, setDispatchForm] = useState({
    vehicle_type: "TRUCK",
    vehicle_number: "",
    destination: "",
    dispatch_date: todayInput(),
    notes: "",
  });
  const [loads, setLoads] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const remainingFor = (itemId: string) => {
    if (!detail) return 0;
    const it = detail.items.find((i) => i.item.id === itemId);
    if (!it) return 0;
    return Math.max(0, it.item.quantity_bags - Number(it.dispatchedBags));
  };

  function openDispatchModal() {
    if (!detail) return;
    const initial: Record<string, number> = {};
    for (const it of detail.items) {
      initial[it.item.id] = Math.max(0, it.item.quantity_bags - Number(it.dispatchedBags));
    }
    setLoads(initial);
    setDispatchForm({ vehicle_type: "TRUCK", vehicle_number: "", destination: "", dispatch_date: todayInput(), notes: "" });
    setShowDispatch(true);
  }

  async function recordDispatch(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    try {
      const items = Object.entries(loads)
        .filter(([, qty]) => qty > 0)
        .map(([order_item_id, quantity_bags]) => ({ order_item_id, quantity_bags }));
      if (items.length === 0) {
        onError(t("Load at least one bag line"));
        return;
      }
      await post(`/sales/orders/${detail.order.id}/dispatch`, {
        ...dispatchForm,
        items,
      });
      setShowDispatch(false);
      onDispatched(items.reduce((s, i) => s + i.quantity_bags, 0));
    } catch (err) {
      onError(err instanceof Error ? err.message : t("Failed to record dispatch"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Order detail */}
      <Modal open={!!detail} onClose={onClose} title={detail ? t("Fill {num}", { num: detail.order.order_number }) : ""} wide>
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-field-900">
                  {detail.buyer.name}
                  {detail.buyer.city ? ` · ${detail.buyer.city}` : ""}
                </p>
                <p className="text-xs text-field-500">
                  {detail.company.name} · {fmtDate(detail.order.order_date)}
                </p>
              </div>
              <StatusBadge status={detail.order.status} />
            </div>

            {/* Progress */}
            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-field-500">
                <span>{t("{a} of {b} bags dispatched", { a: detail.dispatchedBags, b: detail.totalBags })}</span>
                <span>{Math.round((detail.totalBags ? detail.dispatchedBags / detail.totalBags : 0) * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-field-100">
                <div
                  className="h-full rounded-full bg-onion-600 transition-all"
                  style={{ width: `${detail.totalBags ? Math.min(100, (detail.dispatchedBags / detail.totalBags) * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Order lines with remaining */}
            <Table head={[t("Category"), t("Bag size"), t("Ordered"), t("Dispatched"), t("Remaining"), t("Rate"), t("Amount")]} empty={null}>
              {detail.items.map((r) => (
                <tr key={r.item.id}>
                  <Td className="font-medium text-field-900">{r.item.onion_category ?? "—"}</Td>
                  <Td>{r.bagSize.size_name} ({r.bagSize.weight_kg}kg)</Td>
                  <Td>{r.item.quantity_bags}</Td>
                  <Td>{Number(r.dispatchedBags)}</Td>
                  <Td>
                    <Badge tone={remainingFor(r.item.id) > 0 ? "amber" : "green"}>
                      {remainingFor(r.item.id)}
                    </Badge>
                  </Td>
                  <Td><Money value={r.item.rate_per_bag} /></Td>
                  <Td className="font-semibold"><Money value={r.item.total_amount} /></Td>
                </tr>
              ))}
            </Table>

            {/* Dispatches so far */}
            {detail.dispatches.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-field-500">{t("Loads recorded")}</p>
                <div className="space-y-2">
                  {detail.dispatches.map((d) => (
                    <div key={d.dispatch.id} className="rounded-lg border border-field-100 bg-field-50/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-field-900">
                            {vehicleLabel(d.dispatch.vehicle_type, t)}
                            {d.dispatch.vehicle_number && <span className="ml-1 font-mono text-xs text-field-500">{d.dispatch.vehicle_number}</span>}
                          </p>
                          <p className="text-xs text-field-500">
                            {fmtDate(d.dispatch.dispatch_date)}
                            {d.dispatch.destination ? ` → ${d.dispatch.destination}` : ""}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-onion-800">
                          {d.items.reduce((s, i) => s + i.quantity_bags, 0)} bags
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.order.status !== "COMPLETED" && detail.order.status !== "CANCELLED" && (
              <div className="flex justify-end">
                <Button onClick={openDispatchModal}>{t("+ Record vehicle load")}</Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Dispatch (loading) modal */}
      <Modal open={showDispatch} onClose={() => setShowDispatch(false)} title={t("Record vehicle load")} wide>
        <form onSubmit={recordDispatch} className="space-y-4">
          <div className="rounded-lg bg-onion-50 px-3 py-2 text-xs text-onion-800">
            {t("🚛 Load the onion bags onto the vehicle. The order status updates automatically as bags are dispatched.")}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label={t("Vehicle")}>
              <Select value={dispatchForm.vehicle_type} onChange={(e) => setDispatchForm({ ...dispatchForm, vehicle_type: e.target.value })}>
                {vehicleTypes.map((v) => (
                  <option key={v} value={v}>{vehicleLabel(v, t)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t("Vehicle number")}>
              <Input value={dispatchForm.vehicle_number} onChange={(e) => setDispatchForm({ ...dispatchForm, vehicle_number: e.target.value })} placeholder="MH-15-AB-1234" />
            </Field>
            <Field label={t("Destination")}>
              <Input value={dispatchForm.destination} onChange={(e) => setDispatchForm({ ...dispatchForm, destination: e.target.value })} placeholder="Mumbai APMC" />
            </Field>
            <Field label={t("Load date")}>
              <Input type="date" value={dispatchForm.dispatch_date} onChange={(e) => setDispatchForm({ ...dispatchForm, dispatch_date: e.target.value })} required />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-field-600">{t("Bags to load (defaults to remaining)")}</p>
            <div className="space-y-2">
              {detail?.items.map((it) => {
                const remaining = remainingFor(it.item.id);
                if (remaining <= 0) return null;
                return (
                  <div key={it.item.id} className="grid grid-cols-[1fr_auto_110px] items-center gap-2 rounded-lg bg-field-50 p-2.5">
                    <div>
                      <p className="text-sm font-medium text-field-900">{it.item.onion_category ?? "—"}</p>
                      <p className="text-[11px] text-field-400">{it.bagSize.size_name} ({it.bagSize.weight_kg}kg) · {t("{n} remaining", { n: remaining })}</p>
                    </div>
                    <span className="text-xs font-semibold text-field-500">{t("bags:")}</span>
                    <Input
                      type="number"
                      min={0}
                      max={remaining}
                      value={loads[it.item.id] ?? 0}
                      onChange={(e) => setLoads({ ...loads, [it.item.id]: Number(e.target.value) })}
                      required
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <Field label={t("Notes (optional)")}>
            <Input value={dispatchForm.notes} onChange={(e) => setDispatchForm({ ...dispatchForm, notes: e.target.value })} placeholder={t("Weighbridge slip no., driver…")} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowDispatch(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={busy}>{t("Dispatch vehicle")}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
