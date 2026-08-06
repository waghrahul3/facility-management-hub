import { Router } from "express";
import { eq, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { bagSizes, facilities, suppliers } from "../../db/schema.js";
import { requireFacilityAccess, requireRole } from "../../auth/middleware.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest } from "../../lib/errors.js";
import { param } from "../../lib/params.js";

const router = Router();

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

export default router;
