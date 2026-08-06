import { Router } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { supplierDrops, suppliers } from "../../db/schema.js";
import { requireFacilityAccess } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { param } from "../../lib/params.js";
import { weekParams } from "./_shared.js";

const router = Router();

// ---------------------------------------------------------------------------
// Supplier drops
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/supplier-drops",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = weekParams(req.query as Record<string, unknown>);
    const rows = await db
      .select({
        drop: supplierDrops,
        supplier: {
          id: suppliers.id,
          name: suppliers.name,
          phone: suppliers.phone,
        },
      })
      .from(supplierDrops)
      .leftJoin(suppliers, eq(suppliers.id, supplierDrops.supplier_id))
      .where(
        and(
          eq(supplierDrops.facility_id, param(req, "facilityId")),
          gte(supplierDrops.drop_date, weekStart),
          lte(supplierDrops.drop_date, weekEnd)
        )
      )
      .orderBy(desc(supplierDrops.drop_date));
    return res.json({ drops: rows });
  })
);

router.post(
  "/:facilityId/supplier-drops",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { supplier_id, drop_date, total_workers_dropped, rent_per_drop } = req.body ?? {};
    if (!supplier_id || !drop_date) {
      throw badRequest("supplier_id and drop_date are required");
    }
    const [drop] = await db
      .insert(supplierDrops)
      .values({
        supplier_id,
        facility_id: param(req, "facilityId"),
        drop_date: new Date(drop_date),
        total_workers_dropped: total_workers_dropped ?? 0,
        rent_per_drop: rent_per_drop ?? 0,
      })
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "SUPPLIER_DROP",
      entityId: drop.id,
      newValues: drop,
    });
    return res.status(201).json({ drop });
  })
);

router.put(
  "/:facilityId/supplier-drops/:dropId",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const existing = (
      await db
        .select()
        .from(supplierDrops)
        .where(eq(supplierDrops.id, param(req, "dropId")))
        .limit(1)
    )[0];
    if (!existing) throw notFound("Drop not found");

    const { total_workers_dropped, rent_per_drop, status } = req.body ?? {};
    const [updated] = await db
      .update(supplierDrops)
      .set({
        total_workers_dropped:
          total_workers_dropped !== undefined ? total_workers_dropped : existing.total_workers_dropped,
        rent_per_drop: rent_per_drop !== undefined ? rent_per_drop : existing.rent_per_drop,
        status: status ?? existing.status,
        updated_at: new Date(),
      })
      .where(eq(supplierDrops.id, param(req, "dropId")))
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "SUPPLIER_DROP",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ drop: updated });
  })
);

export default router;
