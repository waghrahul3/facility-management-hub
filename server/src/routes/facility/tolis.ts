import { Router } from "express";
import { count, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { supplierDrops, suppliers, toliLeaders, tolis } from "../../db/schema.js";
import { requireFacilityAccess } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
import { param } from "../../lib/params.js";

const router = Router();

// ---------------------------------------------------------------------------
// Tolis
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/tolis",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
    const where = eq(tolis.facility_id, param(req, "facilityId"));
    const rows = await db
      .select({
        toli: tolis,
        drop: {
          id: supplierDrops.id,
          rent_per_drop: supplierDrops.rent_per_drop,
        },
        supplier: { id: suppliers.id, name: suppliers.name },
      })
      .from(tolis)
      .leftJoin(supplierDrops, eq(supplierDrops.id, tolis.drop_id))
      .leftJoin(suppliers, eq(suppliers.id, supplierDrops.supplier_id))
      .where(where)
      .orderBy(desc(tolis.date))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db
      .select({ value: count() })
      .from(tolis)
      .where(where);
    return res.json({ tolis: rows, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

router.post(
  "/:facilityId/tolis",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { leader_name, worker_count, daily_charge, date, drop_id } = req.body ?? {};
    if (!leader_name || !date) throw badRequest("leader_name and date are required");

    // Keep a lightweight toli leader registry
    const [leader] = await db
      .insert(toliLeaders)
      .values({ name: leader_name, phone: null })
      .returning();

    const [toli] = await db
      .insert(tolis)
      .values({
        facility_id: param(req, "facilityId"),
        leader_id: leader.id,
        leader_name,
        worker_count: worker_count ?? 0,
        daily_charge: daily_charge ?? 0,
        date: new Date(date),
        drop_id: drop_id ?? null,
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "TOLI",
      entityId: toli.id,
      newValues: toli,
    });
    return res.status(201).json({ toli });
  })
);

router.put(
  "/:facilityId/tolis/:toliId",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(tolis).where(eq(tolis.id, param(req, "toliId"))).limit(1)
    )[0];
    if (!existing) throw notFound("Toli not found");

    const { leader_name, worker_count, daily_charge, status, drop_id } = req.body ?? {};
    const [updated] = await db
      .update(tolis)
      .set({
        leader_name: leader_name ?? existing.leader_name,
        worker_count: worker_count !== undefined ? worker_count : existing.worker_count,
        daily_charge: daily_charge !== undefined ? daily_charge : existing.daily_charge,
        status: status ?? existing.status,
        drop_id: drop_id !== undefined ? drop_id : existing.drop_id,
        updated_at: new Date(),
      })
      .where(eq(tolis.id, param(req, "toliId")))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "TOLI",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ toli: updated });
  })
);

router.delete(
  "/:facilityId/tolis/:toliId",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(tolis).where(eq(tolis.id, param(req, "toliId"))).limit(1)
    )[0];
    if (!existing) throw notFound("Toli not found");
    await db.delete(tolis).where(eq(tolis.id, param(req, "toliId")));
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "DELETE",
      entityType: "TOLI",
      entityId: param(req, "toliId"),
      oldValues: existing,
    });
    return res.json({ ok: true });
  })
);

export default router;
