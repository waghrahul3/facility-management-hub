import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { subscriptionPlans } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { reqLogger } from "../../lib/logger.js";

const router = Router();

const VALID_CYCLES = ["monthly", "quarterly", "half-yearly", "yearly", "annually"];

// ---------------------------------------------------------------------------
// Super Admin: Plan Management
// ---------------------------------------------------------------------------

router.get(
  "/plans",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (_req, res) => {
    const plans = await db
      .select()
      .from(subscriptionPlans)
      .orderBy(desc(subscriptionPlans.created_at));
    return res.json({ plans });
  })
);

router.post(
  "/plans",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const log = reqLogger({ method: "POST", path: "/subscriptions/plans" });
    const { name, type, price, billing_cycle, description, features } = req.body ?? {};
    if (!name || !type || price === undefined) {
      throw badRequest("name, type, and price are required");
    }
    if (!["COMPANY", "SUPPLIER"].includes(type)) {
      throw badRequest("type must be COMPANY or SUPPLIER");
    }

    const cycle = billing_cycle || "monthly";
    if (!VALID_CYCLES.includes(cycle)) {
      throw badRequest("billing_cycle must be monthly, quarterly, half-yearly, or yearly");
    }

    log.info("Creating subscription plan", { name, type, price, billingCycle: cycle });

    const [plan] = await db
      .insert(subscriptionPlans)
      .values({
        name,
        type,
        price,
        billing_cycle: cycle,
        description,
        features,
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "SUBSCRIPTION_PLAN",
      entityId: plan.id,
      newValues: plan,
    });

    return res.status(201).json({ plan });
  })
);

router.put(
  "/plans/:planId",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const log = reqLogger({ method: "PUT", path: "/subscriptions/plans/:planId" });
    const planId = req.params.planId as string;
    const { name, price, billing_cycle, description, features, is_active } = req.body ?? {};

    if (billing_cycle && !VALID_CYCLES.includes(billing_cycle)) {
      throw badRequest("billing_cycle must be monthly, quarterly, half-yearly, or yearly");
    }

    log.info("Updating subscription plan", { planId });

    const [existing] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
      .limit(1);
    if (!existing) throw notFound("Plan not found");

    const [updated] = await db
      .update(subscriptionPlans)
      .set({
        name: name ?? existing.name,
        price: price ?? existing.price,
        billing_cycle: billing_cycle ?? existing.billing_cycle,
        description: description ?? existing.description,
        features: features ?? existing.features,
        is_active: is_active ?? existing.is_active,
        updated_at: new Date(),
      })
      .where(eq(subscriptionPlans.id, planId))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "SUBSCRIPTION_PLAN",
      entityId: planId,
      oldValues: existing,
      newValues: updated,
    });

    return res.json({ plan: updated });
  })
);

router.delete(
  "/plans/:planId",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const log = reqLogger({ method: "DELETE", path: "/subscriptions/plans/:planId" });
    const planId = req.params.planId as string;

    log.info("Deactivating subscription plan", { planId });

    const [existing] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
      .limit(1);
    if (!existing) throw notFound("Plan not found");

    // Soft delete - just deactivate
    const [updated] = await db
      .update(subscriptionPlans)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(subscriptionPlans.id, planId))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "DELETE",
      entityType: "SUBSCRIPTION_PLAN",
      entityId: planId,
      oldValues: existing,
      newValues: updated,
    });

    return res.json({ ok: true });
  })
);

export default router;
