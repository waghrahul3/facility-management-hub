import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { subscriptionPayments, subscriptions } from "../../db/schema.js";
import { requireAuth, requireRole } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { reqLogger } from "../../lib/logger.js";

const router = Router();

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

export default router;
