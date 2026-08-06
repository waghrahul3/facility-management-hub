import { Router } from "express";
import { count, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { companies, facilities, users } from "../../db/schema.js";
import { hashPassword } from "../../auth/password.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, notFound } from "../../lib/errors.js";
import { reqLogger } from "../../lib/logger.js";
import { param } from "../../lib/params.js";

const router = Router();

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
    const log = reqLogger({ method: "POST", path: "/super-admin/companies" });
    log.info("Creating company", { name: req.body?.name });
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

// ---------------------------------------------------------------------------
// Company admins (manage one company's facilities)
// ---------------------------------------------------------------------------

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

export default router;
