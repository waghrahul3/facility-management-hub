import { Router } from "express";
import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  companies,
  facilities,
  supplierDrops,
  supplierPayments,
  suppliers,
  tolis,
  weeklyWorkSummaries,
} from "../../db/schema.js";
import { requireCompanyAccess } from "../../auth/middleware.js";
import { asyncHandler, notFound } from "../../lib/errors.js";
import { param } from "../../lib/params.js";
import { currentWeek } from "../../services/payments.js";

const router = Router();

// ---------------------------------------------------------------------------
// Company overview dashboard (all facilities under the company)
// ---------------------------------------------------------------------------

router.get(
  "/:companyId/dashboard",
  requireCompanyAccess,
  asyncHandler(async (req, res) => {
    const company = (
      await db.select().from(companies).where(eq(companies.id, param(req, "companyId"))).limit(1)
    )[0];
    if (!company) throw notFound("Company not found");

    const facilityRows = await db
      .select()
      .from(facilities)
      .where(eq(facilities.company_id, param(req, "companyId")))
      .orderBy(facilities.name);
    const facilityIds = facilityRows.map((f) => f.id);

    const { weekStart, weekEnd } = currentWeek();
    const inScope =
      facilityIds.length > 0 ? inArray(supplierDrops.facility_id, facilityIds) : undefined;

    const [dropCountRow] = inScope
      ? await db
          .select({ value: count() })
          .from(supplierDrops)
          .where(and(inScope, gte(supplierDrops.drop_date, weekStart), lte(supplierDrops.drop_date, weekEnd)))
      : [{ value: 0 }];

    const [toliCountRow] = facilityIds.length > 0
      ? await db
          .select({ value: count() })
          .from(tolis)
          .where(inArray(tolis.facility_id, facilityIds))
      : [{ value: 0 }];

    const [pendingSummaryRow] = facilityIds.length > 0
      ? await db
          .select({ value: count() })
          .from(weeklyWorkSummaries)
          .where(
            and(
              inArray(weeklyWorkSummaries.facility_id, facilityIds),
              eq(weeklyWorkSummaries.approval_status, "PENDING")
            )
          )
      : [{ value: 0 }];

    const weekRentRows = inScope
      ? await db
          .select({ sum: supplierDrops.rent_per_drop })
          .from(supplierDrops)
          .where(and(inScope, gte(supplierDrops.drop_date, weekStart), lte(supplierDrops.drop_date, weekEnd)))
      : [];

    const pendingPayments = facilityIds.length > 0
      ? await db
          .select({
            payment: {
              id: supplierPayments.id,
              facility_id: supplierPayments.facility_id,
              week_start_date: supplierPayments.week_start_date,
              net_payment: supplierPayments.net_payment,
              collection_status: supplierPayments.collection_status,
            },
            supplier: { id: suppliers.id, name: suppliers.name },
            facility: { id: facilities.id, name: facilities.name },
          })
          .from(supplierPayments)
          .innerJoin(suppliers, eq(suppliers.id, supplierPayments.supplier_id))
          .innerJoin(facilities, eq(facilities.id, supplierPayments.facility_id))
          .where(
            and(
              inArray(supplierPayments.facility_id, facilityIds),
              eq(supplierPayments.collection_status, "PENDING")
            )
          )
          .orderBy(desc(supplierPayments.net_payment))
          .limit(10)
      : [];

    const facilityStats = await Promise.all(
      facilityRows.map(async (f) => {
        const [dc] = await db
          .select({ value: count() })
          .from(supplierDrops)
          .where(
            and(
              eq(supplierDrops.facility_id, f.id),
              gte(supplierDrops.drop_date, weekStart),
              lte(supplierDrops.drop_date, weekEnd)
            )
          );
        const [tc] = await db
          .select({ value: count() })
          .from(tolis)
          .where(eq(tolis.facility_id, f.id));
        const [pc] = await db
          .select({ value: count() })
          .from(supplierPayments)
          .where(
            and(
              eq(supplierPayments.facility_id, f.id),
              eq(supplierPayments.collection_status, "PENDING")
            )
          );
        return {
          facility: f,
          weekDropCount: dc?.value ?? 0,
          toliCount: tc?.value ?? 0,
          pendingPaymentCount: pc?.value ?? 0,
        };
      })
    );

    return res.json({
      company,
      weekStart,
      weekEnd,
      facilityStats,
      totals: {
        facilityCount: facilityRows.length,
        weekDropCount: dropCountRow?.value ?? 0,
        toliCount: toliCountRow?.value ?? 0,
        pendingSummaryCount: pendingSummaryRow?.value ?? 0,
        weekRentTotal: weekRentRows.reduce((s, r) => s + r.sum, 0),
        pendingPaymentCount: pendingPayments.length,
      },
      pendingPayments,
    });
  })
);

export default router;
