import { Router } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { supplierDrops, supplierPayments, tolis, weeklyWorkSummaries } from "../../db/schema.js";
import { asyncHandler } from "../../lib/errors.js";
import { computeSupplierWeekPayment, currentWeek } from "../../services/payments.js";
import { mySupplierId } from "./_shared.js";

const router = Router();

router.get(
  "/this-week",
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = currentWeek();

    const summaries = await db
      .select({
        summary: weeklyWorkSummaries,
        toli: { id: tolis.id, leader_name: tolis.leader_name },
      })
      .from(weeklyWorkSummaries)
      .innerJoin(tolis, eq(tolis.id, weeklyWorkSummaries.toli_id))
      .where(
        and(
          eq(weeklyWorkSummaries.supplier_id, mySupplierId(req)),
          gte(weeklyWorkSummaries.week_start_date, weekStart),
          lte(weeklyWorkSummaries.week_end_date, weekEnd)
        )
      )
      .orderBy(desc(weeklyWorkSummaries.total_earnings));

    const dropRows = await db
      .select()
      .from(supplierDrops)
      .where(
        and(
          eq(supplierDrops.supplier_id, mySupplierId(req)),
          gte(supplierDrops.drop_date, weekStart),
          lte(supplierDrops.drop_date, weekEnd)
        )
      );

    const totalRent = dropRows.reduce((s, d) => s + d.rent_per_drop, 0);
    const totalEarnings = summaries
      .filter((s) => s.summary.approval_status === "APPROVED")
      .reduce((s, r) => s + r.summary.total_earnings, 0);

    return res.json({
      weekStart,
      weekEnd,
      drops: dropRows,
      summaries,
      totalDrops: dropRows.length,
      totalRent,
      totalWorkerEarnings: totalEarnings,
      netPayment: totalEarnings - totalRent,
    });
  })
);

router.get(
  "/payment-pending",
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = currentWeek();
    const payment = await computeSupplierWeekPayment(
      // supplier needs a facility: pick the facility of their latest drop
      (await latestFacilityForSupplier(mySupplierId(req))) ?? "",
      mySupplierId(req),
      weekStart,
      weekEnd
    );

    const stored = await db
      .select()
      .from(supplierPayments)
      .where(
        and(
          eq(supplierPayments.supplier_id, mySupplierId(req)),
          eq(supplierPayments.week_start_date, weekStart)
        )
      )
      .orderBy(desc(supplierPayments.created_at))
      .limit(1);

    return res.json({ payment, stored: stored[0] ?? null, weekStart, weekEnd });
  })
);

async function latestFacilityForSupplier(supplierId: string): Promise<string | null> {
  const row = await db
    .select({ facility_id: supplierDrops.facility_id })
    .from(supplierDrops)
    .where(eq(supplierDrops.supplier_id, supplierId))
    .orderBy(desc(supplierDrops.drop_date))
    .limit(1);
  return row[0]?.facility_id ?? null;
}

export default router;
