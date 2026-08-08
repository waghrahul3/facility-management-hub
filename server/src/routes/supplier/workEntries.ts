import { Router } from "express";
import { and, count, desc, eq, gte, ilike, inArray, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { bagSizes, supplierDrops, tolis, workEntries } from "../../db/schema.js";
import { endOfWeek, startOfWeek } from "../../lib/date.js";
import { asyncHandler, notFound } from "../../lib/errors.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
import { param } from "../../lib/params.js";
import { mySupplierId } from "./_shared.js";

const router = Router();

// Work entries for the supplier's own drops, for the current week by default.
router.get(
  "/work-entries",
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, unknown>;
    const weekStart = q.weekStart ? new Date(String(q.weekStart)) : startOfWeek(new Date());
    const weekEnd = q.weekEnd ? new Date(String(q.weekEnd)) : endOfWeek(weekStart);
    const { limit, offset, page, pageSize } = parsePage(q);
    const search = typeof q.q === "string" ? q.q.trim() : "";
    const status = typeof q.status === "string" ? q.status.trim() : "";

    // Tolis under this supplier's drops
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
    const dropIds = dropRows.map((d) => d.id);
    if (dropIds.length === 0) {
      return res.json({ entries: [], ...pageMeta(0, { page, pageSize, limit, offset }) });
    }

    const toliRows = await db
      .select()
      .from(tolis)
      .where(
        and(
          inArray(tolis.drop_id, dropIds),
          search ? ilike(tolis.leader_name, `%${search}%`) : undefined
        )
      );
    const toliIds = toliRows.map((t) => t.id);
    if (toliIds.length === 0) {
      return res.json({ entries: [], ...pageMeta(0, { page, pageSize, limit, offset }) });
    }

    const where = and(
      inArray(workEntries.toli_id, toliIds),
      gte(workEntries.work_date, weekStart),
      lte(workEntries.work_date, weekEnd),
      status ? eq(workEntries.status, status as "DRAFT" | "APPROVED" | "PAID") : undefined
    );
    const entries = await db
      .select({
        entry: workEntries,
        toli: { id: tolis.id, leader_name: tolis.leader_name },
        bagSize: { id: bagSizes.id, size_name: bagSizes.size_name, weight_kg: bagSizes.weight_kg },
      })
      .from(workEntries)
      .innerJoin(tolis, eq(tolis.id, workEntries.toli_id))
      .innerJoin(bagSizes, eq(bagSizes.id, workEntries.bag_size_id))
      .where(where)
      .orderBy(desc(workEntries.work_date))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db.select({ value: count() }).from(workEntries).where(where);

    return res.json({ entries, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

router.get(
  "/work-entries/drop/:dropId",
  asyncHandler(async (req, res) => {
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
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

    const toliRows = await db.select().from(tolis).where(eq(tolis.drop_id, drop.id));
    const toliIds = toliRows.map((t) => t.id);
    if (toliIds.length === 0) return res.json({ entries: [] });

    const where = inArray(workEntries.toli_id, toliIds);
    const entries = await db
      .select({
        entry: workEntries,
        toli: { id: tolis.id, leader_name: tolis.leader_name },
        bagSize: { id: bagSizes.id, size_name: bagSizes.size_name, weight_kg: bagSizes.weight_kg },
      })
      .from(workEntries)
      .innerJoin(tolis, eq(tolis.id, workEntries.toli_id))
      .innerJoin(bagSizes, eq(bagSizes.id, workEntries.bag_size_id))
      .where(where)
      .orderBy(desc(workEntries.work_date))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db.select({ value: count() }).from(workEntries).where(where);

    return res.json({ entries, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

export default router;
