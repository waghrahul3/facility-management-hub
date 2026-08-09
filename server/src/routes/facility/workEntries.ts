import { Router } from "express";
import { and, count, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { bagSizes, supplierDrops, suppliers, toliLeaders, tolis, workEntries } from "../../db/schema.js";
import { requireFacilityAccess, requireRole } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { roundMoney } from "../../lib/format.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
import { param } from "../../lib/params.js";
import { resolveRateForBagSize } from "../../services/payments.js";
import { weekParams } from "./_shared.js";

const router = Router();

// Only facility admins, company admins (of the owning company) and the global
// super admin may edit a work entry or change its status — suppliers and toli
// leaders are strictly view-only.
const workEntryAdmin = requireRole("SUPER_ADMIN", "FACILITY_ADMIN", "COMPANY_ADMIN");

// ---------------------------------------------------------------------------
// Work entries
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/work-entries",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { weekStart, weekEnd } = weekParams(req.query as Record<string, unknown>);
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
    const query = req.query as Record<string, unknown>;
    const q = typeof query.q === "string" ? query.q.trim() : "";
    const status = typeof query.status === "string" ? query.status.trim() : "";
    const supplierId = typeof query.supplier_id === "string" ? query.supplier_id.trim() : "";
    const where = and(
      eq(workEntries.facility_id, param(req, "facilityId")),
      gte(workEntries.work_date, weekStart),
      lte(workEntries.work_date, weekEnd),
      q ? ilike(tolis.leader_name, `%${q}%`) : undefined,
      status ? eq(workEntries.status, status as "DRAFT" | "APPROVED" | "PAID") : undefined,
      supplierId ? eq(suppliers.id, supplierId) : undefined
    );
    const rows = await db
      .select({
        entry: workEntries,
        toli: { id: tolis.id, leader_name: tolis.leader_name, worker_count: tolis.worker_count },
        drop: { id: supplierDrops.id, rent_per_drop: supplierDrops.rent_per_drop },
        supplier: { id: suppliers.id, name: suppliers.name },
        bagSize: { id: bagSizes.id, size_name: bagSizes.size_name, weight_kg: bagSizes.weight_kg },
      })
      .from(workEntries)
      .innerJoin(tolis, eq(tolis.id, workEntries.toli_id))
      .innerJoin(bagSizes, eq(bagSizes.id, workEntries.bag_size_id))
      .leftJoin(supplierDrops, eq(supplierDrops.id, tolis.drop_id))
      .leftJoin(suppliers, eq(suppliers.id, supplierDrops.supplier_id))
      .where(where)
      .orderBy(desc(workEntries.work_date))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db
      .select({ value: count() })
      .from(workEntries)
      .innerJoin(tolis, eq(tolis.id, workEntries.toli_id))
      .leftJoin(supplierDrops, eq(supplierDrops.id, tolis.drop_id))
      .leftJoin(suppliers, eq(suppliers.id, supplierDrops.supplier_id))
      .where(where);
    return res.json({ entries: rows, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

router.get(
  "/:facilityId/work-entries/toli/:toliId",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
    const where = and(
      eq(workEntries.toli_id, param(req, "toliId")),
      eq(workEntries.facility_id, param(req, "facilityId"))
    );
    const rows = await db
      .select()
      .from(workEntries)
      .where(where)
      .orderBy(desc(workEntries.work_date))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db
      .select({ value: count() })
      .from(workEntries)
      .where(where);
    return res.json({ entries: rows, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

router.post(
  "/:facilityId/work-entries",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { toli_id, work_date, bag_size_id, quantity_bags, onion_category, notes } = req.body ?? {};
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
        total_amount: roundMoney(rate * quantity_bags),
        onion_category: onion_category || null,
        notes: notes ?? null,
        // Entries recorded by the facility admin are accepted by default:
        // the toli leader's confirmation is treated as given, so the entry
        // is immediately APPROVED and counts toward weekly earnings without
        // a separate confirmation step. Admins can still reject it later.
        status: "APPROVED",
        leader_confirmed_at: new Date(),
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

// ---------------------------------------------------------------------------
// Quick-create: one form creates the whole chain — supplier drop → toli →
// work entry. The drop and toli are reused when one already exists for the
// same supplier / leader on the same day, so repeat entries for the same
// group don't duplicate records. Bag counts are added afterwards via PUT
// (step 2 of the two-step flow).
// ---------------------------------------------------------------------------

router.post(
  "/:facilityId/work-entries/quick-create",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const {
      supplier_id,
      leader_name,
      rent_per_drop,
      worker_count,
      work_date,
      bag_size_id,
      onion_category,
      notes,
    } = req.body ?? {};
    if (!supplier_id || !leader_name || !work_date || !bag_size_id) {
      throw badRequest("supplier_id, leader_name, work_date and bag_size_id are required");
    }
    const facilityId = param(req, "facilityId");
    const date = new Date(work_date);
    const dayStart = new Date(`${work_date}T00:00:00.000Z`);
    const dayEnd = new Date(`${work_date}T23:59:59.999Z`);

    // 1) Find-or-create the supplier drop for that day
    let drop = (
      await db
        .select()
        .from(supplierDrops)
        .where(
          and(
            eq(supplierDrops.supplier_id, supplier_id),
            eq(supplierDrops.facility_id, facilityId),
            gte(supplierDrops.drop_date, dayStart),
            lte(supplierDrops.drop_date, dayEnd)
          )
        )
        .limit(1)
    )[0];
    let dropCreated = false;
    if (drop) {
      // Reuse the existing drop, refreshing the negotiated rent
      [drop] = await db
        .update(supplierDrops)
        .set({
          // Only a real rent overwrites the negotiated one (0 keeps it)
          rent_per_drop:
            rent_per_drop && rent_per_drop > 0 ? rent_per_drop : drop.rent_per_drop,
          total_workers_dropped: worker_count ?? drop.total_workers_dropped,
          updated_at: new Date(),
        })
        .where(eq(supplierDrops.id, drop.id))
        .returning();
    } else {
      [drop] = await db
        .insert(supplierDrops)
        .values({
          supplier_id,
          facility_id: facilityId,
          drop_date: date,
          total_workers_dropped: worker_count ?? 0,
          rent_per_drop: rent_per_drop ?? 0,
        })
        .returning();
      dropCreated = true;
    }

    // 2) Find-or-create the toli leader registry row, then the toli
    const cleanLeader = String(leader_name).trim();
    let leader = (
      await db
        .select()
        .from(toliLeaders)
        .where(eq(toliLeaders.name, cleanLeader))
        .limit(1)
    )[0];
    if (!leader) {
      [leader] = await db
        .insert(toliLeaders)
        .values({ name: cleanLeader, phone: null })
        .returning();
    }
    let toli = (
      await db
        .select()
        .from(tolis)
        .where(
          and(
            eq(tolis.facility_id, facilityId),
            eq(tolis.leader_name, cleanLeader),
            gte(tolis.date, dayStart),
            lte(tolis.date, dayEnd)
          )
        )
        .limit(1)
    )[0];
    let toliCreated = false;
    if (!toli) {
      [toli] = await db
        .insert(tolis)
        .values({
          facility_id: facilityId,
          leader_id: leader.id,
          leader_name: cleanLeader,
          worker_count: worker_count ?? 0,
          daily_charge: 0,
          date,
          drop_id: drop.id,
        })
        .returning();
      toliCreated = true;
    } else {
      // Reused toli: refresh the worker count from the form
      [toli] = await db
        .update(tolis)
        .set({
          worker_count: worker_count ?? toli.worker_count,
          updated_at: new Date(),
        })
        .where(eq(tolis.id, toli.id))
        .returning();
    }

    // 3) Create the work entry (bags filled in step 2)
    const rate = await resolveRateForBagSize(facilityId, bag_size_id);
    if (rate == null) {
      throw badRequest("No rate configured for this bag size (facility or global)");
    }
    const [entry] = await db
      .insert(workEntries)
      .values({
        toli_id: toli.id,
        facility_id: facilityId,
        work_date: date,
        bag_size_id,
        quantity_bags: 0,
        rate_per_bag: rate,
        total_amount: 0,
        onion_category: onion_category || null,
        notes: notes ?? null,
        status: "APPROVED",
        leader_confirmed_at: new Date(),
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "WORK_ENTRY",
      entityId: entry.id,
      newValues: { ...entry, quickCreate: { dropCreated, toliCreated } },
    });
    return res.status(201).json({ entry, toli, drop, dropCreated, toliCreated });
  })
);

router.put(
  "/:facilityId/work-entries/:entryId",
  requireFacilityAccess,
  workEntryAdmin,
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(workEntries).where(eq(workEntries.id, param(req, "entryId"))).limit(1)
    )[0];
    if (!existing) throw notFound("Work entry not found");

    const { quantity_bags, onion_category, notes, status, rent_per_drop } = req.body ?? {};
    // Paid entries are locked after the Sunday payment settlement
    if (existing.status === "PAID" && status && status !== "PAID") {
      throw badRequest("Paid work entries are locked after payment settlement");
    }
    // The drop rent can be corrected here too — it lives on the supplier
    // drop that brought the entry's toli in (shared by all its entries).
    // Only a positive value updates it, so an empty input never wipes it.
    if (rent_per_drop != null && rent_per_drop > 0) {
      const toli = (
        await db.select().from(tolis).where(eq(tolis.id, existing.toli_id)).limit(1)
      )[0];
      if (toli?.drop_id) {
        await db
          .update(supplierDrops)
          .set({ rent_per_drop, updated_at: new Date() })
          .where(eq(supplierDrops.id, toli.drop_id));
      }
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
        onion_category:
          onion_category !== undefined ? onion_category || null : existing.onion_category,
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

// Toli leader confirm (facility admin can also see confirmations)
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
