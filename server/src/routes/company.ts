import { Router } from "express";
import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  companies,
  facilities,
  supplierDrops,
  supplierPayments,
  suppliers,
  tolis,
  users,
  weeklyWorkSummaries,
} from "../db/schema.js";
import {
  requireAuth,
  requireCompanyAccess,
  requireRole,
} from "../auth/middleware.js";
import { hashPassword } from "../auth/password.js";
import { audit } from "../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../lib/errors.js";
import { param } from "../lib/params.js";
import { currentWeek } from "../services/payments.js";

const router = Router();
router.use(requireAuth, requireRole("SUPER_ADMIN", "COMPANY_ADMIN"));

// ---------------------------------------------------------------------------
// Company overview dashboard (all facilities under the company)
// ---------------------------------------------------------------------------

router.get(
  "/:companyId/dashboard",
  requireCompanyAccess,
  asyncHandler(async (req, res) => {
    const company = (
      await db.select().from(companies).where(eq(companies.id, param(req, "companyId"))).limit(1)
    )[0];
    if (!company) throw notFound("Company not found");

    const facilityRows = await db
      .select()
      .from(facilities)
      .where(eq(facilities.company_id, param(req, "companyId")))
      .orderBy(facilities.name);
    const facilityIds = facilityRows.map((f) => f.id);

    const { weekStart, weekEnd } = currentWeek();
    const inScope =
      facilityIds.length > 0 ? inArray(supplierDrops.facility_id, facilityIds) : undefined;

    const [dropCountRow] = inScope
      ? await db
          .select({ value: count() })
          .from(supplierDrops)
          .where(and(inScope, gte(supplierDrops.drop_date, weekStart), lte(supplierDrops.drop_date, weekEnd)))
      : [{ value: 0 }];

    const [toliCountRow] = facilityIds.length > 0
      ? await db
          .select({ value: count() })
          .from(tolis)
          .where(inArray(tolis.facility_id, facilityIds))
      : [{ value: 0 }];

    const [pendingSummaryRow] = facilityIds.length > 0
      ? await db
          .select({ value: count() })
          .from(weeklyWorkSummaries)
          .where(
            and(
              inArray(weeklyWorkSummaries.facility_id, facilityIds),
              eq(weeklyWorkSummaries.approval_status, "PENDING")
            )
          )
      : [{ value: 0 }];

    const weekRentRows = inScope
      ? await db
          .select({ sum: supplierDrops.rent_per_drop })
          .from(supplierDrops)
          .where(and(inScope, gte(supplierDrops.drop_date, weekStart), lte(supplierDrops.drop_date, weekEnd)))
      : [];

    const pendingPayments = facilityIds.length > 0
      ? await db
          .select({
            payment: {
              id: supplierPayments.id,
              facility_id: supplierPayments.facility_id,
              week_start_date: supplierPayments.week_start_date,
              net_payment: supplierPayments.net_payment,
              collection_status: supplierPayments.collection_status,
            },
            supplier: { id: suppliers.id, name: suppliers.name },
            facility: { id: facilities.id, name: facilities.name },
          })
          .from(supplierPayments)
          .innerJoin(suppliers, eq(suppliers.id, supplierPayments.supplier_id))
          .innerJoin(facilities, eq(facilities.id, supplierPayments.facility_id))
          .where(
            and(
              inArray(supplierPayments.facility_id, facilityIds),
              eq(supplierPayments.collection_status, "PENDING")
            )
          )
          .orderBy(desc(supplierPayments.net_payment))
          .limit(10)
      : [];

    const facilityStats = await Promise.all(
      facilityRows.map(async (f) => {
        const [dc] = await db
          .select({ value: count() })
          .from(supplierDrops)
          .where(
            and(
              eq(supplierDrops.facility_id, f.id),
              gte(supplierDrops.drop_date, weekStart),
              lte(supplierDrops.drop_date, weekEnd)
            )
          );
        const [tc] = await db
          .select({ value: count() })
          .from(tolis)
          .where(eq(tolis.facility_id, f.id));
        const [pc] = await db
          .select({ value: count() })
          .from(supplierPayments)
          .where(
            and(
              eq(supplierPayments.facility_id, f.id),
              eq(supplierPayments.collection_status, "PENDING")
            )
          );
        return {
          facility: f,
          weekDropCount: dc?.value ?? 0,
          toliCount: tc?.value ?? 0,
          pendingPaymentCount: pc?.value ?? 0,
        };
      })
    );

    return res.json({
      company,
      weekStart,
      weekEnd,
      facilityStats,
      totals: {
        facilityCount: facilityRows.length,
        weekDropCount: dropCountRow?.value ?? 0,
        toliCount: toliCountRow?.value ?? 0,
        pendingSummaryCount: pendingSummaryRow?.value ?? 0,
        weekRentTotal: weekRentRows.reduce((s, r) => s + r.sum, 0),
        pendingPaymentCount: pendingPayments.length,
      },
      pendingPayments,
    });
  })
);

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
    const company = (
      await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
    )[0];
    if (!company) throw notFound("Company not found");

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

// Facility admins across all facilities of the company

router.get(
  "/:companyId/facility-admins",
  requireCompanyAccess,
  asyncHandler(async (req, res) => {
    const companyId = param(req, "companyId");
    const facilityIds = (
      await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.company_id, companyId))
    ).map((f) => f.id);
    const rows =
      facilityIds.length > 0
        ? await db
            .select()
            .from(users)
            .where(and(eq(users.role, "FACILITY_ADMIN"), inArray(users.facility_id, facilityIds)))
            .orderBy(desc(users.created_at))
        : [];
    return res.json({ facilityAdmins: rows });
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

export default router;
