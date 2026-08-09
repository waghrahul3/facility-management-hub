import { Router } from "express";
import { and, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { facilities, supplierPayments, tolis, weeklyWorkSummaries } from "../../db/schema.js";
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

// All payments the supplier still has to receive from facilities (PENDING)
// plus collected-but-not-yet-distributed ones — each with the week's approved
// toli summaries so the supplier can collect and distribute from the list,
// no matter which week or facility the payment belongs to.
router.get(
  "/pending-payments",
  asyncHandler(async (req, res) => {
    const supplierId = mySupplierId(req);
    const rows = await db
      .select({
        payment: supplierPayments,
        facility: { id: facilities.id, name: facilities.name },
      })
      .from(supplierPayments)
      .innerJoin(facilities, eq(facilities.id, supplierPayments.facility_id))
      .where(
        and(
          eq(supplierPayments.supplier_id, supplierId),
          inArray(supplierPayments.collection_status, [
            "PENDING",
            "COLLECTED_FROM_FACILITY",
          ])
        )
      )
      .orderBy(desc(supplierPayments.week_start_date));

    const payments = await Promise.all(
      rows.map(async (r) => {
        const summaries = await db
          .select({
            toli: { id: tolis.id, leader_name: tolis.leader_name },
            totalEarnings: weeklyWorkSummaries.total_earnings,
          })
          .from(weeklyWorkSummaries)
          .innerJoin(tolis, eq(tolis.id, weeklyWorkSummaries.toli_id))
          .where(
            and(
              eq(weeklyWorkSummaries.supplier_id, supplierId),
              eq(weeklyWorkSummaries.facility_id, r.payment.facility_id),
              eq(weeklyWorkSummaries.week_start_date, r.payment.week_start_date),
              eq(weeklyWorkSummaries.approval_status, "APPROVED")
            )
          );
        return {
          ...r.payment,
          facility: r.facility,
          summaries: summaries.map((s) => ({
            toliId: s.toli.id,
            leader: s.toli.leader_name,
            earnings: s.totalEarnings ?? 0,
          })),
        };
      })
    );
    return res.json({ payments });
  })
);

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
    const query = req.query as Record<string, unknown>;
    const { limit, offset, page, pageSize } = parsePage(query);
    const search = typeof query.q === "string" ? query.q.trim() : "";
    const status = typeof query.status === "string" ? query.status.trim() : "";
    const where = and(
      eq(supplierPayments.supplier_id, mySupplierId(req)),
      search ? ilike(sql`${supplierPayments.week_start_date}::text`, `%${search}%`) : undefined,
      status
        ? eq(
            supplierPayments.collection_status,
            status as "PENDING" | "COLLECTED_FROM_FACILITY" | "DISTRIBUTED_TO_WORKERS"
          )
        : undefined
    );
    const payments = await db
      .select({
        payment: supplierPayments,
        facility: { id: facilities.id, name: facilities.name },
      })
      .from(supplierPayments)
      .innerJoin(facilities, eq(facilities.id, supplierPayments.facility_id))
      .where(where)
      .orderBy(desc(supplierPayments.week_start_date))
      .limit(limit)
      .offset(offset);

    const withDistributions = await Promise.all(
      payments.map(async (p) => ({
        ...p.payment,
        facility: p.facility,
        distributions: await getPaymentDistributions(p.payment.id),
      }))
    );
    const [totalRow] = await db.select({ value: count() }).from(supplierPayments).where(where);
    return res.json({ payments: withDistributions, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

export default router;
