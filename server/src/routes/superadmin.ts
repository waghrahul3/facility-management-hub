import { Router } from "express";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  auditLogs,
  bagSizes,
  companies,
  facilities,
  rates,
  supplierPayments,
  suppliers,
  users,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { hashPassword } from "../auth/password.js";
import { audit, type AuditAction } from "../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../lib/errors.js";
import { param } from "../lib/params.js";

const router = Router();
router.use(requireAuth, requireRole("SUPER_ADMIN"));

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Companies (trading companies owning one or more facilities)
// ---------------------------------------------------------------------------

router.get(
  "/companies",
  asyncHandler(async (_req, res) => {
    const companyRows = await db.select().from(companies).orderBy(desc(companies.created_at));

    const [adminRows, facilityCountRows] = await Promise.all([
      db
        .select({
          companyId: users.company_id,
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .where(eq(users.role, "COMPANY_ADMIN")),
      db
        .select({ companyId: facilities.company_id, value: count() })
        .from(facilities)
        .groupBy(facilities.company_id),
    ]);

    // First admin per company (more may be created via the admins page)
    const adminByCompany = new Map<string, { id: string; name: string; email: string }>();
    for (const a of adminRows) {
      if (a.companyId && !adminByCompany.has(a.companyId)) {
        adminByCompany.set(a.companyId, { id: a.id, name: a.name, email: a.email });
      }
    }
    const facilityCountByCompany = new Map<string, number>();
    for (const f of facilityCountRows) {
      if (f.companyId) facilityCountByCompany.set(f.companyId, f.value);
    }

    const companiesList = companyRows.map((company) => ({
      company,
      facilityCount: facilityCountByCompany.get(company.id) ?? 0,
      adminName: adminByCompany.get(company.id)?.name ?? null,
      adminEmail: adminByCompany.get(company.id)?.email ?? null,
    }));

    return res.json({ companies: companiesList });
  })
);

router.post(
  "/companies",
  asyncHandler(async (req, res) => {
    const { name, contact_person, email, phone, address, city, admin } = req.body ?? {};
    if (!name) throw badRequest("name is required");

    // A company is registered together with its company admin. Validate the
    // admin login email BEFORE creating the company so a duplicate email does
    // not leave an orphaned company behind.
    let adminPayload: { name: string; email: string; password: string; phone: string | null } | null = null;
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
      adminPayload = {
        name: admin.name,
        email: admin.email.toLowerCase(),
        password: admin.password,
        phone: admin.phone ?? null,
      };
    }

    const [company] = await db
      .insert(companies)
      .values({
        name,
        contact_person: contact_person ?? null,
        email: email ?? null,
        phone: phone ?? null,
        address: address ?? null,
        city: city ?? null,
      })
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "COMPANY",
      entityId: company.id,
      newValues: company,
    });

    let companyAdmin = null;
    if (adminPayload) {
      [companyAdmin] = await db
        .insert(users)
        .values({
          name: adminPayload.name,
          email: adminPayload.email,
          phone: adminPayload.phone,
          password_hash: await hashPassword(adminPayload.password),
          role: "COMPANY_ADMIN",
          company_id: company.id,
        })
        .returning();
      await audit({
        req,
        userId: req.auth?.userId,
        role: req.auth?.role,
        action: "CREATE",
        entityType: "COMPANY_ADMIN",
        entityId: companyAdmin.id,
        newValues: { id: companyAdmin.id, name: companyAdmin.name, email: companyAdmin.email },
      });
    }

    return res.status(201).json({ company, companyAdmin });
  })
);

