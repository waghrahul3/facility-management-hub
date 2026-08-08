import { Router } from "express";
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { companies, subscriptionPlans, subscriptionRenewals, subscriptions, suppliers } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, notFound } from "../../lib/errors.js";
import { reqLogger } from "../../lib/logger.js";

const router = Router();

// ---------------------------------------------------------------------------
// Expiry Alerts & Renewal Tracking
// ---------------------------------------------------------------------------

/** GET /subscriptions/alerts/expiring — subscriptions expiring within N days */
router.get(
  "/alerts/expiring",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const days = parseInt(req.query.days as string) || 7;
    const now = new Date();
    const threshold = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const expiring = await db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        start_date: subscriptions.start_date,
        end_date: subscriptions.end_date,
        auto_renew: subscriptions.auto_renew,
        plan_name: subscriptionPlans.name,
        plan_type: subscriptionPlans.type,
        plan_price: subscriptionPlans.price,
        company_id: subscriptions.company_id,
        company_name: companies.name,
        supplier_id: subscriptions.supplier_id,
        supplier_name: suppliers.name,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.plan_id, subscriptionPlans.id))
      .leftJoin(companies, eq(subscriptions.company_id, companies.id))
      .leftJoin(suppliers, eq(subscriptions.supplier_id, suppliers.id))
      .where(
        and(
          eq(subscriptions.status, "ACTIVE"),
          lte(subscriptions.end_date, threshold),
          gte(subscriptions.end_date, now)
        )
      )
      .orderBy(subscriptions.end_date);

    return res.json({
      expiring,
      count: expiring.length,
      thresholdDays: days,
    });
  })
);

/** POST /subscriptions/auto-expire — mark expired subscriptions as EXPIRED */
router.post(
  "/auto-expire",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const log = reqLogger({ method: "POST", path: "/subscriptions/auto-expire" });
    const now = new Date();

    const expired = await db
      .update(subscriptions)
      .set({ status: "EXPIRED", updated_at: now })
      .where(
        and(
          eq(subscriptions.status, "ACTIVE"),
          lte(subscriptions.end_date, now)
        )
      )
      .returning({ id: subscriptions.id });

    log.info("Auto-expired subscriptions", { count: expired.length });

    return res.json({
      expiredCount: expired.length,
      message: "Expired subscriptions updated"
    });
  })
);

/** POST /subscriptions/:subId/renew — renew a subscription for another period */
router.post(
  "/:subId/renew",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const log = reqLogger({ method: "POST", path: "/subscriptions/:subId/renew" });
    const subId = req.params.subId as string;
    const { notes } = req.body ?? {};

    const [existing] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subId))
      .limit(1);
    if (!existing) throw notFound("Subscription not found");

    // Get the plan to determine billing cycle
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, existing.plan_id))
      .limit(1);
    if (!plan) throw notFound("Plan not found");

    // Calculate new period based on billing cycle
    // Supported: monthly (1), quarterly (3), half-yearly (6), yearly (12)
    const cycleMonths: Record<string, number> = {
      monthly: 1,
      quarterly: 3,
      "half-yearly": 6,
      yearly: 12,
      annually: 12,
    };
    const months = cycleMonths[plan.billing_cycle] ?? 1;
    const currentEnd = new Date(existing.end_date);
    const newStart = new Date(currentEnd);
    const newEnd = new Date(currentEnd);
    newEnd.setMonth(newEnd.getMonth() + months);

    // Record renewal history
    await db.insert(subscriptionRenewals).values({
      subscription_id: subId,
      previous_start: existing.start_date,
      previous_end: existing.end_date,
      new_start: newStart,
      new_end: newEnd,
      renewed_by: req.auth?.userId,
      notes,
    });

    // Update subscription with new period
    const [updated] = await db
      .update(subscriptions)
      .set({
        start_date: newStart,
        end_date: newEnd,
        status: "ACTIVE",
        updated_at: new Date(),
      })
      .where(eq(subscriptions.id, subId))
      .returning();

    log.info("Subscription renewed", { subId, newStart, newEnd });

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "SUBSCRIPTION",
      entityId: subId,
      oldValues: existing,
      newValues: updated,
    });

    return res.json({ subscription: updated });
  })
);

/** GET /subscriptions/:subId/renewals — get renewal history */
router.get(
  "/:subId/renewals",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const subId = req.params.subId as string;
    const renewals = await db
      .select()
      .from(subscriptionRenewals)
      .where(eq(subscriptionRenewals.subscription_id, subId))
      .orderBy(subscriptionRenewals.created_at);
    return res.json({ renewals });
  })
);

/** GET /subscriptions/my-status — get own subscription status for any role */
router.get(
  "/my-status",
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
          auto_renew: subscriptions.auto_renew,
          plan_name: subscriptionPlans.name,
          plan_price: subscriptionPlans.price,
          plan_cycle: subscriptionPlans.billing_cycle,
          plan_type: subscriptionPlans.type,
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
          auto_renew: subscriptions.auto_renew,
          plan_name: subscriptionPlans.name,
          plan_price: subscriptionPlans.price,
          plan_type: subscriptionPlans.type,
          plan_cycle: subscriptionPlans.billing_cycle,
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

    // Calculate days remaining
    let daysRemaining: number | null = null;
    let isExpiringSoon = false;
    if (sub && sub.end_date) {
      const endDate = new Date(sub.end_date);
      const now = new Date();
      daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      isExpiringSoon = daysRemaining <= 7 && daysRemaining > 0;
    }

    return res.json({
      subscription: sub,
      daysRemaining,
      isExpiringSoon,
    });
  })
);

export default router;
