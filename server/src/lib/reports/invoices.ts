import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  bagSizes,
  facilities,
  supplierDrops,
  supplierPayments,
  suppliers,
  tolis,
  weeklyWorkSummaries,
  workEntries,
} from "../../db/schema.js";
import { startOfWeek, toISODate } from "../date.js";
import { badRequest, forbidden, notFound } from "../errors.js";
import {
  d,
  money,
  type Report,
  type ReportFilters,
  type ReportScope,
} from "./types.js";

/**
 * Supplier Invoice — a single printable invoice for one supplier for one week:
 * worker earnings (from approved weekly summaries) minus drop rent charges.
 *
 * Filters:
 *  - `supplierId` — which supplier (required, or implied by a SUPPLIER role)
 *  - `facilityId` — which facility (defaults to the caller's facility, or the
 *    supplier's facility that week)
 *  - `from`       — the week start date (defaults to the current week)
 *
 * The `meta` block carries the structured invoice document (header, per-drop
 * rent detail, toli lines, totals, payment status) that the client's printable
 * invoice view renders. The generic rows/columns/cards shape also feeds the
 * existing PDF / Excel exporters.
 */
export async function supplierInvoice(
  scope: ReportScope,
  f: ReportFilters
): Promise<Report> {
  // --- Resolve supplier -----------------------------------------------------
  let supplierId = f.supplierId;
  if (scope.supplierId) {
    if (supplierId && supplierId !== scope.supplierId) {
      throw forbidden("You can only view invoices for your own drops");
    }
    supplierId = scope.supplierId;
  }
  if (!supplierId) {
    throw badRequest("supplierId is required");
  }

  const supplier = (
    await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1)
  )[0];
  if (!supplier) throw notFound("Supplier not found");

  // --- Resolve facility -----------------------------------------------------
  // Facility admins are locked to their own facility; others may pass one or
  // fall back to the supplier's facility for the week.
  let facilityId = f.facilityId ?? null;
  if (scope.facilityIds && scope.facilityIds.length === 1 && !facilityId) {
    facilityId = scope.facilityIds[0];
  }
  if (facilityId && scope.facilityIds && !scope.facilityIds.includes(facilityId)) {
    throw forbidden("Access to this facility is not allowed");
  }

  // Week window (from = week start)
  const weekStart = f.from ? startOfWeek(new Date(f.from)) : startOfWeek(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // If no facility chosen, use the facility of the supplier's drops that week.
  if (!facilityId) {
    const dropRow = (
      await db
        .select({ facilityId: supplierDrops.facility_id })
        .from(supplierDrops)
        .where(
          and(
            eq(supplierDrops.supplier_id, supplierId),
            gte(supplierDrops.drop_date, weekStart),
            lte(supplierDrops.drop_date, weekEnd)
          )
        )
        .limit(1)
    )[0];
    if (dropRow) facilityId = dropRow.facilityId;
  }
  if (!facilityId) throw badRequest("Could not determine the facility for this invoice");

  const facility = (
    await db.select().from(facilities).where(eq(facilities.id, facilityId)).limit(1)
  )[0];
  if (!facility) throw notFound("Facility not found");

  // --- Toli lines (weekly summaries) ---------------------------------------
  const summaries = await db
    .select({
      summary: weeklyWorkSummaries,
      toli: { id: tolis.id, leader_name: tolis.leader_name },
    })
    .from(weeklyWorkSummaries)
    .innerJoin(tolis, eq(tolis.id, weeklyWorkSummaries.toli_id))
    .where(
      and(
        eq(weeklyWorkSummaries.supplier_id, supplierId),
        eq(weeklyWorkSummaries.facility_id, facilityId),
        eq(weeklyWorkSummaries.week_start_date, weekStart)
      )
    )
    .orderBy(desc(weeklyWorkSummaries.total_earnings));

  // --- Drops + rent detail --------------------------------------------------
  const drops = await db
    .select()
    .from(supplierDrops)
    .where(
      and(
        eq(supplierDrops.supplier_id, supplierId),
        eq(supplierDrops.facility_id, facilityId),
        gte(supplierDrops.drop_date, weekStart),
        lte(supplierDrops.drop_date, weekEnd)
      )
    )
    .orderBy(asc(supplierDrops.drop_date));

  // --- Date-wise work details (the toli entries behind the summaries) ------
  const workDetails = await db
    .select({
      workDate: workEntries.work_date,
      leader: tolis.leader_name,
      bagSize: bagSizes.size_name,
      category: workEntries.onion_category,
      bags: workEntries.quantity_bags,
      rate: workEntries.rate_per_bag,
      amount: workEntries.total_amount,
      status: workEntries.status,
    })
    .from(workEntries)
    .innerJoin(tolis, eq(tolis.id, workEntries.toli_id))
    .innerJoin(bagSizes, eq(bagSizes.id, workEntries.bag_size_id))
    .innerJoin(supplierDrops, eq(supplierDrops.id, tolis.drop_id))
    .where(
      and(
        eq(supplierDrops.supplier_id, supplierId),
        eq(workEntries.facility_id, facilityId),
        inArray(workEntries.status, ["APPROVED", "PAID"]),
        gte(workEntries.work_date, weekStart),
        lte(workEntries.work_date, weekEnd)
      )
    )
    .orderBy(asc(workEntries.work_date), asc(tolis.leader_name));

  // --- Payment record (if processed) ---------------------------------------
  const payment = (
    await db
      .select()
      .from(supplierPayments)
      .where(
        and(
          eq(supplierPayments.supplier_id, supplierId),
          eq(supplierPayments.facility_id, facilityId),
          eq(supplierPayments.week_start_date, weekStart)
        )
      )
      .limit(1)
  )[0] ?? null;

  // --- Totals ---------------------------------------------------------------
  const totalEarnings = summaries.reduce((s, x) => s + (x.summary.total_earnings ?? 0), 0);
  const totalRent = drops.reduce((s, x) => s + (x.rent_per_drop ?? 0), 0);
  const netPayment = totalEarnings - totalRent;
  // The facility's total amount to pay for the week: drop rent + toli earnings.
  const facilityTotal = totalEarnings + totalRent;

  const rows = summaries.map((r) => ({
    leader: r.toli.leader_name,
    bags: r.summary.total_bags_processed ?? 0,
    workAmount: r.summary.total_work_amount ?? 0,
    dayCharge: r.summary.daily_charge_agreed_amount ?? 0,
    earnings: r.summary.total_earnings ?? 0,
    status: r.summary.approval_status,
  }));

  const weekLabel = `${d(weekStart)} – ${d(weekEnd)}`;
  const invoiceNo = `INV-${supplierId.slice(0, 6).toUpperCase()}-${toISODate(weekStart).replace(/-/g, "")}`;

  return {
    type: "supplier-invoice",
    title: "Supplier Invoice",
    subtitle: `${supplier.name} • ${facility.name} • ${weekLabel}`,
    generatedAt: new Date().toISOString(),
    period: { from: toISODate(weekStart), to: toISODate(weekEnd) },
    columns: [
      { key: "leader", label: "Toli / Leader", type: "text" },
      { key: "bags", label: "Bags", type: "number" },
      { key: "workAmount", label: "Work amount", type: "money" },
      { key: "dayCharge", label: "Day charge", type: "money" },
      { key: "earnings", label: "Earnings", type: "money" },
      { key: "status", label: "Status", type: "status" },
    ],
    rows,
    totals: {
      bags: rows.reduce((s, r) => s + r.bags, 0),
      workAmount: rows.reduce((s, r) => s + r.workAmount, 0),
      dayCharge: rows.reduce((s, r) => s + r.dayCharge, 0),
      earnings: totalEarnings,
      rent: totalRent,
      net: netPayment,
      facilityTotal,
      drops: drops.length,
    },
    cards: [
      { label: "Worker earnings", value: money(totalEarnings), tone: "blue" },
      { label: "Drop rent", value: money(totalRent), tone: "amber" },
      { label: "Total to pay", value: money(facilityTotal), tone: "green" },
      { label: "Drops", value: String(drops.length), tone: "slate" },
    ],
    meta: {
      invoiceNo,
      supplier: {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        city: supplier.city,
      },
      facility: {
        id: facility.id,
        name: facility.name,
        location: facility.location,
        city: facility.city,
      },
      weekStart: toISODate(weekStart),
      weekEnd: toISODate(weekEnd),
      toliLines: rows,
      workDetails: workDetails.map((w) => ({
        workDate: toISODate(w.workDate),
        leader: w.leader,
        bagSize: w.bagSize,
        category: w.category,
        bags: w.bags,
        rate: w.rate,
        amount: w.amount,
        status: w.status,
      })),
      drops: drops.map((x) => ({
        id: x.id,
        dropDate: toISODate(x.drop_date),
        workers: x.total_workers_dropped ?? 0,
        rent: x.rent_per_drop ?? 0,
        status: x.status,
      })),
      payment: payment
        ? {
            status: payment.collection_status,
            method: payment.payment_method,
            collectedAt: payment.collection_date ? toISODate(payment.collection_date) : null,
            net: payment.net_payment,
          }
        : null,
    },
  };
}


