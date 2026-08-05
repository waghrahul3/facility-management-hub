import { Router } from "express";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { subscriptionRenewals } from "../db/schema.js";
import {
  subscriptionPlans,
  subscriptions,
  subscriptionPayments,
  companies,
  suppliers,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { audit } from "../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../lib/errors.js";
import { logger, reqLogger } from "../lib/logger.js";

const router = Router();

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

    const VALID_CYCLES = ["monthly", "quarterly", "half-yearly", "yearly", "annually"];
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

    const VALID_CYCLES = ["monthly", "quarterly", "half-yearly", "yearly", "annually"];
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

// ---------------------------------------------------------------------------
// Super Admin: Subscription Management
// ---------------------------------------------------------------------------

router.get(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (_req, res) => {
    const subs = await db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        start_date: subscriptions.start_date,
        end_date: subscriptions.end_date,
        auto_renew: subscriptions.auto_renew,
        notes: subscriptions.notes,
        created_at: subscriptions.created_at,
        plan_id: subscriptions.plan_id,
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
      .orderBy(desc(subscriptions.created_at));

    return res.json({ subscriptions: subs });
  })
);

router.get(
  "/stats",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (_req, res) => {
    const [activeCount] = await db
      .select({ count: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, "ACTIVE"));

    const [expiredCount] = await db
      .select({ count: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, "EXPIRED"));

    const [pendingCount] = await db
      .select({ count: count() })
      .from(subscriptions)
      .where(eq(subscriptions.status, "PENDING"));

    const [totalRevenue] = await db
      .select({ total: sql<number>`coalesce(sum(${subscriptionPayments.amount}), 0)` })
      .from(subscriptionPayments);

    return res.json({
      active: activeCount.count,
      expired: expiredCount.count,
      pending: pendingCount.count,
      totalRevenue: totalRevenue.total,
    });
  })
);

router.post(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const log = reqLogger({ method: "POST", path: "/subscriptions" });
    const { plan_id, company_id, supplier_id, start_date, end_date, notes } = req.body ?? {};
    if (!plan_id || !start_date || !end_date) {
      throw badRequest("plan_id, start_date, and end_date are required");
    }
    if (!company_id && !supplier_id) {
      throw badRequest("Either company_id or supplier_id is required");
    }

    log.info("Creating subscription", { planId: plan_id, companyId: company_id, supplierId: supplier_id });

    // Get the plan to check type matches
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, plan_id))
      .limit(1);
    if (!plan) throw notFound("Plan not found");

    // Validate type matches entity
    if (plan.type === "COMPANY" && !company_id) {
      throw badRequest("Company plan requires company_id");
    }
    if (plan.type === "SUPPLIER" && !supplier_id) {
      throw badRequest("Supplier plan requires supplier_id");
    }

    // Check for active subscription of same type
    if (company_id) {
      const [existing] = await db
        .select()
        .from(subscriptions)
        .innerJoin(subscriptionPlans, eq(subscriptions.plan_id, subscriptionPlans.id))
        .where(
          and(
            eq(subscriptions.company_id, company_id),
            eq(subscriptionPlans.type, "COMPANY"),
            eq(subscriptions.status, "ACTIVE")
          )
        )
        .limit(1);
      if (existing) {
        throw badRequest("Company already has an active subscription");
      }
    }
    if (supplier_id) {
      const [existing] = await db
        .select()
        .from(subscriptions)
        .innerJoin(subscriptionPlans, eq(subscriptions.plan_id, subscriptionPlans.id))
        .where(
          and(
            eq(subscriptions.supplier_id, supplier_id),
            eq(subscriptionPlans.type, "SUPPLIER"),
            eq(subscriptions.status, "ACTIVE")
          )
        )
        .limit(1);
      if (existing) {
        throw badRequest("Supplier already has an active subscription");
      }
    }

    const [sub] = await db
      .insert(subscriptions)
      .values({
        plan_id,
        company_id: company_id || null,
        supplier_id: supplier_id || null,
        status: "ACTIVE",
        start_date: new Date(start_date),
        end_date: new Date(end_date),
        notes,
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "SUBSCRIPTION",
      entityId: sub.id,
      newValues: sub,
    });

    return res.status(201).json({ subscription: sub });
  })
);

router.put(
  "/:subId/status",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const log = reqLogger({ method: "PUT", path: "/subscriptions/:subId/status" });
    const subId = req.params.subId as string;
    const { status } = req.body ?? {};
    if (!status || !["ACTIVE", "EXPIRED", "PENDING", "CANCELLED"].includes(status)) {
      throw badRequest("Invalid status");
    }

    log.info("Updating subscription status", { subId, status });

    const [existing] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subId))
      .limit(1);
    if (!existing) throw notFound("Subscription not found");

    const [updated] = await db
      .update(subscriptions)
      .set({ status, updated_at: new Date() })
      .where(eq(subscriptions.id, subId))
      .returning();

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

// ---------------------------------------------------------------------------
// Super Admin: Payment Recording
// ---------------------------------------------------------------------------

router.post(
  "/:subId/payments",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const log = reqLogger({ method: "POST", path: "/subscriptions/:subId/payments" });
    const subId = req.params.subId as string;
    const { amount, payment_date, payment_method, reference_number, notes } = req.body ?? {};
    if (!amount || !payment_date) {
      throw badRequest("amount and payment_date are required");
    }

    log.info("Recording subscription payment", { subId, amount });

    const [existing] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subId))
      .limit(1);
    if (!existing) throw notFound("Subscription not found");

    const [payment] = await db
      .insert(subscriptionPayments)
      .values({
        subscription_id: subId,
        amount,
        payment_date: new Date(payment_date),
        payment_method: payment_method || "CASH",
        reference_number,
        notes,
        recorded_by: req.auth?.userId,
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "SUBSCRIPTION_PAYMENT",
      entityId: payment.id,
      newValues: payment,
    });

    return res.status(201).json({ payment });
  })
);

router.get(
  "/:subId/payments",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const subId = req.params.subId as string;
    const payments = await db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.subscription_id, subId))
      .orderBy(desc(subscriptionPayments.payment_date));
    return res.json({ payments });
  })
);

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

    const [result] = await db
      .update(subscriptions)
      .set({ status: "EXPIRED", updated_at: now })
      .where(
        and(
          eq(subscriptions.status, "ACTIVE"),
          lte(subscriptions.end_date, now)
        )
      )
      .returning({ id: subscriptions.id });

    log.info("Auto-expired subscriptions", { count: result ? 1 : 0 });

    return res.json({
      expiredCount: result ? 1 : 0,
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
