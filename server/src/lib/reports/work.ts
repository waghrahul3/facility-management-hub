import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  bagSizes,
  facilities,
  supplierDrops,
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
// Work Entries Ledger
// ---------------------------------------------------------------------------

export async function workLedger(scope: ReportScope, f: ReportFilters): Promise<Report> {
  const where = [];
  if (scope.facilityIds) where.push(inArray(workEntries.facility_id, scope.facilityIds));
  if (scope.supplierId) where.push(eq(supplierDrops.supplier_id, scope.supplierId));
  if (scope.toliId) where.push(eq(workEntries.toli_id, scope.toliId));
  if (f.facilityId) where.push(eq(workEntries.facility_id, f.facilityId));
  if (f.from) where.push(gte(workEntries.work_date, new Date(f.from)));
  if (f.to) where.push(lte(workEntries.work_date, endOfDay(f.to)));

  const rows = await db
    .select({
      workDate: workEntries.work_date,
      toliName: tolis.leader_name,
      supplierName: suppliers.name,
      bagSize: bagSizes.size_name,
      onionCategory: workEntries.onion_category,
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
      { key: "onionCategory", label: "Onion category", type: "text" },
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
  if (scope.toliId) where.push(eq(weeklyWorkSummaries.toli_id, scope.toliId));
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

export { d };
