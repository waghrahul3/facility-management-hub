import { Router } from "express";
import { and, count, desc, eq, ilike } from "drizzle-orm";
import { db } from "../../db/index.js";
import { suppliers, supplierPaymentDistributions, supplierPayments } from "../../db/schema.js";
import { requireFacilityAccess } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
import { param } from "../../lib/params.js";
import {
  computeSupplierWeekPayment,
  outstandingAdvance,
  processSupplierPayments,
} from "../../services/payments.js";
import { weekParams } from "./_shared.js";

const router = Router();

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/payments/pending",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = weekParams(req.query as Record<string, unknown>);
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
    const where = and(
      eq(supplierPayments.facility_id, param(req, "facilityId")),
      eq(supplierPayments.week_start_date, weekStart)
    );
    const rows = await db
      .select({
        payment: {
          id: supplierPayments.id,
          supplier_id: supplierPayments.supplier_id,
          week_start_date: supplierPayments.week_start_date,
          total_worker_earnings: supplierPayments.total_worker_earnings,
          total_drops: supplierPayments.total_drops,
          total_rent_charges: supplierPayments.total_rent_charges,
          net_payment: supplierPayments.net_payment,
          advance_deducted: supplierPayments.advance_deducted,
          advance_balance_before: supplierPayments.advance_balance_before,
          collection_status: supplierPayments.collection_status,
          payment_method: supplierPayments.payment_method,
        },
        supplier: { id: suppliers.id, name: suppliers.name },
      })
      .from(supplierPayments)
      .innerJoin(suppliers, eq(suppliers.id, supplierPayments.supplier_id))
      .where(where)
      .orderBy(desc(supplierPayments.net_payment))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db
      .select({ value: count() })
      .from(supplierPayments)
      .where(where);

    // Include each supplier's current outstanding advance for the process UI
    const withOutstanding = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        outstanding_advance: await outstandingAdvance(
          param(req, "facilityId"),
          r.supplier.id
        ),
      }))
    );
    return res.json({ payments: withOutstanding, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

// Supplier payment detail (used by both facility admin and supplier)
router.get(
  "/:facilityId/supplier/:supplierId/payment",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = weekParams(req.query as Record<string, unknown>);
    const payment = await computeSupplierWeekPayment(
      param(req, "facilityId"),
      param(req, "supplierId"),
      weekStart,
      weekEnd
    );
    const stored = await db
      .select()
      .from(supplierPayments)
      .where(
        and(
          eq(supplierPayments.facility_id, param(req, "facilityId")),
          eq(supplierPayments.supplier_id, param(req, "supplierId")),
          eq(supplierPayments.week_start_date, weekStart)
        )
      )
      .limit(1);
    return res.json({ payment, stored: stored[0] ?? null });
  })
);

router.post(
  "/:facilityId/payments/process",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = weekParams((req.body ?? {}) as Record<string, unknown>);
    const advanceDeductions =
      (req.body ?? {}).advanceDeductions && typeof (req.body ?? {}).advanceDeductions === "object"
        ? ((req.body ?? {}).advanceDeductions as Record<string, number>)
        : {};
    const results = await processSupplierPayments(
      param(req, "facilityId"),
      weekStart,
      weekEnd,
      advanceDeductions
    );
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "SUPPLIER_PAYMENT",
      entityId: param(req, "facilityId"),
      newValues: { weekStart, advanceDeductions, results },
    });
    return res.json({ processed: results });
  })
);

