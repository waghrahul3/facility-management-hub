import { Router } from "express";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { supplierPayments } from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound, unauthorized } from "../../lib/errors.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
import {
  collectSupplierPayment,
  distributeSupplierPayment,
  getPaymentDistributions,
} from "../../services/payments.js";
import { mySupplierId } from "./_shared.js";

const router = Router();

router.post(
  "/collect-payment",
  asyncHandler(async (req, res) => {
    const { payment_id, payment_method, notes } = req.body ?? {};
    if (!payment_id) throw badRequest("payment_id is required");
    if (!["CASH", "BANK_TRANSFER"].includes(payment_method)) {
      throw badRequest("payment_method must be CASH or BANK_TRANSFER");
    }

    const payment = (
      await db.select().from(supplierPayments).where(eq(supplierPayments.id, payment_id)).limit(1)
    )[0];
    if (!payment) throw notFound("Payment not found");
    if (payment.supplier_id !== mySupplierId(req)) {
      throw unauthorized("You can only collect your own payments");
    }

    const updated = await collectSupplierPayment(payment_id, payment_method, notes);
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "COLLECT",
      entityType: "SUPPLIER_PAYMENT",
      entityId: payment_id,
      newValues: updated,
    });
    return res.json({ payment: updated });
  })
);

router.post(
  "/distribute-payment",
  asyncHandler(async (req, res) => {
    const { payment_id, distributions } = req.body ?? {};
    if (!payment_id || !Array.isArray(distributions) || distributions.length === 0) {
      throw badRequest("payment_id and distributions[] are required");
    }

    const payment = (
      await db.select().from(supplierPayments).where(eq(supplierPayments.id, payment_id)).limit(1)
    )[0];
    if (!payment) throw notFound("Payment not found");
    if (payment.supplier_id !== mySupplierId(req)) {
      throw unauthorized("You can only distribute your own payments");
    }

    const totalDistributed = distributions.reduce(
      (s: number, d: { amount?: number }) => s + (d.amount ?? 0),
      0
    );
    if (totalDistributed > payment.net_payment) {
      throw badRequest("Distribution total exceeds net payment amount");
    }

    const updated = await distributeSupplierPayment(
      payment_id,
      distributions.map((d) => ({
        toliId: d.toli_id,
        amount: d.amount,
        method: d.method ?? "CASH",
        notes: d.notes,
      }))
    );
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "DISTRIBUTE",
      entityType: "SUPPLIER_PAYMENT",
      entityId: payment_id,
      newValues: { distributions },
    });
    return res.json({ payment: updated });
  })
);

router.get(
  "/payment-history",
  asyncHandler(async (req, res) => {
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
    const where = eq(supplierPayments.supplier_id, mySupplierId(req));
    const payments = await db
      .select()
      .from(supplierPayments)
      .where(where)
      .orderBy(desc(supplierPayments.week_start_date))
      .limit(limit)
      .offset(offset);

    const withDistributions = await Promise.all(
      payments.map(async (p) => ({
        ...p,
        distributions: await getPaymentDistributions(p.id),
      }))
    );
    const [totalRow] = await db.select({ value: count() }).from(supplierPayments).where(where);
    return res.json({ payments: withDistributions, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

export default router;
