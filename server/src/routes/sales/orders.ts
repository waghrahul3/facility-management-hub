import { Router } from "express";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  bagSizes,
  buyers,
  companies,
  facilities,
  salesOrderItems,
  salesOrders,
} from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../../lib/errors.js";
import { pageMeta, parsePage } from "../../lib/pagination.js";
import { reqLogger } from "../../lib/logger.js";
import { param } from "../../lib/params.js";
import { myCompanyId, resolveCompanyId } from "./_shared.js";
import { loadOrderDetail } from "./orderHelpers.js";

const router = Router();

// GET /sales/orders — list orders for the caller's scope
router.get(
  "/orders",
  asyncHandler(async (req: any, res) => {
    const cid = myCompanyId(req);
    const role = req.auth.role;
    // Facility admins see only orders assigned to their facility
    const facilityId =
      role === "FACILITY_ADMIN" ? req.auth.facilityId : (req.query.facilityId as string) || null;
    const { limit, offset, page, pageSize } = parsePage(req.query);
    const where = and(
      cid ? eq(salesOrders.company_id, cid) : undefined,
      facilityId ? eq(salesOrders.facility_id, facilityId) : undefined
    );

    const rows = await db
      .select({
        order: salesOrders,
        company: { id: companies.id, name: companies.name },
        facility: { id: facilities.id, name: facilities.name },
        buyer: { id: buyers.id, name: buyers.name, phone: buyers.phone, city: buyers.city },
        itemCount: sql<number>`(
          select count(*) from ${salesOrderItems} where ${salesOrderItems.order_id} = ${salesOrders.id}
        )`,
      })
      .from(salesOrders)
      .innerJoin(companies, eq(companies.id, salesOrders.company_id))
      .innerJoin(facilities, eq(facilities.id, salesOrders.facility_id))
      .innerJoin(buyers, eq(buyers.id, salesOrders.buyer_id))
      .where(where)
      .orderBy(desc(salesOrders.created_at))
      .limit(limit)
      .offset(offset);
    const [totalRow] = await db.select({ value: count() }).from(salesOrders).where(where);
    return res.json({ orders: rows, ...pageMeta(totalRow?.value ?? 0, { page, pageSize, limit, offset }) });
  })
);

// GET /sales/orders/:orderId — full detail
router.get(
  "/orders/:orderId",
  asyncHandler(async (req: any, res) => {
    const orderId = param(req, "orderId");
    const detail = await loadOrderDetail(orderId);
    if (!detail) throw notFound("Order not found");
    const cid = myCompanyId(req);
    if (cid && detail.order.company_id !== cid) throw forbidden("Access to this order is not allowed");
    if (req.auth.role === "FACILITY_ADMIN" && detail.order.facility_id !== req.auth.facilityId) {
      throw forbidden("Access to this order is not allowed");
    }
    return res.json({ order: detail });
  })
);

// POST /sales/orders — company admin records the buyer's order
router.post(
  "/orders",
  asyncHandler(async (req: any, res) => {
    const log = reqLogger({ method: "POST", path: "/sales/orders" });
    if (req.auth.role === "FACILITY_ADMIN") {
      throw forbidden("Only company admins can create orders");
    }
    const companyId = await resolveCompanyId(req);
    const { facility_id, buyer_id, order_date, notes, items } = req.body ?? {};
    if (!facility_id || !buyer_id || !order_date || !Array.isArray(items) || items.length === 0) {
      throw badRequest("facility_id, buyer_id, order_date and items[] are required");
    }

    // Buyer must belong to the same company
    const [buyer] = await db.select().from(buyers).where(eq(buyers.id, buyer_id)).limit(1);
    if (!buyer) throw notFound("Buyer not found");
    if (buyer.company_id !== companyId) throw badRequest("Buyer does not belong to this company");

    const [facility] = await db
      .select()
      .from(facilities)
      .where(eq(facilities.id, facility_id))
      .limit(1);
    if (!facility) throw notFound("Facility not found");

    // Build line items with bag size validation + amounts
    let total = 0;
    const validated: Array<{
      onion_category: string | null;
      bag_size_id: string;
      quantity_bags: number;
      rate_per_bag: number;
      total_amount: number;
    }> = [];
    for (const it of items) {
      const { onion_category, bag_size_id, quantity_bags, rate_per_bag } = it ?? {};
      if (!bag_size_id || !quantity_bags || !rate_per_bag) {
        throw badRequest("Each item needs bag_size_id, quantity_bags and rate_per_bag");
      }
      const [bs] = await db.select().from(bagSizes).where(eq(bagSizes.id, bag_size_id)).limit(1);
      if (!bs) throw badRequest("Invalid bag size");
      const qty = Number(quantity_bags);
      const rate = Number(rate_per_bag);
      if (qty <= 0 || rate < 0) throw badRequest("Quantity must be > 0 and rate >= 0");
      const lineTotal = qty * rate;
      total += lineTotal;
      validated.push({
        onion_category: onion_category || null,
        bag_size_id,
        quantity_bags: qty,
        rate_per_bag: rate,
        total_amount: lineTotal,
      });
    }

    // Human-friendly order number
    const datePart = new Date(order_date).toISOString().slice(0, 10).replace(/-/g, "");
    const seq = await db
      .select({ n: sql<number>`count(*) + 1` })
      .from(salesOrders)
      .where(sql`${salesOrders.order_number} like ${`ORD-${datePart}-%`}`);
    const orderNumber = `ORD-${datePart}-${String(seq[0]?.n ?? 1).padStart(3, "0")}`;

    const [order] = await db
      .insert(salesOrders)
      .values({
        order_number: orderNumber,
        company_id: companyId,
        facility_id,
        buyer_id,
        order_date: new Date(order_date),
        status: "PENDING",
        total_amount: total,
        notes: notes ?? null,
        created_by: req.auth?.userId,
      })
      .returning();

    await db.insert(salesOrderItems).values(
      validated.map((v) => ({ ...v, order_id: order.id }))
    );

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "SALES_ORDER",
      entityId: order.id,
      newValues: { ...order, items: validated },
    });
    log.info("Sales order created", { orderId: order.id, orderNumber, amount: total });

    const detail = await loadOrderDetail(order.id);
    return res.status(201).json({ order: detail });
  })
);

// POST /sales/orders/:orderId/cancel — company admin cancels an order
router.post(
  "/orders/:orderId/cancel",
  asyncHandler(async (req: any, res) => {
    if (req.auth.role === "FACILITY_ADMIN") {
      throw forbidden("Only company admins can cancel orders");
    }
    const orderId = param(req, "orderId");
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
    if (!order) throw notFound("Order not found");
    const cid = myCompanyId(req);
    if (cid && order.company_id !== cid) throw forbidden("Access to this order is not allowed");

    const [updated] = await db
      .update(salesOrders)
      .set({ status: "CANCELLED", updated_at: new Date() })
      .where(eq(salesOrders.id, orderId))
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "SALES_ORDER",
      entityId: orderId,
      oldValues: order,
      newValues: updated,
    });
    return res.json({ order: updated });
  })
);

export default router;
