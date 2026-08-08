import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { dispatchItems, dispatches, salesOrderItems, salesOrders } from "../../db/schema.js";
import { audit } from "../../lib/audit.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../../lib/errors.js";
import { roundMoney } from "../../lib/format.js";
import { reqLogger } from "../../lib/logger.js";
import { param } from "../../lib/params.js";
import { myCompanyId } from "./_shared.js";
import { loadOrderDetail, refreshOrderStatus } from "./orderHelpers.js";

const router = Router();

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
      const lineTotal = roundMoney(qty * item.rate_per_bag);
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

export default router;
