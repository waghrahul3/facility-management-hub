import { and, asc, eq, gt, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { facilities, supplierAdvances, supplierPayments, suppliers } from "../../db/schema.js";
import { badRequest, forbidden, notFound } from "../errors.js";
import { toISODate } from "../date.js";
import {
  d,
  endOfDay,
  money,
  type Report,
  type ReportFilters,
  type ReportScope,
} from "./types.js";

/**
 * Supplier Advance Statement — a printable running-balance statement of the
 * cash advances given to a supplier and how much has been recovered so far
 * from their weekly payments.
 *
 * Filters:
 *  - `supplierId` — which supplier (required, or implied by a SUPPLIER role)
 *  - `facilityId` — optional; when omitted the statement spans all facilities
 *  - `from` / `to` — optional date range applied to advance dates and the
 *    week-start of recoveries (defaults to all time)
 *
 * The `meta` block carries the structured document (advances given, weekly
 * recoveries, totals) that the client's printable statement view renders.
 * The generic rows/columns/cards shape feeds the PDF / Excel exporters.
 */
export async function supplierAdvanceStatement(
  scope: ReportScope,
  f: ReportFilters
): Promise<Report> {
  // --- Resolve supplier -----------------------------------------------------
  let supplierId = f.supplierId;
  if (scope.supplierId) {
    if (supplierId && supplierId !== scope.supplierId) {
      throw forbidden("You can only view statements for your own advances");
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
  // Facility admins are locked to their own facility; other roles may pass a
  // facilityId to narrow the statement (null = all facilities).
  let facilityId = f.facilityId ?? null;
  if (scope.role === "FACILITY_ADMIN") {
    facilityId = scope.facilityIds?.[0] ?? null;
  }
  if (facilityId && scope.facilityIds && !scope.facilityIds.includes(facilityId)) {
    throw forbidden("Access to this facility is not allowed");
  }

  const facility = facilityId
    ? (await db.select().from(facilities).where(eq(facilities.id, facilityId)).limit(1))[0] ?? null
    : null;
  if (facilityId && !facility) throw notFound("Facility not found");

  // --- Date window (defaults to all time) -----------------------------------
  const from = f.from ? new Date(f.from) : null;
  const to = f.to ? endOfDay(new Date(f.to)) : null;

  // --- Advances given -------------------------------------------------------
  const advanceRows = await db
    .select({
      advance: supplierAdvances,
      facility: { id: facilities.id, name: facilities.name },
    })
    .from(supplierAdvances)
    .innerJoin(facilities, eq(facilities.id, supplierAdvances.facility_id))
    .where(
      and(
        eq(supplierAdvances.supplier_id, supplierId),
        facilityId ? eq(supplierAdvances.facility_id, facilityId) : undefined,
        from ? gte(supplierAdvances.advance_date, from) : undefined,
        to ? lte(supplierAdvances.advance_date, to) : undefined
      )
    )
    .orderBy(asc(supplierAdvances.advance_date), asc(supplierAdvances.created_at));

  // --- Recoveries (weekly payment deductions) ------------------------------
  const recoveryRows = await db
    .select({
      payment: supplierPayments,
      facility: { id: facilities.id, name: facilities.name },
    })
    .from(supplierPayments)
    .innerJoin(facilities, eq(facilities.id, supplierPayments.facility_id))
    .where(
      and(
        eq(supplierPayments.supplier_id, supplierId),
        gt(supplierPayments.advance_deducted, 0),
        facilityId ? eq(supplierPayments.facility_id, facilityId) : undefined,
        from ? gte(supplierPayments.week_start_date, from) : undefined,
        to ? lte(supplierPayments.week_start_date, to) : undefined
      )
    )
    .orderBy(asc(supplierPayments.week_start_date));

  // --- Running-balance ledger ----------------------------------------------
  interface LedgerLine {
    date: Date;
    created: number;
    kind: "Advance" | "Recovery";
    facilityName: string;
    detail: string;
    amount: number;
  }

  const lines: LedgerLine[] = [
    ...advanceRows.map((r) => ({
      date: r.advance.advance_date,
      created: r.advance.created_at?.getTime() ?? 0,
      kind: "Advance" as const,
      facilityName: r.facility.name,
      detail:
        (r.advance.payment_method === "BANK_TRANSFER" ? "Bank transfer" : "Cash") +
        (r.advance.notes ? ` — ${r.advance.notes}` : ""),
      amount: r.advance.amount,
    })),
    ...recoveryRows.map((r) => ({
      date: r.payment.week_start_date,
      created: r.payment.updated_at?.getTime() ?? 0,
      kind: "Recovery" as const,
      facilityName: r.facility.name,
      detail: `Week ${d(r.payment.week_start_date)} – ${d(r.payment.week_end_date)}`,
      amount: r.payment.advance_deducted ?? 0,
    })),
  ].sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() ||
      (a.kind === "Advance" ? -1 : 1) - (b.kind === "Advance" ? -1 : 1) ||
      a.created - b.created
  );

  let balance = 0;
  const rows = lines.map((line) => {
    balance += line.kind === "Advance" ? line.amount : -line.amount;
    return {
      date: line.date,
      type: line.kind,
      facility: line.facilityName,
      detail: line.detail,
      amount: line.amount,
      balance,
    };
  });

  // --- Totals ---------------------------------------------------------------
  const given = advanceRows.reduce((s, r) => s + r.advance.amount, 0);
  const recovered = recoveryRows.reduce((s, r) => s + (r.payment.advance_deducted ?? 0), 0);
  const outstanding = Math.max(0, given - recovered);

  const statementNo = `ADV-${supplierId.slice(0, 6).toUpperCase()}-${toISODate(new Date()).replace(/-/g, "")}`;

  return {
    type: "supplier-advance-statement",
    title: "Supplier Advance Statement",
    subtitle: `${supplier.name}${facility ? ` • ${facility.name}` : " • All facilities"}`,
    generatedAt: new Date().toISOString(),
    period: { from: f.from, to: f.to },
    columns: [
      { key: "date", label: "Date", type: "date" },
      { key: "type", label: "Type", type: "text" },
      { key: "facility", label: "Facility", type: "text" },
      { key: "detail", label: "Detail", type: "text" },
      { key: "amount", label: "Amount", type: "money" },
      { key: "balance", label: "Balance", type: "money" },
    ],
    rows,
    totals: { given, recovered, outstanding },
    cards: [
      { label: "Total advances given", value: money(given), tone: "amber" },
      { label: "Recovered from payments", value: money(recovered), tone: "green" },
      {
        label: "Outstanding balance",
        value: money(outstanding),
        tone: outstanding > 0 ? "red" : "slate",
      },
    ],
    meta: {
      statementNo,
      supplier: {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        city: supplier.city,
      },
      facility: facility
        ? {
            id: facility.id,
            name: facility.name,
            location: facility.location,
            city: facility.city,
          }
        : null,
      period: { from: f.from, to: f.to },
      advances: advanceRows.map((r) => ({
        id: r.advance.id,
        date: toISODate(r.advance.advance_date),
        facilityName: r.facility.name,
        method: r.advance.payment_method,
        notes: r.advance.notes,
        amount: r.advance.amount,
      })),
      recoveries: recoveryRows.map((r) => ({
        id: r.payment.id,
        weekStart: toISODate(r.payment.week_start_date),
        weekEnd: toISODate(r.payment.week_end_date),
        balanceBefore: r.payment.advance_balance_before ?? 0,
        deducted: r.payment.advance_deducted ?? 0,
        facilityName: r.facility.name,
      })),
      totals: { given, recovered, outstanding },
    },
  };
}
