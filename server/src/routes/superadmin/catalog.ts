import { Router } from "express";
import { desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { bagSizes, rates } from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { param } from "../../lib/params.js";

const router = Router();

// ---------------------------------------------------------------------------
// Bag sizes (global)
// ---------------------------------------------------------------------------

router.get(
  "/bag-sizes",
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select()
      .from(bagSizes)
      .orderBy(desc(bagSizes.created_at));
    return res.json({ bagSizes: rows });
  })
);

router.post(
  "/bag-sizes",
  asyncHandler(async (req, res) => {
    const { size_name, weight_kg } = req.body ?? {};
    if (!size_name || weight_kg == null) {
      throw badRequest("size_name and weight_kg are required");
    }
    const [row] = await db
      .insert(bagSizes)
      .values({
        size_name,
        weight_kg,
        is_global: true,
        created_by: req.auth?.userId,
      })
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "BAG_SIZE",
      entityId: row.id,
      newValues: row,
    });
    return res.status(201).json({ bagSize: row });
  })
);

router.put(
  "/bag-sizes/:id",
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(bagSizes).where(eq(bagSizes.id, param(req, "id"))).limit(1)
    )[0];
    if (!existing) throw notFound("Bag size not found");
    const { size_name, weight_kg } = req.body ?? {};
    const [updated] = await db
      .update(bagSizes)
      .set({
        size_name: size_name ?? existing.size_name,
        weight_kg: weight_kg != null ? weight_kg : existing.weight_kg,
        updated_at: new Date(),
      })
      .where(eq(bagSizes.id, param(req, "id")))
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "BAG_SIZE",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ bagSize: updated });
  })
);

// ---------------------------------------------------------------------------
// Global rates
// ---------------------------------------------------------------------------

router.get(
  "/rates",
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select()
      .from(rates)
      .where(isNull(rates.facility_id))
      .orderBy(desc(rates.created_at));
    return res.json({ rates: rows });
  })
);

router.post(
  "/rates",
  asyncHandler(async (req, res) => {
    const { bag_size_id, rate_amount } = req.body ?? {};
    if (!bag_size_id || rate_amount == null) {
      throw badRequest("bag_size_id and rate_amount are required");
    }
    // Upsert global rate per bag size
    const [row] = await db
      .insert(rates)
      .values({
        bag_size_id,
        facility_id: null,
        rate_amount,
        is_global: true,
        created_by: req.auth?.userId,
      })
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "RATE",
      entityId: row.id,
      newValues: row,
    });
    return res.status(201).json({ rate: row });
  })
);

router.put(
  "/rates/:id",
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(rates).where(eq(rates.id, param(req, "id"))).limit(1)
    )[0];
    if (!existing) throw notFound("Rate not found");
    const { rate_amount } = req.body ?? {};
    if (rate_amount == null) throw badRequest("rate_amount is required");
    const [updated] = await db
      .update(rates)
      .set({ rate_amount, updated_at: new Date() })
      .where(eq(rates.id, param(req, "id")))
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "RATE",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ rate: updated });
  })
);

export default router;
