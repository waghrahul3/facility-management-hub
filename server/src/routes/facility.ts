import { Router } from "express";
import { and, count, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  bagSizes,
  facilities,
  rates,
  supplierDrops,
  supplierPayments,
  suppliers,
  toliLeaders,
  tolis,
  weeklyWorkSummaries,
  workEntries,
} from "../db/schema.js";
import { requireAuth, requireFacilityAccess, requireRole } from "../auth/middleware.js";
import { audit } from "../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../lib/errors.js";
import { param } from "../lib/params.js";
import {
  computeSupplierWeekPayment,
  currentWeek,
  generateWeeklySummaries,
  processSupplierPayments,
  resolveRateForBagSize,
} from "../services/payments.js";
import { endOfWeek, startOfWeek } from "../lib/date.js";

const router = Router();
router.use(requireAuth);
// SUPPLIER is allowed only on the public facility list (used to register drops);
// every facility-scoped route below additionally enforces requireFacilityAccess,
// which also admits COMPANY_ADMINs for facilities owned by their company.
router.use(requireRole("SUPER_ADMIN", "FACILITY_ADMIN", "COMPANY_ADMIN", "SUPPLIER"));

// ---------------------------------------------------------------------------
// Helper: week params from query (weekStart optional)
// ---------------------------------------------------------------------------

function weekParams(q: Record<string, unknown>) {
  const weekStart = q.weekStart ? new Date(String(q.weekStart)) : startOfWeek(new Date());
  return { weekStart, weekEnd: endOfWeek(weekStart) };
}

// ---------------------------------------------------------------------------
// Facilities list (for suppliers registering drops)
// ---------------------------------------------------------------------------

router.get(
  "/facilities",
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select()
      .from(facilities)
      .where(eq(facilities.is_active, true))
      .orderBy(facilities.name);
    return res.json({ facilities: rows });
  })
);

// ---------------------------------------------------------------------------
// Bag sizes (for recording work entries)
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/bag-sizes",
  requireFacilityAccess,
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select()
      .from(bagSizes)
      .orderBy(bagSizes.size_name);
    return res.json({ bagSizes: rows });
  })
);

// ---------------------------------------------------------------------------
// Suppliers (list for drop registration)
//
// Visibility rules:
//  - ACTIVE suppliers are globally selectable (at every facility).
//  - PENDING suppliers (registered by a facility, awaiting Super Admin login)
//    are only selectable at the facility that registered them.
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/suppliers",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(suppliers)
      .where(
        or(
          eq(suppliers.status, "ACTIVE"),
          eq(suppliers.facility_id, param(req, "facilityId"))
        )
      )
      .orderBy(suppliers.name);
    return res.json({ suppliers: rows });
  })
);

// Facility admins can register a supplier at their own facility. These are
// facility-scoped and PENDING — the Super Admin generates their login later.
router.post(
  "/:facilityId/suppliers",
  requireFacilityAccess,
  requireRole("SUPER_ADMIN", "FACILITY_ADMIN", "COMPANY_ADMIN"),
  asyncHandler(async (req, res) => {
    const { name, email, phone, contact_person, address, city } = req.body ?? {};
    if (!name) throw badRequest("name is required");

    const [supplier] = await db
      .insert(suppliers)
      .values({
        name,
        email: email ?? null,
        phone: phone ?? null,
        contact_person: contact_person ?? null,
        address: address ?? null,
        city: city ?? null,
        status: "PENDING",
        facility_id: param(req, "facilityId"),
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "SUPPLIER",
      entityId: supplier.id,
      newValues: supplier,
    });
    return res.status(201).json({ supplier });
  })
);

// ---------------------------------------------------------------------------
// Supplier drops
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/supplier-drops",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = weekParams(req.query as Record<string, unknown>);
    const rows = await db
      .select({
        drop: supplierDrops,
        supplier: {
          id: suppliers.id,
          name: suppliers.name,
          phone: suppliers.phone,
        },
      })
      .from(supplierDrops)
      .leftJoin(suppliers, eq(suppliers.id, supplierDrops.supplier_id))
      .where(
        and(
          eq(supplierDrops.facility_id, param(req, "facilityId")),
          gte(supplierDrops.drop_date, weekStart),
          lte(supplierDrops.drop_date, weekEnd)
        )
      )
      .orderBy(desc(supplierDrops.drop_date));
    return res.json({ drops: rows });
  })
);

