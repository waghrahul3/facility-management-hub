import { Router } from "express";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  companies,
  subscriptionPlans,
  subscriptionPayments,
  subscriptions,
  suppliers,
} from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
import { reqLogger } from "../../lib/logger.js";

const router = Router();

// ---------------------------------------------------------------------------
// Super Admin: Subscription Management
// ---------------------------------------------------------------------------

router.get(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  asyncHandler(async (req, res) => {
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
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
      .orderBy(desc(subscriptions.created_at))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db.select({ value: count() }).from(subscriptions);
    return res.json({
      subscriptions: subs,
      ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }),
    });
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

export default router;
