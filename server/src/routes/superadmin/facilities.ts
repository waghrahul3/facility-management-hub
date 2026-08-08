import { Router } from "express";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { db } from "../../db/index.js";
import { companies, facilities, users } from "../../db/schema.js";
import { hashPassword } from "../../auth/password.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
import { param } from "../../lib/params.js";

const router = Router();

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

router.get(
  "/facilities",
  asyncHandler(async (req, res) => {
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
    const rows = await db
      .select({
        id: facilities.id,
        company_id: facilities.company_id,
        name: facilities.name,
        location: facilities.location,
        city: facilities.city,
        capacity: facilities.capacity,
        is_active: facilities.is_active,
        created_at: facilities.created_at,
        company: { id: companies.id, name: companies.name },
        admin: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(facilities)
      .leftJoin(companies, eq(companies.id, facilities.company_id))
      .leftJoin(users, eq(users.facility_id, facilities.id))
      .orderBy(desc(facilities.created_at))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db.select({ value: count() }).from(facilities);
    return res.json({ facilities: rows, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

router.post(
  "/facilities",
  asyncHandler(async (req, res) => {
    const { name, location, city, capacity, company_id } = req.body ?? {};
    if (!name || !location) throw badRequest("name and location are required");
    if (company_id) {
      const company = (
        await db.select().from(companies).where(eq(companies.id, company_id)).limit(1)
      )[0];
      if (!company) throw badRequest("Company not found");
    }
    const [facility] = await db
      .insert(facilities)
      .values({
        name,
        location,
        city: city ?? null,
        capacity: capacity ?? 0,
        company_id: company_id ?? null,
      })
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "FACILITY",
      entityId: facility.id,
      newValues: facility,
    });
    return res.status(201).json({ facility });
  })
);

router.put(
  "/facilities/:id",
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(facilities).where(eq(facilities.id, param(req, "id"))).limit(1)
    )[0];
    if (!existing) throw notFound("Facility not found");

    const { name, location, city, capacity, is_active, company_id } = req.body ?? {};
    if (company_id !== undefined && company_id !== null) {
      const company = (
        await db.select().from(companies).where(eq(companies.id, company_id)).limit(1)
      )[0];
      if (!company) throw badRequest("Company not found");
    }
    const [updated] = await db
      .update(facilities)
      .set({
        name: name ?? existing.name,
        location: location ?? existing.location,
        city: city !== undefined ? city : existing.city,
        capacity: capacity !== undefined ? capacity : existing.capacity,
        is_active: is_active !== undefined ? is_active : existing.is_active,
        company_id: company_id !== undefined ? (company_id || null) : existing.company_id,
        updated_at: new Date(),
      })
      .where(eq(facilities.id, param(req, "id")))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "FACILITY",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ facility: updated });
  })
);

router.delete(
  "/facilities/:id",
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(facilities).where(eq(facilities.id, param(req, "id"))).limit(1)
    )[0];
    if (!existing) throw notFound("Facility not found");
    await db.delete(facilities).where(eq(facilities.id, param(req, "id")));
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "DELETE",
      entityType: "FACILITY",
      entityId: param(req, "id"),
      oldValues: existing,
    });
    return res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Facility admins
// ---------------------------------------------------------------------------

router.get(
  "/facility-admins",
  asyncHandler(async (req, res) => {
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
    const where = eq(users.role, "FACILITY_ADMIN");
    const rows = await db
      .select()
      .from(users)
      .where(where)
      .orderBy(desc(users.created_at))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db.select({ value: count() }).from(users).where(where);
    return res.json({ facilityAdmins: rows, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

router.post(
  "/facility-admins",
  asyncHandler(async (req, res) => {
    const { name, email, phone, password, facilityId } = req.body ?? {};
    if (!name || !email || !password || !facilityId) {
      throw badRequest("name, email, password and facilityId are required");
    }
    const facility = (
      await db.select().from(facilities).where(eq(facilities.id, facilityId)).limit(1)
    )[0];
    if (!facility) throw badRequest("Facility not found");

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({
        name,
        email: email.toLowerCase(),
        phone: phone ?? null,
        password_hash: passwordHash,
        role: "FACILITY_ADMIN",
        facility_id: facilityId,
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "FACILITY_ADMIN",
      entityId: user.id,
      newValues: { id: user.id, name: user.name, email: user.email },
    });
    return res.status(201).json({ facilityAdmin: user });
  })
);

router.put(
  "/facility-admins/:id",
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(users).where(eq(users.id, param(req, "id"))).limit(1)
    )[0];
    if (!existing) throw notFound("Facility admin not found");
    if (existing.role !== "FACILITY_ADMIN") throw badRequest("User is not a facility admin");

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
