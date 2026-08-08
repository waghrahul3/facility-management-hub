import { Router } from "express";
import { and, count, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { supplierDrops, suppliers, toliLeaders, tolis, users } from "../../db/schema.js";
import { requireFacilityAccess } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
import { param } from "../../lib/params.js";

const router = Router();

// ---------------------------------------------------------------------------
// Tolis
// ---------------------------------------------------------------------------

router.get(
  "/:facilityId/tolis",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
    const query = req.query as Record<string, unknown>;
    const q = typeof query.q === "string" ? query.q.trim() : "";
    const status = typeof query.status === "string" ? query.status.trim() : "";
    const supplierId = typeof query.supplier_id === "string" ? query.supplier_id.trim() : "";
    const date = typeof query.date === "string" ? query.date.trim() : "";
    const where = and(
      eq(tolis.facility_id, param(req, "facilityId")),
      q ? or(ilike(tolis.leader_name, `%${q}%`), ilike(suppliers.name, `%${q}%`)) : undefined,
      status ? eq(tolis.status, status as "ACTIVE" | "COMPLETED") : undefined,
      supplierId ? eq(suppliers.id, supplierId) : undefined,
      date
        ? and(gte(tolis.date, new Date(`${date}T00:00:00`)), lte(tolis.date, new Date(`${date}T23:59:59.999`)))
        : undefined
    );
    const rows = await db
      .select({
        toli: tolis,
        drop: {
          id: supplierDrops.id,
          rent_per_drop: supplierDrops.rent_per_drop,
        },
        supplier: { id: suppliers.id, name: suppliers.name },
        // Toli leader registry row (name + phone)
        leader: { id: toliLeaders.id, phone: toliLeaders.phone },
        // Login account linked to this toli leader (if one exists)
        user: { id: users.id, name: users.name, email: users.email, phone: users.phone },
      })
      .from(tolis)
      .leftJoin(supplierDrops, eq(supplierDrops.id, tolis.drop_id))
      .leftJoin(suppliers, eq(suppliers.id, supplierDrops.supplier_id))
      .leftJoin(toliLeaders, eq(toliLeaders.id, tolis.leader_id))
      .leftJoin(users, and(eq(users.toli_id, tolis.id), eq(users.role, "TOLI_LEADER")))
      .where(where)
      .orderBy(desc(tolis.date))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db
      .select({ value: count() })
      .from(tolis)
      .leftJoin(supplierDrops, eq(supplierDrops.id, tolis.drop_id))
      .leftJoin(suppliers, eq(suppliers.id, supplierDrops.supplier_id))
      .where(where);
    return res.json({ tolis: rows, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
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

    const { leader_name, worker_count, daily_charge, date, status, drop_id } = req.body ?? {};
    const [updated] = await db
      .update(tolis)
      .set({
        leader_name: leader_name ?? existing.leader_name,
        worker_count: worker_count !== undefined ? worker_count : existing.worker_count,
        daily_charge: daily_charge !== undefined ? daily_charge : existing.daily_charge,
        date: date !== undefined ? new Date(date) : existing.date,
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

// PUT /:facilityId/tolis/:toliId/leader — edit the toli leader's name/phone.
// Keeps the toli leader registry, the toli's denormalized leader_name, and
// the linked TOLI_LEADER login account (if one exists) all in sync.
router.put(
  "/:facilityId/tolis/:toliId/leader",
  requireFacilityAccess,
  asyncHandler(async (req, res) => {
    const toli = (
      await db.select().from(tolis).where(eq(tolis.id, param(req, "toliId"))).limit(1)
    )[0];
    if (!toli) throw notFound("Toli not found");

    const { leader_name, phone } = req.body ?? {};
    if (!leader_name || typeof leader_name !== "string" || leader_name.trim() === "") {
      throw badRequest("leader_name is required");
    }
    const cleanName = leader_name.trim();
    const cleanPhone = phone !== undefined && phone !== null ? String(phone).trim() || null : undefined;

    // 1) Toli leader registry
    let leader = null;
    let oldLeaderPhone: string | null = null;
    if (toli.leader_id) {
      const [existingLeader] = await db
        .select()
        .from(toliLeaders)
        .where(eq(toliLeaders.id, toli.leader_id))
        .limit(1);
      oldLeaderPhone = existingLeader?.phone ?? null;
      [leader] = await db
        .update(toliLeaders)
        .set({
          name: cleanName,
          phone: cleanPhone !== undefined ? cleanPhone : undefined,
          updated_at: new Date(),
        })
        .where(eq(toliLeaders.id, toli.leader_id))
        .returning();
    }

    // 2) Denormalized leader_name on the toli row
    const [updatedToli] = await db
      .update(tolis)
      .set({ leader_name: cleanName, updated_at: new Date() })
      .where(eq(tolis.id, toli.id))
      .returning();

    // 3) Linked TOLI_LEADER login account (if one exists)
    const linkedUser = (
      await db
        .select()
        .from(users)
        .where(and(eq(users.toli_id, toli.id), eq(users.role, "TOLI_LEADER")))
        .limit(1)
    )[0];
    if (linkedUser) {
      await db
        .update(users)
        .set({
          name: cleanName,
          phone: cleanPhone !== undefined ? cleanPhone : linkedUser.phone,
          updated_at: new Date(),
        })
        .where(eq(users.id, linkedUser.id));
    }

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "TOLI_LEADER",
      entityId: toli.id,
      oldValues: { name: toli.leader_name, phone: oldLeaderPhone },
      newValues: { name: cleanName, phone: leader?.phone ?? null },
    });
    return res.json({
      toli: updatedToli,
      leader,
      user: linkedUser
        ? {
            id: linkedUser.id,
            name: cleanName,
            email: linkedUser.email,
            phone: cleanPhone !== undefined ? cleanPhone : linkedUser.phone,
          }
        : null,
    });
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

export default router;
