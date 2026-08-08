import { Router } from "express";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/index.js";
import { buyers, companies } from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../../lib/errors.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
import { reqLogger } from "../../lib/logger.js";
import { param } from "../../lib/params.js";
import { myCompanyId, resolveCompanyId } from "./_shared.js";

const router = Router();

router.get(
  "/buyers",
  asyncHandler(async (req: any, res) => {
    const cid = myCompanyId(req);
    const { limit, offset, page, pageSize } = parsePage(req.query);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
    const where = and(
      cid ? eq(buyers.company_id, cid) : undefined,
      q
        ? or(ilike(buyers.name, `%${q}%`), ilike(buyers.phone, `%${q}%`), ilike(buyers.city, `%${q}%`))
        : undefined,
      status === "ACTIVE"
        ? eq(buyers.is_active, true)
        : status === "INACTIVE"
          ? eq(buyers.is_active, false)
          : undefined
    );
    const rows = await db
      .select({
        buyer: buyers,
        company: { id: companies.id, name: companies.name },
      })
      .from(buyers)
      .leftJoin(companies, eq(companies.id, buyers.company_id))
      .where(where)
      .orderBy(desc(buyers.created_at))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db.select({ value: count() }).from(buyers).where(where);
    return res.json({ buyers: rows, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

router.post(
  "/buyers",
  asyncHandler(async (req: any, res) => {
    const log = reqLogger({ method: "POST", path: "/sales/buyers" });
    const companyId = await resolveCompanyId(req);
    const { name, phone, address, city } = req.body ?? {};
    if (!name) throw badRequest("name is required");

    const [buyer] = await db
      .insert(buyers)
      .values({
        company_id: companyId,
        name,
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
      entityType: "BUYER",
      entityId: buyer.id,
      newValues: buyer,
    });
    log.info("Buyer created", { buyerId: buyer.id, companyId });
    return res.status(201).json({ buyer });
  })
);

router.put(
  "/buyers/:buyerId",
  asyncHandler(async (req: any, res) => {
    const buyerId = param(req, "buyerId");
    const existing = (
      await db.select().from(buyers).where(eq(buyers.id, buyerId)).limit(1)
    )[0];
    if (!existing) throw notFound("Buyer not found");
    const cid = myCompanyId(req);
    if (cid && existing.company_id !== cid) throw forbidden("Access to this buyer is not allowed");

    const { name, phone, address, city, is_active } = req.body ?? {};
    const [updated] = await db
      .update(buyers)
      .set({
        name: name ?? existing.name,
        phone: phone !== undefined ? phone : existing.phone,
        address: address !== undefined ? address : existing.address,
        city: city !== undefined ? city : existing.city,
        is_active: is_active !== undefined ? is_active : existing.is_active,
        updated_at: new Date(),
      })
      .where(eq(buyers.id, buyerId))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "BUYER",
      entityId: buyerId,
      oldValues: existing,
      newValues: updated,
    });
    return res.json({ buyer: updated });
  })
);

router.delete(
  "/buyers/:buyerId",
  asyncHandler(async (req: any, res) => {
    const buyerId = param(req, "buyerId");
    const existing = (
      await db.select().from(buyers).where(eq(buyers.id, buyerId)).limit(1)
    )[0];
    if (!existing) throw notFound("Buyer not found");
    const cid = myCompanyId(req);
    if (cid && existing.company_id !== cid) throw forbidden("Access to this buyer is not allowed");

    await db.delete(buyers).where(eq(buyers.id, buyerId));
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "DELETE",
      entityType: "BUYER",
      entityId: buyerId,
      oldValues: existing,
    });
    return res.json({ ok: true });
  })
);

export default router;
