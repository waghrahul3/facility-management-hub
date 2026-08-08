import { Router } from "express";
import { and, count, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { supplierDrops, suppliers } from "../../db/schema.js";
import { requireFacilityAccess } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
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
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
    const query = req.query as Record<string, unknown>;
    const q = typeof query.q === "string" ? query.q.trim() : "";
    const status = typeof query.status === "string" ? query.status.trim() : "";
    const where = and(
      eq(supplierDrops.facility_id, param(req, "facilityId")),
      gte(supplierDrops.drop_date, weekStart),
      lte(supplierDrops.drop_date, weekEnd),
      q ? ilike(suppliers.name, `%${q}%`) : undefined,
      status ? eq(supplierDrops.status, status as "REGISTERED" | "COMPLETED") : undefined
    );
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
      .where(where)
      .orderBy(desc(supplierDrops.drop_date))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db
      .select({ value: count() })
      .from(supplierDrops)
      .innerJoin(suppliers, eq(suppliers.id, supplierDrops.supplier_id))
      .where(where);
    return res.json({ drops: rows, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
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

    const { supplier_id, drop_date, total_workers_dropped, rent_per_drop, status } = req.body ?? {};
    const [updated] = await db
      .update(supplierDrops)
      .set({
        supplier_id: supplier_id !== undefined ? supplier_id : existing.supplier_id,
        drop_date: drop_date !== undefined ? new Date(drop_date) : existing.drop_date,
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