router.post(
  "/:facilityId/supplier-drops",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { supplier_id, drop_date, total_workers_dropped, rent_per_drop } = req.body ?? {};
    if (!supplier_id || !drop_date) {
      throw badRequest("supplier_id and drop_date are required");
    }
    const [drop] = await db
      .insert(supplierDrops)
      .values({
        supplier_id,
        facility_id: param(req, "facilityId"),
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

router.put(
  "/:facilityId/supplier-drops/:dropId",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const existing = (
      await db
        .select()
        .from(supplierDrops)
        .where(eq(supplierDrops.id, param(req, "dropId")))
        .limit(1)
    )[0];
    if (!existing) throw notFound("Drop not found");

    const { total_workers_dropped, rent_per_drop, status } = req.body ?? {};
    const [updated] = await db
      .update(supplierDrops)
      .set({
        total_workers_dropped:
          total_workers_dropped !== undefined ? total_workers_dropped : existing.total_workers_dropped,
        rent_per_drop: rent_per_drop !== undefined ? rent_per_drop : existing.rent_per_drop,
        status: status ?? existing.status,
        updated_at: new Date(),
      })
      .where(eq(supplierDrops.id, param(req, "dropId")))
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "SUPPLIER_DROP",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ drop: updated });
  })
);

// ---------------------------------------------------------------------------
// Tolis
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/tolis",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const rows = await db
      .select({
        toli: tolis,
        drop: {
          id: supplierDrops.id,
          rent_per_drop: supplierDrops.rent_per_drop,
        },
        supplier: { id: suppliers.id, name: suppliers.name },
      })
      .from(tolis)
      .leftJoin(supplierDrops, eq(supplierDrops.id, tolis.drop_id))
      .leftJoin(suppliers, eq(suppliers.id, supplierDrops.supplier_id))
      .where(eq(tolis.facility_id, param(req, "facilityId")))
      .orderBy(desc(tolis.date));
    return res.json({ tolis: rows });
  })
);

router.post(
  "/:facilityId/tolis",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { leader_name, worker_count, daily_charge, date, drop_id } = req.body ?? {};
    if (!leader_name || !date) throw badRequest("leader_name and date are required");

    // Keep a lightweight toli leader registry
    const [leader] = await db
      .insert(toliLeaders)
      .values({ name: leader_name, phone: null })
      .returning();

    const [toli] = await db
      .insert(tolis)
      .values({
        facility_id: param(req, "facilityId"),
        leader_id: leader.id,
        leader_name,
        worker_count: worker_count ?? 0,
        daily_charge: daily_charge ?? 0,
        date: new Date(date),
        drop_id: drop_id ?? null,
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "TOLI",
      entityId: toli.id,
      newValues: toli,
    });
    return res.status(201).json({ toli });
  })
);

router.put(
  "/:facilityId/tolis/:toliId",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(tolis).where(eq(tolis.id, param(req, "toliId"))).limit(1)
    )[0];
    if (!existing) throw notFound("Toli not found");

    const { leader_name, worker_count, daily_charge, status, drop_id } = req.body ?? {};
    const [updated] = await db
      .update(tolis)
      .set({
        leader_name: leader_name ?? existing.leader_name,
        worker_count: worker_count !== undefined ? worker_count : existing.worker_count,
        daily_charge: daily_charge !== undefined ? daily_charge : existing.daily_charge,
        status: status ?? existing.status,
        drop_id: drop_id !== undefined ? drop_id : existing.drop_id,
        updated_at: new Date(),
      })
      .where(eq(tolis.id, param(req, "toliId")))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "TOLI",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ toli: updated });
  })
);

router.delete(
  "/:facilityId/tolis/:toliId",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(tolis).where(eq(tolis.id, param(req, "toliId"))).limit(1)
    )[0];
    if (!existing) throw notFound("Toli not found");
    await db.delete(tolis).where(eq(tolis.id, param(req, "toliId")));
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "DELETE",
      entityType: "TOLI",
      entityId: param(req, "toliId"),
      oldValues: existing,
    });
    return res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Work entries
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/work-entries",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = weekParams(req.query as Record<string, unknown>);
    const rows = await db
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
          eq(workEntries.facility_id, param(req, "facilityId")),
          gte(workEntries.work_date, weekStart),
          lte(workEntries.work_date, weekEnd)
        )
      )
      .orderBy(desc(workEntries.work_date));
    return res.json({ entries: rows });
  })
);

