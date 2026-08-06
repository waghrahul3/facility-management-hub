import { Router } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { orderPayments, salesOrders } from "../../db/schema.js";
import { asyncHandler } from "../../lib/errors.js";
import { myCompanyId } from "./_shared.js";

const router = Router();

// GET /sales/summary — dashboard summary (company / facility)
router.get(
  "/summary",
  asyncHandler(async (req: any, res) => {
    const cid = myCompanyId(req);
    const isFacility = req.auth.role === "FACILITY_ADMIN";
    const facilityId = isFacility ? req.auth.facilityId : (req.query.facilityId as string) || null;

    const where = and(
      cid ? eq(salesOrders.company_id, cid) : undefined,
      facilityId ? eq(salesOrders.facility_id, facilityId) : undefined
    );

    const [pendingRow] = await db
      .select({ n: sql<number>`count(*)` })
      .from(salesOrders)
      .where(and(where, eq(salesOrders.status, "PENDING")));
    const [partialRow] = await db
      .select({ n: sql<number>`count(*)` })
      .from(salesOrders)
      .where(and(where, eq(salesOrders.status, "PARTIALLY_DISPATCHED")));
    const [completedRow] = await db
      .select({ n: sql<number>`count(*)` })
      .from(salesOrders)
      .where(and(where, eq(salesOrders.status, "COMPLETED")));

    const orderIds = (
      await db
        .select({ id: salesOrders.id })
        .from(salesOrders)
        .where(where)
    ).map((r) => r.id);

    let totalOrderValue = 0;
    let totalPaid = 0;
    if (orderIds.length > 0) {
      const [valRow] = await db
        .select({ v: sql<number>`coalesce(sum(${salesOrders.total_amount}), 0)` })
        .from(salesOrders)
        .where(inArray(salesOrders.id, orderIds));
      totalOrderValue = valRow?.v ?? 0;
      const [paidRow] = await db
        .select({ v: sql<number>`coalesce(sum(${orderPayments.amount}), 0)` })
        .from(orderPayments)
        .where(inArray(orderPayments.order_id, orderIds));
      totalPaid = paidRow?.v ?? 0;
    }

    return res.json({
      pending: pendingRow?.n ?? 0,
      partiallyDispatched: partialRow?.n ?? 0,
      completed: completedRow?.n ?? 0,
      totalOrderValue,
      totalPaid,
      totalBalance: totalOrderValue - totalPaid,
    });
  })
);

export default router;
