import { and, desc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  rates,
  supplierDrops,
  supplierPaymentDistributions,
  supplierPayments,
  suppliers,
  tolis,
  weeklyWorkSummaries,
  workEntries,
} from "../db/schema.js";
import { endOfWeek, startOfWeek } from "../lib/date.js";

// ---------------------------------------------------------------------------
// Rate resolution: facility rate overrides global rate
// ---------------------------------------------------------------------------

export async function resolveRateForBagSize(
  facilityId: string,
  bagSizeId: string
): Promise<number | null> {
  // Facility-specific rate first
  const facilityRates = await db
    .select()
    .from(rates)
    .where(and(eq(rates.facility_id, facilityId), eq(rates.bag_size_id, bagSizeId)))
    .limit(1);
  if (facilityRates.length > 0) return facilityRates[0].rate_amount;

  // Fall back to global rate (facility_id NULL)
  const globalRates = await db
    .select()
    .from(rates)
    .where(and(isNull(rates.facility_id), eq(rates.bag_size_id, bagSizeId)))
    .limit(1);
  if (globalRates.length > 0) return globalRates[0].rate_amount;

  return null;
}

// ---------------------------------------------------------------------------
// Weekly work summaries per toli
// ---------------------------------------------------------------------------

export interface ToliWeekSummary {
  toliId: string;
  leaderName: string;
  facilityId: string;
  supplierId: string | null;
  weekStart: Date;
  weekEnd: Date;
  totalBagsProcessed: number;
  totalWorkAmount: number;
  dailyChargeDays: number;
  dailyChargeAgreedAmount: number;
  totalEarnings: number;
}

