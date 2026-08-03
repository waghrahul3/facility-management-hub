import { Router, type Request } from "express";
import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  bagSizes,
  facilities,
  supplierDrops,
  supplierPayments,
  suppliers,
  tolis,
  weeklyWorkSummaries,
  workEntries,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { audit } from "../lib/audit.js";
import { asyncHandler, badRequest, notFound, unauthorized } from "../lib/errors.js";
import { param } from "../lib/params.js";
import {
  collectSupplierPayment,
  computeSupplierWeekPayment,
  currentWeek,
  distributeSupplierPayment,
  getPaymentDistributions,
} from "../services/payments.js";
import { endOfWeek, startOfWeek } from "../lib/date.js";

const router = Router();
router.use(requireAuth);
router.use(requireRole("SUPER_ADMIN", "SUPPLIER"));

// Supplier id is guaranteed by the role check (SUPER_ADMIN has no supplier_id,
// so we also require it explicitly).
function mySupplierId(req: Request): string {
  if (!req.auth?.supplierId) throw unauthorized("No supplier account linked");
  return req.auth.supplierId;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const supplier = (
      await db.select().from(suppliers).where(eq(suppliers.id, mySupplierId(req))).limit(1)
    )[0];
    if (!supplier) throw notFound("Supplier profile not found");
    return res.json({ supplier });
  })
);

router.put(
  "/profile",
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(suppliers).where(eq(suppliers.id, mySupplierId(req))).limit(1)
    )[0];
    if (!existing) throw notFound("Supplier profile not found");

    const { name, phone, email, contact_person, address, city } = req.body ?? {};
    const [updated] = await db
      .update(suppliers)
      .set({
        name: name ?? existing.name,
        phone: phone !== undefined ? phone : existing.phone,
        email: email !== undefined ? email : existing.email,
        contact_person: contact_person !== undefined ? contact_person : existing.contact_person,
        address: address !== undefined ? address : existing.address,
        city: city !== undefined ? city : existing.city,
        updated_at: new Date(),
      })
      .where(eq(suppliers.id, existing.id))
      .returning();
    return res.json({ supplier: updated });
  })
);

// ---------------------------------------------------------------------------
// Drops
// ---------------------------------------------------------------------------

router.get(
  "/drops",
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, unknown>;
    const weekStart = q.weekStart ? new Date(String(q.weekStart)) : startOfWeek(new Date());
    const weekEnd = q.weekEnd ? new Date(String(q.weekEnd)) : endOfWeek(weekStart);

    const rows = await db
      .select({
        drop: supplierDrops,
        facility: { id: facilities.id, name: facilities.name },
      })
      .from(supplierDrops)
      .leftJoin(facilities, eq(facilities.id, supplierDrops.facility_id))
      .where(
        and(
          eq(supplierDrops.supplier_id, mySupplierId(req)),
          gte(supplierDrops.drop_date, weekStart),
          lte(supplierDrops.drop_date, weekEnd)
        )
      )
      .orderBy(desc(supplierDrops.drop_date));
    return res.json({ drops: rows });
  })
);

router.post(
  "/drops/register",
  asyncHandler(async (req, res) => {
    const { facility_id, drop_date, total_workers_dropped, rent_per_drop } = req.body ?? {};
    if (!facility_id || !drop_date) {
      throw badRequest("facility_id and drop_date are required");
    }
    const [drop] = await db
      .insert(supplierDrops)
      .values({
        supplier_id: mySupplierId(req),
        facility_id,
        drop_date: new Date(drop_date),
        total_workers_dropped: total_workers_dropped ?? 0,
        rent_per_drop: rent_per_drop ?? 0,
      })
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "SUPPLIER_DROP",
      entityId: drop.id,
      newValues: drop,
    });
    return res.status(201).json({ drop });
  })
);

