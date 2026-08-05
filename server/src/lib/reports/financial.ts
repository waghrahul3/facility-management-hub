import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  bagSizes,
  facilities,
  supplierDrops,
  supplierPaymentDistributions,
  supplierPayments,
  suppliers,
  tolis,
  weeklyWorkSummaries,
  workEntries,
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
    subtitle: "Weekly supplier settlements — worker earnings minus drop rent",
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
// Supplier Drops Ledger
// ---------------------------------------------------------------------------

export async function dropsLedger(scope: ReportScope, f: ReportFilters): Promise<Report> {
  const where = [];
  if (scope.facilityIds) where.push(inArray(supplierDrops.facility_id, scope.facilityIds));
  if (scope.supplierId) where.push(eq(supplierDrops.supplier_id, scope.supplierId));
  if (f.facilityId) where.push(eq(supplierDrops.facility_id, f.facilityId));
  if (f.supplierId) where.push(eq(supplierDrops.supplier_id, f.supplierId));
  if (f.from) where.push(gte(supplierDrops.drop_date, new Date(f.from)));
  if (f.to) where.push(lte(supplierDrops.drop_date, endOfDay(f.to)));

  const rows = await db
    .select({
      dropDate: supplierDrops.drop_date,
      facilityName: facilities.name,
      supplierName: suppliers.name,
      workers: supplierDrops.total_workers_dropped,
      rent: supplierDrops.rent_per_drop,
      status: supplierDrops.status,
    })
    .from(supplierDrops)
    .innerJoin(suppliers, eq(suppliers.id, supplierDrops.supplier_id))
    .innerJoin(facilities, eq(facilities.id, supplierDrops.facility_id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(supplierDrops.drop_date));

  const totals = { workers: 0, rent: 0 };
  for (const r of rows) {
    totals.workers += r.workers ?? 0;
    totals.rent += r.rent ?? 0;
  }
  const completed = rows.filter((r) => r.status === "COMPLETED").length;

  return {
    type: "drops",
    title: "Supplier Drops Ledger",
    subtitle: "Every supplier drop with negotiated per-drop rent",
    generatedAt: new Date().toISOString(),
    period: { from: f.from, to: f.to },
    columns: [
      { key: "dropDate", label: "Date", type: "date" },
      { key: "facilityName", label: "Facility", type: "text" },
      { key: "supplierName", label: "Supplier", type: "text" },
      { key: "workers", label: "Workers", type: "number" },
      { key: "rent", label: "Rent", type: "money" },
      { key: "status", label: "Status", type: "status" },
    ],
    rows,
    totals,
    cards: [
      { label: "Total drops", value: String(rows.length), tone: "slate" },
      { label: "Total workers", value: String(totals.workers), tone: "blue" },
      { label: "Total rent", value: money(totals.rent), tone: "amber" },
      { label: "Completed", value: String(completed), tone: "green" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Work Entries Ledger
// ---------------------------------------------------------------------------

export async function workLedger(scope: ReportScope, f: ReportFilters): Promise<Report> {
  const where = [];
  if (scope.facilityIds) where.push(inArray(workEntries.facility_id, scope.facilityIds));
  if (f.facilityId) where.push(eq(workEntries.facility_id, f.facilityId));
  if (f.from) where.push(gte(workEntries.work_date, new Date(f.from)));
  if (f.to) where.push(lte(workEntries.work_date, endOfDay(f.to)));

  const rows = await db
    .select({
      workDate: workEntries.work_date,
      toliName: tolis.leader_name,
      supplierName: suppliers.name,
      bagSize: bagSizes.size_name,
      weightKg: bagSizes.weight_kg,
      qty: workEntries.quantity_bags,
      rate: workEntries.rate_per_bag,
      amount: workEntries.total_amount,
      status: workEntries.status,
      confirmed: workEntries.leader_confirmed_at,
      notes: workEntries.notes,
    })
    .from(workEntries)
    .innerJoin(tolis, eq(tolis.id, workEntries.toli_id))
    .innerJoin(bagSizes, eq(bagSizes.id, workEntries.bag_size_id))
    .leftJoin(supplierDrops, eq(supplierDrops.id, tolis.drop_id))
    .leftJoin(suppliers, eq(suppliers.id, supplierDrops.supplier_id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(workEntries.work_date));

  const totals = { qty: 0, amount: 0 };
  for (const r of rows) {
    totals.qty += r.qty ?? 0;
    totals.amount += r.amount ?? 0;
  }
  const approved = rows.filter((r) => r.status === "APPROVED" || r.status === "PAID");

  return {
    type: "work",
    title: "Work Entries Ledger",
    subtitle: "Daily bag processing recorded per toli with rates and amounts",
    generatedAt: new Date().toISOString(),
    period: { from: f.from, to: f.to },
    columns: [
      { key: "workDate", label: "Date", type: "date" },
      { key: "toliName", label: "Toli / Leader", type: "text" },
      { key: "supplierName", label: "Supplier", type: "text" },
      { key: "bagSize", label: "Bag size", type: "text" },
      { key: "qty", label: "Bags", type: "number" },
      { key: "rate", label: "Rate", type: "money" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "status", label: "Status", type: "status" },
      { key: "confirmed", label: "Leader OK", type: "bool" },
      { key: "notes", label: "Notes", type: "text" },
    ],
    rows,
    totals,
    cards: [
      { label: "Entries", value: String(rows.length), tone: "slate" },
      { label: "Total bags", value: String(totals.qty), tone: "blue" },
      { label: "Total amount", value: money(totals.amount), tone: "green" },
      {
        label: "Approved amount",
        value: money(approved.reduce((s, r) => s + (r.amount ?? 0), 0)),
        tone: "violet",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Weekly Work Summary Ledger
// ---------------------------------------------------------------------------

export async function summariesLedger(scope: ReportScope, f: ReportFilters): Promise<Report> {
  const where = [];
  if (scope.facilityIds) where.push(inArray(weeklyWorkSummaries.facility_id, scope.facilityIds));
  if (scope.supplierId) where.push(eq(weeklyWorkSummaries.supplier_id, scope.supplierId));
  if (f.facilityId) where.push(eq(weeklyWorkSummaries.facility_id, f.facilityId));
  if (f.supplierId) where.push(eq(weeklyWorkSummaries.supplier_id, f.supplierId));
  if (f.from) where.push(gte(weeklyWorkSummaries.week_start_date, new Date(f.from)));
  if (f.to) where.push(lte(weeklyWorkSummaries.week_start_date, endOfDay(f.to)));

  const rows = await db
    .select({
      weekStart: weeklyWorkSummaries.week_start_date,
      facilityName: facilities.name,
      toliName: tolis.leader_name,
      supplierName: suppliers.name,
      bags: weeklyWorkSummaries.total_bags_processed,
      workAmount: weeklyWorkSummaries.total_work_amount,
      dayCharge: weeklyWorkSummaries.daily_charge_agreed_amount,
      earnings: weeklyWorkSummaries.total_earnings,
      status: weeklyWorkSummaries.approval_status,
      approvedAt: weeklyWorkSummaries.approved_at,
    })
    .from(weeklyWorkSummaries)
    .innerJoin(tolis, eq(tolis.id, weeklyWorkSummaries.toli_id))
    .innerJoin(facilities, eq(facilities.id, weeklyWorkSummaries.facility_id))
    .leftJoin(suppliers, eq(suppliers.id, weeklyWorkSummaries.supplier_id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(weeklyWorkSummaries.week_start_date));

  const totals = { bags: 0, workAmount: 0, dayCharge: 0, earnings: 0 };
  for (const r of rows) {
    totals.bags += r.bags ?? 0;
    totals.workAmount += r.workAmount ?? 0;
    totals.dayCharge += r.dayCharge ?? 0;
    totals.earnings += r.earnings ?? 0;
  }
  const approved = rows.filter((r) => r.status === "APPROVED");

  return {
    type: "summaries",
    title: "Weekly Work Summary Ledger",
    subtitle: "Per-toli weekly earnings (bag work + day charge) with approval status",
    generatedAt: new Date().toISOString(),
    period: { from: f.from, to: f.to },
    columns: [
      { key: "weekStart", label: "Week", type: "date" },
      { key: "facilityName", label: "Facility", type: "text" },
      { key: "toliName", label: "Toli / Leader", type: "text" },
      { key: "supplierName", label: "Supplier", type: "text" },
      { key: "bags", label: "Bags", type: "number" },
      { key: "workAmount", label: "Work", type: "money" },
      { key: "dayCharge", label: "Day charge", type: "money" },
      { key: "earnings", label: "Earnings", type: "money" },
      { key: "status", label: "Status", type: "status" },
      { key: "approvedAt", label: "Approved", type: "date" },
    ],
    rows,
    totals,
    cards: [
      { label: "Total earnings", value: money(totals.earnings), tone: "green" },
      { label: "Work amount", value: money(totals.workAmount), tone: "blue" },
      { label: "Day charges", value: money(totals.dayCharge), tone: "amber" },
      {
        label: "Approved earnings",
        value: money(approved.reduce((s, r) => s + (r.earnings ?? 0), 0)),
        tone: "violet",
      },
      { label: "Pending", value: String(rows.filter((r) => r.status === "PENDING").length), tone: "slate" },
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

// ---------------------------------------------------------------------------
// Rent Collection Summary (per supplier)
// ---------------------------------------------------------------------------

export async function rentSummary(scope: ReportScope, f: ReportFilters): Promise<Report> {
  const where = [];
  if (scope.facilityIds) where.push(inArray(supplierDrops.facility_id, scope.facilityIds));
  if (scope.supplierId) where.push(eq(supplierDrops.supplier_id, scope.supplierId));
  if (f.facilityId) where.push(eq(supplierDrops.facility_id, f.facilityId));
  if (f.supplierId) where.push(eq(supplierDrops.supplier_id, f.supplierId));
  if (f.from) where.push(gte(supplierDrops.drop_date, new Date(f.from)));
  if (f.to) where.push(lte(supplierDrops.drop_date, endOfDay(f.to)));

  const rows = await db
    .select({
      supplierId: suppliers.id,
      supplierName: suppliers.name,
      facilityName: facilities.name,
      workers: supplierDrops.total_workers_dropped,
      rent: supplierDrops.rent_per_drop,
    })
    .from(supplierDrops)
    .innerJoin(suppliers, eq(suppliers.id, supplierDrops.supplier_id))
    .innerJoin(facilities, eq(facilities.id, supplierDrops.facility_id))
    .where(where.length ? and(...where) : undefined);

  const bySupplier = new Map<string, { name: string; facilities: Set<string>; drops: number; workers: number; rent: number }>();
  for (const r of rows) {
    const key = r.supplierId;
    let agg = bySupplier.get(key);
    if (!agg) {
      agg = { name: r.supplierName, facilities: new Set(), drops: 0, workers: 0, rent: 0 };
      bySupplier.set(key, agg);
    }
    agg.facilities.add(r.facilityName);
    agg.drops += 1;
    agg.workers += r.workers ?? 0;
    agg.rent += r.rent ?? 0;
  }

  const out = [...bySupplier.values()]
    .sort((a, b) => b.rent - a.rent)
    .map((a) => ({
      supplierName: a.name,
      facilities: [...a.facilities].join(", ") || "—",
      drops: a.drops,
      workers: a.workers,
      rent: a.rent,
    }));

  const totals = { drops: 0, workers: 0, rent: 0 };
  for (const r of out) {
    totals.drops += r.drops;
    totals.workers += r.workers;
    totals.rent += r.rent;
  }

  return {
    type: "rent",
    title: "Rent Collection Summary",
    subtitle: "Negotiated drop rent aggregated per supplier",
    generatedAt: new Date().toISOString(),
    period: { from: f.from, to: f.to },
    columns: [
      { key: "supplierName", label: "Supplier", type: "text" },
      { key: "facilities", label: "Facilities", type: "text" },
      { key: "drops", label: "Drops", type: "number" },
      { key: "workers", label: "Workers", type: "number" },
      { key: "rent", label: "Rent", type: "money" },
    ],
    rows: out,
    totals,
    cards: [
      { label: "Total rent", value: money(totals.rent), tone: "amber" },
      { label: "Total drops", value: String(totals.drops), tone: "slate" },
      { label: "Total workers", value: String(totals.workers), tone: "blue" },
      { label: "Suppliers", value: String(bySupplier.size), tone: "green" },
    ],
  };
}

export { d };