router.get(
  "/:facilityId/work-entries/toli/:toliId",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(workEntries)
      .where(
        and(
          eq(workEntries.toli_id, param(req, "toliId")),
          eq(workEntries.facility_id, param(req, "facilityId"))
        )
      )
      .orderBy(desc(workEntries.work_date));
    return res.json({ entries: rows });
  })
);

router.post(
  "/:facilityId/work-entries",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { toli_id, work_date, bag_size_id, quantity_bags, notes } = req.body ?? {};
    if (!toli_id || !work_date || !bag_size_id || quantity_bags == null) {
      throw badRequest("toli_id, work_date, bag_size_id and quantity_bags are required");
    }

    const rate = await resolveRateForBagSize(param(req, "facilityId"), bag_size_id);
    if (rate == null) {
      throw badRequest("No rate configured for this bag size (facility or global)");
    }

    const [entry] = await db
      .insert(workEntries)
      .values({
        toli_id,
        facility_id: param(req, "facilityId"),
        work_date: new Date(work_date),
        bag_size_id,
        quantity_bags,
        rate_per_bag: rate,
        total_amount: rate * quantity_bags,
        notes: notes ?? null,
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "WORK_ENTRY",
      entityId: entry.id,
      newValues: entry,
    });
    return res.status(201).json({ entry });
  })
);

// Only facility admins, company admins (of the owning company) and the global
// super admin may edit a work entry or change its status — suppliers and toli
// leaders are strictly view-only.
const workEntryAdmin = requireRole("SUPER_ADMIN", "FACILITY_ADMIN", "COMPANY_ADMIN");

router.put(
  "/:facilityId/work-entries/:entryId",
  requireFacilityAccess,
  workEntryAdmin,
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(workEntries).where(eq(workEntries.id, param(req, "entryId"))).limit(1)
    )[0];
    if (!existing) throw notFound("Work entry not found");

    const { quantity_bags, notes, status } = req.body ?? {};
    // Paid entries are locked after the Sunday payment settlement
    if (existing.status === "PAID" && status && status !== "PAID") {
      throw badRequest("Paid work entries are locked after payment settlement");
    }
    let rate = existing.rate_per_bag;
    if (quantity_bags != null) {
      // Re-resolve rate (rates may have changed since entry creation)
      const fresh = await resolveRateForBagSize(
        param(req, "facilityId"),
        existing.bag_size_id
      );
      if (fresh != null) rate = fresh;
    }

    const [updated] = await db
      .update(workEntries)
      .set({
        quantity_bags: quantity_bags ?? existing.quantity_bags,
        rate_per_bag: rate,
        total_amount: (quantity_bags ?? existing.quantity_bags) * rate,
        notes: notes !== undefined ? notes : existing.notes,
        status: status ?? existing.status,
        updated_at: new Date(),
      })
      .where(eq(workEntries.id, param(req, "entryId")))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "WORK_ENTRY",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ entry: updated });
  })
);

// Approve / reject a single work entry (facility admin only)
router.post(
  "/:facilityId/work-entries/:entryId/approve",
  requireFacilityAccess,
  workEntryAdmin,
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(workEntries).where(eq(workEntries.id, param(req, "entryId"))).limit(1)
    )[0];
    if (!existing) throw notFound("Work entry not found");
    if (existing.status === "PAID") {
      throw badRequest("Paid work entries are locked after payment settlement");
    }
    const [updated] = await db
      .update(workEntries)
      .set({ status: "APPROVED", updated_at: new Date() })
      .where(eq(workEntries.id, param(req, "entryId")))
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "APPROVE",
      entityType: "WORK_ENTRY",
      entityId: updated.id,
      newValues: updated,
    });
    return res.json({ entry: updated });
  })
);

router.post(
  "/:facilityId/work-entries/:entryId/reject",
  requireFacilityAccess,
  workEntryAdmin,
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(workEntries).where(eq(workEntries.id, param(req, "entryId"))).limit(1)
    )[0];
    if (!existing) throw notFound("Work entry not found");
    if (existing.status === "PAID") {
      throw badRequest("Paid work entries are locked after payment settlement");
    }
    const [updated] = await db
      .update(workEntries)
      .set({ status: "DRAFT", updated_at: new Date() })
      .where(eq(workEntries.id, param(req, "entryId")))
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "REJECT",
      entityType: "WORK_ENTRY",
      entityId: updated.id,
      newValues: updated,
    });
    return res.json({ entry: updated });
  })
);

