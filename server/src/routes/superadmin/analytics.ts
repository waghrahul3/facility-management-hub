import { Router } from "express";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { auditLogs, companies, facilities, suppliers, supplierPayments, users } from "../../db/schema.js";
import type { AuditAction } from "../../lib/audit.js";
import { asyncHandler } from "../../lib/errors.js";

const router = Router();

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
