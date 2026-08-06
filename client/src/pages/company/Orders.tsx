import { useCallback, useEffect, useState } from "react";
import { api, post } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../i18n";
import {
  Button,
  Card,
  EmptyState,
  LoadingScreen,
  Money,
  PageHeader,
  Pagination,
  StatCard,
  Table,
  Td,
} from "../../components/ui";
import { fmtDate } from "../../lib/format";
import CreateOrderModal from "./orders/CreateOrderModal";
import OrderDetailModal from "./orders/OrderDetailModal";
import PaymentModal from "./orders/PaymentModal";
import { statusBadge } from "./orders/helpers";
import type {
  BagSize,
  BuyerOpt,
  FacilityOpt,
  OrderDetail,
  OrderFormValues,
  OrderRow,
  PaymentFormValues,
  SalesSummary,
} from "./orders/types";

const PAGE_SIZE = 50;

export default function OrdersPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isSuper = user?.role === "SUPER_ADMIN";
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);

  // Lookups
  const [buyers, setBuyers] = useState<BuyerOpt[]>([]);
  const [facilities, setFacilities] = useState<FacilityOpt[]>([]);
  const [bagSizes, setBagSizes] = useState<BagSize[]>([]);

  // Modals
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([
        api<{ orders: OrderRow[]; total: number }>(`/sales/orders?page=${orderPage}&pageSize=${PAGE_SIZE}`),
        api<SalesSummary>("/sales/summary"),
      ]);
      setOrders(o.orders);
      setOrderTotal(o.total);
      if (orderPage > Math.max(1, Math.ceil(o.total / PAGE_SIZE))) {
        setOrderPage(Math.max(1, Math.ceil(o.total / PAGE_SIZE)));
      }
      setSummary(s);
    } catch {
      /* handled by caller */
    }
  }, [orderPage]);

  const loadLookups = useCallback(() => {
    api<{ buyers: { buyer: BuyerOpt }[] }>("/sales/buyers?pageSize=200").then((r) =>
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
  async function createOrder(values: OrderFormValues & { items: Array<{ onion_category: string | null; bag_size_id: string; quantity_bags: number; rate_per_bag: number }> }) {
    setNotice(null);
    try {
      await post("/sales/orders", values);
      setShowCreate(false);
      setNotice({ kind: "success", text: t("Order created — the facility can now start filling it.") });
      loadAll();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to create order") });
    }
  }

  // ---- Payments ----
  async function recordPayment(values: PaymentFormValues) {
    if (!detail) return;
    setNotice(null);
    try {
      await post(`/sales/orders/${detail.order.id}/payments`, {
        amount: Number(values.amount),
        payment_date: values.payment_date,
        payment_method: values.payment_method,
        reference_number: values.reference_number || null,
        notes: values.notes || null,
      });
      setShowPayModal(false);
      setNotice({ kind: "success", text: t("Payment recorded.") });
      await openDetail(detail.order.id);
      loadAll();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to record payment") });
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
          <Pagination
            page={orderPage}
            totalPages={Math.max(1, Math.ceil(orderTotal / PAGE_SIZE))}
            total={orderTotal}
            pageSize={PAGE_SIZE}
            onChange={setOrderPage}
          />
        </Card>
      )}

      {/* Modals */}
      <CreateOrderModal
        open={showCreate}
        buyers={buyers}
        facilities={facilities}
        bagSizes={bagSizes}
        onClose={() => setShowCreate(false)}
        onSave={createOrder}
      />
      <OrderDetailModal
        detail={detail}
        onClose={() => setDetail(null)}
        onRecordPayment={() => setShowPayModal(true)}
        onCancelOrder={cancelOrder}
      />
      <PaymentModal
        open={showPayModal}
        detail={detail}
        onClose={() => setShowPayModal(false)}
        onSave={recordPayment}
      />
    </div>
  );
}