// ---------------------------------------------------------------------------
// Facility-specific rates
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/rates",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    // Facility-specific rates
    const facilityRates = await db
      .select({
        rate: rates,
        bagSize: { id: bagSizes.id, size_name: bagSizes.size_name, weight_kg: bagSizes.weight_kg },
      })
      .from(rates)
      .innerJoin(bagSizes, eq(bagSizes.id, rates.bag_size_id))
      .where(eq(rates.facility_id, param(req, "facilityId")));

    // Global rates (fallback)
    const globalRates = await db
      .select({
        rate: rates,
        bagSize: { id: bagSizes.id, size_name: bagSizes.size_name, weight_kg: bagSizes.weight_kg },
      })
      .from(rates)
      .innerJoin(bagSizes, eq(bagSizes.id, rates.bag_size_id))
      .where(isNull(rates.facility_id));

    return res.json({ facilityRates, globalRates });
  })
);

router.post(
  "/:facilityId/rates",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { bag_size_id, rate_amount } = req.body ?? {};
    if (!bag_size_id || rate_amount == null) {
      throw badRequest("bag_size_id and rate_amount are required");
    }

    // Upsert facility-specific rate for this bag size
    const [rate] = await db
      .insert(rates)
      .values({
        bag_size_id,
        facility_id: param(req, "facilityId"),
        rate_amount,
        is_global: false,
        created_by: req.auth?.userId,
      })
      .onConflictDoUpdate({
        target: [rates.bag_size_id, rates.facility_id],
        set: { rate_amount, updated_at: new Date() },
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "RATE",
      entityId: rate.id,
      newValues: rate,
    });
    return res.status(201).json({ rate });
  })
);

// ---------------------------------------------------------------------------
// Weekly summaries + approval
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/weekly-summary",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = weekParams(req.query as Record<string, unknown>);
    const rows = await db
      .select({
        summary: weeklyWorkSummaries,
        toli: { id: tolis.id, leader_name: tolis.leader_name },
        supplier: { id: suppliers.id, name: suppliers.name },
      })
      .from(weeklyWorkSummaries)
      .innerJoin(tolis, eq(tolis.id, weeklyWorkSummaries.toli_id))
      .leftJoin(suppliers, eq(suppliers.id, weeklyWorkSummaries.supplier_id))
      .where(
        and(
          eq(weeklyWorkSummaries.facility_id, param(req, "facilityId")),
          eq(weeklyWorkSummaries.week_start_date, weekStart)
        )
      )
      .orderBy(desc(weeklyWorkSummaries.total_earnings));
    return res.json({ summaries: rows, weekStart, weekEnd });
  })
);

router.post(
  "/:facilityId/weekly-summary/generate",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = weekParams((req.body ?? {}) as Record<string, unknown>);
    const summaries = await generateWeeklySummaries(
      param(req, "facilityId"),
      weekStart,
      weekEnd
    );
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "WEEKLY_SUMMARY",
      entityId: param(req, "facilityId"),
      newValues: { generated: summaries.length },
    });
    return res.json({ summaries, count: summaries.length });
  })
);

router.post(
  "/:facilityId/weekly-summary/:summaryId/approve",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const existing = (
      await db
        .select()
        .from(weeklyWorkSummaries)
        .where(eq(weeklyWorkSummaries.id, param(req, "summaryId")))
        .limit(1)
    )[0];
    if (!existing) throw notFound("Summary not found");

    const [updated] = await db
      .update(weeklyWorkSummaries)
      .set({
        approval_status: "APPROVED",
        approved_by: req.auth?.userId,
        approved_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(weeklyWorkSummaries.id, param(req, "summaryId")))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "APPROVE",
      entityType: "WEEKLY_SUMMARY",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ summary: updated });
  })
);

