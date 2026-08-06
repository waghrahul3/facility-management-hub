import { Router } from "express";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { facilities, suppliers, users } from "../../db/schema.js";
import { hashPassword } from "../../auth/password.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
import { param } from "../../lib/params.js";

const router = Router();

// ---------------------------------------------------------------------------
// Suppliers (global registry)
// ---------------------------------------------------------------------------

router.get(
  "/suppliers",
  asyncHandler(async (req, res) => {
    const { limit, offset, page, pageSize } = parsePage(req.query as Record<string, unknown>);
    const rows = await db
      .select({
        supplier: suppliers,
        facility: { id: facilities.id, name: facilities.name },
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(suppliers)
      .leftJoin(facilities, eq(facilities.id, suppliers.facility_id))
      .leftJoin(
        users,
        and(eq(users.supplier_id, suppliers.id), eq(users.role, "SUPPLIER"))
      )
      .orderBy(
        // PENDING (awaiting activation) first, then newest first
        sql`CASE WHEN ${suppliers.status} = 'PENDING' THEN 0 ELSE 1 END`,
        desc(suppliers.created_at)
      )
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db.select({ value: count() }).from(suppliers);
    return res.json({ suppliers: rows, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

router.post(
  "/suppliers",
  asyncHandler(async (req, res) => {
    const { name, email, phone, contact_person, address, city, create_login, password } =
      req.body ?? {};
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
        // Globally registered suppliers are immediately ACTIVE
        status: "ACTIVE",
      })
      .returning();

    let user = null;
    if (create_login) {
      if (!email || !password) {
        throw badRequest("email and password are required to create a supplier login");
      }
      // Login emails are unique — fail cleanly instead of a 500
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
      if (existingUser) {
        throw badRequest("A user with this email already exists");
      }
      [user] = await db
        .insert(users)
        .values({
          name,
          email: email.toLowerCase(),
          phone: phone ?? null,
          password_hash: await hashPassword(password),
          role: "SUPPLIER",
          supplier_id: supplier.id,
        })
        .returning();
    }

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "SUPPLIER",
      entityId: supplier.id,
      newValues: supplier,
    });
    return res.status(201).json({ supplier, user });
  })
);

// Generate a supplier login — the ONLY way a facility-registered (PENDING)
// supplier becomes ACTIVE and globally selectable. Super Admin only.
router.post(
  "/suppliers/:id/generate-login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      throw badRequest("email and password are required to generate a supplier login");
    }

    const supplier = (
      await db.select().from(suppliers).where(eq(suppliers.id, param(req, "id"))).limit(1)
    )[0];
    if (!supplier) throw notFound("Supplier not found");

    // One login per supplier
    const existingLogin = (
      await db
        .select()
        .from(users)
        .where(and(eq(users.role, "SUPPLIER"), eq(users.supplier_id, supplier.id)))
        .limit(1)
    )[0];
    if (existingLogin) throw badRequest("This supplier already has a login account");

    // Login emails are unique — fail cleanly instead of a 500
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (existingUser) throw badRequest("A user with this email already exists");

    const [user] = await db
      .insert(users)
      .values({
        name: supplier.name,
        email: email.toLowerCase(),
        phone: supplier.phone ?? null,
        password_hash: await hashPassword(password),
        role: "SUPPLIER",
        supplier_id: supplier.id,
      })
      .returning();

    const [updated] = await db
      .update(suppliers)
      .set({
        status: "ACTIVE",
        login_generated_at: new Date(),
        login_generated_by: req.auth?.userId,
        updated_at: new Date(),
      })
      .where(eq(suppliers.id, supplier.id))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "SUPPLIER_LOGIN",
      entityId: user.id,
      newValues: { supplierId: supplier.id, email: user.email },
    });
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "SUPPLIER",
      entityId: updated.id,
      oldValues: { status: supplier.status },
      newValues: { status: updated.status, login_generated_at: updated.login_generated_at },
    });
    return res.status(201).json({ supplier: updated, user });
  })
);

export default router;