const PAYMENT_STATUSES = ["PENDING", "COLLECTED_FROM_FACILITY", "DISTRIBUTED_TO_WORKERS"] as const;
type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// Facility/company admins can override a payment's collection status — e.g.
// reset a mistaken collect, or record that cash was handed over offline.
router.put(
  "/:facilityId/payments/:paymentId/status",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { status } = req.body ?? {};
    if (!PAYMENT_STATUSES.includes(status as PaymentStatus)) {
      throw badRequest("status must be PENDING, COLLECTED_FROM_FACILITY or DISTRIBUTED_TO_WORKERS");
    }

    const existing = (
      await db
        .select()
        .from(supplierPayments)
        .where(eq(supplierPayments.id, param(req, "paymentId")))
        .limit(1)
    )[0];
    if (!existing || existing.facility_id !== param(req, "facilityId")) {
      throw notFound("Payment not found");
    }

    // Moving a settled payment backward removes its distribution records so
    // the supplier can redo the distribution cleanly.
    if (
      (status === "PENDING" || status === "COLLECTED_FROM_FACILITY") &&
      existing.collection_status === "DISTRIBUTED_TO_WORKERS"
    ) {
      await db
        .delete(supplierPaymentDistributions)
        .where(eq(supplierPaymentDistributions.supplier_payment_id, existing.id));
    }

    const [updated] = await db
      .update(supplierPayments)
      .set({
        collection_status: status as PaymentStatus,
        collection_date:
          status === "PENDING"
            ? null
            : status === "COLLECTED_FROM_FACILITY"
              ? (existing.collection_date ?? new Date())
              : existing.collection_date,
        payment_method: status === "PENDING" ? null : existing.payment_method,
        updated_at: new Date(),
      })
      .where(eq(supplierPayments.id, existing.id))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "SUPPLIER_PAYMENT",
      entityId: existing.id,
      oldValues: { collection_status: existing.collection_status },
      newValues: { collection_status: status },
    });
    return res.json({ payment: updated });
  })
);

// Facility/company admin records that the payment was physically handed over
// to the supplier (cash or bank transfer) — the facility-side equivalent of
// the supplier's "Mark collected". Captures method + notes + timestamp.
router.put(
  "/:facilityId/payments/:paymentId/handover",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { payment_method, notes } = req.body ?? {};
    if (!["CASH", "BANK_TRANSFER"].includes(payment_method)) {
      throw badRequest("payment_method must be CASH or BANK_TRANSFER");
    }

    const existing = (
      await db
        .select()
        .from(supplierPayments)
        .where(eq(supplierPayments.id, param(req, "paymentId")))
        .limit(1)
    )[0];
    if (!existing || existing.facility_id !== param(req, "facilityId")) {
      throw notFound("Payment not found");
    }
    if (existing.collection_status !== "PENDING") {
      throw badRequest(
        existing.collection_status === "DISTRIBUTED_TO_WORKERS"
          ? "Payment has already been distributed to workers"
          : "Payment has already been handed over"
      );
    }

    const [updated] = await db
      .update(supplierPayments)
      .set({
        collection_status: "COLLECTED_FROM_FACILITY",
        collection_date: new Date(),
        payment_method,
        notes: notes ?? null,
        updated_at: new Date(),
      })
      .where(eq(supplierPayments.id, existing.id))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "SUPPLIER_PAYMENT",
      entityId: existing.id,
      oldValues: { collection_status: existing.collection_status },
      newValues: { collection_status: "COLLECTED_FROM_FACILITY", payment_method, notes: notes ?? null },
    });
    return res.json({ payment: updated });
  })
);

router.get(
  "/:facilityId/payments/history",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
    const query = req.query as Record<string, unknown>;
    const q = typeof query.q === "string" ? query.q.trim() : "";
    const status = typeof query.status === "string" ? query.status.trim() : "";
    const where = and(
      eq(supplierPayments.facility_id, param(req, "facilityId")),
      q ? ilike(suppliers.name, `%${q}%`) : undefined,
      status
        ? eq(
            supplierPayments.collection_status,
            status as "PENDING" | "COLLECTED_FROM_FACILITY" | "DISTRIBUTED_TO_WORKERS"
          )
        : undefined
    );
    const rows = await db
      .select({
        payment: supplierPayments,
        supplier: { id: suppliers.id, name: suppliers.name },
      })
      .from(supplierPayments)
      .innerJoin(suppliers, eq(suppliers.id, supplierPayments.supplier_id))
      .where(where)
      .orderBy(desc(supplierPayments.week_start_date))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db
      .select({ value: count() })
      .from(supplierPayments)
      .innerJoin(suppliers, eq(suppliers.id, supplierPayments.supplier_id))
      .where(where);
    return res.json({ payments: rows, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

export default router;
