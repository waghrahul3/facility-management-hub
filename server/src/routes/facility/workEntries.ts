import { Router } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/index.js";
import { bagSizes, tolis, workEntries } from "../../db/schema.js";
import { requireFacilityAccess, requireRole } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
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
        total_amount: rate * quantity_bags,
        onion_category: onion_category || null,
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

router.put(
  "/:facilityId/work-entries/:entryId",
  requireFacilityAccess,
  workEntryAdmin,
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(workEntries).where(eq(workEntries.id, param(req, "entryId"))).limit(1)
    )[0];
    if (!existing) throw notFound("Work entry not found");

    const { quantity_bags, onion_category, notes, status } = req.body ?? {};
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
