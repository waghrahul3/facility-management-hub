import { Router } from "express";
import { eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { bagSizes, rates } from "../../db/schema.js";
import { requireFacilityAccess } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest } from "../../lib/errors.js";
import { param } from "../../lib/params.js";

const router = Router();

// ---------------------------------------------------------------------------
// Facility-specific rates
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/rates",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    // Facility-specific rates
    const facilityRates = await db
      .select({
        rate: rates,
        bagSize: { id: bagSizes.id, size_name: bagSizes.size_name, weight_kg: bagSizes.weight_kg },
      })
      .from(rates)
      .innerJoin(bagSizes, eq(bagSizes.id, rates.bag_size_id))
      .where(eq(rates.facility_id, param(req, "facilityId")));

    // Global rates (fallback)
    const globalRates = await db
      .select({
        rate: rates,
        bagSize: { id: bagSizes.id, size_name: bagSizes.size_name, weight_kg: bagSizes.weight_kg },
      })
      .from(rates)
      .innerJoin(bagSizes, eq(bagSizes.id, rates.bag_size_id))
      .where(isNull(rates.facility_id));

    return res.json({ facilityRates, globalRates });
  })
);

router.post(
  "/:facilityId/rates",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { bag_size_id, rate_amount } = req.body ?? {};
    if (!bag_size_id || rate_amount == null) {
      throw badRequest("bag_size_id and rate_amount are required");
    }

    // Upsert facility-specific rate for this bag size
    const [rate] = await db
      .insert(rates)
      .values({
        bag_size_id,
        facility_id: param(req, "facilityId"),
        rate_amount,
        is_global: false,
        created_by: req.auth?.userId,
      })
      .onConflictDoUpdate({
        target: [rates.bag_size_id, rates.facility_id],
        set: { rate_amount, updated_at: new Date() },
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "RATE",
      entityId: rate.id,
      newValues: rate,
    });
    return res.status(201).json({ rate });
  })
);

export default router;
