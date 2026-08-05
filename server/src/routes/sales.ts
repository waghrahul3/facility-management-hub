import { Router } from "express";
import {
  and,
  desc,
  eq,
  inArray,
  sql,
} from "drizzle-orm";
import { db } from "../db/index.js";
import {
  bagSizes,
  buyers,
  companies,
  dispatchItems,
  dispatches,
  facilities,
  orderPayments,
  salesOrderItems,
  salesOrders,
} from "../db/schema.js";
import {
  requireAuth,
  requireCompanyAccess,
  requireFacilityAccess,
  requireRole,
} from "../auth/middleware.js";
import { audit } from "../lib/audit.js";
import { asyncHandler, badRequest, notFound, forbidden } from "../lib/errors.js";
import { logger, reqLogger } from "../lib/logger.js";
import { param } from "../lib/params.js";

const router = Router();
router.use(requireAuth);
router.use(requireRole("SUPER_ADMIN", "COMPANY_ADMIN", "FACILITY_ADMIN"));

// ---------------------------------------------------------------------------
// Scope helpers
// ---------------------------------------------------------------------------

/** Company id the caller is scoped to (null for super admin = all). */
function myCompanyId(req: any): string | null {
  if (req.auth.role === "SUPER_ADMIN") return null;
  return req.auth.companyId;
}

async function resolveCompanyId(req: any): Promise<string> {
  if (req.auth.role === "SUPER_ADMIN") {
    const cid = req.body?.company_id || req.query.companyId;
    if (!cid) throw badRequest("company_id is required for this operation");
    return cid;
  }
  if (!req.auth.companyId) throw forbidden("No company linked to this account");
  return req.auth.companyId;
}

// ---------------------------------------------------------------------------
// Buyers
// ---------------------------------------------------------------------------

