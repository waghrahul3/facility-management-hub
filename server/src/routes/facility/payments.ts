import { Router } from "express";
import { and, count, desc, eq, ilike } from "drizzle-orm";
import { db } from "../../db/index.js";
import { suppliers, supplierPayments } from "../../db/schema.js";
import { requireFacilityAccess } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler } from "../../lib/errors.js";
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
