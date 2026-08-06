import { Router } from "express";
import { and, count, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { supplierDrops, supplierPayments, tolis } from "../../db/schema.js";
import { asyncHandler } from "../../lib/errors.js";
import { currentWeek } from "../../services/payments.js";
import { mySupplierId } from "./_shared.js";

const router = Router();

// Dashboard summary
router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = currentWeek();
    const [dropCountRow] = await db
      .select({ value: count() })
      .from(supplierDrops)
      .where(
        and(
          eq(supplierDrops.supplier_id, mySupplierId(req)),
          gte(supplierDrops.drop_date, weekStart),
          lte(supplierDrops.drop_date, weekEnd)
        )
      );

    // Count tolis across this supplier's drops this week
    const dropRows = await db
      .select({ id: supplierDrops.id })
      .from(supplierDrops)
      .where(
        and(
          eq(supplierDrops.supplier_id, mySupplierId(req)),
          gte(supplierDrops.drop_date, weekStart),
          lte(supplierDrops.drop_date, weekEnd)
        )
      );
    const dropIds = dropRows.map((d) => d.id);
    const [toliCountRow] = dropIds.length
      ? await db.select({ value: count() }).from(tolis).where(inArray(tolis.drop_id, dropIds))
      : [{ value: 0 }];

    const pendingPayments = await db
      .select()
      .from(supplierPayments)
      .where(
        and(
          eq(supplierPayments.supplier_id, mySupplierId(req)),
          eq(supplierPayments.collection_status, "PENDING")
        )
      )
      .limit(5);

    return res.json({
      weekStart,
      weekEnd,
      weekDropCount: dropCountRow?.value ?? 0,
      weekToliCount: toliCountRow?.value ?? 0,
      pendingPayments,
    });
  })
);

export default router;
