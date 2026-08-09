import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  rates,
  supplierAdvances,
  supplierDrops,
  supplierPaymentDistributions,
  supplierPayments,
  suppliers,
  tolis,
  weeklyWorkSummaries,
  workEntries,
} from "../db/schema.js";
import { endOfWeek, startOfWeek } from "../lib/date.js";
import { badRequest } from "../lib/errors.js";
import { roundMoney } from "../lib/format.js";

/**
 * A query client that can be either the global `db` or an in-flight
 * transaction (`tx`), so helpers can run inside `db.transaction(...)`.
 */
type TxLike = Pick<typeof db, "select" | "insert" | "update">;

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
  weekEnd: Date,
  client: TxLike = db
): Promise<ToliWeekSummary | null> {
  const toli = (
    await client.select().from(tolis).where(eq(tolis.id, toliId)).limit(1)
  )[0];
  if (!toli) return null;

  const entries = await client
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
  const totalWorkAmount = roundMoney(counted.reduce((s, e) => s + e.total_amount, 0));

  // Day charge is charged once per distinct working day
  const workingDays = new Set(
    counted.map((e) => new Date(e.work_date).toISOString().slice(0, 10))
  ).size;
  const dailyChargeAgreed = toli.daily_charge * workingDays;

  // Supplier comes from the drop that brought the toli in
  let supplierId: string | null = null;
  if (toli.drop_id) {
    const drop = (
      await client.select().from(supplierDrops).where(eq(supplierDrops.id, toli.drop_id)).limit(1)
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
    totalEarnings: roundMoney(totalWorkAmount + dailyChargeAgreed),
  };
}

/**
 * Generate (or refresh) weekly summaries for every toli of a facility that has
 * work entries in the given week. Returns the summaries. All upserts for the
 * week are committed atomically so a mid-way failure cannot leave the week
 * half-generated.
 */
export async function generateWeeklySummaries(
  facilityId: string,
  weekStart: Date,
  weekEnd: Date
) {
  return db.transaction(async (tx) => {
    const toliList = await tx
      .select()
      .from(tolis)
      .where(eq(tolis.facility_id, facilityId));

    const summaries: ToliWeekSummary[] = [];
    for (const toli of toliList) {
      const summary = await computeToliWeekSummary(
        toli.id,
        facilityId,
        weekStart,
        weekEnd,
        tx
      );
      if (summary) summaries.push(summary);
    }

    // Upsert each summary (unique per toli + week)
    for (const s of summaries) {
      await tx
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
  });
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

/**
 * Compute the weekly settlement for one supplier from approved summaries + drops.
 * The collection (net payment) is worker earnings PLUS drop rent charges — the
 * full amount the facility pays out to the supplier for the week.
 */
export async function computeSupplierWeekPayment(
  facilityId: string,
  supplierId: string,
  weekStart: Date,
  weekEnd: Date,
  client: TxLike = db
): Promise<SupplierWeekPayment | null> {
  const supplier = (
    await client.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1)
  )[0];
  if (!supplier) return null;

  const approvedSummaries = await client
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

  const drops = await client
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

  const totalWorkerEarnings = roundMoney(
    approvedSummaries.reduce((s, x) => s + x.total_earnings, 0)
  );
  const totalRentCharges = drops.reduce((s, d) => s + d.rent_per_drop, 0);

  return {
    supplierId,
    supplierName: supplier.name,
    totalWorkerEarnings,
    totalDrops: drops.length,
    totalRentCharges,
    netPayment: roundMoney(totalWorkerEarnings + totalRentCharges),
  };
}

/**
 * Outstanding advance balance for a supplier at a facility:
 * total advances given − total already recovered through weekly deductions.
 */
export async function outstandingAdvance(
  facilityId: string,
  supplierId: string,
  client: TxLike = db
): Promise<number> {
  const advances = await client
    .select({ amount: supplierAdvances.amount })
    .from(supplierAdvances)
    .where(
      and(
        eq(supplierAdvances.facility_id, facilityId),
        eq(supplierAdvances.supplier_id, supplierId)
      )
    );
  const recovered = await client
    .select({ amount: supplierPayments.advance_deducted })
    .from(supplierPayments)
    .where(
      and(
        eq(supplierPayments.facility_id, facilityId),
        eq(supplierPayments.supplier_id, supplierId)
      )
    );
  const given = advances.reduce((s, a) => s + a.amount, 0);
  const back = recovered.reduce((s, p) => s + (p.amount ?? 0), 0);
  return Math.max(0, roundMoney(given - back));
}

/**
 * Process Sunday supplier payments for a facility: for every supplier that has
 * approved weekly summaries this week, create/update a supplier_payments row.
 * Marks counted work entries as PAID. The payment rows + PAID flip are
 * committed atomically so a mid-way failure cannot leave payments created but
 * entries unpaid (or vice versa).
 *
 * `advanceDeductions` maps supplierId → amount the facility admin chose to
 * recover from that supplier's outstanding advance this week. The deduction
 * is clamped to the outstanding balance and to the week's net payment (a
 * settlement never goes negative); anything left over carries forward.
 */
export async function processSupplierPayments(
  facilityId: string,
  weekStart: Date,
  weekEnd: Date,
  advanceDeductions: Record<string, number> = {}
) {
  return db.transaction(async (tx) => {
    const summaries = await tx
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
        weekEnd,
        tx
      );
      if (!payment) continue;

      // Once collected/distributed, a week's payment is locked.
      const [existing] = await tx
        .select()
        .from(supplierPayments)
        .where(
          and(
            eq(supplierPayments.facility_id, facilityId),
            eq(supplierPayments.supplier_id, supplierId),
            eq(supplierPayments.week_start_date, weekStart)
          )
        )
        .limit(1);
      if (existing && existing.collection_status !== "PENDING") continue;

      const balanceBefore = await outstandingAdvance(facilityId, supplierId, tx);
      const requested = Math.max(0, roundMoney(Number(advanceDeductions[supplierId] ?? 0)));
      const advanceDeducted = roundMoney(Math.min(requested, balanceBefore, Math.max(0, payment.netPayment)));
      const netPayment = roundMoney(payment.netPayment - advanceDeducted);

      await tx
        .insert(supplierPayments)
        .values({
          supplier_id: payment.supplierId,
          facility_id: facilityId,
          week_start_date: weekStart,
          week_end_date: weekEnd,
          total_worker_earnings: payment.totalWorkerEarnings,
          total_drops: payment.totalDrops,
          total_rent_charges: payment.totalRentCharges,
          net_payment: netPayment,
          advance_deducted: advanceDeducted,
          advance_balance_before: balanceBefore,
          collection_status: "PENDING",
        })
        .onConflictDoUpdate({
          target: [supplierPayments.supplier_id, supplierPayments.week_start_date],
          set: {
            week_end_date: weekEnd,
            total_worker_earnings: payment.totalWorkerEarnings,
            total_drops: payment.totalDrops,
            total_rent_charges: payment.totalRentCharges,
            net_payment: netPayment,
            advance_deducted: advanceDeducted,
            advance_balance_before: balanceBefore,
          },
        });

      results.push({ ...payment, netPayment });
    }

    // Mark counted work entries as PAID
    const toliIds = summaries.map((s) => s.toli_id);
    if (toliIds.length > 0) {
      await tx
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
  });
}

// ---------------------------------------------------------------------------
// Supplier collection + distribution
// ---------------------------------------------------------------------------

export async function collectSupplierPayment(
  paymentId: string,
  method: "CASH" | "BANK_TRANSFER",
  notes?: string | null
) {
  const [existing] = await db
    .select()
    .from(supplierPayments)
    .where(eq(supplierPayments.id, paymentId))
    .limit(1);
  if (!existing) return null;
  if (existing.collection_status !== "PENDING") {
    throw badRequest(
      existing.collection_status === "DISTRIBUTED_TO_WORKERS"
        ? "Payment has already been distributed to workers"
        : "Payment has already been collected"
    );
  }

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
  // Distribution rows + the status flip are committed atomically, and the
  // state guards prevent distributing before collection or distributing twice.
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(supplierPayments)
      .where(eq(supplierPayments.id, paymentId))
      .limit(1);
    if (!payment) return null;

    if (payment.collection_status !== "COLLECTED_FROM_FACILITY") {
      throw badRequest(
        payment.collection_status === "DISTRIBUTED_TO_WORKERS"
          ? "Payment has already been distributed to workers"
          : "Payment must be collected from the facility before distributing"
      );
    }

    const total = distributions.reduce((s, d) => s + d.amount, 0);
    if (total <= 0) throw badRequest("Distribution total must be greater than zero");
    if (total > payment.net_payment) {
      throw badRequest("Distribution total exceeds net payment amount");
    }

    for (const d of distributions) {
      await tx.insert(supplierPaymentDistributions).values({
        supplier_payment_id: paymentId,
        supplier_id: payment.supplier_id,
        toli_id: d.toliId,
        amount_distributed: d.amount,
        distribution_date: new Date(),
        payment_method: d.method,
        notes: d.notes ?? null,
      });
    }

    const [updated] = await tx
      .update(supplierPayments)
      .set({
        collection_status: "DISTRIBUTED_TO_WORKERS",
        updated_at: new Date(),
      })
      .where(eq(supplierPayments.id, paymentId))
      .returning();

    return updated;
  });
}

export async function getPaymentDistributions(paymentId: string) {
  const rows = await db
    .select({
      id: supplierPaymentDistributions.id,
      supplier_payment_id: supplierPaymentDistributions.supplier_payment_id,
      supplier_id: supplierPaymentDistributions.supplier_id,
      toli_id: supplierPaymentDistributions.toli_id,
      amount_distributed: supplierPaymentDistributions.amount_distributed,
      distribution_date: supplierPaymentDistributions.distribution_date,
      payment_method: supplierPaymentDistributions.payment_method,
      notes: supplierPaymentDistributions.notes,
      created_at: supplierPaymentDistributions.created_at,
      toliLeader: tolis.leader_name,
    })
    .from(supplierPaymentDistributions)
    .innerJoin(tolis, eq(tolis.id, supplierPaymentDistributions.toli_id))
    .where(eq(supplierPaymentDistributions.supplier_payment_id, paymentId))
    .orderBy(desc(supplierPaymentDistributions.created_at));
  return rows.map((r) => ({ ...r, leader_name: r.toliLeader ?? null }));
}

/** Convenience: today's week boundaries. */
export function currentWeek() {
  const start = startOfWeek(new Date());
  return { weekStart: start, weekEnd: endOfWeek(new Date()) };
}
