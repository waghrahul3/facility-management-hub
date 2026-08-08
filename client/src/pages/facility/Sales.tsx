import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useFacilityScope } from "../../lib/facilityScope";
import { useI18n } from "../../i18n";
import {
  Button,
  Card,
  EmptyState,
  ListFilters,
  LoadingScreen,
  Money,
  PageHeader,
  Pagination,
  StatCard,
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";
import { fmtDate } from "../../lib/format";
import OrderDetailModal from "./sales/OrderDetailModal";
import { PAGE_SIZE, type OrderDetail, type OrderRow, type SalesSummary } from "./sales/types";

export default function FacilitySalesPage() {
  const { facilityId: fid } = useFacilityScope();
  const { t } = useI18n();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);

  const load = useCallback(() => {
    if (!fid) return;
    Promise.all([
      api<{ orders: OrderRow[]; total: number }>(
        `/sales/orders?page=${orderPage}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(q)}&status=${status}`
      ).catch(() => ({ orders: [] as OrderRow[], total: 0 })),
      api<SalesSummary>("/sales/summary").catch(() => null),
    ]).then(([o, s]) => {
      setOrders(o.orders);
      setOrderTotal(o.total);
      if (orderPage > Math.max(1, Math.ceil(o.total / PAGE_SIZE))) {
        setOrderPage(Math.max(1, Math.ceil(o.total / PAGE_SIZE)));
      }
      setSummary(s);
    });
  }, [fid, orderPage, q, status]);

  useEffect(load, [load]);

  const openDetail = useCallback(async (orderId: string) => {
    try {
      const r = await api<{ order: OrderDetail }>(`/sales/orders/${orderId}`);
      setDetail(r.order);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to load order") });
    }
  }, [t]);

  function handleDispatched(bagCount: number) {
    setNotice({ kind: "success", text: t("Vehicle load recorded — {n} bags dispatched.", { n: bagCount }) });
    if (detail) void openDetail(detail.order.id);
    load();
  }

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

      <div className="mb-4">
        <ListFilters
          search={q}
          onSearch={(v) => {
            setQ(v);
            setOrderPage(1);
          }}
          status={status}
          onStatus={(v) => {
            setStatus(v);
            setOrderPage(1);
          }}
          statusOptions={[
            { value: "PENDING", label: t("Pending") },
            { value: "PARTIALLY_DISPATCHED", label: t("Partial") },
            { value: "COMPLETED", label: t("Completed") },
            { value: "CANCELLED", label: t("Cancelled") },
          ]}
          searchPlaceholder={t("Search order # or buyer…")}
        />
      </div>

      {orders.length === 0 ? (
        <Card>
          {q || status ? (
            <EmptyState icon="🔍" title={t("No orders match")} hint={t("Try a different search or status filter")} />
          ) : (
            <EmptyState
              icon="📦"
              title={t("No orders for this facility")}
              hint={t("When the company records a buyer order for your facility, it appears here to fill")}
            />
          )}
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
          <Pagination
            page={orderPage}
            totalPages={Math.max(1, Math.ceil(orderTotal / PAGE_SIZE))}
            total={orderTotal}
            pageSize={PAGE_SIZE}
            onChange={setOrderPage}
          />
        </Card>
      )}

      <OrderDetailModal
        detail={detail}
        onClose={() => setDetail(null)}
        onDispatched={handleDispatched}
        onError={(text) => setNotice({ kind: "error", text })}
      />
    </div>
  );
}
