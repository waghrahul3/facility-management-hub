import { useI18n } from "../../../i18n";
import { Badge, Button, Modal, Money, Table, Td } from "../../../components/ui";
import { fmtDate } from "../../../lib/format";
import { statusBadge, vehicleLabel } from "./helpers";
import type { OrderDetail } from "./types";

interface Props {
  detail: OrderDetail | null;
  onClose: () => void;
  onRecordPayment: () => void;
  onCancelOrder: () => void;
}

export default function OrderDetailModal({ detail, onClose, onRecordPayment, onCancelOrder }: Props) {
  const { t } = useI18n();
  if (!detail) return null;

  return (
    <Modal open={!!detail} onClose={onClose} title={t("Order {num}", { num: detail.order.order_number })} wide>
      <div className="space-y-5">
        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-field-900">
              {detail.buyer.name}
              {detail.buyer.city ? ` · ${detail.buyer.city}` : ""}
            </p>
            <p className="text-xs text-field-500">
              {detail.facility.name} · {fmtDate(detail.order.order_date)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge(detail.order.status)}
            {detail.order.status !== "CANCELLED" && (
              <Button size="sm" variant="danger" onClick={onCancelOrder}>{t("Cancel order")}</Button>
            )}
          </div>
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

        {/* Payment summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-field-50 p-3">
            <p className="text-[10px] font-semibold uppercase text-field-400">{t("Order total")}</p>
            <p className="font-display text-lg font-bold text-field-900"><Money value={detail.order.total_amount} /></p>
          </div>
          <div className="rounded-lg bg-onion-50 p-3">
            <p className="text-[10px] font-semibold uppercase text-onion-600">{t("Paid")}</p>
            <p className="font-display text-lg font-bold text-onion-800"><Money value={detail.paidAmount} /></p>
          </div>
          <div className="rounded-lg bg-husk-50 p-3">
            <p className="text-[10px] font-semibold uppercase text-husk-700">{t("Balance")}</p>
            <p className="font-display text-lg font-bold text-husk-800"><Money value={detail.balanceAmount} /></p>
          </div>
        </div>

        {/* Line items */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-field-500">{t("Order lines")}</p>
          </div>
          <Table head={[t("Category"), t("Bag size"), t("Qty"), t("Rate"), t("Amount"), t("Dispatched")]} empty={null}>
            {detail.items.map((r) => (
              <tr key={r.item.id}>
                <Td className="font-medium text-field-900">{r.item.onion_category ?? "—"}</Td>
                <Td>{r.bagSize.size_name} ({r.bagSize.weight_kg}kg)</Td>
                <Td>{r.item.quantity_bags}</Td>
                <Td><Money value={r.item.rate_per_bag} /></Td>
                <Td className="font-semibold"><Money value={r.item.total_amount} /></Td>
                <Td>
                  <Badge tone={Number(r.dispatchedBags) >= r.item.quantity_bags ? "green" : "amber"}>
                    {Number(r.dispatchedBags)} / {r.item.quantity_bags}
                  </Badge>
                </Td>
              </tr>
            ))}
          </Table>
        </div>

        {/* Dispatches */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-field-500">{t("Vehicle loads (dispatches)")}</p>
          {detail.dispatches.length === 0 ? (
            <div className="rounded-lg border border-dashed border-field-200 px-4 py-5 text-center text-sm text-field-400">
              {t("No loads yet — the facility fills this order from its Sales screen")}
            </div>
          ) : (
            <div className="space-y-2">
              {detail.dispatches.map((d) => (
                <div key={d.dispatch.id} className="rounded-lg border border-field-100 bg-field-50/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{vehicleLabel(d.dispatch.vehicle_type, t).split(" ")[0]}</span>
                      <div>
                        <p className="text-sm font-semibold text-field-900">
                          {vehicleLabel(d.dispatch.vehicle_type, t).split(" ").slice(1).join(" ")}
                          {d.dispatch.vehicle_number && <span className="ml-1 font-mono text-xs text-field-500">{d.dispatch.vehicle_number}</span>}
                        </p>
                        <p className="text-xs text-field-500">
                          {fmtDate(d.dispatch.dispatch_date)}
                          {d.dispatch.destination ? ` → ${d.dispatch.destination}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-onion-800">
                        <Money value={d.items.reduce((s, i) => s + i.total_amount, 0)} />
                      </p>
                      <p className="text-[11px] text-field-400">
                        {d.items.reduce((s, i) => s + i.quantity_bags, 0)} bags
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payments */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-field-500">{t("Payments received")}</p>
            {detail.order.status !== "CANCELLED" && (
              <Button size="sm" onClick={onRecordPayment}>{t("+ Record payment")}</Button>
            )}
          </div>
          {detail.payments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-field-200 px-4 py-5 text-center text-sm text-field-400">
              {t("No payments yet")}
            </div>
          ) : (
            <Table head={[t("Date"), t("Amount"), t("Method"), t("Reference"), t("Notes")]} empty={null}>
              {detail.payments.map((p) => (
                <tr key={p.id}>
                  <Td>{fmtDate(p.payment_date)}</Td>
                  <Td className="font-semibold text-onion-800"><Money value={p.amount} /></Td>
                  <Td>{p.payment_method.replace("_", " ")}</Td>
                  <Td className="font-mono text-xs">{p.reference_number ?? "—"}</Td>
                  <Td className="text-xs text-field-500">{p.notes ?? "—"}</Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </div>
    </Modal>
  );
}