router.get(
  "/drops/:dropId",
  asyncHandler(async (req, res) => {
    const drop = (
      await db
        .select()
        .from(supplierDrops)
        .where(
          and(
            eq(supplierDrops.id, param(req, "dropId")),
            eq(supplierDrops.supplier_id, mySupplierId(req))
          )
        )
        .limit(1)
    )[0];
    if (!drop) throw notFound("Drop not found");

    // Tolis under this drop
    const toliRows = await db
      .select()
      .from(tolis)
      .where(eq(tolis.drop_id, drop.id));
    return res.json({ drop, tolis: toliRows });
  })
);

// ---------------------------------------------------------------------------
// Work entries for own drops ⭐
// ---------------------------------------------------------------------------

router.get(
  "/work-entries",
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, unknown>;
    const weekStart = q.weekStart ? new Date(String(q.weekStart)) : startOfWeek(new Date());
    const weekEnd = q.weekEnd ? new Date(String(q.weekEnd)) : endOfWeek(weekStart);

    // Tolis under this supplier's drops
    const dropRows = await db
      .select()
      .from(supplierDrops)
      .where(
        and(
          eq(supplierDrops.supplier_id, mySupplierId(req)),
          gte(supplierDrops.drop_date, weekStart),
          lte(supplierDrops.drop_date, weekEnd)
        )
      );
    const dropIds = dropRows.map((d) => d.id);
    if (dropIds.length === 0) return res.json({ entries: [] });

    const toliRows = await db.select().from(tolis).where(inArray(tolis.drop_id, dropIds));
    const toliIds = toliRows.map((t) => t.id);
    if (toliIds.length === 0) return res.json({ entries: [] });

    const entries = await db
      .select({
        entry: workEntries,
        toli: { id: tolis.id, leader_name: tolis.leader_name },
        bagSize: { id: bagSizes.id, size_name: bagSizes.size_name, weight_kg: bagSizes.weight_kg },
      })
      .from(workEntries)
      .innerJoin(tolis, eq(tolis.id, workEntries.toli_id))
      .innerJoin(bagSizes, eq(bagSizes.id, workEntries.bag_size_id))
      .where(
        and(
          inArray(workEntries.toli_id, toliIds),
          gte(workEntries.work_date, weekStart),
          lte(workEntries.work_date, weekEnd)
        )
      )
      .orderBy(desc(workEntries.work_date));

    return res.json({ entries });
  })
);

router.get(
  "/work-entries/drop/:dropId",
  asyncHandler(async (req, res) => {
    const drop = (
      await db
        .select()
        .from(supplierDrops)
        .where(
          and(
            eq(supplierDrops.id, param(req, "dropId")),
            eq(supplierDrops.supplier_id, mySupplierId(req))
          )
        )
        .limit(1)
    )[0];
    if (!drop) throw notFound("Drop not found");

    const toliRows = await db.select().from(tolis).where(eq(tolis.drop_id, drop.id));
    const toliIds = toliRows.map((t) => t.id);
    if (toliIds.length === 0) return res.json({ entries: [] });

    const entries = await db
      .select({
        entry: workEntries,
        toli: { id: tolis.id, leader_name: tolis.leader_name },
        bagSize: { id: bagSizes.id, size_name: bagSizes.size_name, weight_kg: bagSizes.weight_kg },
      })
      .from(workEntries)
      .innerJoin(tolis, eq(tolis.id, workEntries.toli_id))
      .innerJoin(bagSizes, eq(bagSizes.id, workEntries.bag_size_id))
      .where(inArray(workEntries.toli_id, toliIds))
      .orderBy(desc(workEntries.work_date));

    return res.json({ entries });
  })
);

// ---------------------------------------------------------------------------
// Weekly summary / payment pending
// ---------------------------------------------------------------------------