router.get(
  "/buyers",
  asyncHandler(async (req: any, res) => {
    const cid = myCompanyId(req);
    const rows = await db
      .select({
        buyer: buyers,
        company: { id: companies.id, name: companies.name },
      })
      .from(buyers)
      .leftJoin(companies, eq(companies.id, buyers.company_id))
      .where(cid ? eq(buyers.company_id, cid) : undefined)
      .orderBy(desc(buyers.created_at));
    return res.json({ buyers: rows });
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

// ---------------------------------------------------------------------------
// Sales orders
// ---------------------------------------------------------------------------

function computeOrderStatus(totalBags: number, dispatchedBags: number): "PENDING" | "PARTIALLY_DISPATCHED" | "COMPLETED" {
  if (dispatchedBags <= 0) return "PENDING";
  if (dispatchedBags >= totalBags) return "COMPLETED";
  return "PARTIALLY_DISPATCHED";
}

async function refreshOrderStatus(orderId: string) {
  // Sum remaining quantities: ordered vs dispatched per item
  const items = await db
    .select()
    .from(salesOrderItems)
    .where(eq(salesOrderItems.order_id, orderId));
  const dispatchedRows = await db
    .select({
      order_item_id: dispatchItems.order_item_id,
      qty: sql<number>`coalesce(sum(${dispatchItems.quantity_bags}), 0)`,
    })
    .from(dispatchItems)
    .innerJoin(dispatches, eq(dispatches.id, dispatchItems.dispatch_id))
    .where(eq(dispatches.order_id, orderId))
    .groupBy(dispatchItems.order_item_id);

  const dispatchedByItem = new Map(dispatchedRows.map((r) => [r.order_item_id, r.qty ?? 0]));
  const totalBags = items.reduce((s, i) => s + i.quantity_bags, 0);
  const dispatchedBags = items.reduce((s, i) => s + (dispatchedByItem.get(i.id) ?? 0), 0);
  const status = computeOrderStatus(totalBags, dispatchedBags);

  await db
    .update(salesOrders)
    .set({ status, updated_at: new Date() })
    .where(eq(salesOrders.id, orderId));
  return status;
}

async function loadOrderDetail(orderId: string) {
  const [order] = await db
    .select({
      order: salesOrders,
      company: { id: companies.id, name: companies.name },
      facility: { id: facilities.id, name: facilities.name },
      buyer: { id: buyers.id, name: buyers.name, phone: buyers.phone, city: buyers.city },
    })
    .from(salesOrders)
    .innerJoin(companies, eq(companies.id, salesOrders.company_id))
    .innerJoin(facilities, eq(facilities.id, salesOrders.facility_id))
    .innerJoin(buyers, eq(buyers.id, salesOrders.buyer_id))
    .where(eq(salesOrders.id, orderId))
    .limit(1);
  if (!order) return null;

  const items = await db
    .select({
      item: salesOrderItems,
      bagSize: { id: bagSizes.id, size_name: bagSizes.size_name, weight_kg: bagSizes.weight_kg },
      dispatchedBags: sql<number>`coalesce((
        select sum(${dispatchItems.quantity_bags})
        from ${dispatchItems}
        inner join ${dispatches} on ${dispatches.id} = ${dispatchItems.dispatch_id}
        where ${dispatchItems.order_item_id} = ${salesOrderItems.id}
      ), 0)`,
    })
    .from(salesOrderItems)
    .innerJoin(bagSizes, eq(bagSizes.id, salesOrderItems.bag_size_id))
    .where(eq(salesOrderItems.order_id, orderId));

  const dispatchRows = await db
    .select({
      dispatch: dispatches,
      items: sql<string>`coalesce(json_agg(json_build_object(
        'id', ${dispatchItems.id},
        'order_item_id', ${dispatchItems.order_item_id},
        'quantity_bags', ${dispatchItems.quantity_bags},
        'rate_per_bag', ${dispatchItems.rate_per_bag},
        'total_amount', ${dispatchItems.total_amount}
      ) order by ${dispatchItems.id}), '[]'::json)`,
    })
    .from(dispatches)
    .leftJoin(dispatchItems, eq(dispatchItems.dispatch_id, dispatches.id))
    .where(eq(dispatches.order_id, orderId))
    .groupBy(dispatches.id)
    .orderBy(desc(dispatches.dispatch_date));

  const payments = await db
    .select()
    .from(orderPayments)
    .where(eq(orderPayments.order_id, orderId))
    .orderBy(desc(orderPayments.payment_date));

  const paidAmount = payments.reduce((s, p) => s + p.amount, 0);

  return {
    ...order,
    items,
    dispatches: dispatchRows.map((d) => ({
      ...d,
      items: typeof d.items === "string" ? JSON.parse(d.items) : d.items,
    })),
    payments,
    totalBags: items.reduce((s, i) => s + i.item.quantity_bags, 0),
    dispatchedBags: items.reduce((s, i) => s + Number(i.dispatchedBags ?? 0), 0),
    paidAmount,
    balanceAmount: Math.max(0, order.order.total_amount - paidAmount),
  };
}

// GET /sales/orders — list orders for the caller's scope
router.get(
  "/orders",
  asyncHandler(async (req: any, res) => {
    const cid = myCompanyId(req);
    const role = req.auth.role;
    // Facility admins see only orders assigned to their facility
    const facilityId =
      role === "FACILITY_ADMIN" ? req.auth.facilityId : (req.query.facilityId as string) || null;

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
      .where(
        and(
          cid ? eq(salesOrders.company_id, cid) : undefined,
          facilityId ? eq(salesOrders.facility_id, facilityId) : undefined
        )
      )
      .orderBy(desc(salesOrders.created_at));

    return res.json({ orders: rows });
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

// POST /sales/orders/:orderId/dispatch — facility fills the order by loading a vehicle
router.post(
  "/orders/:orderId/dispatch",
  asyncHandler(async (req: any, res) => {
    const log = reqLogger({ method: "POST", path: "/sales/orders/:orderId/dispatch" });
    const orderId = param(req, "orderId");
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
    if (!order) throw notFound("Order not found");
    if (order.status === "CANCELLED") throw badRequest("Cancelled orders cannot be dispatched");

    const cid = myCompanyId(req);
    if (cid && order.company_id !== cid) throw forbidden("Access to this order is not allowed");
    if (req.auth.role === "FACILITY_ADMIN" && order.facility_id !== req.auth.facilityId) {
      throw forbidden("You can only fill orders assigned to your facility");
    }

    const { vehicle_type, vehicle_number, destination, dispatch_date, notes, items } = req.body ?? {};
    if (!vehicle_type || !["TRUCK", "CONTAINER", "TRACTOR", "TEMPO", "OTHER"].includes(vehicle_type)) {
      throw badRequest("vehicle_type must be TRUCK, CONTAINER, TRACTOR, TEMPO or OTHER");
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw badRequest("items[] (bags loaded per order line) is required");
    }

    const orderItems = await db
      .select()
      .from(salesOrderItems)
      .where(eq(salesOrderItems.order_id, orderId));
    const itemMap = new Map(orderItems.map((i) => [i.id, i]));

    // Current dispatched qty per item
    const dispRows = await db
      .select({
        order_item_id: dispatchItems.order_item_id,
        qty: sql<number>`coalesce(sum(${dispatchItems.quantity_bags}), 0)`,
      })
      .from(dispatchItems)
      .innerJoin(dispatches, eq(dispatches.id, dispatchItems.dispatch_id))
      .where(eq(dispatches.order_id, orderId))
      .groupBy(dispatchItems.order_item_id);
    const alreadyDisp = new Map(dispRows.map((r) => [r.order_item_id, r.qty ?? 0]));

    // Validate loads don't exceed remaining
    let dispatchTotal = 0;
    const validated: Array<{ order_item_id: string; quantity_bags: number; rate_per_bag: number; total_amount: number }> = [];
    for (const it of items) {
      const { order_item_id, quantity_bags } = it ?? {};
      const item = itemMap.get(order_item_id);
      if (!item) throw badRequest("Invalid order line item");
      const qty = Number(quantity_bags);
      if (qty <= 0) throw badRequest("Loaded quantity must be > 0");
      const remaining = item.quantity_bags - (alreadyDisp.get(order_item_id) ?? 0);
      if (qty > remaining) {
        throw badRequest(
          `Loading ${qty} bags exceeds remaining ${remaining} for line “${item.onion_category ?? item.bag_size_id}”`
        );
      }
      const lineTotal = qty * item.rate_per_bag;
      dispatchTotal += lineTotal;
      validated.push({
        order_item_id,
        quantity_bags: qty,
        rate_per_bag: item.rate_per_bag,
        total_amount: lineTotal,
      });
    }

    const [dispatch] = await db
      .insert(dispatches)
      .values({
        order_id: orderId,
        facility_id: order.facility_id,
        vehicle_type,
        vehicle_number: vehicle_number ?? null,
        destination: destination ?? null,
        dispatch_date: dispatch_date ? new Date(dispatch_date) : new Date(),
        notes: notes ?? null,
        created_by: req.auth?.userId,
      })
      .returning();

    await db.insert(dispatchItems).values(
      validated.map((v) => ({ ...v, dispatch_id: dispatch.id }))
    );

    const status = await refreshOrderStatus(orderId);

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "DISPATCH",
      entityId: dispatch.id,
      newValues: { dispatch, items: validated },
    });
    log.info("Dispatch recorded", { dispatchId: dispatch.id, orderId, vehicleType: vehicle_type, total: dispatchTotal });

    const detail = await loadOrderDetail(orderId);
    return res.status(201).json({ dispatch, order: detail, status });
  })
);

// POST /sales/orders/:orderId/payments — record a payment from the buyer
router.post(
  "/orders/:orderId/payments",
  asyncHandler(async (req: any, res) => {
    const log = reqLogger({ method: "POST", path: "/sales/orders/:orderId/payments" });
    if (req.auth.role === "FACILITY_ADMIN") {
      throw forbidden("Only company admins can record payments");
    }
    const orderId = param(req, "orderId");
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, orderId)).limit(1);
    if (!order) throw notFound("Order not found");

    const cid = myCompanyId(req);
    if (cid && order.company_id !== cid) throw forbidden("Access to this order is not allowed");

    const { amount, payment_date, payment_method, reference_number, notes } = req.body ?? {};
    if (!amount || amount <= 0) throw badRequest("amount must be > 0");

    const [payment] = await db
      .insert(orderPayments)
      .values({
        order_id: orderId,
        amount,
        payment_date: payment_date ? new Date(payment_date) : new Date(),
        payment_method: payment_method || "CASH",
        reference_number: reference_number ?? null,
        notes: notes ?? null,
        recorded_by: req.auth?.userId,
      })
      .returning();

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "ORDER_PAYMENT",
      entityId: payment.id,
      newValues: payment,
    });
    log.info("Order payment recorded", { orderId, paymentId: payment.id, amount });

    const detail = await loadOrderDetail(orderId);
    return res.status(201).json({ payment, order: detail });
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

// ---------------------------------------------------------------------------
// Dashboard summary (company / facility)
// ---------------------------------------------------------------------------

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
