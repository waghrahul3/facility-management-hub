import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post } from "../../lib/api";
import { useAuth } from "../../lib/auth";
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

interface BagSize { id: string; size_name: string; weight_kg: number }
interface FacilityOpt { id: string; name: string }
interface BuyerOpt { id: string; name: string; phone: string | null; city: string | null }

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
  items: Array<{
    id: string;
    order_item_id: string;
    quantity_bags: number;
    rate_per_bag: number;
    total_amount: number;
  }>;
}

interface PaymentRow {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
}

interface OrderRow {
  order: {
    id: string;
    order_number: string;
    company_id: string;
    facility_id: string;
    buyer_id: string;
    order_date: string;
    status: string;
    total_amount: number;
    notes: string | null;
    created_at: string;
  };
  company: { id: string; name: string };
  facility: { id: string; name: string };
  buyer: { id: string; name: string; phone: string | null; city: string | null };
  itemCount: number;
}

interface OrderDetail extends OrderRow {
  items: OrderItem[];
  dispatches: DispatchRow[];
  payments: PaymentRow[];
  totalBags: number;
  dispatchedBags: number;
  paidAmount: number;
  balanceAmount: number;
}

interface SalesSummary {
  pending: number;
  partiallyDispatched: number;
  completed: number;
  totalOrderValue: number;
  totalPaid: number;
  totalBalance: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function statusBadge(status: string) {
  return <StatusBadge status={status} />;
}

interface LineDraft {
  key: number;
  onion_category: string;
  bag_size_id: string;
  quantity_bags: number;
  rate_per_bag: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrdersPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isSuper = user?.role === "SUPER_ADMIN";
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [summary, setSummary] = useState<SalesSummary | null>(null);

  // Lookups
  const [buyers, setBuyers] = useState<BuyerOpt[]>([]);
  const [facilities, setFacilities] = useState<FacilityOpt[]>([]);
  const [bagSizes, setBagSizes] = useState<BagSize[]>([]);