router.post(
  "/:facilityId/weekly-summary/:summaryId/reject",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const existing = (
      await db
        .select()
        .from(weeklyWorkSummaries)
        .where(eq(weeklyWorkSummaries.id, param(req, "summaryId")))
        .limit(1)
    )[0];
    if (!existing) throw notFound("Summary not found");

    const [updated] = await db
      .update(weeklyWorkSummaries)
      .set({
        approval_status: "REJECTED",
        approved_by: req.auth?.userId,
        approved_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(weeklyWorkSummaries.id, param(req, "summaryId")))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "REJECT",
      entityType: "WEEKLY_SUMMARY",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ summary: updated });
  })
);

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/payments/pending",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = weekParams(req.query as Record<string, unknown>);
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
          collection_status: supplierPayments.collection_status,
          payment_method: supplierPayments.payment_method,
        },
        supplier: { id: suppliers.id, name: suppliers.name },
      })
      .from(supplierPayments)
      .innerJoin(suppliers, eq(suppliers.id, supplierPayments.supplier_id))
      .where(
        and(
          eq(supplierPayments.facility_id, param(req, "facilityId")),
          eq(supplierPayments.week_start_date, weekStart)
        )
      )
      .orderBy(desc(supplierPayments.net_payment));
    return res.json({ payments: rows });
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
    const results = await processSupplierPayments(
      param(req, "facilityId"),
      weekStart,
      weekEnd
    );
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "SUPPLIER_PAYMENT",
      entityId: param(req, "facilityId"),
      newValues: { weekStart, results },
    });
    return res.json({ processed: results });
  })
);

router.get(
  "/:facilityId/payments/history",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const rows = await db
      .select({
        payment: supplierPayments,
        supplier: { id: suppliers.id, name: suppliers.name },
      })
      .from(supplierPayments)
      .innerJoin(suppliers, eq(suppliers.id, supplierPayments.supplier_id))
      .where(eq(supplierPayments.facility_id, param(req, "facilityId")))
      .orderBy(desc(supplierPayments.week_start_date))
      .limit(100);
    return res.json({ payments: rows });
  })
);

// ---------------------------------------------------------------------------
// Facility dashboard & reports
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/dashboard",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const facility = (
      await db.select().from(facilities).where(eq(facilities.id, param(req, "facilityId"))).limit(1)
    )[0];
    if (!facility) throw notFound("Facility not found");

    const { weekStart, weekEnd } = currentWeek();

    const [dropCountRow] = await db
      .select({ value: count() })
      .from(supplierDrops)
      .where(
        and(
          eq(supplierDrops.facility_id, param(req, "facilityId")),
          gte(supplierDrops.drop_date, weekStart),
          lte(supplierDrops.drop_date, weekEnd)
        )
      );

    const [toliCountRow] = await db
      .select({ value: count() })
      .from(tolis)
      .where(eq(tolis.facility_id, param(req, "facilityId")));

    const [pendingSummaryRow] = await db
      .select({ value: count() })
      .from(weeklyWorkSummaries)
      .where(
        and(
          eq(weeklyWorkSummaries.facility_id, param(req, "facilityId")),
          eq(weeklyWorkSummaries.approval_status, "PENDING")
        )
      );

    const pendingPayments = await db
      .select()
      .from(supplierPayments)
      .where(
        and(
          eq(supplierPayments.facility_id, param(req, "facilityId")),
          eq(supplierPayments.collection_status, "PENDING")
        )
      )
      .limit(5);

    const weekRentTotal = await db
      .select({ sum: supplierDrops.rent_per_drop })
      .from(supplierDrops)
      .where(
        and(
          eq(supplierDrops.facility_id, param(req, "facilityId")),
          gte(supplierDrops.drop_date, weekStart),
          lte(supplierDrops.drop_date, weekEnd)
        )
      );

    return res.json({
      facility,
      weekStart,
      weekEnd,
      weekDropCount: dropCountRow?.value ?? 0,
      toliCount: toliCountRow?.value ?? 0,
      pendingSummaryCount: pendingSummaryRow?.value ?? 0,
      weekRentTotal: weekRentTotal.reduce((s, r) => s + r.sum, 0),
      pendingPayments,
    });
  })
);

// ---------------------------------------------------------------------------
// Toli leader confirm (facility admin can also see confirmations)
// ---------------------------------------------------------------------------

router.post(
  "/:facilityId/work-entries/:entryId/confirm",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const [updated] = await db
      .update(workEntries)
      .set({ leader_confirmed_at: new Date(), updated_at: new Date() })
      .where(eq(workEntries.id, param(req, "entryId")))
      .returning();
    if (!updated) throw notFound("Work entry not found");
    return res.json({ entry: updated });
  })
);

export default router;
