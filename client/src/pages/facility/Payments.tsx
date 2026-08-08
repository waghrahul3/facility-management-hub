import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, post, put, listFacilityAdvances, recordAdvance, deleteAdvance } from "../../lib/api";
import type { FacilityAdvanceRow } from "../../lib/api";
import { useFacilityScope } from "../../lib/facilityScope";
import { useI18n } from "../../i18n";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  ListFilters,
  LoadingScreen,
  Modal,
  Money,
  PageHeader,
  Pagination,
  SearchableSelect,
  Select,
  Table,
  Td,
} from "../../components/ui";
import { fmtDate, todayInput, weekStartInput } from "../../lib/format";
import ExportButtons from "../../components/ExportButtons";
import SupplierInvoiceModal from "../../components/SupplierInvoiceModal";
import SupplierAdvanceStatementModal from "../../components/SupplierAdvanceStatementModal";

const PAGE_SIZE = 50;

interface PendingPayment {
  payment: {
    id: string;
    supplier_id: string;
    week_start_date: string;
    total_worker_earnings: number;
    total_drops: number;
    total_rent_charges: number;
    net_payment: number;
    advance_deducted: number;
    advance_balance_before: number;
    collection_status: string;
    payment_method: string | null;
  };
  supplier: { id: string; name: string };
  outstanding_advance: number;
}

interface HistoryRow {
  payment: {
    id: string;
    week_start_date: string;
    total_worker_earnings: number;
    total_rent_charges: number;
    net_payment: number;
    advance_deducted: number;
    collection_status: string;
    payment_method: string | null;
  };
  supplier: { id: string; name: string };
}

interface FacilitySupplier {
  id: string;
  name: string;
}

