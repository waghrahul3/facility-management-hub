import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { facilities, supplierAdvances } from "../../db/schema.js";
import { asyncHandler } from "../../lib/errors.js";
import { outstandingAdvance } from "../../services/payments.js";
import { mySupplierId } from "./_shared.js";

const router = Router();

// GET /advances — the supplier's own advance history + outstanding balance.
router.get(
  "/advances",
  asyncHandler(async (req, res) => {
    const supplierId = mySupplierId(req);
    const rows = await db
      .select({
        advance: supplierAdvances,
        facility: { id: facilities.id, name: facilities.name },
      })
      .from(supplierAdvances)
      .innerJoin(facilities, eq(facilities.id, supplierAdvances.facility_id))
      .where(eq(supplierAdvances.supplier_id, supplierId))
      .orderBy(desc(supplierAdvances.advance_date), desc(supplierAdvances.created_at))
      .limit(200);

    const advances = rows.map((r) => ({ ...r.advance, facility: r.facility }));

    // Outstanding = total given − total recovered (across all facilities)
    const balanceRows = await db
      .select({ facility_id: supplierAdvances.facility_id, amount: supplierAdvances.amount })
      .from(supplierAdvances)
      .where(eq(supplierAdvances.supplier_id, supplierId));
    const facilityIds = [...new Set(balanceRows.map((r) => r.facility_id))];
    const byFacility = await Promise.all(
      facilityIds.map(async (fid) => ({
        facilityId: fid,
        outstanding: await outstandingAdvance(fid, supplierId),
      }))
    );
    const totalGiven = balanceRows.reduce((s, r) => s + r.amount, 0);
    const totalOutstanding = byFacility.reduce((s, b) => s + b.outstanding, 0);

    return res.json({
      advances,
      totalGiven,
      totalOutstanding,
      byFacility,
    });
  })
);

export default router;