/** Aggregate approved work entries for a toli over a week. */
export async function computeToliWeekSummary(
  toliId: string,
  facilityId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<ToliWeekSummary | null> {
  const toli = (
    await db.select().from(tolis).where(eq(tolis.id, toliId)).limit(1)
  )[0];
  if (!toli) return null;

  const entries = await db
    .select()
    .from(workEntries)
    .where(
      and(
        eq(workEntries.toli_id, toliId),
        gte(workEntries.work_date, weekStart),
        lte(workEntries.work_date, weekEnd)
      )
    );

  // Only APPROVED / PAID entries count toward earnings
  const counted = entries.filter((e) => e.status === "APPROVED" || e.status === "PAID");
  const totalBags = counted.reduce((s, e) => s + e.quantity_bags, 0);
  const totalWorkAmount = counted.reduce((s, e) => s + e.total_amount, 0);

  // Day charge is charged once per distinct working day
  const workingDays = new Set(
    counted.map((e) => new Date(e.work_date).toISOString().slice(0, 10))
  ).size;
  const dailyChargeAgreed = toli.daily_charge * workingDays;

  // Supplier comes from the drop that brought the toli in
  let supplierId: string | null = null;
  if (toli.drop_id) {
    const drop = (
      await db.select().from(supplierDrops).where(eq(supplierDrops.id, toli.drop_id)).limit(1)
    )[0];
    supplierId = drop?.supplier_id ?? null;
  }

  return {
    toliId,
    leaderName: toli.leader_name,
    facilityId,
    supplierId,
    weekStart,
    weekEnd,
    totalBagsProcessed: totalBags,
    totalWorkAmount,
    dailyChargeDays: workingDays,
    dailyChargeAgreedAmount: dailyChargeAgreed,
    totalEarnings: totalWorkAmount + dailyChargeAgreed,
  };
}

/**
 * Generate (or refresh) weekly summaries for every toli of a facility that has
 * work entries in the given week. Returns the summaries.
 */
export async function generateWeeklySummaries(
  facilityId: string,
  weekStart: Date,
  weekEnd: Date
) {
  const toliList = await db
    .select()
    .from(tolis)
    .where(eq(tolis.facility_id, facilityId));

  const summaries: ToliWeekSummary[] = [];
  for (const toli of toliList) {
    const summary = await computeToliWeekSummary(
      toli.id,
      facilityId,
      weekStart,
      weekEnd
    );
    if (summary) summaries.push(summary);
  }

  // Upsert each summary (unique per toli + week)
  for (const s of summaries) {
    await db
      .insert(weeklyWorkSummaries)
      .values({
        toli_id: s.toliId,
        facility_id: s.facilityId,
        supplier_id: s.supplierId,
        week_start_date: s.weekStart,
        week_end_date: s.weekEnd,
        total_bags_processed: s.totalBagsProcessed,
        total_work_amount: s.totalWorkAmount,
        daily_charge_agreed_amount: s.dailyChargeAgreedAmount,
        total_earnings: s.totalEarnings,
        approval_status: "PENDING",
      })
      .onConflictDoUpdate({
        target: [
          weeklyWorkSummaries.toli_id,
          weeklyWorkSummaries.week_start_date,
        ],
        set: {
          week_end_date: s.weekEnd,
          total_bags_processed: s.totalBagsProcessed,
          total_work_amount: s.totalWorkAmount,
          daily_charge_agreed_amount: s.dailyChargeAgreedAmount,
          total_earnings: s.totalEarnings,
          // Recompute resets approval so admin re-verifies changed numbers
          approval_status: "PENDING",
          approved_by: null,
          approved_at: null,
        },
      });
  }

  return summaries;
}

// ---------------------------------------------------------------------------
// Supplier payment calculation (Sunday, Facility Admin)
// ---------------------------------------------------------------------------

export interface SupplierWeekPayment {
  supplierId: string;
  supplierName: string;
  totalWorkerEarnings: number;
  totalDrops: number;
  totalRentCharges: number;
  netPayment: number;
}

/** Compute net payment for one supplier for a week, from approved summaries + drops. */
export async function computeSupplierWeekPayment(
  facilityId: string,
  supplierId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<SupplierWeekPayment | null> {
  const supplier = (
    await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1)
  )[0];
  if (!supplier) return null;

  const approvedSummaries = await db
    .select()
    .from(weeklyWorkSummaries)
    .where(
      and(
        eq(weeklyWorkSummaries.facility_id, facilityId),
        eq(weeklyWorkSummaries.supplier_id, supplierId),
        eq(weeklyWorkSummaries.approval_status, "APPROVED"),
        gte(weeklyWorkSummaries.week_start_date, weekStart),
        lte(weeklyWorkSummaries.week_end_date, weekEnd)
      )
    );

  const drops = await db
    .select()
    .from(supplierDrops)
    .where(
      and(
        eq(supplierDrops.facility_id, facilityId),
        eq(supplierDrops.supplier_id, supplierId),
        gte(supplierDrops.drop_date, weekStart),
        lte(supplierDrops.drop_date, weekEnd)
      )
    );

  const totalWorkerEarnings = approvedSummaries.reduce(
    (s, x) => s + x.total_earnings,
    0
  );
  const totalRentCharges = drops.reduce((s, d) => s + d.rent_per_drop, 0);

  return {
    supplierId,
    supplierName: supplier.name,
    totalWorkerEarnings,
    totalDrops: drops.length,
    totalRentCharges,
    netPayment: totalWorkerEarnings - totalRentCharges,
  };
}

/**
 * Process Sunday supplier payments for a facility: for every supplier that has
 * approved weekly summaries this week, create/update a supplier_payments row.
 * Marks counted work entries as PAID.
 */
export async function processSupplierPayments(
  facilityId: string,
  weekStart: Date,
  weekEnd: Date
) {
  const summaries = await db
    .select()
    .from(weeklyWorkSummaries)
    .where(
      and(
        eq(weeklyWorkSummaries.facility_id, facilityId),
        eq(weeklyWorkSummaries.approval_status, "APPROVED"),
        gte(weeklyWorkSummaries.week_start_date, weekStart),
        lte(weeklyWorkSummaries.week_end_date, weekEnd)
      )
    );

  const supplierIds = [...new Set(summaries.map((s) => s.supplier_id).filter(Boolean))] as string[];

  const results: SupplierWeekPayment[] = [];
  for (const supplierId of supplierIds) {
    const payment = await computeSupplierWeekPayment(
      facilityId,
      supplierId,
      weekStart,
      weekEnd
    );
    if (!payment) continue;

    await db
      .insert(supplierPayments)
      .values({
        supplier_id: payment.supplierId,
        facility_id: facilityId,
        week_start_date: weekStart,
        week_end_date: weekEnd,
        total_worker_earnings: payment.totalWorkerEarnings,
        total_drops: payment.totalDrops,
        total_rent_charges: payment.totalRentCharges,
        net_payment: payment.netPayment,
        collection_status: "PENDING",
      })
      .onConflictDoUpdate({
        target: [supplierPayments.supplier_id, supplierPayments.week_start_date],
        set: {
          week_end_date: weekEnd,
          total_worker_earnings: payment.totalWorkerEarnings,
          total_drops: payment.totalDrops,
          total_rent_charges: payment.totalRentCharges,
          net_payment: payment.netPayment,
        },
      });

    results.push(payment);
  }

  // Mark counted work entries as PAID
  const toliIds = summaries.map((s) => s.toli_id);
  if (toliIds.length > 0) {
    await db
      .update(workEntries)
      .set({ status: "PAID" })
      .where(
        and(
          inArray(workEntries.toli_id, toliIds),
          inArray(workEntries.status, ["APPROVED"]),
          gte(workEntries.work_date, weekStart),
          lte(workEntries.work_date, weekEnd)
        )
      );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Supplier collection + distribution
// ---------------------------------------------------------------------------

export async function collectSupplierPayment(
  paymentId: string,
  method: "CASH" | "BANK_TRANSFER",
  notes?: string | null
) {
  const existing = await db
    .select()
    .from(supplierPayments)
    .where(eq(supplierPayments.id, paymentId))
    .limit(1);
  if (existing.length === 0) return null;

  const [updated] = await db
    .update(supplierPayments)
    .set({
      collection_status: "COLLECTED_FROM_FACILITY",
      collection_date: new Date(),
      payment_method: method,
      notes,
      updated_at: new Date(),
    })
    .where(eq(supplierPayments.id, paymentId))
    .returning();

  return updated;
}

export async function distributeSupplierPayment(
  paymentId: string,
  distributions: { toliId: string; amount: number; method: "CASH" | "BANK_TRANSFER"; notes?: string }[]
) {
  const payment = (
    await db
      .select()
      .from(supplierPayments)
      .where(eq(supplierPayments.id, paymentId))
      .limit(1)
  )[0];
  if (!payment) return null;

  for (const d of distributions) {
    await db.insert(supplierPaymentDistributions).values({
      supplier_payment_id: paymentId,
      supplier_id: payment.supplier_id,
      toli_id: d.toliId,
      amount_distributed: d.amount,
      distribution_date: new Date(),
      payment_method: d.method,
      notes: d.notes ?? null,
    });
  }

  const [updated] = await db
    .update(supplierPayments)
    .set({
      collection_status: "DISTRIBUTED_TO_WORKERS",
      updated_at: new Date(),
    })
    .where(eq(supplierPayments.id, paymentId))
    .returning();

  return updated;
}

export async function getPaymentDistributions(paymentId: string) {
  return db
    .select()
    .from(supplierPaymentDistributions)
    .where(eq(supplierPaymentDistributions.supplier_payment_id, paymentId))
    .orderBy(desc(supplierPaymentDistributions.created_at));
}

/** Convenience: today's week boundaries. */
export function currentWeek() {
  const start = startOfWeek(new Date());
  return { weekStart: start, weekEnd: endOfWeek(new Date()) };
}
