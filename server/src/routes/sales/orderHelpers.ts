import { desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
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
} from "../../db/schema.js";

export function computeOrderStatus(
  totalBags: number,
  dispatchedBags: number
): "PENDING" | "PARTIALLY_DISPATCHED" | "COMPLETED" {
  if (dispatchedBags <= 0) return "PENDING";
  if (dispatchedBags >= totalBags) return "COMPLETED";
  return "PARTIALLY_DISPATCHED";
}

export async function refreshOrderStatus(orderId: string) {
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

export async function loadOrderDetail(orderId: string) {
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
