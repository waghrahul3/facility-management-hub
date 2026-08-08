import { Router } from "express";
import { and, count, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { facilities, users } from "../../db/schema.js";
import { requireCompanyAccess } from "../../auth/middleware.js";
import { hashPassword } from "../../auth/password.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
import { param } from "../../lib/params.js";

const router = Router();

// ---------------------------------------------------------------------------
// Facility admins across all facilities of the company
// ---------------------------------------------------------------------------

router.get(
  "/:companyId/facility-admins",
  requireCompanyAccess,
  asyncHandler(async (req, res) => {
    const companyId = param(req, "companyId");
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
    const query = req.query as Record<string, unknown>;
    const q = typeof query.q === "string" ? query.q.trim() : "";
    const facilityId = typeof query.facilityId === "string" ? query.facilityId.trim() : "";
    const facilityIds = (
      await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.company_id, companyId))
    ).map((f) => f.id);
    const base =
      facilityIds.length > 0
        ? and(eq(users.role, "FACILITY_ADMIN"), inArray(users.facility_id, facilityIds))
        : undefined;
    const where = base
      ? and(
          base,
          q ? or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined,
          facilityId ? eq(users.facility_id, facilityId) : undefined
        )
      : undefined;
    const rows = where
      ? await db
          .select()
          .from(users)
          .where(where)
          .orderBy(desc(users.created_at))
          .limit(limit)
          .offset(offset)
      : [];
    const [totalRow] = where
      ? await db.select({ value: count() }).from(users).where(where)
      : [{ value: 0 }];
    return res.json({
      facilityAdmins: rows,
      ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }),
    });
  })
);

router.post(
  "/:companyId/facility-admins",
  requireCompanyAccess,
  asyncHandler(async (req, res) => {
    const companyId = param(req, "companyId");
    const { name, email, phone, password, facilityId } = req.body ?? {};
    if (!name || !email || !password || !facilityId) {
      throw badRequest("name, email, password and facilityId are required");
    }
    const facility = (
      await db.select().from(facilities).where(eq(facilities.id, facilityId)).limit(1)
    )[0];
    if (!facility) throw badRequest("Facility not found");
    if (facility.company_id !== companyId && req.auth?.role !== "SUPER_ADMIN") {
      throw badRequest("Facility does not belong to this company");
    }
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (existingUser) throw badRequest("A user with this email already exists");

    const [user] = await db
      .insert(users)
      .values({
        name,
        email: email.toLowerCase(),
        phone: phone ?? null,
        password_hash: await hashPassword(password),
        role: "FACILITY_ADMIN",
        facility_id: facilityId,
        company_id: companyId,
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "FACILITY_ADMIN",
      entityId: user.id,
      newValues: { id: user.id, name: user.name, email: user.email, facilityId },
    });
    return res.status(201).json({ facilityAdmin: user });
  })
);

router.put(
  "/:companyId/facility-admins/:id",
  requireCompanyAccess,
  asyncHandler(async (req, res) => {
    const companyId = param(req, "companyId");
    const existing = (
      await db.select().from(users).where(eq(users.id, param(req, "id"))).limit(1)
    )[0];
    if (!existing) throw notFound("Facility admin not found");
    if (existing.role !== "FACILITY_ADMIN") throw badRequest("User is not a facility admin");

    // The admin must belong to a facility owned by this company
    const facilityIds = (
      await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.company_id, companyId))
    ).map((f) => f.id);
    if (!existing.facility_id || !facilityIds.includes(existing.facility_id)) {
      throw badRequest("This admin does not belong to one of your facilities");
    }

    const { name, phone, email } = req.body ?? {};
    let newEmail: string | null = null;
    if (email !== undefined && email !== null && String(email).toLowerCase() !== existing.email) {
      newEmail = String(email).toLowerCase().trim();
      const [dup] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, newEmail), ne(users.id, existing.id)))
        .limit(1);
      if (dup) throw badRequest("A user with this email already exists");
    }

    const [updated] = await db
      .update(users)
      .set({
        name: name !== undefined && name !== null && String(name).trim() !== "" ? String(name).trim() : existing.name,
        phone: phone !== undefined ? phone : existing.phone,
        email: newEmail ?? existing.email,
        updated_at: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "FACILITY_ADMIN",
      entityId: updated.id,
      oldValues: { id: existing.id, name: existing.name, email: existing.email },
      newValues: { id: updated.id, name: updated.name, email: updated.email },
    });
    return res.json({ facilityAdmin: updated });
  })
);

export default router;