  // Create-order modal
  const [showCreate, setShowCreate] = useState(false);
  const [orderForm, setOrderForm] = useState({
    buyer_id: "",
    facility_id: "",
    order_date: todayInput(),
    notes: "",
  });
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Detail drawer
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({
    amount: 0,
    payment_date: todayInput(),
    payment_method: "CASH",
    reference_number: "",
    notes: "",
  });
  const [payBusy, setPayBusy] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([
        api<{ orders: OrderRow[] }>("/sales/orders"),
        api<SalesSummary>("/sales/summary"),
      ]);
      setOrders(o.orders);
      setSummary(s);
    } catch {
      /* handled by caller */
    }
  }, []);

  const loadLookups = useCallback(() => {
    api<{ buyers: { buyer: BuyerOpt }[] }>("/sales/buyers").then((r) =>
      setBuyers(r.buyers.map((b) => b.buyer))
    );
    // Company admins list their facilities via /company/:companyId/facilities
    // (super admins use /super-admin/facilities).
    const listFacilities = (r: { facilities: { facility?: FacilityOpt }[] }) => {
      const list = Array.isArray(r.facilities)
        ? r.facilities.map((f: any) => (f.facility ? f.facility : f))
        : [];
      setFacilities(list);
      // Bag sizes are global — fetch them through the first facility's scope.
      if (list.length > 0) {
        api<{ bagSizes: BagSize[] }>(`/facility/${list[0].id}/bag-sizes`)
          .then((b) => setBagSizes(b.bagSizes))
          .catch(() => {});
      }
    };
    if (isSuper) {
      api<{ facilities: { facility: FacilityOpt }[] }>("/super-admin/facilities")
        .then(listFacilities)
        .catch(() => {});
    } else if (user?.companyId) {
      api<{ facilities: { facility: FacilityOpt }[] }>(`/company/${user.companyId}/facilities`)
        .then(listFacilities)
        .catch(() => {});
    }
  }, [isSuper, user?.companyId]);

  useEffect(() => {
    loadAll();
    loadLookups();
  }, [loadAll, loadLookups]);

  async function openDetail(orderId: string) {
    try {
      const r = await api<{ order: OrderDetail }>(`/sales/orders/${orderId}`);
      setDetail(r.order);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to load order") });
    }
  }

  // ---- Create order ----
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

  async function createOrder(e: FormEvent) {
    e.preventDefault();
    if (lines.length === 0) {
      setNotice({ kind: "error", text: t("Add at least one line item") });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      await post("/sales/orders", {
        ...orderForm,
        items: lines.map((l) => ({
          onion_category: l.onion_category || null,
          bag_size_id: l.bag_size_id,
          quantity_bags: Number(l.quantity_bags),
          rate_per_bag: Number(l.rate_per_bag),
        })),
      });
      setShowCreate(false);
      setLines([]);
      setOrderForm({ buyer_id: "", facility_id: "", order_date: todayInput(), notes: "" });
      setNotice({ kind: "success", text: t("Order created — the facility can now start filling it.") });
      loadAll();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to create order") });
    } finally {
      setBusy(false);
    }
  }

  // ---- Payments ----
  async function recordPayment(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setPayBusy(true);
    setNotice(null);
    try {
      await post(`/sales/orders/${detail.order.id}/payments`, {
        amount: Number(payForm.amount),
        payment_date: payForm.payment_date,
        payment_method: payForm.payment_method,
        reference_number: payForm.reference_number || null,
        notes: payForm.notes || null,
      });
      setShowPayModal(false);
      setPayForm({ amount: 0, payment_date: todayInput(), payment_method: "CASH", reference_number: "", notes: "" });
      setNotice({ kind: "success", text: t("Payment recorded.") });
      await openDetail(detail.order.id);
      loadAll();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to record payment") });
    } finally {
      setPayBusy(false);
    }
  }

  async function cancelOrder() {
    if (!detail) return;
    if (!confirm(t("Cancel order {num}?", { num: detail.order.order_number }))) return;
    try {
      await post(`/sales/orders/${detail.order.id}/cancel`);
      setDetail(null);
      setNotice({ kind: "success", text: t("Order cancelled.") });
      loadAll();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to cancel order") });
    }
  }

  if (!orders) return <LoadingScreen label={t("Loading orders…")} />;

  return (
    <div>
      <PageHeader
        title={t("Sales Orders")}
        subtitle={t("Buyer orders → facility dispatch → payments")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => (window.location.href = "/company/buyers")}>
              {t("Buyers")}
            </Button>
            <Button onClick={() => setShowCreate(true)}>{t("+ New order")}</Button>
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
            title={t("No orders yet")}
            hint={t("A buyer places an order → you create it here → the facility fills it")}
          />
        </Card>
      ) : (
        <Card>
          <Table head={[t("Order #"), t("Date"), t("Buyer"), t("Facility"), t("Items"), t("Total"), t("Status"), t("Action")]} empty={null}>
            {orders.map((r) => (
              <tr key={r.order.id} className="hover:bg-field-50/50">
                <Td className="font-mono text-xs font-semibold text-onion-800">{r.order.order_number}</Td>
                <Td>{fmtDate(r.order.order_date)}</Td>
                <Td>
                  <span className="font-medium text-field-900">{r.buyer.name}</span>
                  {r.buyer.city && <span className="block text-xs text-field-400">{r.buyer.city}</span>}
                </Td>
                <Td className="text-field-600">{r.facility.name}</Td>
                <Td>{r.itemCount}</Td>
                <Td className="font-semibold"><Money value={r.order.total_amount} /></Td>
                <Td>{statusBadge(r.order.status)}</Td>
                <Td>
                  <Button size="sm" onClick={() => openDetail(r.order.id)}>{t("View")}</Button>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {/* Create order modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t("New sales order")} wide>
        <form onSubmit={createOrder} className="space-y-4">
          <div className="rounded-lg bg-onion-50 px-3 py-2 text-xs text-onion-800">
            {t("Buyer places an order with the company → you record it here → the assigned facility fills it by loading bags onto a vehicle.")}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={t("Buyer")}>
              <SearchableSelect
                value={orderForm.buyer_id}
                onChange={(v) => setOrderForm({ ...orderForm, buyer_id: v })}
                options={buyers.map((b) => ({ value: b.id, label: b.name + (b.city ? ` (${b.city})` : "") }))}
                placeholder={t("Select buyer…")}
                searchPlaceholder={t("Search buyers…")}
                required
              />
            </Field>
            <Field label={t("Facility to fill")}>
              <SearchableSelect
                value={orderForm.facility_id}
                onChange={(v) => setOrderForm({ ...orderForm, facility_id: v })}
                options={facilities.map((f) => ({ value: f.id, label: f.name }))}
                placeholder={t("Select facility…")}
                searchPlaceholder={t("Search facilities…")}
                required
              />
            </Field>
            <Field label={t("Order date")}>
              <Input type="date" value={orderForm.order_date} onChange={(e) => setOrderForm({ ...orderForm, order_date: e.target.value })} required />
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
            <Input value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} placeholder={t("Payment terms, delivery instructions…")} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={busy}>{t("Create order")}</Button>
          </div>
        </form>
      </Modal>

      {/* Order detail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? t("Order {num}", { num: detail.order.order_number }) : ""} wide>
        {detail && (
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
                  <Button size="sm" variant="danger" onClick={cancelOrder}>{t("Cancel order")}</Button>
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
                  <Button size="sm" onClick={() => setShowPayModal(true)}>{t("+ Record payment")}</Button>
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
        )}
      </Modal>

      {/* Record payment modal */}
      <Modal open={showPayModal} onClose={() => setShowPayModal(false)} title={t("Record payment")}>
        <form onSubmit={recordPayment} className="space-y-4">
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
              <Input type="number" min={1} value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })} required />
            </Field>
            <Field label={t("Payment date")}>
              <Input type="date" value={payForm.payment_date} onChange={(e) => setPayForm({ ...payForm, payment_date: e.target.value })} required />
            </Field>
            <Field label={t("Method")}>
              <Select value={payForm.payment_method} onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })}>
                <option value="CASH">{t("Cash")}</option>
                <option value="BANK_TRANSFER">{t("Bank transfer")}</option>
                <option value="UPI">UPI</option>
                <option value="CHEQUE">{t("Cheque")}</option>
              </Select>
            </Field>
            <Field label={t("Reference no.")}>
              <Input value={payForm.reference_number} onChange={(e) => setPayForm({ ...payForm, reference_number: e.target.value })} placeholder={t("UTR / cheque no.")} />
            </Field>
          </div>
          <Field label={t("Notes (optional)")}>
            <Input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowPayModal(false)}>{t("Cancel")}</Button>
            <Button type="submit" loading={payBusy}>{t("Record payment")}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
