import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post } from "../../lib/api";
import { useFacilityScope } from "../../lib/facilityScope";
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
  Select,
  StatCard,
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";
import { fmtDate, todayInput } from "../../lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrderRow {
  order: {
    id: string;
    order_number: string;
    order_date: string;
    status: string;
    total_amount: number;
  };
  company: { id: string; name: string };
  facility: { id: string; name: string };
  buyer: { id: string; name: string; phone: string | null; city: string | null };
  itemCount: number;
}

interface OrderItem {
  item: {
    id: string;
    onion_category: string | null;
    quantity_bags: number;
    rate_per_bag: number;
    total_amount: number;
  };
  bagSize: { id: string; size_name: string; weight_kg: number };
  dispatchedBags: number;
}

interface DispatchRow {
  dispatch: {
    id: string;
    vehicle_type: string;
    vehicle_number: string | null;
    destination: string | null;
    dispatch_date: string;
    notes: string | null;
  };
  items: Array<{ id: string; order_item_id: string; quantity_bags: number; rate_per_bag: number; total_amount: number }>;
}

interface OrderDetail {
  order: OrderRow["order"];
  company: { id: string; name: string };
  facility: { id: string; name: string };
  buyer: OrderRow["buyer"];
  items: OrderItem[];
  dispatches: DispatchRow[];
  totalBags: number;
  dispatchedBags: number;
}

interface SalesSummary {
  pending: number;
  partiallyDispatched: number;
  completed: number;
  totalOrderValue: number;
  totalPaid: number;
  totalBalance: number;
}

const vehicleTypes = ["TRUCK", "CONTAINER", "TRACTOR", "TEMPO", "OTHER"];

function vehicleLabel(v: string, tr: (s: string) => string): string {
  switch (v) {
    case "TRUCK": return "🚛 " + tr("Truck");
    case "CONTAINER": return "🚢 " + tr("Container");
    case "TRACTOR": return "🚜 " + tr("Tractor");
    case "TEMPO": return "🛺 " + tr("Tempo");
    default: return "🚚 " + tr("Other");
  }
}

export default function FacilitySalesPage() {
  const { facilityId: fid } = useFacilityScope();
  const { t } = useI18n();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Detail + dispatch
  const [detail, setDetail] = useState<OrderDetail | null>(null);
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

  const load = useCallback(() => {
    if (!fid) return;
    Promise.all([
      api<{ orders: OrderRow[] }>("/sales/orders").catch(() => ({ orders: [] as OrderRow[] })),
      api<SalesSummary>("/sales/summary").catch(() => null),
    ]).then(([o, s]) => {
      setOrders(o.orders);
      setSummary(s);
    });
  }, [fid]);

  useEffect(load, [load]);

  async function openDetail(orderId: string) {
    try {
      const r = await api<{ order: OrderDetail }>(`/sales/orders/${orderId}`);
      setDetail(r.order);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to load order") });
    }
  }

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
    setNotice(null);
    try {
      const items = Object.entries(loads)
        .filter(([, qty]) => qty > 0)
        .map(([order_item_id, quantity_bags]) => ({ order_item_id, quantity_bags }));
      if (items.length === 0) {
        setNotice({ kind: "error", text: t("Load at least one bag line") });
        return;
      }
      await post(`/sales/orders/${detail.order.id}/dispatch`, {
        ...dispatchForm,
        items,
      });
      setShowDispatch(false);
      setNotice({ kind: "success", text: t("Vehicle load recorded — {n} bags dispatched.", { n: items.reduce((s, i) => s + i.quantity_bags, 0) }) });
      await openDetail(detail.order.id);
      load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to record dispatch") });
    } finally {
      setBusy(false);
    }
  }

  const remainingFor = (itemId: string) => {
    if (!detail) return 0;
    const it = detail.items.find((i) => i.item.id === itemId);
    if (!it) return 0;
    return Math.max(0, it.item.quantity_bags - Number(it.dispatchedBags));
  };

  if (!orders) return <LoadingScreen label={t("Loading sales orders…")} />;

  return (
    <div>
      <PageHeader
        title={t("Sales Orders")}
        subtitle={t("Fill buyer orders by loading onion bags onto vehicles")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => (window.location.href = "/facility/loading")}>
              {t("Loading guide")}
            </Button>
          </div>
        }
      />

      {notice && (
        <div
          className={`animate-fade-in mb-5 rounded-xl border px-4 py-3 text-sm font-medium ${
            notice.kind === "success"
              ? "border-onion-200 bg-onion-50 text-onion-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label={t("Pending")} value={summary.pending} tone="amber" icon="⏳" />
          <StatCard label={t("Partial")} value={summary.partiallyDispatched} tone="blue" icon="🚛" />
          <StatCard label={t("Completed")} value={summary.completed} tone="green" icon="✅" />
          <StatCard label={t("Order value")} value={<Money value={summary.totalOrderValue} />} tone="slate" icon="🧾" />
          <StatCard label={t("Paid")} value={<Money value={summary.totalPaid} />} tone="green" icon="💰" />
          <StatCard label={t("Balance")} value={<Money value={summary.totalBalance} />} tone="violet" icon="🧮" />
        </div>
      )}

      {orders.length === 0 ? (
        <Card>
          <EmptyState
            icon="📦"
            title={t("No orders for this facility")}
            hint={t("When the company records a buyer order for your facility, it appears here to fill")}
          />
        </Card>
      ) : (
        <Card>
          <Table head={[t("Order #"), t("Date"), t("Buyer"), t("Company"), t("Items"), t("Total"), t("Status"), t("Action")]} empty={null}>
            {orders.map((r) => (
              <tr key={r.order.id} className="hover:bg-field-50/50">
                <Td className="font-mono text-xs font-semibold text-onion-800">{r.order.order_number}</Td>
                <Td>{fmtDate(r.order.order_date)}</Td>
                <Td>
                  <span className="font-medium text-field-900">{r.buyer.name}</span>
                  {r.buyer.city && <span className="block text-xs text-field-400">{r.buyer.city}</span>}
                </Td>
                <Td className="text-field-600">{r.company.name}</Td>
                <Td>{r.itemCount}</Td>
                <Td className="font-semibold"><Money value={r.order.total_amount} /></Td>
                <Td><StatusBadge status={r.order.status} /></Td>
                <Td>
                  <Button size="sm" onClick={() => openDetail(r.order.id)}>{t("Fill")}</Button>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {/* Order detail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? t("Fill {num}", { num: detail.order.order_number }) : ""} wide>
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
    </div>
  );
}