router.put(
  "/companies/:id",
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(companies).where(eq(companies.id, param(req, "id"))).limit(1)
    )[0];
    if (!existing) throw notFound("Company not found");
    const { name, contact_person, email, phone, address, city, is_active } = req.body ?? {};
    const [updated] = await db
      .update(companies)
      .set({
        name: name ?? existing.name,
        contact_person: contact_person !== undefined ? contact_person : existing.contact_person,
        email: email !== undefined ? email : existing.email,
        phone: phone !== undefined ? phone : existing.phone,
        address: address !== undefined ? address : existing.address,
        city: city !== undefined ? city : existing.city,
        is_active: is_active !== undefined ? is_active : existing.is_active,
        updated_at: new Date(),
      })
      .where(eq(companies.id, param(req, "id")))
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "COMPANY",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ company: updated });
  })
);

router.delete(
  "/companies/:id",
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(companies).where(eq(companies.id, param(req, "id"))).limit(1)
    )[0];
    if (!existing) throw notFound("Company not found");
    await db.delete(companies).where(eq(companies.id, param(req, "id")));
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "DELETE",
      entityType: "COMPANY",
      entityId: param(req, "id"),
      oldValues: existing,
    });
    return res.json({ ok: true });
  })
);

// Company admins (manage one company's facilities)

router.get(
  "/company-admins",
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.role, "COMPANY_ADMIN"))
      .orderBy(desc(users.created_at));
    return res.json({ companyAdmins: rows });
  })
);

router.post(
  "/company-admins",
  asyncHandler(async (req, res) => {
    const { name, email, phone, password, companyId } = req.body ?? {};
    if (!name || !email || !password || !companyId) {
      throw badRequest("name, email, password and companyId are required");
    }
    const company = (
      await db.select().from(companies).where(eq(companies.id, companyId)).limit(1)
    )[0];
    if (!company) throw badRequest("Company not found");
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (existingUser) throw badRequest("A user with this email already exists");

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({
        name,
        email: email.toLowerCase(),
        phone: phone ?? null,
        password_hash: passwordHash,
        role: "COMPANY_ADMIN",
        company_id: companyId,
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "COMPANY_ADMIN",
      entityId: user.id,
      newValues: { id: user.id, name: user.name, email: user.email },
    });
    return res.status(201).json({ companyAdmin: user });
  })
);

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------

router.get(
  "/facilities",
  asyncHandler(async (_req, res) => {
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
      .orderBy(desc(facilities.created_at));
    return res.json({ facilities: rows });
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
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.role, "FACILITY_ADMIN"))
      .orderBy(desc(users.created_at));
    return res.json({ facilityAdmins: rows });
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

// ---------------------------------------------------------------------------
// Bag sizes (global)
// ---------------------------------------------------------------------------

router.get(
  "/bag-sizes",
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select()
      .from(bagSizes)
      .orderBy(desc(bagSizes.created_at));
    return res.json({ bagSizes: rows });
  })
);

router.post(
  "/bag-sizes",
  asyncHandler(async (req, res) => {
    const { size_name, weight_kg } = req.body ?? {};
    if (!size_name || weight_kg == null) {
      throw badRequest("size_name and weight_kg are required");
    }
    const [row] = await db
      .insert(bagSizes)
      .values({
        size_name,
        weight_kg,
        is_global: true,
        created_by: req.auth?.userId,
      })
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "BAG_SIZE",
      entityId: row.id,
      newValues: row,
    });
    return res.status(201).json({ bagSize: row });
  })
);

router.put(
  "/bag-sizes/:id",
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(bagSizes).where(eq(bagSizes.id, param(req, "id"))).limit(1)
    )[0];
    if (!existing) throw notFound("Bag size not found");
    const { size_name, weight_kg } = req.body ?? {};
    const [updated] = await db
      .update(bagSizes)
      .set({
        size_name: size_name ?? existing.size_name,
        weight_kg: weight_kg != null ? weight_kg : existing.weight_kg,
        updated_at: new Date(),
      })
      .where(eq(bagSizes.id, param(req, "id")))
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "BAG_SIZE",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ bagSize: updated });
  })
);

// ---------------------------------------------------------------------------
// Global rates
// ---------------------------------------------------------------------------

