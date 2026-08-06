import { Router } from "express";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { facilities, users } from "../../db/schema.js";
import { requireCompanyAccess } from "../../auth/middleware.js";
import { hashPassword } from "../../auth/password.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest } from "../../lib/errors.js";
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
    const facilityIds = (
      await db.select({ id: facilities.id }).from(facilities).where(eq(facilities.company_id, companyId))
    ).map((f) => f.id);
    const where =
      facilityIds.length > 0
        ? and(eq(users.role, "FACILITY_ADMIN"), inArray(users.facility_id, facilityIds))
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

export default router;