export default function PaymentsPage() {
  const { facilityId: fid } = useFacilityScope();
  const { t } = useI18n();
  const [pending, setPending] = useState<PendingPayment[] | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [weekStart, setWeekStart] = useState(weekStartInput());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<{ supplierId: string; weekStart: string } | null>(null);
  const [statementFor, setStatementFor] = useState<{ supplierId: string; supplierName: string } | null>(null);

  // Process modal — per-supplier advance deduction
  const [showProcess, setShowProcess] = useState(false);
  const [deductions, setDeductions] = useState<Record<string, number>>({});

  // Admin status override
  const [changingStatus, setChangingStatus] = useState<string | null>(null);

  // Advances ledger
  const [advances, setAdvances] = useState<FacilityAdvanceRow[]>([]);
  const [advancesTotal, setAdvancesTotal] = useState(0);
  const [advancesPage, setAdvancesPage] = useState(1);
  const [advanceQ, setAdvanceQ] = useState("");
  const [suppliers, setSuppliers] = useState<FacilitySupplier[]>([]);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    supplier_id: "",
    amount: "",
    advance_date: todayInput(),
    payment_method: "CASH" as "CASH" | "BANK_TRANSFER",
    notes: "",
  });
  const [advanceBusy, setAdvanceBusy] = useState(false);

  const load = useCallback(() => {
    if (!fid) return;
    api<{ payments: PendingPayment[] }>(`/facility/${fid}/payments/pending?weekStart=${weekStart}`)
      .then((r) => {
        setPending(r.payments);
        setDeductions(
          Object.fromEntries(
            r.payments.map((p) => [
              p.supplier.id,
              Math.min(p.outstanding_advance, Math.max(0, p.payment.net_payment)),
            ])
          )
        );
      })
      .catch(() => setPending([]));
    api<{ payments: HistoryRow[]; total: number }>(
      `/facility/${fid}/payments/history?page=${historyPage}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(q)}&status=${status}`
    ).then((r) => {
      setHistory(r.payments);
      setHistoryTotal(r.total);
      if (historyPage > Math.max(1, Math.ceil(r.total / PAGE_SIZE))) {
        setHistoryPage(Math.max(1, Math.ceil(r.total / PAGE_SIZE)));
      }
    });
  }, [fid, weekStart, historyPage, q, status]);

  useEffect(load, [load]);

  const loadAdvances = useCallback(() => {
    if (!fid) return;
    listFacilityAdvances(fid, { page: advancesPage, pageSize: 10, q: advanceQ || undefined }).then(
      (r) => {
        setAdvances(r.advances);
        setAdvancesTotal(r.total);
        if (advancesPage > Math.max(1, Math.ceil(r.total / 10))) {
          setAdvancesPage(Math.max(1, Math.ceil(r.total / 10)));
        }
      }
    );
  }, [fid, advancesPage, advanceQ]);

  useEffect(loadAdvances, [loadAdvances]);

  const openAdvanceModal = useCallback(() => {
    if (!fid) return;
    api<{ suppliers: FacilitySupplier[] }>(`/facility/${fid}/suppliers?pageSize=200`).then((r) => {
      setSuppliers(r.suppliers);
      setAdvanceForm((f) => ({ ...f, supplier_id: f.supplier_id || r.suppliers[0]?.id || "" }));
      setShowAdvanceModal(true);
    });
  }, [fid]);

  async function handleAdvanceSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fid) return;
    const amount = Math.floor(Number(advanceForm.amount));
    if (!Number.isFinite(amount) || amount <= 0) return;
    setAdvanceBusy(true);
    setNotice(null);
    try {
      await recordAdvance(fid, {
        supplier_id: advanceForm.supplier_id,
        amount,
        advance_date: advanceForm.advance_date,
        payment_method: advanceForm.payment_method,
        notes: advanceForm.notes.trim() || null,
      });
      setNotice({ kind: "success", text: t("Advance recorded.") });
      setShowAdvanceModal(false);
      setAdvanceForm({ supplier_id: "", amount: "", advance_date: todayInput(), payment_method: "CASH", notes: "" });
      loadAdvances();
      load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to record advance") });
    } finally {
      setAdvanceBusy(false);
    }
  }

  async function handleDeleteAdvance(id: string) {
    if (!fid) return;
    if (!confirm(t("Delete this advance? This cannot be undone."))) return;
    try {
      await deleteAdvance(fid, id);
      setNotice({ kind: "success", text: t("Advance deleted.") });
      loadAdvances();
      load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to delete advance") });
    }
  }

  const paymentStatusLabel = (s: string) =>
    t(
      s === "PENDING"
        ? "Pending"
        : s === "COLLECTED_FROM_FACILITY"
          ? "Collected from facility"
          : "Distributed to workers"
    );

  async function changeStatus(paymentId: string, supplierName: string, next: string) {
    if (!fid) return;
    const label = paymentStatusLabel(next);
    if (!confirm(t("Change {name}'s payment status to {status}?", { name: supplierName, status: label }))) {
      return;
    }
    setChangingStatus(paymentId);
    setNotice(null);
    try {
      await put(`/facility/${fid}/payments/${paymentId}/status`, { status: next });
      setNotice({ kind: "success", text: t("Payment status updated to {status}.", { status: label }) });
      load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to update payment status") });
    } finally {
      setChangingStatus(null);
    }
  }

  async function processSunday() {
    if (!fid) return;
    setBusy(true);
    setNotice(null);
    try {
      const r = await post<{ processed: unknown[] }>(`/facility/${fid}/payments/process`, {
        weekStart,
        advanceDeductions: deductions,
      });
      const n = r.processed.length;
      setNotice({
        kind: n > 0 ? "success" : "error",
        text:
          n > 0
            ? t("Processed {n} supplier payments. Suppliers can now collect and distribute.", { n })
            : t("No supplier payments were created. Check the selected week and that at least one weekly summary is approved."),
      });
      setShowProcess(false);
      load();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : t("Failed to process payments") });
    } finally {
      setBusy(false);
    }
  }

  const outstandingTotal = (pending ?? []).reduce((s, p) => s + (p.outstanding_advance ?? 0), 0);
  // Collection total per supplier = worker earnings + rent charges
  const collectionTotal = (pending ?? []).reduce(
    (s, p) => s + p.payment.total_worker_earnings + p.payment.total_rent_charges,
    0
  );
  const hasOutstanding = (pending ?? []).some((p) => (p.outstanding_advance ?? 0) > 0);

  return (
    <div>
      <PageHeader
        title={t("Sunday Payments")}
        subtitle={t("Collection total per supplier = worker earnings + rent charges")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportButtons reportType="payments" filters={{ from: weekStart }} />
            <Button variant="success" onClick={() => setShowProcess(true)} loading={busy}>
              {t("Process Sunday payments")}
            </Button>
          </div>
        }
      />

      {notice && (
        <div
          className={`animate-fade-in mb-4 rounded-lg border px-4 py-3 text-sm ${
            notice.kind === "success"
              ? "border-onion-200 bg-onion-50 text-onion-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      <Card className="mb-5">
        <Field label={t("Week starting")}>
          <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
        </Field>
      </Card>

      <Card title={t("Pending collections")} subtitle={t("Worker earnings + rent charges each supplier will collect from the facility")}>
        {!pending ? (
          <LoadingScreen />
        ) : pending.length === 0 ? (
          <EmptyState title={t("No pending payments")} hint={t("Process Sunday payments once summaries are approved")} />
        ) : (
          <>
            <Table
              head={[t("Supplier"), t("Worker earnings"), t("Drops"), t("Rent charges"), t("Collection total"), t("Status"), t("Invoice")]}
              empty={null}
            >
              {pending.map((r) => (
                <tr key={r.payment.id} className="hover:bg-field-50/50">
                  <Td className="font-semibold text-field-900">{r.supplier.name}</Td>
                  <Td><Money value={r.payment.total_worker_earnings} /></Td>
                  <Td>{r.payment.total_drops}</Td>
                  <Td className="text-onion-700">+ <Money value={r.payment.total_rent_charges} /></Td>
                  <Td className="font-bold text-onion-800">
                    <Money value={r.payment.total_worker_earnings + r.payment.total_rent_charges} />
                  </Td>
                  <Td>
                    <Select
                      value={r.payment.collection_status}
                      disabled={changingStatus === r.payment.id}
                      onChange={(e) => changeStatus(r.payment.id, r.supplier.name, e.target.value)}
                      className="w-auto cursor-pointer text-xs"
                      aria-label={t("Payment status")}
                    >
                      <option value="PENDING">{t("Pending")}</option>
                      <option value="COLLECTED_FROM_FACILITY">{t("Collected from facility")}</option>
                      <option value="DISTRIBUTED_TO_WORKERS">{t("Distributed to workers")}</option>
                    </Select>
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setInvoiceFor({ supplierId: r.supplier.id, weekStart: r.payment.week_start_date.slice(0, 10) })}
                    >
                      🧾 {t("Invoice")}
                    </Button>
                  </Td>
                </tr>
              ))}
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <p className="text-xs text-field-500">
                {t("Total collection:")}{" "}
                <span className="font-semibold text-onion-800"><Money value={collectionTotal} /></span>
                {hasOutstanding && (
                  <>
                    {" · "}
                    {t("Total outstanding advance:")}{" "}
                    <span className="font-semibold text-amber-700"><Money value={outstandingTotal} /></span>
                  </>
                )}
              </p>
            </div>
          </>
        )}
      </Card>

      {/* Supplier advances ledger */}
      <Card
        className="mt-6"
        title={t("Supplier advances")}
        subtitle={t("Cash given to suppliers before settlement — recover it when processing weekly payments")}
        action={<Button size="sm" onClick={openAdvanceModal}>{t("+ Record advance")}</Button>}
      >
        <div className="mb-3">
          <ListFilters
            search={advanceQ}
            onSearch={(v) => {
              setAdvanceQ(v);
              setAdvancesPage(1);
            }}
            status=""
            onStatus={() => {}}
            statusOptions={[]}
            searchPlaceholder={t("Search suppliers…")}
          />
        </div>
        {advances.length === 0 ? (
          <EmptyState title={t("No advances yet")} hint={t("Record an advance given to a supplier — it is recovered from their weekly payment")} />
        ) : (
          <>
            <Table head={[t("Supplier"), t("Date"), t("Amount"), t("Method"), t("Notes"), t("Actions")]} empty={null}>
              {advances.map((r) => (
                <tr key={r.advance.id} className="hover:bg-field-50/50">
                  <Td className="font-semibold text-field-900">{r.supplier.name}</Td>
                  <Td>{fmtDate(r.advance.advance_date)}</Td>
                  <Td className="font-semibold text-amber-700"><Money value={r.advance.amount} /></Td>
                  <Td><Badge tone="slate">{r.advance.payment_method.replace(/_/g, " ")}</Badge></Td>
                  <Td className="max-w-40 truncate text-xs text-field-500">{r.advance.notes ?? "—"}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setStatementFor({ supplierId: r.supplier.id, supplierName: r.supplier.name })}
                      >
                        📄 {t("Statement")}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleDeleteAdvance(r.advance.id)}>
                        {t("Delete")}
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination
              page={advancesPage}
              totalPages={Math.max(1, Math.ceil(advancesTotal / 10))}
              total={advancesTotal}
              pageSize={10}
              onChange={setAdvancesPage}
            />
          </>
        )}
      </Card>

      <div className="mt-6">
        <div className="mb-4">
          <ListFilters
            search={q}
            onSearch={(v) => {
              setQ(v);
              setHistoryPage(1);
            }}
            status={status}
            onStatus={(v) => {
              setStatus(v);
              setHistoryPage(1);
            }}
            statusOptions={[
              { value: "PENDING", label: t("Pending") },
              { value: "COLLECTED_FROM_FACILITY", label: t("Collected from facility") },
              { value: "DISTRIBUTED_TO_WORKERS", label: t("Distributed to workers") },
            ]}
            searchPlaceholder={t("Search suppliers…")}
          />
        </div>
        <Card title={t("Payment history")} subtitle={t("All weekly supplier payments for this facility")}>
          {history.length === 0 ? (
            q || status ? (
              <EmptyState icon="🔍" title={t("No payments match")} hint={t("Try a different search or status filter")} />
            ) : (
              <EmptyState title={t("No payment history yet")} />
            )
          ) : (
            <Table
              head={[t("Week"), t("Supplier"), t("Earnings"), t("Rent"), t("Advance"), t("Collection total"), t("Method"), t("Status"), t("Invoice")]}
              empty={null}
            >
              {history.map((r) => (
                <tr key={r.payment.id} className="hover:bg-field-50/50">
                  <Td>{r.payment.week_start_date.slice(0, 10)}</Td>
                  <Td className="font-medium">{r.supplier.name}</Td>
                  <Td><Money value={r.payment.total_worker_earnings} /></Td>
                  <Td className="text-onion-700">+ <Money value={r.payment.total_rent_charges} /></Td>
                  <Td>
                    {r.payment.advance_deducted > 0 ? (
                      <span className="text-amber-700">− <Money value={r.payment.advance_deducted} /></span>
                    ) : (
                      <span className="text-field-300">—</span>
                    )}
                  </Td>
                  <Td className="font-bold text-onion-800">
                    <Money value={r.payment.total_worker_earnings + r.payment.total_rent_charges} />
                  </Td>
                  <Td>{r.payment.payment_method ?? "—"}</Td>
                  <Td>
                    <Select
                      value={r.payment.collection_status}
                      disabled={changingStatus === r.payment.id}
                      onChange={(e) => changeStatus(r.payment.id, r.supplier.name, e.target.value)}
                      className="w-auto cursor-pointer text-xs"
                      aria-label={t("Payment status")}
                    >
                      <option value="PENDING">{t("Pending")}</option>
                      <option value="COLLECTED_FROM_FACILITY">{t("Collected from facility")}</option>
                      <option value="DISTRIBUTED_TO_WORKERS">{t("Distributed to workers")}</option>
                    </Select>
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setInvoiceFor({ supplierId: r.supplier.id, weekStart: r.payment.week_start_date.slice(0, 10) })}
                    >
                      🧾 {t("Invoice")}
                    </Button>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <Pagination
            page={historyPage}
            totalPages={Math.max(1, Math.ceil(historyTotal / PAGE_SIZE))}
            total={historyTotal}
            pageSize={PAGE_SIZE}
            onChange={setHistoryPage}
          />
        </Card>
      </div>

      {/* Record advance modal */}
      <Modal open={showAdvanceModal} onClose={() => setShowAdvanceModal(false)} title={t("Record advance")}>
        <form onSubmit={handleAdvanceSubmit} className="space-y-4">
          <Field label={t("Supplier")}>
            <SearchableSelect
              value={advanceForm.supplier_id}
              onChange={(v) => setAdvanceForm({ ...advanceForm, supplier_id: v })}
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              placeholder={t("Select supplier…")}
              searchPlaceholder={t("Search suppliers…")}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Advance amount (₹)")}>
              <Input
                type="number"
                min={1}
                value={advanceForm.amount}
                onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })}
                placeholder="0"
                required
              />
            </Field>
            <Field label={t("Advance date")}>
              <Input
                type="date"
                value={advanceForm.advance_date}
                onChange={(e) => setAdvanceForm({ ...advanceForm, advance_date: e.target.value })}
                required
              />
            </Field>
          </div>
          <Field label={t("Payment method")}>
            <SearchableSelect
              value={advanceForm.payment_method}
              onChange={(v) => setAdvanceForm({ ...advanceForm, payment_method: v as "CASH" | "BANK_TRANSFER" })}
              options={[
                { value: "CASH", label: t("Cash") },
                { value: "BANK_TRANSFER", label: t("Bank transfer") },
              ]}
            />
          </Field>
          <Field label={t("Notes (optional)")}>
            <Input
              value={advanceForm.notes}
              onChange={(e) => setAdvanceForm({ ...advanceForm, notes: e.target.value })}
              placeholder={t("e.g. advance for workers of next drop")}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowAdvanceModal(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" loading={advanceBusy}>
              {t("Record advance")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Process Sunday payments modal — per-supplier advance deduction */}
      <Modal open={showProcess} onClose={() => setShowProcess(false)} title={t("Process Sunday payments")} wide>
        <div className="space-y-4">
          {(pending ?? []).length === 0 ? (
            <p className="rounded-lg bg-field-50 px-3 py-2 text-xs leading-relaxed text-field-500">
              {t("No payments exist for this week yet. Processing creates a payment for every supplier with an approved weekly summary — approve summaries in Approvals first, then process here.")}
            </p>
          ) : (
            <>
              <p className="rounded-lg bg-field-50 px-3 py-2 text-xs leading-relaxed text-field-500">
                {t("Approve the advance recovery for each supplier. The deduction reduces their net payment; the rest carries forward.")}
              </p>
            <Table head={[t("Supplier"), t("Earnings − rent"), t("Outstanding advance"), t("Deduct now"), t("Net to pay")]} empty={null}>
              {pending!.map((r) => {
                const netBefore = r.payment.net_payment;
                const out = r.outstanding_advance ?? 0;
                const deduction = Math.min(
                  Number(deductions[r.supplier.id] ?? 0) || 0,
                  Math.max(0, netBefore),
                  out
                );
                const finalNet = netBefore - deduction;
                return (
                  <tr key={r.supplier.id} className="hover:bg-field-50/50">
                    <Td className="font-semibold text-field-900">{r.supplier.name}</Td>
                    <Td><Money value={netBefore} /></Td>
                    <Td>
                      {out > 0 ? (
                        <span className="font-semibold text-amber-700"><Money value={out} /></span>
                      ) : (
                        <span className="text-field-300">—</span>
                      )}
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        min={0}
                        max={Math.min(out, Math.max(0, netBefore))}
                        className="w-32"
                        value={deductions[r.supplier.id] ?? 0}
                        disabled={out <= 0}
                        onChange={(e) =>
                          setDeductions({ ...deductions, [r.supplier.id]: Number(e.target.value) })
                        }
                      />
                    </Td>
                    <Td className="font-bold text-onion-800"><Money value={finalNet} /></Td>
                  </tr>
                );
              })}
            </Table>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowProcess(false)}>
              {t("Cancel")}
            </Button>
            <Button type="button" variant="success" onClick={processSunday} loading={busy}>
              {t("Process & lock payments")}
            </Button>
          </div>
        </div>
      </Modal>

      <SupplierInvoiceModal
        open={invoiceFor !== null}
        onClose={() => setInvoiceFor(null)}
        supplierId={invoiceFor?.supplierId ?? ""}
        facilityId={fid}
        weekStart={invoiceFor?.weekStart ?? weekStart}
      />

      <SupplierAdvanceStatementModal
        open={statementFor !== null}
        onClose={() => setStatementFor(null)}
        supplierId={statementFor?.supplierId ?? ""}
        facilityId={fid}
      />
    </div>
  );
}
