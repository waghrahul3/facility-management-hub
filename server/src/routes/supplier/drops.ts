import { Router } from "express";
import { and, count, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { facilities, supplierDrops, tolis } from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { endOfWeek, startOfWeek } from "../../lib/date.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
import { reqLogger } from "../../lib/logger.js";
import { param } from "../../lib/params.js";
import { mySupplierId } from "./_shared.js";

const router = Router();

router.get(
  "/drops",
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, unknown>;
    const weekStart = q.weekStart ? new Date(String(q.weekStart)) : startOfWeek(new Date());
    const weekEnd = q.weekEnd ? new Date(String(q.weekEnd)) : endOfWeek(weekStart);
    const { limit, offset, page, pageSize } = parsePage(q);
    const search = typeof q.q === "string" ? q.q.trim() : "";
    const status = typeof q.status === "string" ? q.status.trim() : "";
    const where = and(
      eq(supplierDrops.supplier_id, mySupplierId(req)),
      gte(supplierDrops.drop_date, weekStart),
      lte(supplierDrops.drop_date, weekEnd),
      search ? ilike(facilities.name, `%${search}%`) : undefined,
      status ? eq(supplierDrops.status, status as "REGISTERED" | "COMPLETED") : undefined
    );

    const rows = await db
      .select({
        drop: supplierDrops,
        facility: { id: facilities.id, name: facilities.name },
      })
      .from(supplierDrops)
      .leftJoin(facilities, eq(facilities.id, supplierDrops.facility_id))
      .where(where)
      .orderBy(desc(supplierDrops.drop_date))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db
      .select({ value: count() })
      .from(supplierDrops)
      .leftJoin(facilities, eq(facilities.id, supplierDrops.facility_id))
      .where(where);
    return res.json({ drops: rows, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

router.post(
  "/drops/register",
  asyncHandler(async (req, res) => {
    const log = reqLogger({ method: "POST", path: "/supplier/supplier-drops" });
    log.info("Registering supplier drop", { facilityId: req.body?.facility_id, dropDate: req.body?.drop_date, workers: req.body?.total_workers_dropped });
    const { facility_id, drop_date, total_workers_dropped, rent_per_drop } = req.body ?? {};
    if (!facility_id || !drop_date) {
      throw badRequest("facility_id and drop_date are required");
    }
    const [drop] = await db
      .insert(supplierDrops)
      .values({
        supplier_id: mySupplierId(req),
        facility_id,
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

router.get(
  "/drops/:dropId",
  asyncHandler(async (req, res) => {
    const drop = (
      await db
        .select()
        .from(supplierDrops)
        .where(
          and(
            eq(supplierDrops.id, param(req, "dropId")),
            eq(supplierDrops.supplier_id, mySupplierId(req))
          )
        )
        .limit(1)
    )[0];
    if (!drop) throw notFound("Drop not found");

    // Tolis under this drop
    const toliRows = await db
      .select()
      .from(tolis)
      .where(eq(tolis.drop_id, drop.id));
    return res.json({ drop, tolis: toliRows });
  })
);

export default router;
