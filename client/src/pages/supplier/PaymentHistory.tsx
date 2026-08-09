import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useI18n } from "../../i18n";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ListFilters,
  LoadingScreen,
  Money,
  PageHeader,
  Pagination,
  StatusBadge,
  Table,
  Td,
} from "../../components/ui";
import { fmtDate } from "../../lib/format";
import ExportButtons from "../../components/ExportButtons";
import SupplierInvoiceModal from "../../components/SupplierInvoiceModal";

interface HistoryPayment {
  id: string;
  facility: { id: string; name: string } | null;
  week_start_date: string;
  week_end_date: string;
  total_worker_earnings: number;
  total_drops: number;
  total_rent_charges: number;
  net_payment: number;
  collection_status: string;
  payment_method: string | null;
  distributions: Array<{
    id: string;
    toli_id: string;
    leader_name: string | null;
    amount_distributed: number;
    distribution_date: string;
    payment_method: string;
  }>;
}

const PAGE_SIZE = 50;

export default function SupplierPaymentHistoryPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const userSupplierId = user?.supplierId ?? "";
  const [payments, setPayments] = useState<HistoryPayment[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [invoiceFor, setInvoiceFor] = useState<{ facilityId: string; weekStart: string } | null>(null);

  useEffect(() => {
    api<{ payments: HistoryPayment[]; total: number }>(
      `/supplier/payment-history?page=${page}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(q)}&status=${status}`
    ).then((r) => {
      setPayments(r.payments);
      setTotal(r.total);
      if (page > Math.max(1, Math.ceil(r.total / PAGE_SIZE))) {
        setPage(Math.max(1, Math.ceil(r.total / PAGE_SIZE)));
      }
    });
  }, [page, q, status]);

  if (!payments) return <LoadingScreen label={t("Loading payment history…")} />;

  return (
    <div>
      <PageHeader
        title={t("Payment History")}
        subtitle={t("Weekly settlements with distributions to toli leaders")}
        action={<ExportButtons reportType="distributions" />}
      />

      <div className="mb-4">
        <ListFilters
          search={q}
          onSearch={(v) => {
            setQ(v);
            setPage(1);
          }}
          status={status}
          onStatus={(v) => {
            setStatus(v);
            setPage(1);
          }}
          statusOptions={[
            { value: "PENDING", label: t("Pending") },
            { value: "COLLECTED_FROM_FACILITY", label: t("Collected from facility") },
            { value: "DISTRIBUTED_TO_WORKERS", label: t("Distributed to workers") },
          ]}
          searchPlaceholder={t("Search week date…")}
        />
      </div>

      {payments.length === 0 ? (
        <Card>
          {q || status ? (
            <EmptyState icon="🔍" title={t("No payments match")} hint={t("Try a different search or status filter")} />
          ) : (
            <EmptyState title={t("No payments yet")} hint={t("Payments appear after Sunday processing")} />
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {payments.map((p) => {
            const totalDistributed = p.distributions.reduce((s, d) => s + d.amount_distributed, 0);
            return (
              <Card
                key={p.id}
                title={t("Week of {date}", { date: fmtDate(p.week_start_date) })}
                subtitle={
                  <span className="flex items-center gap-2">
                    <StatusBadge status={p.collection_status} />
                    {p.payment_method && (
                      <Badge tone="slate">{p.payment_method.replace("_", " ")}</Badge>
                    )}
                    <Badge tone="blue">{p.facility?.name ?? ""}</Badge>
                  </span>
                }
              >
                <div className="mb-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setInvoiceFor({
                        facilityId: p.facility?.id ?? "",
                        weekStart: p.week_start_date.slice(0, 10),
                      })
                    }
                  >
                    🧾 {t("Invoice")}
                  </Button>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg bg-field-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-field-400">{t("Earnings")}</p>
                    <p className="font-display text-base font-bold text-field-900">
                      <Money value={p.total_worker_earnings} />
                    </p>
                  </div>
                  <div className="rounded-lg bg-field-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-field-400">{t("Drop rent")}</p>
                    <p className="font-display text-base font-bold text-onion-700">
                      + <Money value={p.total_rent_charges} />
                    </p>
                  </div>
                  <div className="rounded-lg bg-onion-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-onion-600">{t("Net")}</p>
                    <p className="font-display text-base font-bold text-onion-800">
                      <Money value={p.net_payment} />
                    </p>
                  </div>
                  <div className="rounded-lg bg-field-50 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-field-400">{t("Distributed")}</p>
                    <p className="font-display text-base font-bold text-field-900">
                      <Money value={totalDistributed} />
                    </p>
                  </div>
                </div>

                {p.distributions.length > 0 && (
                  <Table head={[t("Toli leader"), t("Amount"), t("Method"), t("Date")]} empty={null}>
                    {p.distributions.map((d) => (
                      <tr key={d.id}>
                        <Td className="font-medium text-field-800">
                          {d.leader_name ?? t("Unknown leader")}
                        </Td>
                        <Td className="font-semibold"><Money value={d.amount_distributed} /></Td>
                        <Td>{d.payment_method.replace("_", " ")}</Td>
                        <Td>{fmtDate(d.distribution_date)}</Td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <Pagination
        page={page}
        totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        pageSize={PAGE_SIZE}
        onChange={setPage}
      />

      <SupplierInvoiceModal
        open={invoiceFor !== null}
        onClose={() => setInvoiceFor(null)}
        supplierId={userSupplierId}
        facilityId={invoiceFor?.facilityId ?? null}
        weekStart={invoiceFor?.weekStart ?? ""}
      />
    </div>
  );
}