router.get(
  "/this-week",
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = currentWeek();

    const summaries = await db
      .select({
        summary: weeklyWorkSummaries,
        toli: { id: tolis.id, leader_name: tolis.leader_name },
      })
      .from(weeklyWorkSummaries)
      .innerJoin(tolis, eq(tolis.id, weeklyWorkSummaries.toli_id))
      .where(
        and(
          eq(weeklyWorkSummaries.supplier_id, mySupplierId(req)),
          gte(weeklyWorkSummaries.week_start_date, weekStart),
          lte(weeklyWorkSummaries.week_end_date, weekEnd)
        )
      )
      .orderBy(desc(weeklyWorkSummaries.total_earnings));

    const dropRows = await db
      .select()
      .from(supplierDrops)
      .where(
        and(
          eq(supplierDrops.supplier_id, mySupplierId(req)),
          gte(supplierDrops.drop_date, weekStart),
          lte(supplierDrops.drop_date, weekEnd)
        )
      );

    const totalRent = dropRows.reduce((s, d) => s + d.rent_per_drop, 0);
    const totalEarnings = summaries
      .filter((s) => s.summary.approval_status === "APPROVED")
      .reduce((s, r) => s + r.summary.total_earnings, 0);

    return res.json({
      weekStart,
      weekEnd,
      drops: dropRows,
      summaries,
      totalDrops: dropRows.length,
      totalRent,
      totalWorkerEarnings: totalEarnings,
      netPayment: totalEarnings - totalRent,
    });
  })
);

router.get(
  "/payment-pending",
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = currentWeek();
    const payment = await computeSupplierWeekPayment(
      // supplier needs a facility: pick the facility of their latest drop
      (await latestFacilityForSupplier(mySupplierId(req))) ?? "",
      mySupplierId(req),
      weekStart,
      weekEnd
    );

    const stored = await db
      .select()
      .from(supplierPayments)
      .where(
        and(
          eq(supplierPayments.supplier_id, mySupplierId(req)),
          eq(supplierPayments.week_start_date, weekStart)
        )
      )
      .orderBy(desc(supplierPayments.created_at))
      .limit(1);

    return res.json({ payment, stored: stored[0] ?? null, weekStart, weekEnd });
  })
);

async function latestFacilityForSupplier(supplierId: string): Promise<string | null> {
  const row = await db
    .select({ facility_id: supplierDrops.facility_id })
    .from(supplierDrops)
    .where(eq(supplierDrops.supplier_id, supplierId))
    .orderBy(desc(supplierDrops.drop_date))
    .limit(1);
  return row[0]?.facility_id ?? null;
}

// ---------------------------------------------------------------------------
// Collect + distribute payment ⭐
// ---------------------------------------------------------------------------

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
    const payments = await db
      .select()
      .from(supplierPayments)
      .where(eq(supplierPayments.supplier_id, mySupplierId(req)))
      .orderBy(desc(supplierPayments.week_start_date))
      .limit(50);

    const withDistributions = await Promise.all(
      payments.map(async (p) => ({
        ...p,
        distributions: await getPaymentDistributions(p.id),
      }))
    );
    return res.json({ payments: withDistributions });
  })
);

// Dashboard summary
router.get(
  "/dashboard",
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = currentWeek();
    const [dropCountRow] = await db
      .select({ value: count() })
      .from(supplierDrops)
      .where(
        and(
          eq(supplierDrops.supplier_id, mySupplierId(req)),
          gte(supplierDrops.drop_date, weekStart),
          lte(supplierDrops.drop_date, weekEnd)
        )
      );

    // Count tolis across this supplier's drops this week
    const dropRows = await db
      .select({ id: supplierDrops.id })
      .from(supplierDrops)
      .where(
        and(
          eq(supplierDrops.supplier_id, mySupplierId(req)),
          gte(supplierDrops.drop_date, weekStart),
          lte(supplierDrops.drop_date, weekEnd)
        )
      );
    const dropIds = dropRows.map((d) => d.id);
    const [toliCountRow] = dropIds.length
      ? await db.select({ value: count() }).from(tolis).where(inArray(tolis.drop_id, dropIds))
      : [{ value: 0 }];

    const pendingPayments = await db
      .select()
      .from(supplierPayments)
      .where(
        and(
          eq(supplierPayments.supplier_id, mySupplierId(req)),
          eq(supplierPayments.collection_status, "PENDING")
        )
      )
      .limit(5);

    return res.json({
      weekStart,
      weekEnd,
      weekDropCount: dropCountRow?.value ?? 0,
      weekToliCount: toliCountRow?.value ?? 0,
      pendingPayments,
    });
  })
);

export default router;
