import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { companies, facilities, users } from "../../db/schema.js";
import { requireCompanyAccess } from "../../auth/middleware.js";
import { hashPassword } from "../../auth/password.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { param } from "../../lib/params.js";

const router = Router();

// ---------------------------------------------------------------------------
// Facilities under a company (read-only overview)
// ---------------------------------------------------------------------------

router.get(
  "/:companyId/facilities",
  requireCompanyAccess,
  asyncHandler(async (req, res) => {
    const company = (
      await db.select().from(companies).where(eq(companies.id, param(req, "companyId"))).limit(1)
    )[0];
    if (!company) throw notFound("Company not found");

    const rows = await db
      .select({
        facility: facilities,
        admin: { id: users.id, name: users.name, email: users.email },
      })
      .from(facilities)
      .leftJoin(users, eq(users.facility_id, facilities.id))
      .where(eq(facilities.company_id, param(req, "companyId")))
      .orderBy(facilities.name);
    return res.json({ company, facilities: rows });
  })
);

// ---------------------------------------------------------------------------
// Company onboarding: register facilities + facility admins
// ---------------------------------------------------------------------------

// Onboard a facility under the company. Optionally creates the facility admin
// (name/email/password) in the same request.
router.post(
  "/:companyId/facilities",
  requireCompanyAccess,
  asyncHandler(async (req, res) => {
    const companyId = param(req, "companyId");
    const { name, location, city, capacity, admin } = req.body ?? {};
    if (!name || !location) throw badRequest("name and location are required");

    const [facility] = await db
      .insert(facilities)
      .values({
        name,
        location,
        city: city ?? null,
        capacity: capacity ?? 0,
        company_id: companyId,
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

    let facilityAdmin = null;
    if (admin && (admin.name || admin.email || admin.password || admin.phone)) {
      if (!admin.name || !admin.email || !admin.password) {
        throw badRequest("admin name, email and password are required");
      }
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, admin.email.toLowerCase()))
        .limit(1);
      if (existingUser) throw badRequest("A user with this email already exists");
      [facilityAdmin] = await db
        .insert(users)
        .values({
          name: admin.name,
          email: admin.email.toLowerCase(),
          phone: admin.phone ?? null,
          password_hash: await hashPassword(admin.password),
          role: "FACILITY_ADMIN",
          facility_id: facility.id,
          company_id: companyId,
        })
        .returning();
      await audit({
        req,
        userId: req.auth?.userId,
        role: req.auth?.role,
        action: "CREATE",
        entityType: "FACILITY_ADMIN",
        entityId: facilityAdmin.id,
        newValues: { id: facilityAdmin.id, name: facilityAdmin.name, email: facilityAdmin.email },
      });
    }

    return res.status(201).json({ facility, facilityAdmin });
  })
);

router.put(
  "/:companyId/facilities/:facilityId",
  requireCompanyAccess,
  asyncHandler(async (req, res) => {
    const companyId = param(req, "companyId");
    const existing = (
      await db.select().from(facilities).where(eq(facilities.id, param(req, "facilityId"))).limit(1)
    )[0];
    if (!existing) throw notFound("Facility not found");
    if (existing.company_id !== companyId && req.auth?.role !== "SUPER_ADMIN") {
      throw badRequest("Facility does not belong to this company");
    }

    const { name, location, city, capacity, is_active } = req.body ?? {};
    const [updated] = await db
      .update(facilities)
      .set({
        name: name ?? existing.name,
        location: location ?? existing.location,
        city: city !== undefined ? city : existing.city,
        capacity: capacity !== undefined ? capacity : existing.capacity,
        is_active: is_active !== undefined ? is_active : existing.is_active,
        updated_at: new Date(),
      })
      .where(eq(facilities.id, param(req, "facilityId")))
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
  "/:companyId/facilities/:facilityId",
  requireCompanyAccess,
  asyncHandler(async (req, res) => {
    const companyId = param(req, "companyId");
    const existing = (
      await db.select().from(facilities).where(eq(facilities.id, param(req, "facilityId"))).limit(1)
    )[0];
    if (!existing) throw notFound("Facility not found");
    if (existing.company_id !== companyId && req.auth?.role !== "SUPER_ADMIN") {
      throw badRequest("Facility does not belong to this company");
    }
    await db.delete(facilities).where(eq(facilities.id, param(req, "facilityId")));
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "DELETE",
      entityType: "FACILITY",
      entityId: param(req, "facilityId"),
      oldValues: existing,
    });
    return res.json({ ok: true });
  })
);

export default router;
