import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { orderPayments, salesOrders } from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../../lib/errors.js";
import { reqLogger } from "../../lib/logger.js";
import { param } from "../../lib/params.js";
import { myCompanyId } from "./_shared.js";
import { loadOrderDetail } from "./orderHelpers.js";

const router = Router();

// POST /sales/orders/:orderId/payments — record a payment from the buyer
router.post(
  "/orders/:orderId/payments",
  asyncHandler(async (req: any, res) => {
    const log = reqLogger({ method: "POST", path: "/sales/orders/:orderId/payments" });
    if (req.auth.role === "FACILITY_ADMIN") {
      throw forbidden("Only company admins can record payments");
    }
    const orderId = param(req, "orderId");
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
    if (!order) throw notFound("Order not found");

    const cid = myCompanyId(req);
    if (cid && order.company_id !== cid) throw forbidden("Access to this order is not allowed");

    const { amount, payment_date, payment_method, reference_number, notes } = req.body ?? {};
    if (!amount || amount <= 0) throw badRequest("amount must be > 0");

    const [payment] = await db
      .insert(orderPayments)
      .values({
        order_id: orderId,
        amount,
        payment_date: payment_date ? new Date(payment_date) : new Date(),
        payment_method: payment_method || "CASH",
        reference_number: reference_number ?? null,
        notes: notes ?? null,
        recorded_by: req.auth?.userId,
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "ORDER_PAYMENT",
      entityId: payment.id,
      newValues: payment,
    });
    log.info("Order payment recorded", { orderId, paymentId: payment.id, amount });

    const detail = await loadOrderDetail(orderId);
    return res.status(201).json({ payment, order: detail });
  })
);

export default router;
