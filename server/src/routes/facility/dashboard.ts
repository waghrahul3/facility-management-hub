import { Router } from "express";
import { and, count, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { facilities, supplierDrops, supplierPayments, tolis, weeklyWorkSummaries } from "../../db/schema.js";
import { requireFacilityAccess } from "../../auth/middleware.js";
import { asyncHandler, notFound } from "../../lib/errors.js";
import { param } from "../../lib/params.js";
import { currentWeek } from "../../services/payments.js";

const router = Router();

// ---------------------------------------------------------------------------
// Facility dashboard & reports
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/dashboard",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const facility = (
      await db.select().from(facilities).where(eq(facilities.id, param(req, "facilityId"))).limit(1)
    )[0];
    if (!facility) throw notFound("Facility not found");

    const { weekStart, weekEnd } = currentWeek();

    const [dropCountRow] = await db
      .select({ value: count() })
      .from(supplierDrops)
      .where(
        and(
          eq(supplierDrops.facility_id, param(req, "facilityId")),
          gte(supplierDrops.drop_date, weekStart),
          lte(supplierDrops.drop_date, weekEnd)
        )
      );

    const [toliCountRow] = await db
      .select({ value: count() })
      .from(tolis)
      .where(eq(tolis.facility_id, param(req, "facilityId")));

    const [pendingSummaryRow] = await db
      .select({ value: count() })
      .from(weeklyWorkSummaries)
      .where(
        and(
          eq(weeklyWorkSummaries.facility_id, param(req, "facilityId")),
          eq(weeklyWorkSummaries.approval_status, "PENDING")
        )
      );

    const pendingPayments = await db
      .select()
      .from(supplierPayments)
      .where(
        and(
          eq(supplierPayments.facility_id, param(req, "facilityId")),
          eq(supplierPayments.collection_status, "PENDING")
        )
      )
      .limit(5);

    const weekRentTotal = await db
      .select({ sum: supplierDrops.rent_per_drop })
      .from(supplierDrops)
      .where(
        and(
          eq(supplierDrops.facility_id, param(req, "facilityId")),
          gte(supplierDrops.drop_date, weekStart),
          lte(supplierDrops.drop_date, weekEnd)
        )
      );

    return res.json({
      facility,
      weekStart,
      weekEnd,
      weekDropCount: dropCountRow?.value ?? 0,
      toliCount: toliCountRow?.value ?? 0,
      pendingSummaryCount: pendingSummaryRow?.value ?? 0,
      weekRentTotal: weekRentTotal.reduce((s, r) => s + r.sum, 0),
      pendingPayments,
    });
  })
);

export default router;
