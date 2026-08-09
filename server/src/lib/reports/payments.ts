import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  facilities,
  supplierPaymentDistributions,
  supplierPayments,
  suppliers,
  tolis,
} from "../../db/schema.js";
import {
  d,
  endOfDay,
  money,
  type Report,
  type ReportFilters,
  type ReportScope,
} from "./types.js";

// ---------------------------------------------------------------------------
// Supplier Payments Ledger
// ---------------------------------------------------------------------------

export async function paymentsLedger(scope: ReportScope, f: ReportFilters): Promise<Report> {
  const where = [];
  if (scope.facilityIds) where.push(inArray(supplierPayments.facility_id, scope.facilityIds));
  if (scope.supplierId) where.push(eq(supplierPayments.supplier_id, scope.supplierId));
  if (f.facilityId) where.push(eq(supplierPayments.facility_id, f.facilityId));
  if (f.supplierId) where.push(eq(supplierPayments.supplier_id, f.supplierId));
  if (f.from) where.push(gte(supplierPayments.week_start_date, new Date(f.from)));
  if (f.to) where.push(lte(supplierPayments.week_start_date, endOfDay(f.to)));

  const rows = await db
    .select({
      weekStart: supplierPayments.week_start_date,
      facilityName: facilities.name,
      supplierName: suppliers.name,
      earnings: supplierPayments.total_worker_earnings,
      drops: supplierPayments.total_drops,
      rent: supplierPayments.total_rent_charges,
      net: supplierPayments.net_payment,
      status: supplierPayments.collection_status,
      method: supplierPayments.payment_method,
      collectedAt: supplierPayments.collection_date,
      notes: supplierPayments.notes,
    })
    .from(supplierPayments)
    .innerJoin(suppliers, eq(suppliers.id, supplierPayments.supplier_id))
    .innerJoin(facilities, eq(facilities.id, supplierPayments.facility_id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(supplierPayments.week_start_date));

  const totals = { earnings: 0, drops: 0, rent: 0, net: 0 };
  for (const r of rows) {
    totals.earnings += r.earnings ?? 0;
    totals.drops += r.drops ?? 0;
    totals.rent += r.rent ?? 0;
    totals.net += r.net ?? 0;
  }
  const settled = rows.filter((r) => r.status && r.status !== "PENDING").length;

  return {
    type: "payments",
    title: "Supplier Payments Ledger",
    subtitle: "Weekly supplier settlements — worker earnings plus drop rent",
    generatedAt: new Date().toISOString(),
    period: { from: f.from, to: f.to },
    columns: [
      { key: "weekStart", label: "Week", type: "date" },
      { key: "facilityName", label: "Facility", type: "text" },
      { key: "supplierName", label: "Supplier", type: "text" },
      { key: "earnings", label: "Earnings", type: "money" },
      { key: "drops", label: "Drops", type: "number" },
      { key: "rent", label: "Rent", type: "money" },
      { key: "net", label: "Net", type: "money" },
      { key: "status", label: "Status", type: "status" },
      { key: "method", label: "Method", type: "text" },
      { key: "collectedAt", label: "Collected", type: "date" },
      { key: "notes", label: "Notes", type: "text" },
    ],
    rows,
    totals,
    cards: [
      { label: "Total net", value: money(totals.net), tone: "green" },
      { label: "Worker earnings", value: money(totals.earnings), tone: "blue" },
      { label: "Rent charged", value: money(totals.rent), tone: "amber" },
      { label: "Settlements", value: String(rows.length), tone: "slate" },
      { label: "Collected", value: String(settled), tone: "violet" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Payment Distribution Ledger
// ---------------------------------------------------------------------------

export async function distributionsLedger(scope: ReportScope, f: ReportFilters): Promise<Report> {
  const where = [];
  if (scope.facilityIds) where.push(inArray(supplierPayments.facility_id, scope.facilityIds));
  if (scope.supplierId) where.push(eq(supplierPayments.supplier_id, scope.supplierId));
  if (scope.toliId) where.push(eq(supplierPaymentDistributions.toli_id, scope.toliId));
  if (f.facilityId) where.push(eq(supplierPayments.facility_id, f.facilityId));
  if (f.supplierId) where.push(eq(supplierPayments.supplier_id, f.supplierId));
  if (f.from) where.push(gte(supplierPaymentDistributions.distribution_date, new Date(f.from)));
  if (f.to) where.push(lte(supplierPaymentDistributions.distribution_date, endOfDay(f.to)));

  const rows = await db
    .select({
      distDate: supplierPaymentDistributions.distribution_date,
      weekStart: supplierPayments.week_start_date,
      facilityName: facilities.name,
      supplierName: suppliers.name,
      toliName: tolis.leader_name,
      amount: supplierPaymentDistributions.amount_distributed,
      method: supplierPaymentDistributions.payment_method,
      notes: supplierPaymentDistributions.notes,
    })
    .from(supplierPaymentDistributions)
    .innerJoin(
      supplierPayments,
      eq(supplierPayments.id, supplierPaymentDistributions.supplier_payment_id)
    )
    .innerJoin(suppliers, eq(suppliers.id, supplierPaymentDistributions.supplier_id))
    .innerJoin(tolis, eq(tolis.id, supplierPaymentDistributions.toli_id))
    .innerJoin(facilities, eq(facilities.id, supplierPayments.facility_id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(supplierPaymentDistributions.distribution_date));

  const totals = { amount: 0 };
  for (const r of rows) totals.amount += r.amount ?? 0;

  return {
    type: "distributions",
    title: "Payment Distribution Ledger",
    subtitle: "Every payment distributed by suppliers to toli leaders",
    generatedAt: new Date().toISOString(),
    period: { from: f.from, to: f.to },
    columns: [
      { key: "distDate", label: "Date", type: "date" },
      { key: "weekStart", label: "Week", type: "date" },
      { key: "facilityName", label: "Facility", type: "text" },
      { key: "supplierName", label: "Supplier", type: "text" },
      { key: "toliName", label: "Toli / Leader", type: "text" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "method", label: "Method", type: "text" },
      { key: "notes", label: "Notes", type: "text" },
    ],
    rows,
    totals,
    cards: [
      { label: "Total distributed", value: money(totals.amount), tone: "green" },
      { label: "Distributions", value: String(rows.length), tone: "slate" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Supplier Statements — the running-balance ledger
// ---------------------------------------------------------------------------

export async function supplierStatements(scope: ReportScope, f: ReportFilters): Promise<Report> {
  const where = [];
  if (scope.facilityIds) where.push(inArray(supplierPayments.facility_id, scope.facilityIds));
  if (scope.supplierId) where.push(eq(supplierPayments.supplier_id, scope.supplierId));
  if (f.facilityId) where.push(eq(supplierPayments.facility_id, f.facilityId));
  if (f.supplierId) where.push(eq(supplierPayments.supplier_id, f.supplierId));
  if (f.from) where.push(gte(supplierPayments.week_start_date, new Date(f.from)));
  if (f.to) where.push(lte(supplierPayments.week_start_date, endOfDay(f.to)));

  const rows = await db
    .select({
      weekStart: supplierPayments.week_start_date,
      facilityName: facilities.name,
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      drops: supplierPayments.total_drops,
      rent: supplierPayments.total_rent_charges,
      earnings: supplierPayments.total_worker_earnings,
      net: supplierPayments.net_payment,
      status: supplierPayments.collection_status,
    })
    .from(supplierPayments)
    .innerJoin(suppliers, eq(suppliers.id, supplierPayments.supplier_id))
    .innerJoin(facilities, eq(facilities.id, supplierPayments.facility_id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(suppliers.name), asc(supplierPayments.week_start_date));

  // Running balance per supplier: + net payable, − collected
  const balanceBySupplier = new Map<string, number>();
  const out: Record<string, unknown>[] = [];
  let totalNet = 0;
  let totalCollected = 0;
  let totalOutstanding = 0;

  for (const r of rows) {
    const collected = r.status && r.status !== "PENDING" ? r.net : 0;
    const bal = (balanceBySupplier.get(r.supplierId) ?? 0) + r.net - collected;
    balanceBySupplier.set(r.supplierId, bal);
    totalNet += r.net ?? 0;
    totalCollected += collected;
    out.push({
      weekStart: r.weekStart,
      facilityName: r.facilityName,
      supplierName: r.supplierName,
      drops: r.drops,
      rent: r.rent,
      earnings: r.earnings,
      net: r.net,
      collected,
      balance: bal,
    });
  }
  for (const bal of balanceBySupplier.values()) totalOutstanding += bal;

  return {
    type: "supplier-statements",
    title: "Supplier Statement Ledger",
    subtitle: "Running balance per supplier — net payable minus amounts collected",
    generatedAt: new Date().toISOString(),
    period: { from: f.from, to: f.to },
    columns: [
      { key: "weekStart", label: "Week", type: "date" },
      { key: "facilityName", label: "Facility", type: "text" },
      { key: "supplierName", label: "Supplier", type: "text" },
      { key: "drops", label: "Drops", type: "number" },
      { key: "rent", label: "Rent", type: "money" },
      { key: "earnings", label: "Earnings", type: "money" },
      { key: "net", label: "Net payable", type: "money" },
      { key: "collected", label: "Collected", type: "money" },
      { key: "balance", label: "Balance", type: "money" },
    ],
    rows: out,
    totals: { drops: 0, rent: 0, earnings: 0, net: totalNet, collected: totalCollected, balance: totalOutstanding },
    cards: [
      { label: "Suppliers", value: String(balanceBySupplier.size), tone: "slate" },
      { label: "Total net payable", value: money(totalNet), tone: "blue" },
      { label: "Collected", value: money(totalCollected), tone: "green" },
      { label: "Outstanding", value: money(totalOutstanding), tone: totalOutstanding > 0 ? "amber" : "green" },
    ],
  };
}

export { d };
