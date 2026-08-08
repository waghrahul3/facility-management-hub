import { Router } from "express";
import { and, count, desc, eq, ilike } from "drizzle-orm";
import { db } from "../../db/index.js";
import { supplierAdvances, supplierPayments, suppliers } from "../../db/schema.js";
import { requireFacilityAccess } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
import { param } from "../../lib/params.js";
import { outstandingAdvance } from "../../services/payments.js";

const router = Router();

// ---------------------------------------------------------------------------
// Supplier advances (cash given to a supplier before settlement)
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/advances",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
    const query = req.query as Record<string, unknown>;
    const q = typeof query.q === "string" ? query.q.trim() : "";
    const supplierId = typeof query.supplierId === "string" ? query.supplierId.trim() : "";
    const where = and(
      eq(supplierAdvances.facility_id, param(req, "facilityId")),
      q ? ilike(suppliers.name, `%${q}%`) : undefined,
      supplierId ? eq(supplierAdvances.supplier_id, supplierId) : undefined
    );
    const rows = await db
      .select({
        advance: supplierAdvances,
        supplier: { id: suppliers.id, name: suppliers.name },
      })
      .from(supplierAdvances)
      .innerJoin(suppliers, eq(suppliers.id, supplierAdvances.supplier_id))
      .where(where)
      .orderBy(desc(supplierAdvances.advance_date), desc(supplierAdvances.created_at))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db
      .select({ value: count() })
      .from(supplierAdvances)
      .innerJoin(suppliers, eq(suppliers.id, supplierAdvances.supplier_id))
      .where(where);
    return res.json({ advances: rows, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

// Outstanding advance balance per supplier at this facility
router.get(
  "/:facilityId/advances/outstanding",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const facilityId = param(req, "facilityId");
    // Every supplier who has advances or recovered amounts at this facility
    const advanceRows = await db
      .select({ supplier_id: supplierAdvances.supplier_id })
      .from(supplierAdvances)
      .where(eq(supplierAdvances.facility_id, facilityId));
    const supplierIds = [
      ...new Set(advanceRows.map((r) => r.supplier_id)),
    ];
    const balances = await Promise.all(
      supplierIds.map(async (sid) => {
        const [supplier] = await db
          .select({ id: suppliers.id, name: suppliers.name })
          .from(suppliers)
          .where(eq(suppliers.id, sid))
          .limit(1);
        return {
          supplierId: sid,
          supplierName: supplier?.name ?? "Unknown",
          outstanding: await outstandingAdvance(facilityId, sid),
        };
      })
    );
    return res.json({ balances });
  })
);

router.post(
  "/:facilityId/advances",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { supplier_id, amount, advance_date, payment_method, notes } = req.body ?? {};
    if (!supplier_id) throw badRequest("supplier_id is required");
    const amountNum = Math.floor(Number(amount));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      throw badRequest("amount must be a positive number");
    }

    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, supplier_id))
      .limit(1);
    if (!supplier) throw notFound("Supplier not found");

    const [advance] = await db
      .insert(supplierAdvances)
      .values({
        supplier_id,
        facility_id: param(req, "facilityId"),
        amount: amountNum,
        advance_date: advance_date ? new Date(String(advance_date)) : new Date(),
        payment_method:
          payment_method === "BANK_TRANSFER" ? "BANK_TRANSFER" : "CASH",
        notes: notes ?? null,
        recorded_by: req.auth?.userId,
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "SUPPLIER_ADVANCE",
      entityId: advance.id,
      newValues: { supplierId: supplier_id, amount: amountNum, notes: advance.notes },
    });
    return res.status(201).json({ advance });
  })
);

router.delete(
  "/:facilityId/advances/:id",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const advance = (
      await db.select().from(supplierAdvances).where(eq(supplierAdvances.id, param(req, "id"))).limit(1)
    )[0];
    if (!advance) throw notFound("Advance not found");
    if (advance.facility_id !== param(req, "facilityId")) {
      throw badRequest("Advance does not belong to this facility");
    }

    // Integrity guard: never delete an advance once any recovery has happened
    // from weekly payments — the running balance would go wrong.
    const recoveredRows = await db
      .select({ amount: supplierPayments.advance_deducted })
      .from(supplierPayments)
      .where(
        and(
          eq(supplierPayments.facility_id, advance.facility_id),
          eq(supplierPayments.supplier_id, advance.supplier_id)
        )
      );
    const recovered = recoveredRows.reduce((s, p) => s + (p.amount ?? 0), 0);
    if (recovered > 0) {
      throw badRequest(
        "This advance has already been recovered from payments and can no longer be deleted"
      );
    }

    await db.delete(supplierAdvances).where(eq(supplierAdvances.id, advance.id));
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "DELETE",
      entityType: "SUPPLIER_ADVANCE",
      entityId: advance.id,
      oldValues: { supplierId: advance.supplier_id, amount: advance.amount },
    });
    return res.json({ ok: true });
  })
);

export default router;
