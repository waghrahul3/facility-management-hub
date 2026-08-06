import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { subscriptionPlans, subscriptions } from "../../db/schema.js";
import { requireAuth } from "../../auth/middleware.js";
import { asyncHandler } from "../../lib/errors.js";

const router = Router();

// ---------------------------------------------------------------------------
// Role-specific: Get own subscription status
// ---------------------------------------------------------------------------

router.get(
  "/my-subscription",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.auth!;
    let sub = null;

    if (user.role === "COMPANY_ADMIN" && user.companyId) {
      const [result] = await db
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          start_date: subscriptions.start_date,
          end_date: subscriptions.end_date,
          plan_name: subscriptionPlans.name,
          plan_price: subscriptionPlans.price,
        })
        .from(subscriptions)
        .innerJoin(subscriptionPlans, eq(subscriptions.plan_id, subscriptionPlans.id))
        .where(
          and(
            eq(subscriptions.company_id, user.companyId),
            eq(subscriptions.status, "ACTIVE")
          )
        )
        .limit(1);
      sub = result || null;
    } else if (user.role === "SUPPLIER" && user.supplierId) {
      const [result] = await db
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          start_date: subscriptions.start_date,
          end_date: subscriptions.end_date,
          plan_name: subscriptionPlans.name,
          plan_price: subscriptionPlans.price,
        })
        .from(subscriptions)
        .innerJoin(subscriptionPlans, eq(subscriptions.plan_id, subscriptionPlans.id))
        .where(
          and(
            eq(subscriptions.supplier_id, user.supplierId),
            eq(subscriptions.status, "ACTIVE")
          )
        )
        .limit(1);
      sub = result || null;
    }

    return res.json({ subscription: sub });
  })
);

// ---------------------------------------------------------------------------
// Get available plans (for Super Admin and public)
// ---------------------------------------------------------------------------

router.get(
  "/plans/available",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const plans = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.is_active, true))
      .orderBy(subscriptionPlans.type, subscriptionPlans.price);
    return res.json({ plans });
  })
);

export default router;