router.get(
  "/rates",
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select()
      .from(rates)
      .where(isNull(rates.facility_id))
      .orderBy(desc(rates.created_at));
    return res.json({ rates: rows });
  })
);

router.post(
  "/rates",
  asyncHandler(async (req, res) => {
    const { bag_size_id, rate_amount } = req.body ?? {};
    if (!bag_size_id || rate_amount == null) {
      throw badRequest("bag_size_id and rate_amount are required");
    }
    // Upsert global rate per bag size
    const [row] = await db
      .insert(rates)
      .values({
        bag_size_id,
        facility_id: null,
        rate_amount,
        is_global: true,
        created_by: req.auth?.userId,
      })
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "RATE",
      entityId: row.id,
      newValues: row,
    });
    return res.status(201).json({ rate: row });
  })
);

router.put(
  "/rates/:id",
  asyncHandler(async (req, res) => {
    const existing = (
      await db.select().from(rates).where(eq(rates.id, param(req, "id"))).limit(1)
    )[0];
    if (!existing) throw notFound("Rate not found");
    const { rate_amount } = req.body ?? {};
    if (rate_amount == null) throw badRequest("rate_amount is required");
    const [updated] = await db
      .update(rates)
      .set({ rate_amount, updated_at: new Date() })
      .where(eq(rates.id, param(req, "id")))
      .returning();
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "RATE",
      entityId: updated.id,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ rate: updated });
  })
);

// ---------------------------------------------------------------------------
// Suppliers (global registry)
// ---------------------------------------------------------------------------

router.get(
  "/suppliers",
  asyncHandler(async (_req, res) => {
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
      );
    return res.json({ suppliers: rows });
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

// ---------------------------------------------------------------------------
// Audit log (read-only)
// ---------------------------------------------------------------------------

router.get(
  "/audit-logs",
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, unknown>;
    const limit = Math.min(Number(q.limit ?? 100), 500);
    const offset = Number(q.offset ?? 0);

    const conditions = [];
    if (q.action) conditions.push(eq(auditLogs.action, String(q.action) as AuditAction));
    if (q.entityType) conditions.push(eq(auditLogs.entity_type, String(q.entityType)));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        log: auditLogs,
        user: { id: users.id, name: users.name },
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.user_id))
      .where(where)
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit)
      .offset(offset);

    const [total] = await db
      .select({ value: count() })
      .from(auditLogs)
      .where(where);

    return res.json({ logs: rows, total: total?.value ?? 0, limit, offset });
  })
);

// ---------------------------------------------------------------------------
// Reports & dashboard
// ---------------------------------------------------------------------------

router.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    const [facilityCount] = await db
      .select({ value: count() })
      .from(facilities);
    const [supplierCount] = await db.select({ value: count() }).from(suppliers);
    const [companyCount] = await db.select({ value: count() }).from(companies);
    const [adminCount] = await db
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, "FACILITY_ADMIN"));

    const facilityList = await db
      .select()
      .from(facilities)
      .orderBy(desc(facilities.created_at))
      .limit(10);

    return res.json({
      facilityCount: facilityCount?.value ?? 0,
      supplierCount: supplierCount?.value ?? 0,
      companyCount: companyCount?.value ?? 0,
      adminCount: adminCount?.value ?? 0,
      facilities: facilityList,
    });
  })
);

router.get(
  "/reports/payments",
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        payment: supplierPayments,
        supplier: { id: suppliers.id, name: suppliers.name },
        facility: { id: facilities.id, name: facilities.name },
      })
      .from(supplierPayments)
      .leftJoin(suppliers, eq(suppliers.id, supplierPayments.supplier_id))
      .leftJoin(facilities, eq(facilities.id, supplierPayments.facility_id))
      .orderBy(desc(supplierPayments.created_at))
      .limit(100);
    return res.json({ payments: rows });
  })
);

router.get(
  "/reports/suppliers",
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select()
      .from(suppliers)
      .orderBy(desc(suppliers.created_at));
    return res.json({ suppliers: rows });
  })
);

export default router;
